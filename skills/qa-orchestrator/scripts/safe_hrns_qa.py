#!/usr/bin/env python3
"""Preview and safely execute approved ``hrns qa`` commands."""

from __future__ import annotations

import argparse
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence


ALLOWED_ACTIONS = {"run", "report", "exploratory", "auth"}
SECRET_FLAGS = {
    "--api-key",
    "--credential",
    "--credentials",
    "--password",
    "--secret",
    "--token",
}
WINDOWS_BATCH_METACHARACTERS = frozenset("&|<>^%!")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preview an hrns qa command; add --execute only after approval."
    )
    parser.add_argument("--execute", action="store_true", help="run instead of preview")
    parser.add_argument("--cwd", type=Path, default=Path.cwd(), help="working directory")
    parser.add_argument("--executable", default="hrns", help="hrns executable or node")
    parser.add_argument(
        "--prefix-arg",
        action="append",
        default=[],
        help="argument before 'qa'; repeat for source-checkout launchers",
    )
    parser.add_argument("qa_args", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if args.qa_args[:1] == ["--"]:
        args.qa_args = args.qa_args[1:]
    return args


def validate(args: argparse.Namespace) -> tuple[Path, list[str]]:
    cwd = args.cwd.expanduser().resolve(strict=True)
    if not cwd.is_dir():
        raise ValueError(f"working directory is not a directory: {cwd}")

    executable = shutil.which(args.executable)
    if executable is None:
        candidate = Path(args.executable).expanduser()
        if not candidate.is_absolute():
            candidate = cwd / candidate
        executable = str(candidate.resolve(strict=True))
        if not Path(executable).is_file():
            raise ValueError(f"executable is not a file: {executable}")

    command = [executable, *args.prefix_arg, *args.qa_args]
    qa_index = 1 + len(args.prefix_arg)
    if command[qa_index : qa_index + 1] != ["qa"]:
        raise ValueError("command must start with 'qa'")

    qa_options = command[qa_index + 1 :]
    action = qa_options[0] if qa_options and not qa_options[0].startswith("-") else None
    if action is not None and action not in ALLOWED_ACTIONS:
        raise ValueError(f"unsupported qa action: {action}")
    if action == "run" and "--report" not in qa_options:
        raise ValueError("qa run requires --report")

    for value in command[qa_index + 1 :]:
        if "\x00" in value or "\r" in value or "\n" in value:
            raise ValueError("arguments cannot contain NUL or newline characters")
        flag = value.split("=", 1)[0].lower()
        if flag in SECRET_FLAGS:
            raise ValueError(f"credential values are forbidden; use named --auth: {flag}")

    if os.name == "nt" and Path(executable).suffix.lower() in {".bat", ".cmd"}:
        unsafe = next(
            (
                value
                for value in command[1:]
                if any(character in value for character in WINDOWS_BATCH_METACHARACTERS)
            ),
            None,
        )
        if unsafe is not None:
            raise ValueError("Windows batch launcher arguments cannot contain cmd metacharacters")

    return cwd, command


def display_command(command: Sequence[str]) -> str:
    return subprocess.list2cmdline(command) if os.name == "nt" else shlex.join(command)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_args(argv if argv is not None else sys.argv[1:])
        cwd, command = validate(args)
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    print(f"Working directory: {cwd}")
    print(f"Command: {display_command(command)}")
    if not args.execute:
        print("Preview only. Re-run with --execute after explicit confirmation.")
        return 0

    try:
        return subprocess.run(command, cwd=cwd, shell=False, check=False).returncode
    except OSError as error:
        print(f"error: failed to start command: {error}", file=sys.stderr)
        return 126


if __name__ == "__main__":
    raise SystemExit(main())
