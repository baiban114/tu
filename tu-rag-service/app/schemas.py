from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RagIndexDocument(BaseModel):
    kbId: str
    pageId: str
    blockId: str
    title: str | None = None
    content: str
    blockType: str | None = None
    updatedAt: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RagIndexRequest(BaseModel):
    kbId: str
    pageId: str
    documents: list[RagIndexDocument] = Field(default_factory=list)


class RagDeleteRequest(BaseModel):
    kbId: str
    pageId: str | None = None
    pageIds: list[str] | None = None


class RagQueryRequest(BaseModel):
    kbId: str
    query: str
    topK: int | None = 5


class RagSource(BaseModel):
    kbId: str
    pageId: str
    blockId: str
    title: str | None = None
    content: str
    blockType: str | None = None
    score: float | None = None


class RagQueryResponse(BaseModel):
    answer: str
    sources: list[RagSource] = Field(default_factory=list)
