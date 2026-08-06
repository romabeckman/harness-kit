#!/usr/bin/env python3
"""
tests/unit/test_generate_docs_graph.py
---------------------------------------
Suíte de testes unitários para a ferramenta generate_docs_graph.py
"""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

# Importar o módulo do script
sys_path_added = False
script_dir = Path(__file__).resolve().parent.parent.parent / "skills" / "project-memory" / "scripts"
import sys
if str(script_dir) not in sys.path:
    sys.path.insert(0, str(script_dir))
    sys_path_added = True

from generate_docs_graph import parse_markdown_file, build_docs_graph


class TestGenerateDocsGraph(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.docs_dir = Path(self.test_dir) / "docs"
        self.docs_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_parse_markdown_file_full_frontmatter(self):
        """Testa extração de nó e edges a partir de YAML frontmatter completo."""
        doc_path = self.docs_dir / "feature" / "my_feature.md"
        doc_path.parent.mkdir(parents=True, exist_ok=True)
        content = """---
doc_type: feature
domain: billing
stack: python
node_id: feature:my-feature
tags:
  - billing
  - payment
edges:
  - relation: depends_on
    target: adr:architecture
  - relation: tested_by
    target: adr:tests
updated: '2026-08-06'
---

# My Billing Feature

Documentation content goes here.
"""
        doc_path.write_text(content, encoding="utf-8")

        node, edges = parse_markdown_file(doc_path, self.docs_dir.parent)

        self.assertEqual(node["id"], "feature:my-feature")
        self.assertEqual(node["type"], "feature")
        self.assertEqual(node["title"], "My Billing Feature")
        self.assertEqual(node["tags"], ["billing", "payment"])
        self.assertEqual(len(edges), 2)
        self.assertEqual(edges[0], {"source": "feature:my-feature", "target": "adr:architecture", "relation": "depends_on"})
        self.assertEqual(edges[1], {"source": "feature:my-feature", "target": "adr:tests", "relation": "tested_by"})

    def test_parse_markdown_file_embedded_graph_block(self):
        """Testa extração de arestas a partir do bloco ```graph."""
        doc_path = self.docs_dir / "feature" / "embedded.md"
        doc_path.parent.mkdir(parents=True, exist_ok=True)
        content = """---
doc_type: feature
node_id: feature:embedded
tags:
  - test
---

```graph
{
  "node_id": "feature:embedded",
  "tested_by": "adr:tests",
  "depends_on": ["adr:architecture", "adr:database"]
}
```

# Embedded Graph Feature
"""
        doc_path.write_text(content, encoding="utf-8")

        node, edges = parse_markdown_file(doc_path, self.docs_dir.parent)

        self.assertEqual(node["id"], "feature:embedded")
        self.assertEqual(len(edges), 3)
        relations = [(e["target"], e["relation"]) for e in edges]
        self.assertIn(("adr:tests", "tested_by"), relations)
        self.assertIn(("adr:architecture", "depends_on"), relations)
        self.assertIn(("adr:database", "depends_on"), relations)

    def test_build_docs_graph_directory_traversal(self):
        """Testa varredura recursiva de diretórios ignorando o README root."""
        # Criar arquivos em diferentes subdiretórios
        (self.docs_dir / "README.md").write_text("# Root README", encoding="utf-8")
        
        adr_doc = self.docs_dir / "adr" / "ARCHITECTURE.md"
        adr_doc.parent.mkdir(parents=True, exist_ok=True)
        adr_doc.write_text("""---
doc_type: adr
node_id: adr:architecture
tags: [arch]
---
# Architecture
""", encoding="utf-8")

        feat_doc = self.docs_dir / "feature" / "brand" / "JEEP.md"
        feat_doc.parent.mkdir(parents=True, exist_ok=True)
        feat_doc.write_text("""---
doc_type: feature
node_id: feature:jeep
tags: [brand]
edges:
  - relation: depends_on
    target: adr:architecture
---
# Jeep Brand
""", encoding="utf-8")

        graph = build_docs_graph(self.docs_dir)

        # Não deve incluir README.md root
        paths = [n["path"] for n in graph["nodes"]]
        self.assertNotIn("docs/README.md", paths)

        # Deve conter 2 nós
        self.assertEqual(len(graph["nodes"]), 2)
        node_ids = [n["id"] for n in graph["nodes"]]
        self.assertIn("adr:architecture", node_ids)
        self.assertIn("feature:jeep", node_ids)

        # Deve conter 1 edge
        self.assertEqual(len(graph["edges"]), 1)
        self.assertEqual(graph["edges"][0], {
            "source": "feature:jeep",
            "target": "adr:architecture",
            "relation": "depends_on"
        })


if __name__ == "__main__":
    unittest.main()
