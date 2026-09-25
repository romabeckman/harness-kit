import json
import tempfile
import unittest
from pathlib import Path
import sys
import os
import subprocess

sys.path.insert(0, str(Path(__file__).parent))
from generate_docs_graph import build_docs_graph


def write_doc(path: Path, node_id: str, edges: str = "edges: []", doc_type: str = "adr") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(
            [
                "---",
                f"doc_type: {doc_type}",
                "domain: test",
                f'node_id: "{node_id}"',
                "tags: [test, routing]",
                edges,
                "---",
                f"# {node_id}",
            ]
        ),
        encoding="utf-8",
    )


def append_micrograph(path: Path, graph_json: str) -> None:
    with path.open("a", encoding="utf-8") as document:
        document.write(f"\n```graph\n{graph_json}\n```\n")


class BuildDocsGraphTests(unittest.TestCase):
    def test_indexes_only_adr_and_feature_documents(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "architecture.md", "adr:architecture")
            write_doc(docs / "feature" / "runner.md", "feature:runner")
            write_doc(docs / "specs" / "billing" / "design.md", "spec:billing")
            write_doc(docs / "PLAYBOOK.md", "doc:playbook")

            graph = build_docs_graph(docs)

            self.assertEqual(
                ["adr:architecture", "feature:runner"],
                [node["id"] for node in graph["nodes"]],
            )

    def test_development_consumers_define_micrograph_fast_paths(self) -> None:
        repository = Path(__file__).parents[3]
        tdd_skill = (repository / "skills" / "tdd-orchestrator" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        scope_skill = (repository / "skills" / "scope-refinement" / "SKILL.md").read_text(
            encoding="utf-8"
        )

        for field in ("entrypoints", "registration_files", "reference_files", "code_files", "test_files"):
            self.assertIn(field, tdd_skill)
        self.assertIn("stale", tdd_skill.lower())
        self.assertIn("${orientation}", scope_skill)
        self.assertIn("once", scope_skill.lower())

        for agent_file in sorted((repository / "skills" / "scope-refinement" / "agents").glob("*.md")):
            agent = agent_file.read_text(encoding="utf-8")
            self.assertIn("${orientation}", agent, agent_file.name)
            self.assertIn("fallback", agent.lower(), agent_file.name)

    def test_cli_status_output_is_cp1252_safe(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "architecture.md", "adr:architecture")
            environment = os.environ.copy()
            environment["PYTHONIOENCODING"] = "cp1252"

            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "generate_docs_graph.py"), str(docs)],
                capture_output=True,
                text=True,
                env=environment,
            )

            self.assertEqual(0, result.returncode, result.stderr)
            graph = json.loads((docs / ".graph.json").read_text(encoding="utf-8"))
            self.assertEqual([], graph["related_projects"])

    def test_cli_preserves_related_projects_when_regenerating_document_graph(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "architecture.md", "adr:architecture")
            (docs / ".graph.json").write_text(
                json.dumps({
                    "nodes": [],
                    "edges": [],
                    "related_projects": [
                        {"key": "ledger", "relation": "provides_to"},
                        {"key": "authentication", "relation": "depends_on"},
                    ],
                }),
                encoding="utf-8",
            )

            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "generate_docs_graph.py"), str(docs)],
                capture_output=True,
                text=True,
            )

            self.assertEqual(0, result.returncode, result.stderr)
            graph = json.loads((docs / ".graph.json").read_text(encoding="utf-8"))
            self.assertEqual(["adr:architecture"], [node["id"] for node in graph["nodes"]])
            self.assertEqual(
                [
                    {"key": "authentication", "relation": "depends_on"},
                    {"key": "ledger", "relation": "provides_to"},
                ],
                graph["related_projects"],
            )

    def test_feature_template_exposes_direct_source_routing_fields(self) -> None:
        template = (Path(__file__).parent.parent / "references" / "DOCUMENT-TEMPLATE.md").read_text(
            encoding="utf-8"
        )

        for field in ("entrypoints", "registration_files", "reference_files", "code_files", "test_files"):
            self.assertIn(f'"{field}"', template)

    def test_readme_rules_preserve_direct_path_fast_route(self) -> None:
        rules = (Path(__file__).parent.parent / "references" / "README-RULES.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("exact path", rules.lower())

    def test_architecture_rules_defines_size_limit_and_decomposition(self) -> None:
        rules = (Path(__file__).parent.parent / "references" / "ARCHITECTURE-RULES.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("8,000", rules)
        self.assertIn("docs/adr/", rules)

    def test_sorts_nodes_and_edges_for_stable_compact_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "feature" / "z.md", "feature:z")
            write_doc(
                docs / "feature" / "a.md",
                "feature:a",
                'edges:\n  - relation: depends_on\n    target: "feature:z"',
            )

            graph = build_docs_graph(docs)

            self.assertEqual(["feature:a", "feature:z"], [node["id"] for node in graph["nodes"]])
            self.assertEqual(
                [{"source": "feature:a", "target": "feature:z", "relation": "depends_on"}],
                graph["edges"],
            )

    def test_rejects_duplicate_node_ids(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "feature" / "a.md", "feature:duplicate")
            write_doc(docs / "feature" / "b.md", "feature:duplicate")

            with self.assertRaisesRegex(ValueError, "Duplicate node_id"):
                build_docs_graph(docs)

    def test_rejects_unresolved_edge_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(
                docs / "feature" / "a.md",
                "feature:a",
                'edges:\n  - relation: depends_on\n    target: "feature:missing"',
            )

            with self.assertRaisesRegex(ValueError, "Unresolved edge target"):
                build_docs_graph(docs)

    def test_extracts_list_relations_from_feature_micrograph(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            feature = docs / "feature" / "runner.md"
            write_doc(feature, "feature:runner", doc_type="feature")
            write_doc(docs / "adr" / "architecture.md", "adr:architecture")
            write_doc(docs / "adr" / "tests.md", "adr:tests")
            append_micrograph(
                feature,
                '{"node_id":"feature:runner","domain":"test","implements":["adr:architecture"],'
                '"tested_by":["adr:tests"],"entrypoints":[],"registration_files":[],'
                '"reference_files":[],"code_files":[],"test_files":[]}',
            )

            graph = build_docs_graph(docs)

            self.assertIn(
                {"source": "feature:runner", "target": "adr:architecture", "relation": "implements"},
                graph["edges"],
            )
            self.assertIn(
                {"source": "feature:runner", "target": "adr:tests", "relation": "tested_by"},
                graph["edges"],
            )

    def test_rejects_feature_micrograph_without_routing_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            feature = docs / "feature" / "runner.md"
            write_doc(feature, "feature:runner", doc_type="feature")
            append_micrograph(feature, '{"node_id":"feature:runner","domain":"test"}')

            with self.assertRaisesRegex(ValueError, "Missing micrograph field"):
                build_docs_graph(docs)

    def test_rejects_missing_and_duplicate_routing_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            feature = docs / "feature" / "runner.md"
            write_doc(feature, "feature:runner", doc_type="feature")
            append_micrograph(
                feature,
                '{"node_id":"feature:runner","domain":"test","implements":[],"tested_by":[],'
                '"entrypoints":["src/missing.ts"],"registration_files":["src/missing.ts"],'
                '"reference_files":[],"code_files":[],"test_files":[]}',
            )

            with self.assertRaisesRegex(ValueError, "Duplicate routing path"):
                build_docs_graph(docs)

    def test_feature_node_macro_reading_policy_in_related_docs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "architecture.md", "adr:architecture")
            write_doc(docs / "adr" / "security.md", "adr:security")
            feature_edges = (
                "edges:\n"
                "  - relation: implements\n"
                '    target: "adr:architecture"\n'
                "    read: must\n"
                "  - relation: references\n"
                '    target: "adr:security"\n'
                "    read: optional\n"
                '    when: "Read when changing authorization, sensitive data, secrets, authentication, or trust boundaries."'
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            graph = build_docs_graph(docs)

            feature_node = next(n for n in graph["nodes"] if n["id"] == "feature:checkout")
            self.assertEqual(
                {
                    "must_read": ["adr:architecture"],
                    "optional": [
                        {
                            "target": "adr:security",
                            "description": "Read when changing authorization, sensitive data, secrets, authentication, or trust boundaries.",
                        }
                    ],
                },
                feature_node.get("related_docs"),
            )

            # Omit related_docs from non-feature nodes
            adr_node = next(n for n in graph["nodes"] if n["id"] == "adr:architecture")
            self.assertNotIn("related_docs", adr_node)

            # Global edges unchanged, no read or when copied
            global_edges = graph["edges"]
            self.assertEqual(
                [
                    {"source": "feature:checkout", "target": "adr:architecture", "relation": "implements"},
                    {"source": "feature:checkout", "target": "adr:security", "relation": "references"},
                ],
                global_edges,
            )

    def test_rejects_optional_read_missing_when(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "security.md", "adr:security")
            feature_edges = (
                "edges:\n"
                "  - relation: references\n"
                '    target: "adr:security"\n'
                "    read: optional"
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            with self.assertRaisesRegex(ValueError, "Missing required 'when'"):
                build_docs_graph(docs)

    def test_rejects_feature_edge_without_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(
                docs / "feature" / "checkout.md",
                "feature:checkout",
                "edges:\n  - relation: references",
                doc_type="feature",
            )

            with self.assertRaisesRegex(ValueError, "Invalid feature frontmatter edge"):
                build_docs_graph(docs)

    def test_rejects_invalid_feature_read_value(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "security.md", "adr:security")
            feature_edges = (
                "edges:\n"
                "  - relation: references\n"
                '    target: "adr:security"\n'
                "    read: later"
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            with self.assertRaisesRegex(ValueError, "Invalid read value"):
                build_docs_graph(docs)

    def test_rejects_when_without_read_policy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "security.md", "adr:security")
            feature_edges = (
                "edges:\n"
                "  - relation: references\n"
                '    target: "adr:security"\n'
                '    when: "Read when changing authorization"'
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            with self.assertRaisesRegex(ValueError, "specifies 'when' without"):
                build_docs_graph(docs)

    def test_rejects_optional_read_when_exceeds_300_chars(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "security.md", "adr:security")
            long_when = "x" * 301
            feature_edges = (
                "edges:\n"
                "  - relation: references\n"
                '    target: "adr:security"\n'
                "    read: optional\n"
                f'    when: "{long_when}"'
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            with self.assertRaisesRegex(ValueError, "exceeds 300 characters"):
                build_docs_graph(docs)

    def test_rejects_must_read_with_when(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "architecture.md", "adr:architecture")
            feature_edges = (
                "edges:\n"
                "  - relation: implements\n"
                '    target: "adr:architecture"\n'
                "    read: must\n"
                '    when: "Should not be here"'
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            with self.assertRaisesRegex(ValueError, "cannot include 'when'"):
                build_docs_graph(docs)

    def test_rejects_duplicate_routing_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "architecture.md", "adr:architecture")
            feature_edges = (
                "edges:\n"
                "  - relation: implements\n"
                '    target: "adr:architecture"\n'
                "    read: must\n"
                "  - relation: references\n"
                '    target: "adr:architecture"\n'
                "    read: must"
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            with self.assertRaisesRegex(ValueError, "Duplicate routing target"):
                build_docs_graph(docs)

    def test_rejects_same_target_both_must_and_optional(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            write_doc(docs / "adr" / "architecture.md", "adr:architecture")
            feature_edges = (
                "edges:\n"
                "  - relation: implements\n"
                '    target: "adr:architecture"\n'
                "    read: must\n"
                "  - relation: references\n"
                '    target: "adr:architecture"\n'
                "    read: optional\n"
                '    when: "Read when modifying architecture"'
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            with self.assertRaisesRegex(ValueError, "both must and optional"):
                build_docs_graph(docs)

    def test_rejects_unresolved_routing_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            docs = Path(temp_dir) / "docs"
            feature_edges = (
                "edges:\n"
                "  - relation: implements\n"
                '    target: "adr:missing"\n'
                "    read: must"
            )
            write_doc(docs / "feature" / "checkout.md", "feature:checkout", edges=feature_edges, doc_type="feature")

            with self.assertRaisesRegex(ValueError, "Unresolved routing target"):
                build_docs_graph(docs)

    def test_skill_defines_macro_routing_rules_and_step_9_schema(self) -> None:
        skill_content = (Path(__file__).parents[1] / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("read: must | optional", skill_content)
        self.assertIn("related_docs.must_read", skill_content)
        self.assertIn("related_docs.optional", skill_content)
        self.assertIn("exceeds 300 characters", skill_content)
        self.assertIn("both must and optional", skill_content)

    def test_template_defines_macro_routing_fields(self) -> None:
        template = (Path(__file__).parents[1] / "references" / "DOCUMENT-TEMPLATE.md").read_text(encoding="utf-8")
        self.assertIn("read: [must | optional]", template)
        self.assertIn("when: \"[required only for optional, max 300 chars]\"", template)


if __name__ == "__main__":
    unittest.main()
