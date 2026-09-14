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

> **Spring Boot 4 + Flyway**：必须用 `spring-boot-starter-flyway`（仅 `flyway-core` 不会自动迁移）。启动成功后应看到表 `personal_note`、`learning_goal`、`daily_plan` 与 `flyway_schema_history`。

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
| POST | `/api/learning/goals` | 新建；`setCurrent=true` 设为当前；可传 `deadline`（`YYYY-MM-DD`） |
| PUT | `/api/learning/goals/{id}` | 更新标题、绑定与可选 `deadline` |
| PUT | `/api/learning/goals/{id}/current` | 设为当前 |
| DELETE | `/api/learning/goals/current` | 清除当前标记 |
| DELETE | `/api/learning/goals/{id}` | 删除 |

`sourceKind`：`free_text` / `knowledge_point` / `resource_item` / `resource_excerpt`。表：`learning_goal`（`V3__learning_goal.sql`，截止日期由 `V5__goal_deadline_and_daily_plan.sql` 增加）。

## 每日计划与月历

首页月历按月加载每日完成汇总，选中日期后加载当天计划。计划明细接口分页，默认每页 10 条。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/learning/daily-plans?date=&page=&pageSize=` | 指定日期的计划明细 |
| GET | `/api/learning/daily-plans/calendar?startDate=&endDate=` | 日期区间内按日汇总总数和完成数 |
| POST | `/api/learning/daily-plans` | 新建 `{ title, planDate, completed, goalId? }` |
| PUT | `/api/learning/daily-plans/{id}` | 更新计划内容、日期、完成状态或关联目标 |
| PUT | `/api/learning/daily-plans/{id}/series` | 更新任务标题和关联目标 `{ title, goalId?, updateWholeSeries }`；可选择当前项或整个循环组 |
| POST | `/api/learning/daily-plans/{id}/repeat` | 按周期复制到截止日期 `{ unit, interval, endDate }` |
| DELETE | `/api/learning/daily-plans/{id}` | 删除计划 |
| GET | `/api/learning/goals/{goalId}/milestones?page=&pageSize=` | 分页查看目标的阶段里程碑 |
| POST | `/api/learning/goals/{goalId}/milestones` | 新建里程碑 `{ title, deadline?, completed?, sortOrder? }` |
| PUT | `/api/learning/goals/{goalId}/milestones/{milestoneId}` | 更新里程碑标题、截止日期、完成状态或顺序 |
| DELETE | `/api/learning/goals/{goalId}/milestones/{milestoneId}` | 删除里程碑 |
| GET | `/api/learning/goals/{goalId}/task-terms?page=&pageSize=` | 分页查看目标任务条款 |
| POST | `/api/learning/goals/{goalId}/task-terms` | 新建任务条款 `{ title, totalAmount }` |
| PUT | `/api/learning/goals/{goalId}/task-terms/{termId}` | 更新任务条款标题和总量 |
| POST | `/api/learning/goals/{goalId}/task-terms/{termId}/distribute` | 按 `{ startDate, endDate }` 将总量平分到所选起止日期（含首尾） |
| DELETE | `/api/learning/goals/{goalId}/task-terms/{termId}` | 删除条款及其未完成自动计划 |

`unit` 支持 `DAY` / `WEEK` / `MONTH`，`interval` 范围 1–365，`endDate` 包含在生成范围内。循环以原计划日期为锚点，单次最多生成 366 条；相同用户、日期、标题和目标的现有计划会被跳过。循环生成的计划共享 `repeatSeriesId`，通过整组更新接口修改标题或关联目标时，组内日期、完成状态和条款分配数量不变。旧版生成且没有组标识的计划在显式选择“整个循环组”后，会按原标题和关联目标归组。

条款分配后会保存起止日期；生成的每日计划包含 `goalTermSequenceNumber` 和 `goalTermSequenceTotal`，用于显示该任务在分配序列中的位置。日期字段使用 `YYYY-MM-DD`，避免客户端时区导致日期漂移。表：`daily_plan`（Flyway `V5__goal_deadline_and_daily_plan.sql`）；删除关联目标时，`V6__daily_plan_goal_foreign_key.sql` 会将计划的 `goal_id` 自动置空。

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
