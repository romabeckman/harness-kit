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

def parse_markdown_file(file_path: Path, base_dir: Path):
    rel_path = file_path.relative_to(base_dir).as_posix()
    content = file_path.read_text(encoding="utf-8")
    
    frontmatter = {}
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if fm_match:
        fm_text = fm_match.group(1)
        # Parse simples de YAML sem dependência externa obrigatória
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

    tags = []
    # Busca por tags no frontmatter
    tags_match = re.search(r"tags:\s*\n((?:\s*-\s*.+\n)+)", fm_text if fm_match else "", re.MULTILINE)
    if tags_match:
        for t_line in tags_match.group(1).splitlines():
            t_val = t_line.strip().lstrip("-").strip()
            if t_val:
                tags.append(t_val)

    node = {
        "id": node_id,
        "type": doc_type,
        "title": title,
        "path": rel_path,
        "tags": tags
    }

    edges = []
    # Busca por edges no frontmatter
    edges_block_match = re.search(r"edges:\s*\n((?:\s*-\s*.+\n?)+)", fm_text if fm_match else "", re.MULTILINE)
    if edges_block_match:
        current_relation = None
        current_target = None
        for line in edges_block_match.group(1).splitlines():
            line = line.strip()
            if "relation:" in line:
                current_relation = line.split("relation:", 1)[1].strip().strip("'\"")
            if "target:" in line:
                current_target = line.split("target:", 1)[1].strip().strip("'\"")
            if current_relation and current_target:
                edges.append({
                    "source": node_id,
                    "target": current_target,
                    "relation": current_relation
                })
                current_relation = None
                current_target = None

    # Busca por bloco embutido ```graph
    graph_block_match = re.search(r"```graph\s*\n(.*?)\n```", content, re.DOTALL)
    if graph_block_match:
        try:
            gb_data = json.loads(graph_block_match.group(1))
            tested_by = gb_data.get("tested_by")
            if tested_by:
                edges.append({
                    "source": node_id,
                    "target": tested_by,
                    "relation": "tested_by"
                })
            depends_on = gb_data.get("depends_on")
            if depends_on:
                if isinstance(depends_on, list):
                    for dep in depends_on:
                        edges.append({"source": node_id, "target": dep, "relation": "depends_on"})
                else:
                    edges.append({"source": node_id, "target": depends_on, "relation": "depends_on"})
        except Exception:
            pass

    return node, edges

def build_docs_graph(docs_dir: Path):
    nodes = []
    edges = []
    node_ids = set()

    for root, dirs, files in os.walk(docs_dir):
        dirs[:] = [d for d in dirs if d not in ["harness-history"]]
        
        for file in files:
            if file.endswith(".md") and not file.startswith("."):
                file_path = Path(root) / file
                if file_path == docs_dir / "README.md":
                    continue
                    
                node, file_edges = parse_markdown_file(file_path, docs_dir.parent)
                
                if node["id"] not in node_ids:
                    nodes.append(node)
                    node_ids.add(node["id"])
                
                edges.extend(file_edges)

    unique_edges = []
    seen_edges = set()
    for edge in edges:
        edge_key = (edge["source"], edge["target"], edge["relation"])
        if edge_key not in seen_edges:
            seen_edges.add(edge_key)
            unique_edges.append(edge)

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

    print(f"✅ Grafo gerado em {output_file} ({len(graph_data['nodes'])} nós, {len(graph_data['edges'])} arestas)")

if __name__ == "__main__":
    main()
