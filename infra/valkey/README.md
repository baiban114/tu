# Valkey Cluster（运维基础设施）

独立 Compose 栈，**不挂应用名、不带 `tu` 前缀**。与 Redis Cluster 协议兼容，端口默认错开，可同机并存。

| 项 | 值 |
|----|-----|
| Compose project | `valkey` |
| 容器 | `valkey-1` … `valkey-6`、`valkey-cluster-init` |
| 拓扑 | 3 master + 3 replica |
| 客户端端口 | `127.0.0.1:7379`–`7384`（可改 `.env`） |
| Bus 端口 | `17379`–`17384` |
| 镜像 | `valkey/valkey:8-alpine` |

## 启动

```powershell
cd infra/valkey
Copy-Item .env.example .env
docker compose --env-file .env pull
docker compose --env-file .env up -d
```

## 巡检

```powershell
docker compose --env-file .env ps
docker exec valkey-1 valkey-cli -c -h 127.0.0.1 -p 6379 cluster nodes
# 从宿主机：
# docker run --rm --network host valkey/valkey:8-alpine valkey-cli -c -h 127.0.0.1 -p 7379 cluster info
```

## 停止（仅本栈）

```powershell
docker compose --env-file .env down
```

删数据卷（会清空集群数据）：

```powershell
docker compose --env-file .env down -v
```

## 与 Redis 栈对照

| | Redis（现） | Valkey（本目录） |
|--|-------------|------------------|
| 目录 | `tu-backend/docker-compose.redis.yml`（历史位置） | `infra/valkey/`（运维入口） |
| Project | `redis` | `valkey` |
| 端口 | 6379–6384 | 7379–7384 |
| CLI | `redis-cli` | `valkey-cli` |

应用侧仍可用 Redis 协议客户端（Lettuce / Jedis 等）连 Valkey Cluster。
