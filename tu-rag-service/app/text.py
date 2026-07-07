from __future__ import annotations

import re


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        return []
    if len(normalized) <= chunk_size:
        return [normalized]

    chunks: list[str] = []
    start = 0
    step = max(1, chunk_size - overlap)
    while start < len(normalized):
        end = min(len(normalized), start + chunk_size)
        chunks.append(normalized[start:end].strip())
        if end >= len(normalized):
            break
        start += step
    return [chunk for chunk in chunks if chunk]


def source_excerpt(text: str, limit: int = 180) -> str:
    normalized = normalize_text(text)
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit].rstrip()}..."
