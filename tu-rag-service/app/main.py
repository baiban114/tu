from __future__ import annotations

from fastapi import FastAPI, HTTPException

from .embedding import embed_text
from .qdrant import QdrantStore, point_id
from .schemas import RagDeleteRequest, RagIndexRequest, RagQueryRequest, RagQueryResponse, RagSource
from .settings import settings
from .text import chunk_text, source_excerpt

app = FastAPI(title="tu-rag-service")
store = QdrantStore(settings.qdrant_url, settings.qdrant_collection, settings.vector_size)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/internal/rag/index")
async def index(request: RagIndexRequest) -> dict[str, int]:
    points = []
    for document in request.documents:
        chunks = chunk_text(document.content, settings.chunk_size, settings.chunk_overlap)
        for index, chunk in enumerate(chunks):
            payload = {
                "kbId": document.kbId,
                "pageId": document.pageId,
                "blockId": document.blockId,
                "title": document.title,
                "content": chunk,
                "blockType": document.blockType,
                "updatedAt": document.updatedAt,
                "metadata": document.metadata,
                "chunkIndex": index,
            }
            points.append(
                {
                    "id": point_id(document.pageId, document.blockId, index),
                    "vector": embed_text(chunk, settings.vector_size),
                    "payload": payload,
                }
            )

    await store.replace_page(request.kbId, request.pageId, points)
    return {"indexed": len(points)}


@app.post("/internal/rag/delete")
async def delete(request: RagDeleteRequest) -> dict[str, str]:
    await store.delete(request.kbId, request.pageId, request.pageIds)
    return {"status": "ok"}


@app.post("/internal/rag/query", response_model=RagQueryResponse)
async def query(request: RagQueryRequest) -> RagQueryResponse:
    query_text = request.query.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="query is required")

    limit = max(1, min(request.topK or 5, 20))
    results = await store.search(request.kbId, embed_text(query_text, settings.vector_size), limit)
    sources = [
        RagSource(
            kbId=payload.get("kbId"),
            pageId=payload.get("pageId"),
            blockId=payload.get("blockId"),
            title=payload.get("title"),
            content=payload.get("content") or "",
            blockType=payload.get("blockType"),
            score=result.get("score"),
        )
        for result in results
        for payload in [result.get("payload") or {}]
    ]

    if not sources:
        return RagQueryResponse(answer="No relevant content was found in the current knowledge base.", sources=[])

    answer_lines = ["Relevant information was found in the following sources:"]
    for idx, source in enumerate(sources[:3], start=1):
        title = source.title or source.blockId
        answer_lines.append(f"{idx}. {title}: {source_excerpt(source.content)}")
    return RagQueryResponse(answer="\n".join(answer_lines), sources=sources)
