#!/usr/bin/env python3
"""Emit JavaScript/ESM source with // and /* */ comments removed.

String and template-literal contents are preserved so command text passed to
child-process APIs remains visible to the privilege audit. Output keeps one line
per input line and prefixes it with the source path, matching execonly.py.
"""
from __future__ import annotations

import re
import sys


def strip_comments(source: str) -> str:
    out: list[str] = []
    mode = "code"
    escaped = False
    i = 0

    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""

        if mode == "line_comment":
            if ch == "\n":
                out.append(ch)
                mode = "code"
            else:
                out.append(" ")
            i += 1
            continue

        if mode == "block_comment":
            if ch == "*" and nxt == "/":
                out.extend((" ", " "))
                mode = "code"
                i += 2
            else:
                out.append("\n" if ch == "\n" else " ")
                i += 1
            continue

        if mode in {"single", "double", "template"}:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif (mode == "single" and ch == "'") or (mode == "double" and ch == '"') or (mode == "template" and ch == "`"):
                mode = "code"
            i += 1
            continue

        if ch == "/" and nxt == "/":
            out.extend((" ", " "))
            mode = "line_comment"
            i += 2
        elif ch == "/" and nxt == "*":
            out.extend((" ", " "))
            mode = "block_comment"
            i += 2
        else:
            out.append(ch)
            if ch == "'":
                mode = "single"
            elif ch == '"':
                mode = "double"
            elif ch == "`":
                mode = "template"
            i += 1

    return "".join(out)


CALL_RE = re.compile(
    r"execFile(?:Sync)?\s*\(\s*(['\"])(?P<command>.*?)\1\s*,\s*\[(?P<args>.*?)\]",
    re.DOTALL,
)
STRING_RE = re.compile(r"(['\"])(.*?)\1", re.DOTALL)


def privilege_findings(source: str, path: str) -> list[str]:
    clean = strip_comments(source)
    findings: dict[tuple[int, str], str] = {}

    def add(offset: int, kind: str, text: str) -> None:
        line = clean.count("\n", 0, offset) + 1
        snippet = " ".join(text.split())[:240]
        findings[(line, kind)] = f"{path}:line={line}:{kind}:{snippet}"

    for match in CALL_RE.finditer(clean):
        command = match.group("command")
        args = match.group("args")
        strings = [item.group(2) for item in STRING_RE.finditer(args)]
        approved = (
            command == "sudo"
            and strings[:3] == ["-n", "-u", "postgres"]
            and (
                re.search(r"['\"]postgres['\"]\s*,\s*PGADMIN\b", args)
                or "/usr/local/sbin/ec-pgadmin" in strings
            )
        )
        call_text = match.group(0)
        privileged = (
            command == "su" and strings[:1] == ["postgres"]
        ) or (
            command == "sudo" and "-u" in strings and "postgres" in strings and not approved
        )
        shell_c = command in {"sh", "bash", "dash", "ksh", "zsh"} and strings[:1] == ["-c"]
        shell_c = shell_c or (privileged and any(
            strings[i:i + 2] == [shell, "-c"]
            for shell in ("sh", "bash", "dash", "ksh", "zsh")
            for i in range(len(strings) - 1)
        ))
        raw_db = command in {"psql", "createdb", "dropdb"} or bool(
            re.search(r"\b(?:psql|createdb|dropdb)\s+-", args)
        )
        if privileged:
            add(match.start(), "FORBIDDEN_PRIVILEGE", call_text)
        if shell_c:
            add(match.start(), "PRIVILEGED_SHELL_C", call_text)
        if raw_db:
            add(match.start(), "RAW_DB", call_text)

    for offset, line in _lines_with_offsets(clean):
        if re.search(r"\bsu\s+postgres\b|\bsudo(?:\s+-n)?\s+-u\s+postgres\b", line):
            add(offset, "FORBIDDEN_PRIVILEGE", line)
        if re.search(r"\b(?:ba|da|k|z)?sh\s+-c\b", line):
            add(offset, "PRIVILEGED_SHELL_C", line)
        if re.search(r"\b(?:psql|createdb|dropdb)\s+-", line):
            add(offset, "RAW_DB", line)

    return [findings[key] for key in sorted(findings)]


def _lines_with_offsets(source: str):
    offset = 0
    for line in source.splitlines():
        yield offset, line
        offset += len(line) + 1


def main(paths: list[str], privilege: bool = False) -> int:
    failed = False
    for path in paths:
        try:
            source = open(path, encoding="utf-8", errors="replace").read()
        except OSError as exc:
            print(f"{path}:<<unreadable: {exc}>>", file=sys.stderr)
            failed = True
            continue
        if privilege:
            print(*privilege_findings(source, path), sep="\n")
        else:
            for line in strip_comments(source).splitlines():
                if line.strip():
                    print(f"{path}:{line}")
    return 1 if failed else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    privilege = bool(args and args[0] == "--privilege")
    raise SystemExit(main(args[1:] if privilege else args, privilege=privilege))
