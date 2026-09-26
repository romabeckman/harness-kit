#!/usr/bin/env python3
"""Read-only structural validation of document knowledge, not evidence truth."""

import argparse
import json
import re
from pathlib import Path


TYPES = {"capability", "rule", "contract", "decision"}
RELATIONS = {
    "constrained_by": ({"capability", "contract"}, {"rule"}),
    "exposes": ({"capability"}, {"contract"}),
    "depends_on": ({"capability", "contract"}, {"capability", "contract"}),
    "governed_by": ({"capability", "rule", "contract"}, {"decision"}),
}
ENTITY_FIELDS = {"id", "type", "label", "definition", "aliases"}
CLAIM_FIELDS = {
    "id", "subject", "relation", "object", "statement", "kind", "status",
    "evidence", "derived_from", "gap",
}
EVIDENCE_KINDS = {
    "request", "specification", "code", "configuration", "test_definition", "execution",
}
LOCAL_ID = re.compile(r"[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*\Z")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def string(value):
    return isinstance(value, str) and bool(value.strip())


def fields(value, expected, where):
    require(isinstance(value, dict) and set(value) == expected, f"{where}: invalid fields")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def knowledge_block(text):
    """Ignore headings inside fenced examples; keep subsections within KNOWLEDGE."""
    active = False
    found = False
    fence = None
    capture = False
    buffer = []
    blocks = []
    for line in text.splitlines():
        if fence:
            if re.fullmatch(r" {0,3}" + re.escape(fence[0]) +
                            "{" + str(len(fence)) + r",}\s*", line):
                if capture:
                    blocks.append("\n".join(buffer))
                fence = None
                capture = False
            elif capture:
                buffer.append(line)
            continue
        opening = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if opening:
            fence = opening[1]
            capture = active and opening[2].strip() == "json"
            buffer = []
            continue
        heading = re.match(r"^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if heading and len(heading[1]) <= 2:
            active = heading[1] == "##" and heading[2] == "KNOWLEDGE"
            if active:
                require(not found, "Duplicate KNOWLEDGE section")
                found = True
    if not found:
        return None
    require(not capture and len(blocks) == 1, "KNOWLEDGE must contain one closed JSON block")
    return json.loads(blocks[0], object_pairs_hook=unique_object)


class Validator:
    def __init__(self, docs_dir):
        self.docs = Path(docs_dir).resolve()
        self.project = self.docs.parent
        index = json.loads((self.docs / ".graph.json").read_text(encoding="utf-8"),
                           object_pairs_hook=unique_object)
        require(isinstance(index, dict) and isinstance(index.get("nodes"), list),
                "Invalid document graph nodes")
        self.paths = {}
        for node in index["nodes"]:
            require(isinstance(node, dict) and string(node.get("id")) and
                    string(node.get("path")), "Invalid document graph node")
            require(node["id"] not in self.paths, f"Duplicate document ID: {node['id']}")
            path = (self.project / node["path"]).resolve()
            allowed = any(path.is_relative_to(self.docs / folder) for folder in ("adr", "feature"))
            require(allowed and path.suffix == ".md" and path.is_file(),
                    f"Invalid document path: {node['path']}")
            self.paths[node["id"]] = path
        self.records = {}
        self.claims = {}
        self.skipped = set()

    def load(self, document):
        if document in self.records:
            return
        require(document in self.paths, f"Unknown document ID: {document}")
        try:
            data = knowledge_block(self.paths[document].read_text(encoding="utf-8"))
            if data is None:
                self.records[document] = {}
                self.skipped.add(document)
                return
            fields(data, {"schema_version", "entities", "claims"}, document)
            require(type(data["schema_version"]) is int and data["schema_version"] == 1,
                    "Unsupported schema_version")
            records = {}
            for category in ("entities", "claims"):
                require(isinstance(data[category], list), f"{category} must be an array")
                for item in data[category]:
                    fields(item, ENTITY_FIELDS if category == "entities" else CLAIM_FIELDS, category)
                    identifier = item["id"]
                    require(string(identifier) and LOCAL_ID.fullmatch(identifier), "Invalid local ID")
                    require(identifier not in records, f"Duplicate ID: {identifier}")
                    records[identifier] = item
                    if category == "entities":
                        require(string(item["type"]) and item["type"] in TYPES and
                                identifier.split(":", 1)[0] == item["type"], "Invalid entity type/ID")
                        require(string(item["label"]) and string(item["definition"]), "Empty entity text")
                        require(isinstance(item["aliases"], list) and all(map(string, item["aliases"])),
                                "Invalid aliases")
                    else:
                        require(identifier.startswith("claim:"), "Invalid claim ID")
                        self.check_claim(item)
            self.records[document] = records
            for claim in data["claims"]:
                self.claims[(document, claim["id"])] = claim
        except ValueError as error:
            raise ValueError(f"{document}: {error}") from error

    @staticmethod
    def check_claim(claim):
        require(string(claim["subject"]) and string(claim["statement"]), "Invalid claim text")
        require(claim["kind"] in ("requirement", "observation", "hypothesis"), "Invalid claim kind")
        require(claim["status"] in ("supported", "unresolved", "conflicted", "stale"),
                "Invalid claim status")
        relation = claim["relation"]
        require((relation is None and claim["object"] is None) or
                (string(relation) and relation in RELATIONS and string(claim["object"])),
                "Invalid relation/object pair")
        require(isinstance(claim["evidence"], list), "Evidence must be an array")
        for evidence in claim["evidence"]:
            fields(evidence, {"kind", "source", "locator", "snapshot"}, "evidence")
            require(string(evidence["kind"]) and evidence["kind"] in EVIDENCE_KINDS,
                    "Invalid evidence kind")
            require(string(evidence["source"]) and string(evidence["locator"]) and
                    (evidence["snapshot"] is None or string(evidence["snapshot"])),
                    "Invalid evidence locator/snapshot")
        require(isinstance(claim["derived_from"], list) and
                all(map(string, claim["derived_from"])), "Invalid derivation references")
        if claim["status"] == "supported":
            require(claim["kind"] != "hypothesis" and claim["evidence"] and claim["gap"] is None,
                    "Supported claim requires evidence, no gap, and non-hypothesis kind")
        else:
            require(string(claim["gap"]), "Non-supported claim requires a gap")
        if claim["status"] == "conflicted":
            require(len(claim["evidence"]) >= 2, "Conflicted claim requires both evidence sources")
        if claim["status"] == "stale":
            require(claim["evidence"], "Stale claim requires prior evidence")

    def resolve(self, owner, reference, category):
        if "#" in reference:
            document, identifier = reference.split("#", 1)
        else:
            document, identifier = owner, reference
        require(LOCAL_ID.fullmatch(identifier), f"Invalid reference: {reference}")
        self.load(document)
        item = self.records[document].get(identifier)
        require(item is not None and ("type" in item) == (category == "entity"),
                f"{owner}: unresolved {category} reference {reference}")
        return (document, identifier), item

    def validate(self, documents=None):
        selected = list(self.paths) if documents is None else documents
        for document in selected:
            self.load(document)
        dependencies = {}
        while pending := set(self.claims) - set(dependencies):
            for key in sorted(pending):
                claim = self.claims[key]
                _, subject = self.resolve(key[0], claim["subject"], "entity")
                if claim["relation"] is not None:
                    _, target = self.resolve(key[0], claim["object"], "entity")
                    origins, targets = RELATIONS[claim["relation"]]
                    require(subject["type"] in origins and target["type"] in targets,
                            f"{key}: invalid relation endpoint types")
                dependencies[key] = [self.resolve(key[0], ref, "claim")[0]
                                     for ref in claim["derived_from"]]
        # Topological elimination rejects only derivation cycles, not domain dependencies.
        remaining = {key: set(refs) for key, refs in dependencies.items()}
        while remaining:
            ready = {key for key, refs in remaining.items() if not refs}
            require(ready, "Circular claim derivation")
            remaining = {key: refs - ready for key, refs in remaining.items() if key not in ready}
        return {"documents_checked": len(self.records), "claims_checked": len(self.claims),
                "without_knowledge": sorted(self.skipped), "evidence_verified": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docs_dir", type=Path)
    parser.add_argument("--document", action="append", help="Node ID; repeat to select documents")
    args = parser.parse_args()
    try:
        result = Validator(args.docs_dir).validate(args.document)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Ontology validation failed: {error}\n")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
