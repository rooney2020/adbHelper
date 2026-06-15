#!/usr/bin/env python3.10
"""Extract log lines matching a session id."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description="Filter logs by session id")
    ap.add_argument("input", type=Path)
    ap.add_argument("session_id")
    ap.add_argument("-o", "--output", type=Path)
    args = ap.parse_args()

    pattern = re.compile(re.escape(args.session_id), re.I)
    lines_out: list[str] = []
    with args.input.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if pattern.search(line):
                lines_out.append(line)

    text = "".join(lines_out)
    if args.output:
        args.output.write_text(text, encoding="utf-8")
        print(f"Wrote {len(lines_out)} lines -> {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
