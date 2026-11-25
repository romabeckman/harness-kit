"""Shared fenced graph extraction for documentation tools."""

import json
import re


MAX_CANONICAL_DOCUMENT_CHARS = 20_000


def validate_canonical_document_size(text, document_type):
    size = len(text.replace("\r\n", "\n").replace("\r", "\n"))
    if size > MAX_CANONICAL_DOCUMENT_CHARS:
        raise ValueError(
            f"{document_type} document has {size:,} characters. "
            f"Maximum: {MAX_CANONICAL_DOCUMENT_CHARS:,}. "
            "Consider compacting the text or splitting it into documents with distinct responsibilities."
        )


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def graph_block(text):
    """Read the single graph object, ignoring fenced examples."""
    fence = None
    capture = False
    buffer = []
    graphs = []
    for line in text.splitlines():
        if fence:
            if re.fullmatch(r" {0,3}" + re.escape(fence[0]) +
                            "{" + str(len(fence)) + r",}\s*", line):
                if capture:
                    graphs.append("\n".join(buffer))
                fence = None
                capture = False
            elif capture:
                buffer.append(line)
            continue
        opening = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if opening:
            fence = opening[1]
            capture = opening[2].strip() == "graph"
            buffer = []
            continue
    if capture:
        raise ValueError("Unclosed graph block")
    if len(graphs) > 1:
        raise ValueError("Duplicate graph blocks")
    if not graphs:
        return None
    graph = json.loads(graphs[0], object_pairs_hook=unique_object)
    if not isinstance(graph, dict):
        raise ValueError("Graph must be an object")
    return graph
