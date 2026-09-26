import json
import tempfile
import unittest
from pathlib import Path

from validate_ontology import Validator, knowledge_block


def entity(identifier, kind):
    return dict(id=identifier, type=kind, label="Example", definition="Fixture concept", aliases=[])


def claim(identifier="claim:guard"):
    return dict(id=identifier, subject="capability:charge", relation="constrained_by",
                object="feature:rules#rule:positive", statement="Reject nonpositive amounts",
                kind="observation", status="supported",
                evidence=[dict(kind="code", source="src/payments.py", locator="charge guard", snapshot=None)],
                derived_from=[], gap=None)


class OntologyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path.cwd())
        self.addCleanup(self.temp.cleanup)
        self.docs = Path(self.temp.name) / "docs"
        (self.docs / "feature").mkdir(parents=True)
        nodes = [{"id": f"feature:{name}", "path": f"docs/feature/{name}.md"}
                 for name in ("payments", "rules", "unannotated")]
        (self.docs / ".graph.json").write_text(json.dumps({"nodes": nodes}), encoding="utf-8")
        self.write("payments", [entity("capability:charge", "capability")], [claim()])
        self.write("rules", [entity("rule:positive", "rule")], [])
        (self.docs / "feature/unannotated.md").write_text("# Unannotated\n", encoding="utf-8")

    def write(self, name, entities, claims):
        data = dict(schema_version=1, entities=entities, claims=claims)
        self.write_graph(name, data)

    def write_graph(self, name, data):
        graph = dict(node_id=f"feature:{name}", domain=name, implements=[], tested_by=[],
                     entrypoints=[], registration_files=[], reference_files=[],
                     code_files=[], test_files=[], knowledge=data)
        (self.docs / f"feature/{name}.md").write_text(
            f'---\nnode_id: "feature:{name}"\ndoc_type: feature\nedges: []\n---\n'
            + "```graph\n" + json.dumps(graph, separators=(',', ':')) + "\n```\n# Feature\n",
            encoding="utf-8")

    def test_targeted_validation_follows_qualified_owner(self):
        result = Validator(self.docs).validate(["feature:payments"])
        self.assertEqual(result["documents_checked"], 2)
        self.assertEqual(result["claims_checked"], 1)
        self.assertFalse(result["evidence_verified"])

    def test_unannotated_is_reported_without_semantic_success(self):
        self.assertEqual(Validator(self.docs).validate()["without_knowledge"], ["feature:unannotated"])

    def test_missing_target_and_wrong_relation_type_fail(self):
        for target in ("feature:rules#rule:missing", "capability:charge"):
            with self.subTest(target=target):
                record = claim()
                record["object"] = target
                self.write("payments", [entity("capability:charge", "capability")], [record])
                with self.assertRaises(ValueError):
                    Validator(self.docs).validate()

    def test_supported_hypothesis_and_missing_evidence_fail(self):
        for update in ({"kind": "hypothesis"}, {"evidence": []}, {"gap": "Unknown"}):
            with self.subTest(update=update):
                record = claim()
                record.update(update)
                self.write("payments", [entity("capability:charge", "capability")], [record])
                with self.assertRaises(ValueError):
                    Validator(self.docs).validate()

    def test_cross_document_derivation_cycle_fails(self):
        first = claim()
        first["derived_from"] = ["feature:rules#claim:premise"]
        second = claim("claim:premise")
        second.update(subject="rule:positive", relation=None, object=None,
                      derived_from=["feature:payments#claim:guard"])
        self.write("payments", [entity("capability:charge", "capability")], [first])
        self.write("rules", [entity("rule:positive", "rule")], [second])
        with self.assertRaisesRegex(ValueError, "Circular"):
            Validator(self.docs).validate()

    def test_unknown_version_duplicate_ids_and_fields_fail(self):
        path = self.docs / "feature/payments.md"
        original = path.read_text(encoding="utf-8")
        data = knowledge_block(original)
        variants = [dict(data, schema_version=True), dict(data, unexpected=[]),
                    dict(data, entities=data["entities"] * 2)]
        for variant in variants:
            with self.subTest(variant=variant):
                self.write_graph("payments", variant)
                with self.assertRaises(ValueError):
                    Validator(self.docs).validate()

    def test_fenced_examples_do_not_create_sections(self):
        self.assertIsNone(knowledge_block("````markdown\n## EXAMPLE\n```graph\n{}\n```\n````"))
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            knowledge_block('```graph\n{"a":1,"a":2}\n```')
        with self.assertRaises(ValueError):
            knowledge_block("```graph\n{}")

    def test_graph_path_cannot_escape_allowed_directories(self):
        (self.docs / ".graph.json").write_text(json.dumps({"nodes": [
            {"id": "feature:escape", "path": "docs/harness-history/trace.md"}
        ]}), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Invalid document path"):
            Validator(self.docs)

    def add_adr(self, content, identifier="adr:architecture"):
        path = self.docs / "adr/architecture.md"
        path.parent.mkdir(exist_ok=True)
        path.write_text(content, encoding="utf-8")
        index_path = self.docs / ".graph.json"
        index = json.loads(index_path.read_text(encoding="utf-8"))
        index["nodes"].append({"id": identifier, "path": "docs/adr/architecture.md"})
        index_path.write_text(json.dumps(index), encoding="utf-8")

    def test_adr_without_knowledge_is_not_reported_as_missing(self):
        self.add_adr("# Architecture\nUse a gateway.\n")
        result = Validator(self.docs).validate()
        self.assertEqual(result["documents_checked"], 4)
        self.assertEqual(result["without_knowledge"], ["feature:unannotated"])

    def test_adr_knowledge_is_rejected_even_with_feature_node_id(self):
        content = (self.docs / "feature/rules.md").read_text(encoding="utf-8")
        self.add_adr(content, "feature:misclassified")
        with self.assertRaisesRegex(ValueError, "allowed only in docs/feature"):
            Validator(self.docs).validate()

    def test_qualified_claim_cannot_use_adr_as_entity_owner(self):
        self.add_adr("# Architecture\n")
        record = claim()
        record["object"] = "adr:architecture#rule:positive"
        self.write("payments", [entity("capability:charge", "capability")], [record])
        with self.assertRaisesRegex(ValueError, "unresolved entity"):
            Validator(self.docs).validate(["feature:payments"])

    def test_nested_feature_knowledge_remains_supported(self):
        old = self.docs / "feature/payments.md"
        new = self.docs / "feature/billing/payments.md"
        new.parent.mkdir()
        old.rename(new)
        index_path = self.docs / ".graph.json"
        index = json.loads(index_path.read_text(encoding="utf-8"))
        index["nodes"][0]["path"] = "docs/feature/billing/payments.md"
        index_path.write_text(json.dumps(index), encoding="utf-8")
        self.assertEqual(Validator(self.docs).validate()["claims_checked"], 1)

    def test_unrelated_json_does_not_supply_or_override_graph_knowledge(self):
        path = self.docs / "feature/payments.md"
        graph_text = path.read_text(encoding="utf-8")
        expected = knowledge_block(graph_text)
        example = '\n## EXAMPLE\n```json\n{"schema_version":999,"entities":[],"claims":[]}\n```\n'
        self.assertIsNone(knowledge_block(example))
        self.assertEqual(knowledge_block(graph_text + example), expected)

    def test_invalid_graph_knowledge_is_not_silently_skipped(self):
        for payload in ('{"knowledge":null}', '{"knowledge":[]}',
                        '{"knowledge":{},"knowledge":{}}', '{"knowledge":'):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                data = knowledge_block("```graph\n" + payload + "\n```")
                if data is not None:
                    path = self.docs / "feature/payments.md"
                    path.write_text("```graph\n" + payload + "\n```", encoding="utf-8")
                    Validator(self.docs).validate()

    def test_duplicate_or_unclosed_graph_is_rejected(self):
        for text in ('```graph\n{}', '```graph\n{}\n```\n```graph\n{}\n```'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                knowledge_block(text)

    def test_graph_inside_code_example_is_ignored(self):
        self.assertIsNone(knowledge_block('````markdown\n```graph\n{"knowledge":{}}\n```\n````'))
        self.assertIsNone(knowledge_block('```graph\n{"node_id":"feature:unannotated"}\n```'))

    def test_nested_knowledge_remains_prohibited_in_adrs(self):
        self.add_adr((self.docs / "feature/rules.md").read_text(encoding="utf-8"))
        with self.assertRaisesRegex(ValueError, "allowed only in docs/feature"):
            Validator(self.docs).validate()

    def test_macro_graph_does_not_copy_nested_knowledge(self):
        from generate_docs_graph import build_docs_graph
        data = knowledge_block((self.docs / "feature/payments.md").read_text(encoding="utf-8"))
        graph = build_docs_graph(self.docs)
        self.assertEqual({node['id'] for node in graph['nodes']},
                         {"feature:payments", "feature:rules", "feature:unannotated"})
        self.assertNotIn('knowledge', json.dumps(graph))
        self.assertEqual(graph['edges'], [])
        self.assertEqual(knowledge_block((self.docs / "feature/payments.md").read_text()), data)


if __name__ == "__main__":
    unittest.main()
