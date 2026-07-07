# tu-rag-service

Python FastAPI RAG service for `tu-backend`.

## API

- `GET /healthz`
- `POST /internal/rag/index`
- `POST /internal/rag/delete`
- `POST /internal/rag/query`

The service stores vectors in Qdrant. v1 includes a deterministic local embedding fallback so indexing and retrieval work without an external model key.

## Environment

- `QDRANT_URL`: Qdrant base URL, default `http://localhost:6333`
- `QDRANT_COLLECTION`: collection name, default `tu_rag_chunks`
- `RAG_VECTOR_SIZE`: vector size, default `256`
- `RAG_CHUNK_SIZE`: chunk size, default `900`
- `RAG_CHUNK_OVERLAP`: chunk overlap, default `120`

## Local Run

```powershell
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 19080
```
1. 启动 Qdrant
   在 tu-backend 目录：

cd D:\project\tu\tu-backend

docker compose up -d qdrant

2. 启动 RAG 服务
   在 tu-rag-service 目录：

cd D:\project\tu\tu-rag-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 19080 --reload
