# studyflow-service

StudyFlow 学习域微服务：打卡、掌握度、指标等自有数据；通过 **Dubbo** 只读消费 `tu-backend` 知识平台能力。

与 `studyflow/` 前端同属 `d:\project\tu` monorepo，**不单独建仓**。

## 架构位置

```
浏览器 (studyflow/apps/web)
    │ REST /api/learning/**
    ▼
studyflow-service :18082
    │ Dubbo (Nacos)
    ▼
tu-backend (KnowledgePlatformFacade Provider)
    │ HTTP
    ▼
tu-rag-service / PostgreSQL|MySQL (tu_db)
```

自有库：**PostgreSQL `studyflow`**（Flyway 迁移）。

## 前置依赖

1. 安装 `tu-platform-api` 到本地 Maven 仓库：

```powershell
cd ..\tu-backend
mvn install -pl tu-platform-api -am -DskipTests
```

2. （可选）启动 PostgreSQL：

```powershell
cd studyflow-service
docker compose up -d
```

3. （可选）Nacos + tu-backend Dubbo Provider（本地全链路调试时）。

## 本地运行

```powershell
cd studyflow-service
mvn spring-boot:run
```

## 个人记录（MVP）

纯文本个人状态记录，路由 `/notes`，API：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/learning/notes?page=&pageSize=` | 分页列表（默认每页 10） |
| POST | `/api/learning/notes` | 新建 `{ "body": "..." }` |
| PUT | `/api/learning/notes/{id}` | 更新 body |
| DELETE | `/api/learning/notes/{id}` | 删除 |

可选请求头 `X-User-Id`（缺省 `local`）。表：`personal_note`（Flyway `V2__personal_note.sql`）。

先启动 PostgreSQL：`docker compose up -d`，再 `mvn spring-boot:run`。


## 环境变量

| 变量 | 默认 |
|------|------|
| `SERVER_PORT` | `18082` |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:15433/studyflow` |
| `SPRING_DATASOURCE_USERNAME` | `studyflow` |
| `SPRING_DATASOURCE_PASSWORD` | `studyflow123` |
| `NACOS_SERVER_ADDR` | `localhost:8848` |
