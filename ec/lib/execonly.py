#!/usr/bin/env python3
"""
Emit only EXECUTABLE shell lines, so a privilege audit cannot be fooled by text
that merely *looks* like documentation.

Two things are stripped: comments, and heredoc bodies that are provably inert.

HEREDOC RULE (structural, not a special case)
  A heredoc body is stripped ONLY when the command owning it is an inert emitter
  (cat / tee / echo / printf / :) AND that command line contains no pipe into an
  interpreter. In every other case the body is EMITTED AS CODE, because the
  interpreter will execute it.

  Default-deny is deliberate. The earlier version stripped every heredoc body,
  so this hid from the audit entirely:

      bash <<'HIDDEN'
      sudo bash -c 'echo pwned as root'
      HIDDEN

  Under the current rule the owning command is `bash`, which is not inert, so
  the body is emitted and the audit sees the payload. The same holds for
  `cat <<EOF | bash`, because the pipe-into-interpreter test fires on the
  command line regardless of the leading `cat`.

Lines are printed as "path:line" so callers can grep with provenance.
"""
import sys, re

INERT_CMDS = {"cat", "tee", "echo", "printf", ":", "true"}
INTERP_RE = re.compile(
    r"\|\s*(?:sudo\s+|env\s+|command\s+)*(?:/[\w./-]*/)?"
    r"(?:ba|da|k|z)?sh\b|\|\s*python3?\b|\|\s*perl\b|\|\s*ruby\b|\|\s*node\b"
)
HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*")

def first_word(line):
    """First command token, skipping redirections and VAR=value prefixes."""
    for tok in line.strip().split():
        if tok.startswith(("<", ">", "&", "|", "(", "{")):
            continue
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tok):
            continue
        return tok.rsplit("/", 1)[-1]
    return ""

def body_is_code(cmd_line):
    """True when the interpreter owning this heredoc will execute its body."""
    if INTERP_RE.search(cmd_line):        # ... <<EOF | bash
        return True
    return first_word(cmd_line) not in INERT_CMDS

def main(paths):
    for path in paths:
        try:
            lines = open(path, errors="replace").read().splitlines(True)
        except OSError as e:
            print(f"{path}:<<unreadable: {e}>>", file=sys.stderr)
            continue
        i, n = 0, len(lines)
        while i < n:
            line = lines[i]
            if line.lstrip().startswith("#"):
                i += 1
                continue
            m = HEREDOC_RE.search(line)
            if m:
                tag = m.group(2)
                as_code = body_is_code(line)
                sys.stdout.write(f"{path}:{line[:m.start()]}\n")   # the command itself
                i += 1
                while i < n and lines[i].strip() != tag:
                    if as_code:
                        sys.stdout.write(f"{path}:{lines[i]}")
                    i += 1
                i += 1                                             # consume terminator
                continue
            sys.stdout.write(f"{path}:{line}")
            i += 1

if __name__ == "__main__":
    main(sys.argv[1:])
