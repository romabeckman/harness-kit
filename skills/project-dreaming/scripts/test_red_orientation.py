import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from red_orientation import Conflict, apply_handoff, guidance_section


class RedOrientationTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.destination = "docs/feature/agents/SDK_DIAGNOSE.md"
        self.feature = self.root / self.destination
        self.feature.parent.mkdir(parents=True)
        self.node = "feature:sdk_diagnose"
        self.initial = (
            f'---\nnode_id: "{self.node}"\n---\n\n'
            f'```graph\n{{"node_id":"{self.node}"}}\n```\n\n'
            "# SDK Diagnose\n\n"
            "~~~md\n## Orientações para o RED\n~~~\n\n"
            "## Existing contract\n\nCapture and retry have distinct semantics.\n"
        )
        self.feature.write_text(self.initial, encoding="utf-8")
        self.index = self.root / "docs" / ".graph.json"
        self.index.write_text(json.dumps({"nodes": [{"id": self.node, "path": self.destination}]}))
        source = {"path": self.destination, "locator": "Capture and retry have distinct semantics."}
        self.handoff = {
            "operation": "publish",
            "feature_node_id": self.node,
            "destination": self.destination,
            "hypothesis_id": "verified-retry-test",
            "revision": 1,
            "expected_published_revision": None,
            "orientation": {
                "id": "verified-retry-test",
                "revision": 1,
                "applies_when": "A specified retry crosses instances.",
                "action": "Use a fresh instance with the reserved identity from persisted state.",
                "skip_when": "The task is a fresh capture.",
                "sources": [source],
            },
            "evidence": {"evaluation_id": "example-pair", "result": "Fixture evidence.", "sources": [source]},
        }

    def entries(self):
        return guidance_section(self.feature.read_text(encoding="utf-8"))[3]

    def withdraw(self, revision):
        handoff = {**self.handoff, "operation": "withdraw",
                   "revision": revision, "expected_published_revision": revision}
        del handoff["orientation"]
        return handoff

    def test_missing_and_fenced_example_have_no_guidance(self):
        self.assertEqual(self.entries(), {})

    def test_publish_and_retry_same_id(self):
        self.assertEqual(apply_handoff(self.root, self.handoff)["result"], "written")
        published = self.feature.read_bytes()
        self.assertTrue(published.startswith(self.initial.encode()))
        self.assertEqual(self.entries(), {"verified-retry-test": self.handoff["orientation"]})
        self.assertEqual(apply_handoff(self.root, self.handoff)["result"], "already_current")
        self.assertEqual(self.feature.read_bytes(), published)

    def test_replace_compare_and_set_and_withdraw(self):
        apply_handoff(self.root, self.handoff)
        replacement = copy.deepcopy(self.handoff)
        replacement.update(revision=2, expected_published_revision=1)
        replacement["orientation"].update(revision=2, action="Require the same ledger after restart.")
        self.assertEqual(apply_handoff(self.root, replacement)["result"], "written")
        self.assertEqual(apply_handoff(self.root, replacement)["result"], "already_current")
        with self.assertRaisesRegex(Conflict, "Expected published revision"):
            apply_handoff(self.root, self.withdraw(1))
        self.assertEqual(apply_handoff(self.root, self.withdraw(2))["result"], "written")
        self.assertEqual(apply_handoff(self.root, self.withdraw(2))["result"], "already_current")
        self.assertEqual(self.entries(), {})

    def test_same_revision_with_different_content_conflicts(self):
        apply_handoff(self.root, self.handoff)
        conflicting = copy.deepcopy(self.handoff)
        conflicting["orientation"]["action"] = "Use a different setup."
        with self.assertRaisesRegex(Conflict, "Expected published revision"):
            apply_handoff(self.root, conflicting)
        self.assertEqual(self.entries()["verified-retry-test"], self.handoff["orientation"])

    def test_interrupted_write_can_resume(self):
        with patch("red_orientation.os.replace", side_effect=OSError("interrupted")):
            with self.assertRaisesRegex(OSError, "interrupted"):
                apply_handoff(self.root, self.handoff)
        self.assertEqual(self.entries(), {})
        self.assertEqual(list(self.feature.parent.iterdir()), [self.feature])
        self.assertEqual(apply_handoff(self.root, self.handoff)["result"], "written")

    def test_new_section_keeps_references_last(self):
        references = "## REFERENCES\n\n- An existing reference.\n"
        self.feature.write_text(self.initial + "\n" + references, encoding="utf-8")
        apply_handoff(self.root, self.handoff)
        published = self.feature.read_text(encoding="utf-8")
        self.assertTrue(published.endswith(references))
        self.assertIn(self.handoff["hypothesis_id"], self.entries())

    def test_unclosed_fence_does_not_hide_a_new_section(self):
        invalid_document = self.initial + "\n```text\nUnclosed fence\n"
        self.feature.write_text(invalid_document, encoding="utf-8")
        with self.assertRaisesRegex(Conflict, "would hide"):
            apply_handoff(self.root, self.handoff)
        self.assertEqual(self.feature.read_text(encoding="utf-8"), invalid_document)

    def test_stale_route_refuses_publication(self):
        self.index.write_text(json.dumps({"nodes": []}))
        with self.assertRaisesRegex(Conflict, "does not route"):
            apply_handoff(self.root, self.handoff)
        self.assertEqual(self.entries(), {})

    def test_unresolved_locator_refuses_publication(self):
        self.handoff["evidence"]["sources"][0]["locator"] = "A removed source"
        with self.assertRaisesRegex(ValueError, "Unresolved locator"):
            apply_handoff(self.root, self.handoff)
        self.assertEqual(self.entries(), {})

    def test_history_cannot_be_used_as_a_canonical_source(self):
        history = self.root / "docs" / "harness-history"
        history.mkdir()
        evidence = history / "private.md"
        evidence.write_text("A source inside history")
        self.handoff["evidence"]["sources"] = [
            {"path": "docs/harness-history/private.md", "locator": "A source inside history"}
        ]
        with self.assertRaisesRegex(ValueError, "Cannot resolve an allowed project file"):
            apply_handoff(self.root, self.handoff)
        self.assertEqual(self.entries(), {})

    def test_update_preserves_following_prose_and_other_entries(self):
        with self.feature.open("a", encoding="utf-8") as output:
            output.write("\n## Orientações para o RED\n\n```json\n[]\n```\n\n## Keep\n\nOutside the section.\n")
        apply_handoff(self.root, self.handoff)
        other = copy.deepcopy(self.handoff)
        other["hypothesis_id"] = other["orientation"]["id"] = "another-rule"
        apply_handoff(self.root, other)
        apply_handoff(self.root, self.withdraw(1))
        self.assertEqual(self.entries(), {"another-rule": other["orientation"]})
        self.assertTrue(self.feature.read_text(encoding="utf-8").endswith("## Keep\n\nOutside the section.\n"))


if __name__ == "__main__":
    unittest.main()
