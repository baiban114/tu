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

> **Spring Boot 4 + Flyway**：必须用 `spring-boot-starter-flyway`（仅 `flyway-core` 不会自动迁移）。启动成功后应看到表 `personal_note`、`learning_goal` 与 `flyway_schema_history`。

> **JDK 25 + Dubbo 3.3.6 + Spring Boot 4**：Dubbo `JsonUtils` 会探测 fastjson / gson / Jackson2 SPI。Boot 4 默认是 Jackson 3（`tools.jackson`），需在 `pom.xml` 显式带上 `fastjson`、`gson`、`jackson-databind`（2.x）与 `jackson-datatype-jsr310`，否则启动会报 `NoClassDefFoundError`（`JSONException` / `JavaTimeModule`）。Dubbo ≥ 3.3.7 后可再评估精简。

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

## 学习目标

结构化学习目标（与 tu 工作区「学习计划」视图共享），路由 StudyFlow `/goals`：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/learning/goals?page=&pageSize=` | 分页列表（当前目标优先） |
| GET | `/api/learning/goals/current` | 当前目标（可 null） |
| POST | `/api/learning/goals` | 新建；`setCurrent=true` 设为当前 |
| PUT | `/api/learning/goals/{id}` | 更新标题/绑定 |
| PUT | `/api/learning/goals/{id}/current` | 设为当前 |
| DELETE | `/api/learning/goals/current` | 清除当前标记 |
| DELETE | `/api/learning/goals/{id}` | 删除 |

`sourceKind`：`free_text` / `knowledge_point` / `resource_item` / `resource_excerpt`。表：`learning_goal`（`V3__learning_goal.sql`）。

tu-gateway / tu-web-ts Vite 将 `/api/learning/**` 转到本服务（18082）。

### 掌握度与动态计划

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/learning/mastery?kbId=&page=&pageSize=` | 分页列表 |
| PUT | `/api/learning/mastery` | Upsert（`knowledgePointId` + `status`） |
| POST | `/api/learning/mastery/projection` | 按有序点 ID 投影状态 + `suggestedNextPointId` |
| DELETE | `/api/learning/mastery/{knowledgePointId}` | 删除一条 |

`status`：`unknown` / `learning` / `mastered`。表：`knowledge_point_mastery`（`V4__knowledge_point_mastery.sql`）。投影规则：顺序中第一个非 `mastered` 为建议下一项。tu 学习计划视图与 StudyFlow `/mastery` 共用。

先启动 PostgreSQL：`docker compose up -d`，再 `mvn spring-boot:run`。


## 环境变量

| 变量 | 默认 |
|------|------|
| `SERVER_PORT` | `18082` |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:15433/studyflow` |
| `SPRING_DATASOURCE_USERNAME` | `studyflow` |
| `SPRING_DATASOURCE_PASSWORD` | `studyflow123` |
| `NACOS_SERVER_ADDR` | `localhost:8848` |
