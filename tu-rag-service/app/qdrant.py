from __future__ import annotations

import hashlib
import uuid
from typing import Any

import httpx


class QdrantStore:
    def __init__(self, base_url: str, collection: str, vector_size: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.collection = collection
        self.vector_size = vector_size

    async def ensure_collection(self) -> None:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{self.base_url}/collections/{self.collection}")
            if response.status_code == 200:
                return
            if response.status_code != 404:
                response.raise_for_status()
            create_response = await client.put(
                f"{self.base_url}/collections/{self.collection}",
                json={
                    "vectors": {
                        "size": self.vector_size,
                        "distance": "Cosine",
                    }
                },
            )
            create_response.raise_for_status()

    async def replace_page(self, kb_id: str, page_id: str, points: list[dict[str, Any]]) -> None:
        await self.delete(kb_id=kb_id, page_id=page_id)
        if not points:
            return
        await self.upsert(points)

    async def upsert(self, points: list[dict[str, Any]]) -> None:
        await self.ensure_collection()
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.put(
                f"{self.base_url}/collections/{self.collection}/points",
                json={"points": points},
            )
            response.raise_for_status()

    async def delete(
        self,
        kb_id: str,
        page_id: str | None = None,
        page_ids: list[str] | None = None,
    ) -> None:
        await self.ensure_collection()
        conditions: list[dict[str, Any]] = [{"key": "kbId", "match": {"value": kb_id}}]
        if page_id:
            conditions.append({"key": "pageId", "match": {"value": page_id}})
        if page_ids:
            conditions.append({"key": "pageId", "match": {"any": page_ids}})

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/collections/{self.collection}/points/delete",
                json={
                    "filter": {
                        "must": conditions,
                    }
                },
            )
            response.raise_for_status()

    async def search(self, kb_id: str, query_vector: list[float], limit: int) -> list[dict[str, Any]]:
        await self.ensure_collection()
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/collections/{self.collection}/points/search",
                json={
                    "vector": query_vector,
                    "limit": limit,
                    "with_payload": True,
                    "filter": {
                        "must": [
                            {"key": "kbId", "match": {"value": kb_id}},
                        ]
                    },
                },
            )
            response.raise_for_status()
            return response.json().get("result", [])


def point_id(page_id: str, block_id: str, chunk_index: int) -> str:
    raw = f"{page_id}:{block_id}:{chunk_index}".encode("utf-8")
    digest = hashlib.md5(raw, usedforsecurity=False).digest()
    return str(uuid.UUID(bytes=digest))
