# tu

知识库与富文本编辑平台 monorepo（前端 + Java 后端 + 网关 + 集成/RAG 服务）。

详细开发约定见 [AGENTS.md](./AGENTS.md)。

## 仓库结构

| 目录 | 说明 |
|------|------|
| [`tu-web-ts/`](./tu-web-ts/) | Vue 3 + TypeScript 前端（Vite，端口 5173） |
| [`tu-backend/`](./tu-backend/) | Spring Boot 4 多模块后端（`tu-platform-api` + `tu-backend-app`，端口 8080） |
| [`tu-gateway/`](./tu-gateway/) | Spring Cloud Gateway（默认端口 18080，转发 `/api/**`） |
| [`tu-integration-service/`](./tu-integration-service/) | 外部任务系统集成（Kaneo 等） |
| [`tu-rag-service/`](./tu-rag-service/) | Python FastAPI RAG 服务（端口 19080） |
| [`studyflow/`](./studyflow/) | StudyFlow 学习驾驶舱前端（Vite + React，端口 5180） |
| [`studyflow-service/`](./studyflow-service/) | StudyFlow 学习域微服务（REST + Dubbo Consumer，端口 18082） |

## 本地开发（最小链路）

1. 基础设施：`cd tu-backend && docker compose -f docker-compose.infra.yml up -d`
2. 后端：`cd tu-backend && mvn spring-boot:run -pl tu-backend-app`
3. 网关：`cd tu-gateway && mvn spring-boot:run`
4. 前端：`cd tu-web-ts && npm run dev`（代理到 `http://localhost:18080`）

### StudyFlow（学习驾驶舱，可选）

与 tu-web-ts 并列，同属本 monorepo：

1. PostgreSQL：`cd studyflow-service && docker compose up -d`
2. 安装 Dubbo 契约：`cd tu-backend && mvn install -pl tu-platform-api -am -DskipTests`
3. 后端：`cd studyflow-service && mvn spring-boot:run`
4. 前端：`cd studyflow && pnpm install && pnpm dev`（`http://localhost:5180`）

各子目录 README 有更完整的配置说明。

## 历史仓库迁移

本 monorepo 由以下独立仓库合并而来（历史提交保留在各自 remote，新开发以本仓库为准）：

| 原仓库 | 路径 |
|--------|------|
| `baiban114/tu-web-ts` | `tu-web-ts/` |
| `baiban114/tu-backend` | `tu-backend/` |
| `baiban114/tu-gateway` | `tu-gateway/` |

推送新 remote 示例：

```bash
git remote add origin git@github.com:baiban114/tu.git
git push -u origin master
```

可将 GitHub 上的 `tu-web-ts` 仓库重命名为 `tu`，或新建 `tu` 仓库后推送。
