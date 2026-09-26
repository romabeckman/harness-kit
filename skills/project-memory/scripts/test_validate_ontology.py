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
                 for name in ("payments", "rules", "legacy")]
        (self.docs / ".graph.json").write_text(json.dumps({"nodes": nodes}), encoding="utf-8")
        self.write("payments", [entity("capability:charge", "capability")], [claim()])
        self.write("rules", [entity("rule:positive", "rule")], [])
        (self.docs / "feature/legacy.md").write_text("# Legacy\n", encoding="utf-8")

    def write(self, name, entities, claims):
        data = dict(schema_version=1, entities=entities, claims=claims)
        (self.docs / f"feature/{name}.md").write_text(
            "# Fixture\n## KNOWLEDGE\n```json\n" + json.dumps(data) + "\n```\n## OTHER\n",
            encoding="utf-8")

    def test_targeted_validation_follows_qualified_owner(self):
        result = Validator(self.docs).validate(["feature:payments"])
        self.assertEqual(result["documents_checked"], 2)
        self.assertEqual(result["claims_checked"], 1)
        self.assertFalse(result["evidence_verified"])

    def test_legacy_is_reported_without_semantic_success(self):
        self.assertEqual(Validator(self.docs).validate()["without_knowledge"], ["feature:legacy"])

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
                path.write_text("## KNOWLEDGE\n```json\n" + json.dumps(variant) + "\n```", encoding="utf-8")
                with self.assertRaises(ValueError):
                    Validator(self.docs).validate()

    def test_fenced_examples_do_not_create_sections(self):
        self.assertIsNone(knowledge_block("````markdown\n## KNOWLEDGE\n```json\n{}\n```\n````"))
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            knowledge_block('## KNOWLEDGE\n```json\n{"a":1,"a":2}\n```')
        with self.assertRaises(ValueError):
            knowledge_block("## KNOWLEDGE\n```json\n{}")

    def test_graph_path_cannot_escape_allowed_directories(self):
        (self.docs / ".graph.json").write_text(json.dumps({"nodes": [
            {"id": "feature:escape", "path": "docs/harness-history/trace.md"}
        ]}), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Invalid document path"):
            Validator(self.docs)


if __name__ == "__main__":
    unittest.main()
