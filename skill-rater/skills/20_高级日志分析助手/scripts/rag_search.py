#!/usr/bin/env python3.10
"""TF-IDF similarity search over markdown case library."""

from __future__ import annotations

import argparse
import math
import re
import sys
from collections import Counter
from pathlib import Path


def tokenize(text: str) -> list[str]:
    text = text.lower()
    tokens = re.findall(r"[\w\u4e00-\u9fff]+", text)
    return [t for t in tokens if len(t) > 1]


def load_case(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def build_corpus(cases_dir: Path) -> list[tuple[Path, str, Counter[str]]]:
    docs: list[tuple[Path, str, Counter[str]]] = []
    for path in sorted(cases_dir.rglob("*.md")):
        raw = load_case(path)
        docs.append((path, raw, Counter(tokenize(raw))))
    return docs


def idf(corpus: list[Counter[str]]) -> dict[str, float]:
    n = len(corpus)
    df: Counter[str] = Counter()
    for doc in corpus:
        for term in doc:
            df[term] += 1
    return {term: math.log((1 + n) / (1 + count)) + 1.0 for term, count in df.items()}


def tfidf_vector(tokens: Counter[str], idf_map: dict[str, float]) -> dict[str, float]:
    total = sum(tokens.values()) or 1
    vec: dict[str, float] = {}
    for term, count in tokens.items():
        vec[term] = (count / total) * idf_map.get(term, 0.0)
    return vec


def cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    dot = sum(a[t] * b[t] for t in common)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def main() -> int:
    ap = argparse.ArgumentParser(description="Search similar cases")
    ap.add_argument("--query", required=True)
    ap.add_argument("--cases", type=Path, default=Path("data/cases"))
    ap.add_argument("--top", type=int, default=5)
    args = ap.parse_args()

    if not args.cases.is_dir():
        print(f"No case library at {args.cases}", file=sys.stderr)
        return 1

    docs = build_corpus(args.cases)
    if not docs:
        print(f"No .md cases under {args.cases}", file=sys.stderr)
        return 1

    counters = [c for _, _, c in docs]
    idf_map = idf(counters)
    q_vec = tfidf_vector(Counter(tokenize(args.query)), idf_map)

    scored: list[tuple[float, Path, str]] = []
    for path, raw, ctr in docs:
        d_vec = tfidf_vector(ctr, idf_map)
        scored.append((cosine(q_vec, d_vec), path, raw))

    scored.sort(key=lambda x: x[0], reverse=True)
    for score, path, raw in scored[: args.top]:
        title = path.stem
        m = re.search(r"^#\s+(.+)$", raw, re.M)
        if m:
            title = m.group(1).strip()
        snippet = raw[:200].replace("\n", " ")
        print(f"{score:.3f}\t{path}\t{title}\n  {snippet}...\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
