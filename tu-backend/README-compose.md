# Docker Compose Layout

The compose files are split by responsibility.

## Files

- `docker-compose.yml`: application services only (`tu-backend`, `tu-gateway`, `tu-integration-service`, `tu-rag-service`).
- `docker-compose.infra.yml`: shared infrastructure and external dependencies (`nacos`, databases, `qdrant`, `elasticsearch`, `kaneo`).
- `docker-compose.dev.yml`: local development overrides that wire app services to the infra service names.

## Local All-In-One

```powershell
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

This starts the local infra plus all tu services. It is intended for development and demos.

## App Services Only

Copy `.env.example` to `.env`, adjust external infrastructure addresses, then run:

```powershell
docker compose up -d --build
```

Use this when Nacos, MySQL, Qdrant, and external systems are managed outside the application stack.

## Infra Only

```powershell
docker compose -f docker-compose.infra.yml up -d
```

Use this for local shared middleware without rebuilding application services.

## Redis Cluster Only

When other containers are already running, use the **standalone** compose file.
It uses project name `redis` and does not touch other stacks.

```powershell
cd tu-backend
copy .env.redis.example .env.redis
docker compose -f docker-compose.redis.yml --env-file .env.redis pull
docker compose -f docker-compose.redis.yml --env-file .env.redis up -d
```

- Cluster nodes: `127.0.0.1:6379`–`6384` (3 masters + 3 replicas; override via `.env.redis`)
- Topology: `redis-cli -c -h 127.0.0.1 -p 6379 cluster nodes`
- Data volumes: `redis-1-data` … `redis-6-data` (Compose project `redis`)

Stop / remove only Redis Cluster:

```powershell
docker compose -f docker-compose.redis.yml --env-file .env.redis down
```

## MinIO Only (object storage)

When MySQL / ES / other containers are already running, use the **standalone** compose file.
It uses project name `minio` and does not touch other stacks.

```powershell
cd tu-backend
copy .env.minio.example .env.minio
docker compose -f docker-compose.minio.yml --env-file .env.minio pull
docker compose -f docker-compose.minio.yml --env-file .env.minio up -d
```

- S3 API: `http://localhost:9000` (override with `MINIO_API_PORT` in `.env.minio`)
- Console: `http://localhost:9001` (login = `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)
- Data volume: `minio-data` (Compose project `minio`)

Stop / remove only MinIO:

```powershell
docker compose -f docker-compose.minio.yml --env-file .env.minio down
```

Configure `tu-backend` with the same credentials (`STORAGE_S3_*` in `.env.example`).
On first upload the backend creates bucket `tu-files` if missing.

## Kaneo

Kaneo is pulled from GHCR:

```powershell
docker compose -f docker-compose.infra.yml pull kaneo
docker compose -f docker-compose.infra.yml up -d kaneo-postgres kaneo
```

If GHCR is slow, use an external Kaneo instance and configure it from the `/tasks` page.

# 运行笔记
只启动 Elasticsearch
在 tu-backend 目录下执行：

cd d:\project\tu\tu-backend
docker compose -f docker-compose.infra.yml up -d elasticsearch
首次运行会自动拉镜像并创建 elasticsearch-data 卷。