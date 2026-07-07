from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    qdrant_url: str = Field("http://localhost:6333", alias="QDRANT_URL")
    qdrant_collection: str = Field("tu_rag_chunks", alias="QDRANT_COLLECTION")
    vector_size: int = Field(256, alias="RAG_VECTOR_SIZE")
    chunk_size: int = Field(900, alias="RAG_CHUNK_SIZE")
    chunk_overlap: int = Field(120, alias="RAG_CHUNK_OVERLAP")


settings = Settings()
