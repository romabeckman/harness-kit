#!/usr/bin/env python3
"""
generate_docs_graph.py
----------------------
Extrai o grafo de relacionamentos dos arquivos Markdown em `docs/`
e gera/atualiza o arquivo `docs/.graph.json` de forma compacta e token-optimized.
"""

import os
import re
import json
import sys
from pathlib import Path

ROUTING_FIELDS = (
    "entrypoints",
    "registration_files",
    "reference_files",
    "code_files",
    "test_files",
)
MICROGRAPH_FIELDS = ("node_id", "domain", "implements", "tested_by", *ROUTING_FIELDS)


def validate_feature_micrograph(data, node_id: str, file_path: Path, base_dir: Path):
    for field in MICROGRAPH_FIELDS:
        if field not in data:
            raise ValueError(f"Missing micrograph field '{field}' in {file_path}")

    if data["node_id"] != node_id:
        raise ValueError(
            f"Micrograph node_id '{data['node_id']}' does not match '{node_id}' in {file_path}"
        )

    for field in ("implements", "tested_by", *ROUTING_FIELDS):
        if not isinstance(data[field], list):
            raise ValueError(f"Micrograph field '{field}' must be an array in {file_path}")

    seen_paths = set()
    project_root = base_dir.resolve()
    routes = []
    for field in ROUTING_FIELDS:
        for route in data[field]:
            if not isinstance(route, str) or not route:
                raise ValueError(f"Invalid routing path in '{field}' in {file_path}")
            if route in seen_paths:
                raise ValueError(f"Duplicate routing path '{route}' in {file_path}")
            seen_paths.add(route)
            routes.append(route)

    for route in routes:
        target = (project_root / route).resolve()
        if not target.is_relative_to(project_root) or not target.is_file():
            raise ValueError(f"Unresolved routing path '{route}' in {file_path}")

def parse_markdown_file(file_path: Path, base_dir: Path):
    rel_path = file_path.relative_to(base_dir).as_posix()
    content = file_path.read_text(encoding="utf-8")
    
    frontmatter = {}
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if fm_match:
        fm_text = fm_match.group(1)
        try:
            import yaml
            frontmatter = yaml.safe_load(fm_text) or {}
        except Exception:
            # Fallback para regex simples
            for line in fm_text.splitlines():
                line = line.strip()
                if ":" in line and not line.startswith("-"):
                    k, v = line.split(":", 1)
                    frontmatter[k.strip()] = v.strip().strip("'\"")

    # Extrair título principal (# Title)
    title = file_path.stem.replace("_", " ").replace("-", " ").title()
    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if title_match:
        title = title_match.group(1).strip()
    elif "title" in frontmatter:
        title = frontmatter["title"]

    doc_type = frontmatter.get("doc_type")
    if not doc_type:
        if "adr/" in rel_path:
            doc_type = "adr"
        elif "feature/" in rel_path:
            doc_type = "feature"
        elif "specs/" in rel_path:
            doc_type = "spec"
        else:
            doc_type = "doc"

    node_id = frontmatter.get("node_id")
    if not node_id:
        slug = file_path.stem.lower().replace("_", "-")
        node_id = f"{doc_type}:{slug}"

    tags = frontmatter.get("tags", [])
    if not isinstance(tags, list):
        tags = []

    node = {
        "id": node_id,
        "type": doc_type,
        "title": title,
        "path": rel_path,
        "tags": tags
    }

    edges = []
    # 1. Processar edges do YAML frontmatter
    fm_edges = frontmatter.get("edges", [])
    if isinstance(fm_edges, list):
        for edge in fm_edges:
            if isinstance(edge, dict) and "target" in edge:
                edges.append({
                    "source": node_id,
                    "target": edge["target"],
                    "relation": edge.get("relation", "references")
                })

    # 2. Processar bloco embutido ```graph
    graph_block_match = re.search(r"```graph\s*\n(.*?)\n```", content, re.DOTALL)
    if graph_block_match:
        try:
            gb_data = json.loads(graph_block_match.group(1))
            if doc_type == "feature":
                validate_feature_micrograph(gb_data, node_id, file_path, base_dir)
            for relation in ("implements", "depends_on", "tested_by"):
                targets = gb_data.get(relation, [])
                if not isinstance(targets, list):
                    targets = [targets]
                for target in targets:
                    if target:
                        edges.append({"source": node_id, "target": target, "relation": relation})
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid micrograph JSON in {file_path}: {error.msg}") from error

    return node, edges

def build_docs_graph(docs_dir: Path):
    nodes = []
    edges = []
    node_ids = set()
    node_paths = {}

    for allowed_dir in (docs_dir / "adr", docs_dir / "feature"):
        if not allowed_dir.exists():
            continue
        for root, _, files in os.walk(allowed_dir):
            for file in files:
                if not file.endswith(".md") or file.startswith("."):
                    continue

                file_path = Path(root) / file
                node, file_edges = parse_markdown_file(file_path, docs_dir.parent)

                if node["id"] in node_ids:
                    raise ValueError(
                        f"Duplicate node_id '{node['id']}' in {node_paths[node['id']]} and {node['path']}"
                    )
                nodes.append(node)
                node_ids.add(node["id"])
                node_paths[node["id"]] = node["path"]
                edges.extend(file_edges)

    unique_edges = []
    seen_edges = set()
    for edge in edges:
        edge_key = (edge["source"], edge["target"], edge["relation"])
        if edge_key not in seen_edges:
            seen_edges.add(edge_key)
            unique_edges.append(edge)

    unresolved = sorted(
        (edge for edge in unique_edges if edge["target"] not in node_ids),
        key=lambda edge: (edge["source"], edge["relation"], edge["target"]),
    )
    if unresolved:
        edge = unresolved[0]
        raise ValueError(
            f"Unresolved edge target '{edge['target']}' from '{edge['source']}' ({edge['relation']})"
        )

    nodes.sort(key=lambda node: node["id"])
    unique_edges.sort(key=lambda edge: (edge["source"], edge["relation"], edge["target"]))

    return {
        "nodes": nodes,
        "edges": unique_edges
    }

def main():
    docs_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("docs")
    
    if not docs_path.exists():
        print(f"Erro: Diretório '{docs_path}' não encontrado.", file=sys.stderr)
        sys.exit(1)

    graph_data = build_docs_graph(docs_path)
    output_file = docs_path / ".graph.json"

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(graph_data, f, separators=(',', ':'), ensure_ascii=False)

    print(f"Graph generated at {output_file} ({len(graph_data['nodes'])} nodes, {len(graph_data['edges'])} edges)")

if __name__ == "__main__":
    main()
