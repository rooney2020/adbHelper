#!/usr/bin/env python3.10
"""Render timeline.json as a Markdown table for reports."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_timeline(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def event_summary(ev: dict[str, Any]) -> str:
    parts = [ev.get("event", "")]
    detail = ev.get("detail") or {}
    if "confidence" in detail:
        parts.append(f"conf={detail['confidence']}")
    if detail.get("session_id"):
        parts.append(f"session={detail['session_id']}")
    return " ".join(p for p in parts if p)


def to_markdown(data: dict[str, Any], session: str | None = None) -> str:
    sid = session or data.get("session_id") or "unknown"
    lines = [f"## 时间线（session: {sid}）", ""]
    lines.append("| 时间 | 模块 | 事件 | 证据 |")
    lines.append("|------|------|------|------|")
    for ev in data.get("events", []):
        ref = f"{ev.get('source', '')} {ev.get('source_ref', '')}".strip()
        lines.append(
            f"| {ev.get('ts', '')} | {ev.get('module', '')} | "
            f"{event_summary(ev)} | {ref} |"
        )
    modules = [e.get("module") for e in data.get("events", []) if e.get("module")]
    if modules:
        path = " → ".join(dict.fromkeys(modules))
        lines.extend(["", f"**关键路径**: {path}"])
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Timeline JSON → Markdown")
    ap.add_argument("timeline_json", type=Path)
    ap.add_argument("-o", "--output", type=Path)
    ap.add_argument("--session", help="Override session id in heading")
    args = ap.parse_args()

    data = load_timeline(args.timeline_json)
    md = to_markdown(data, args.session)
    if args.output:
        args.output.write_text(md, encoding="utf-8")
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
