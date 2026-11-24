"""Apply a grounded Project Memory handoff to the routed feature."""

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "project-memory" / "scripts"))
from document_graph import graph_block, unique_object


HEADING = "## RED guidance"


class Conflict(ValueError):
    """An operation no longer matches the canonical feature state."""


def project_file(project, relative, directory=None):
    if not isinstance(relative, str) or not relative:
        raise ValueError("Expected a project-relative path")
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Path must be relative to the project: {relative}")
    target = (project / path).resolve()
    allowed = (project / directory).resolve() if directory else project
    history = (project / "docs/harness-history").resolve()
    if (not target.is_relative_to(project) or not target.is_relative_to(allowed)
            or target.is_relative_to(history) or not target.is_file()):
        raise ValueError(f"Cannot resolve an allowed project file: {relative}")
    return target


def require_text(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be nonempty text")


def positive_revision(value):
    return type(value) is int and value > 0


def verify_sources(project, sources):
    if not isinstance(sources, list) or not sources:
        raise ValueError("At least one verifiable source is required")
    for source in sources:
        locator = source["locator"]
        require_text(locator, "source locator")
        path = project_file(project, source["path"])
        if locator not in path.read_text(encoding="utf-8"):
            raise ValueError(f"Unresolved locator in {source['path']}: {locator}")


def routed_destination(project, handoff):
    node_id = handoff["feature_node_id"]
    index = project_file(project, "docs/.graph.json").read_text(encoding="utf-8")
    nodes = [node for node in json.loads(index, object_pairs_hook=unique_object)["nodes"]
             if node["id"] == node_id]
    destination = handoff["destination"]
    if len(nodes) != 1 or nodes[0]["path"] != destination:
        raise Conflict(f"{node_id} does not route uniquely to {destination}")
    path = project_file(project, destination, "docs/feature")
    if path.suffix != ".md":
        raise Conflict(f"{destination} is not a Markdown feature document")
    return path


def guidance_section(document):
    """Return the bounds of the section body and decode its orientation entries."""
    lines = document.splitlines(keepends=True)
    headings = []
    fence = None
    frontmatter = bool(lines and lines[0].strip() == "---")
    for index, line in enumerate(lines):
        if frontmatter:
            if index and line.strip() == "---":
                frontmatter = False
            continue
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if marker:
            token, remainder = marker.groups()
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence) and not remainder.strip():
                fence = None
            continue
        if fence is None and re.match(r"^ {0,3}#{1,2}[ \t]", line):
            headings.append((index, re.sub(r"[ \t]+#+$", "", line.strip())))

    matches = [position for position, (_, heading) in enumerate(headings)
               if heading in (HEADING, "## Orientações para o RED")]
    if len(matches) > 1:
        raise Conflict("Duplicate RED orientation sections")
    if not matches:
        before_references = next((index for index, heading in headings if heading == "## REFERENCES"), len(lines))
        return lines, None, before_references, {}
    position = matches[0]
    start = headings[position][0] + 1
    end = headings[position + 1][0] if position + 1 < len(headings) else len(lines)
    body = "".join(lines[start:end]).strip()
    if not body:
        return lines, start, end, {}
    block = re.fullmatch(r"```json\r?\n(.*?)\r?\n```", body, re.DOTALL)
    if not block:
        raise Conflict("Expected a JSON fence in the RED orientation section")
    entries = json.loads(block[1], object_pairs_hook=unique_object)
    if not isinstance(entries, list):
        raise Conflict("Expected an array of orientations")
    orientations = {}
    for entry in entries:
        if entry["id"] in orientations or not positive_revision(entry["revision"]):
            raise Conflict("Duplicate orientation ID or invalid revision")
        orientations[entry["id"]] = entry
    return lines, start, end, orientations


@contextmanager
def lock_directory(directory):
    import fcntl

    fd = os.open(directory, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def replace_document(path, original, updated):
    mode = stat.S_IMODE(path.stat().st_mode)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write(updated.encode("utf-8"))
            output.flush()
            os.fchmod(output.fileno(), mode)
            os.fsync(output.fileno())
            if path.read_bytes() != original:
                raise Conflict("Feature changed during publication")
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def apply_handoff(project, handoff):
    project = project.resolve()
    operation = handoff["operation"]
    orientation_id = handoff["hypothesis_id"]
    revision = handoff["revision"]
    expected = handoff["expected_published_revision"]
    require_text(orientation_id, "hypothesis_id")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", orientation_id):
        raise ValueError("Expected a lowercase kebab-case hypothesis ID")
    require_text(handoff["feature_node_id"], "feature_node_id")
    if not positive_revision(revision) or (expected is not None and not positive_revision(expected)):
        raise ValueError("Expected positive integer revisions")
    evidence = handoff["evidence"]
    require_text(evidence["result"], "evidence.result")
    verify_sources(project, evidence["sources"])
    if operation == "publish":
        require_text(evidence["evaluation_id"], "evidence.evaluation_id")
        orientation = handoff["orientation"]
        if (orientation["id"] != orientation_id or not positive_revision(orientation["revision"])
                or orientation["revision"] != revision):
            raise ValueError("Orientation identity must match the handoff")
        for field in ("applies_when", "action", "skip_when"):
            require_text(orientation[field], field)
        verify_sources(project, orientation["sources"])
        if expected is not None and revision <= expected:
            raise ValueError("Replacement must advance the published revision")
    elif operation == "withdraw" and expected == revision:
        orientation = None
    else:
        raise ValueError("Withdraw must specify the revision it expects to remove")

    path = routed_destination(project, handoff)
    receipt = {key: handoff[key] for key in (
        "operation", "destination", "feature_node_id", "hypothesis_id", "revision"
    )}
    with lock_directory(path.parent):
        if routed_destination(project, handoff) != path:
            raise Conflict("Feature routing changed during publication")
        original = path.read_bytes()
        document = original.decode("utf-8")
        graph = graph_block(document)
        if graph is None or graph["node_id"] != handoff["feature_node_id"]:
            raise Conflict("Feature micrograph does not match the destination")
        lines, start, end, orientations = guidance_section(document)
        current = orientations.get(orientation_id)
        if current == orientation:
            receipt["result"] = "already_current"
        else:
            current_revision = current["revision"] if current else None
            if current_revision != expected:
                raise Conflict(f"Expected published revision {expected}, found {current_revision}")
            if orientation is None:
                del orientations[orientation_id]
            else:
                orientations[orientation_id] = orientation
            newline = "\r\n" if "\r\n" in document else "\n"
            payload = json.dumps(list(orientations.values()), ensure_ascii=False, separators=(",", ":"))
            body = "\n```json\n" + payload
            body = (body + "\n```\n\n").replace("\n", newline)
            if start is None:
                before = "".join(lines[:end])
                separator = "" if before.endswith(newline * 2) else newline
                if not before.endswith(newline):
                    separator += newline
                updated = before + separator + HEADING + newline + body + "".join(lines[end:])
            else:
                lines[start - 1] = HEADING + newline
                updated = "".join(lines[:start]) + body + "".join(lines[end:])
            if guidance_section(updated)[3] != orientations:
                raise Conflict("Updated document would hide or change the published orientations")
            replace_document(path, original, updated)
            receipt["result"] = "written"
        if (routed_destination(project, handoff) != path
                or guidance_section(path.read_text(encoding="utf-8"))[3].get(orientation_id) != orientation):
            raise Conflict("Could not confirm canonical orientation after the operation")

    receipt["checks"] = ["feature route and node", "source locators", "published ID, revision and content"]
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    args = parser.parse_args()
    try:
        handoff = json.load(sys.stdin, object_pairs_hook=unique_object)
        receipt = apply_handoff(args.project, handoff)
    except (ValueError, KeyError, TypeError, OSError, ImportError) as error:
        print(json.dumps({"result": "conflict", "reason": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(receipt, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
