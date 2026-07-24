# infra — 运维基础设施

与应用（`tu-*`、`studyflow*`）**解耦**的中间件栈。命名、Compose project、容器名均按组件本身，**不加 `tu` 前缀**。

从运维视角：这里只负责「起得来、可巡检、可单独下线」，不负责应用业务配置。

## 栈一览

| 目录 | Compose project | 说明 | 默认端口 |
|------|-----------------|------|----------|
| [`valkey/`](./valkey/) | `valkey` | Valkey Cluster（3+3，Redis 协议兼容） | 7379–7384 |
| （历史）`tu-backend/docker-compose.redis.yml` | `redis` | Redis Cluster（3+3） | 6379–6384 |
| （历史）`tu-backend/docker-compose.minio.yml` | `minio` | MinIO 对象存储 | 9000 / 9001 |
| （历史）`tu-backend/docker-compose.infra.yml` | 随 compose | Nacos / DB / ES / Qdrant 等开发联调 | 见该文件 |

新开基础设施优先落在本目录（`infra/<组件>/`），再在应用侧用环境变量接入。

## 约定

1. **独立 project name**：与应用 compose 隔离，`down` 互不影响。
2. **容器名 = 组件名-序号**：如 `valkey-1`，禁止 `tu-valkey-1`。
3. **端口可配**：通过目录内 `.env` / `.env.example`，默认同机可与同类栈错开。
4. **文档自包含**：每个子目录有自己的 README（启停、巡检、清卷）。

## 快速启动 Valkey

```powershell
cd infra/valkey
Copy-Item .env.example .env
docker compose --env-file .env up -d
```
