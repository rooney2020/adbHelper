#!/usr/bin/env python3.10
"""Parse logcat/dialogue logs into a unified timeline JSON."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional

# Dialogue / pipeline keywords -> module
MODULE_PATTERNS: list[tuple[str, str]] = [
    (r"wakeup|wake_success|hotword|唤醒", "wakeup"),
    (r"\basr\b|recognition|partial|confidence", "asr"),
    (r"\bnlu\b|intent|slot|semantic", "nlu"),
    (r"fallback|reject|domain|router", "router"),
    (r"\btts\b|speak|playback|播报", "tts"),
    (r"timeout|network|http|grpc|dns", "network"),
]

LOGCAT_RE = re.compile(
    r"^(?:(\d{2}-\d{2})\s+)?(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}:\d{2})\s+"
    r"\d+\s+\d+\s+([VDIWEF])\s+([^:]+):\s*(.*)$"
)
DIALOGUE_TS_RE = re.compile(
    r"^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[([^\]]+)\]\s*(.*)$", re.I
)
BRACKET_TS_RE = re.compile(r"^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(.*)$")


@dataclass
class TimelineEvent:
    ts: str
    ts_epoch_ms: Optional[int] = None
    module: str = "unknown"
    event: str = ""
    detail: dict[str, Any] = field(default_factory=dict)
    source: str = ""
    source_ref: str = ""

    def sort_key(self) -> tuple[str, int]:
        return (self.ts, self.ts_epoch_ms or 0)


def infer_module(text: str) -> str:
    lower = text.lower()
    for pattern, module in MODULE_PATTERNS:
        if re.search(pattern, lower, re.I):
            return module
    return "unknown"


def parse_ts_to_epoch_ms(ts: str, date_prefix: Optional[str] = None) -> Optional[int]:
    try:
        if "." in ts:
            fmt = "%H:%M:%S.%f"
            dt = datetime.strptime(ts, fmt)
        else:
            dt = datetime.strptime(ts, "%H:%M:%S")
        if date_prefix:
            d = datetime.strptime(date_prefix, "%m-%d")
            dt = dt.replace(month=d.month, day=d.day)
        return int(dt.timestamp() * 1000)
    except ValueError:
        return None


def extract_session(text: str) -> Optional[str]:
    m = re.search(r"(?:session|session_id|request_id|trace_id)[=:\s]+(\S+)", text, re.I)
    return m.group(1).rstrip(",;") if m else None


def normalize_event_name(module: str, message: str) -> str:
    lower = message.lower()
    if module == "wakeup" and re.search(r"success|成功", lower):
        return "wakeup_success"
    if module == "asr" and "start" in lower:
        return "asr_start"
    if module == "asr" and ("end" in lower or "final" in lower):
        return "asr_end"
    if module == "nlu" and re.search(r"fail|error|timeout", lower):
        return "nlu_fail"
    if module == "router" and "fallback" in lower:
        return "intent_fallback"
    if module == "tts" and re.search(r"start|speak", lower):
        return "tts_start"
    if module == "network" and "timeout" in lower:
        return "network_timeout"
    # fallback: first meaningful token
    words = re.findall(r"[a-z_]+", lower)
    return words[0] if words else "log_line"


def parse_logcat_line(line: str, line_no: int) -> Optional[TimelineEvent]:
    m = LOGCAT_RE.match(line.strip())
    if not m:
        return None
    date_prefix, ts, _level, tag, message = m.groups()
    full_msg = f"{tag}: {message}"
    module = infer_module(full_msg)
    detail: dict[str, Any] = {"level": _level, "tag": tag}
    conf = re.search(r"confidence[=:\s]+([\d.]+)", message, re.I)
    if conf:
        detail["confidence"] = float(conf.group(1))
    sid = extract_session(message)
    if sid:
        detail["session_id"] = sid
    return TimelineEvent(
        ts=ts,
        ts_epoch_ms=parse_ts_to_epoch_ms(ts, date_prefix),
        module=module,
        event=normalize_event_name(module, full_msg),
        detail=detail,
        source="logcat",
        source_ref=f"L{line_no}",
    )


def parse_dialogue_line(line: str, line_no: int) -> Optional[TimelineEvent]:
    stripped = line.strip()
    if not stripped:
        return None
    m = DIALOGUE_TS_RE.match(stripped)
    if m:
        ts, bracket, rest = m.groups()
        module = infer_module(bracket + " " + rest)
        message = rest
    else:
        m2 = BRACKET_TS_RE.match(stripped)
        if not m2:
            return None
        ts, message = m2.groups()
        module = infer_module(message)
    detail: dict[str, Any] = {}
    conf = re.search(r"confidence[=:\s]+([\d.]+)", message, re.I)
    if conf:
        detail["confidence"] = float(conf.group(1))
    sid = extract_session(stripped)
    if sid:
        detail["session_id"] = sid
    return TimelineEvent(
        ts=ts,
        ts_epoch_ms=parse_ts_to_epoch_ms(ts),
        module=module,
        event=normalize_event_name(module, message),
        detail=detail,
        source="dialogue",
        source_ref=f"L{line_no}",
    )


def load_lines(path: Path) -> Iterable[str]:
    with path.open(encoding="utf-8", errors="replace") as f:
        yield from f


def parse_generic_line(line: str, line_no: int) -> Optional[TimelineEvent]:
    """Try logcat then dialogue heuristics (for generic .log files)."""
    return parse_logcat_line(line, line_no) or parse_dialogue_line(line, line_no)


def parse_file(path: Path, mode: str) -> list[TimelineEvent]:
    events: list[TimelineEvent] = []
    if mode == "auto":
        parser = parse_generic_line
    elif mode == "logcat":
        parser = parse_logcat_line
    else:
        parser = parse_dialogue_line
    for i, line in enumerate(load_lines(path), start=1):
        ev = parser(line, i)
        if ev:
            events.append(ev)
    return events


def load_json_lines(path: Path) -> list[TimelineEvent]:
    events: list[TimelineEvent] = []
    with path.open(encoding="utf-8") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = obj.get("ts") or obj.get("timestamp") or obj.get("time", "")
            module = obj.get("module") or infer_module(json.dumps(obj))
            events.append(
                TimelineEvent(
                    ts=str(ts),
                    ts_epoch_ms=obj.get("ts_epoch_ms"),
                    module=module,
                    event=obj.get("event", obj.get("type", "event")),
                    detail={k: v for k, v in obj.items() if k not in ("ts", "event", "module")},
                    source="json-lines",
                    source_ref=f"L{i}",
                )
            )
    return events


def merge_sessions(events: list[TimelineEvent]) -> Optional[str]:
    for ev in events:
        sid = ev.detail.get("session_id")
        if sid:
            return str(sid)
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Build unified timeline from logs")
    ap.add_argument(
        "--log",
        type=Path,
        action="append",
        default=[],
        help="Generic .log file(s); auto-detect logcat vs dialogue per line",
    )
    ap.add_argument("--logcat", type=Path, action="append", default=[])
    ap.add_argument("--dialogue", type=Path, action="append", default=[])
    ap.add_argument("--json-lines", type=Path, action="append", default=[])
    ap.add_argument("-o", "--output", type=Path, required=True)
    args = ap.parse_args()

    all_events: list[TimelineEvent] = []
    files_meta: list[str] = []

    for p in args.log:
        all_events.extend(parse_file(p, "auto"))
        files_meta.append(str(p))
    for p in args.logcat:
        all_events.extend(parse_file(p, "logcat"))
        files_meta.append(str(p))
    for p in args.dialogue:
        all_events.extend(parse_file(p, "dialogue"))
        files_meta.append(str(p))
    for p in args.json_lines:
        all_events.extend(load_json_lines(p))
        files_meta.append(str(p))

    all_events.sort(key=lambda e: e.sort_key())

    out = {
        "events": [
            {**asdict(e), "detail": e.detail} for e in all_events
        ],
        "session_id": merge_sessions(all_events),
        "meta": {"files": files_meta, "event_count": len(all_events)},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(all_events)} events -> {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
