# StudyFlow

学习驾驶舱前端（与 `tu-web-ts` 知识生产分工）。本目录为 **Turborepo + pnpm** monorepo，**不单独建仓**，与 `studyflow-service/` 同属 `d:\project\tu` monorepo。

## 结构

```
studyflow/
  apps/web/          # Vite + React 19 主应用（浏览器）
  packages/api/      # HTTP 客户端与 DTO（对接 studyflow-service）
  packages/core/     # 纯逻辑（ETA、环比等）
```

## 本地开发

```powershell
cd studyflow
pnpm install
pnpm dev
```

默认开发地址：`http://localhost:5180`（API 代理到 `studyflow-service`）。

## 与 tu 平台关系

| 应用 | 职责 |
|------|------|
| `tu-web-ts` | 知识生产：文档、PDF、知识点；学习计划**结构**与 AI 路线 |
| **StudyFlow** | 学习消费：打卡、**掌握度（真相源）**、效率看板；个人纯文本记录（MVP） |

浏览器 → `studyflow-service`（REST `/api/learning/**`）→ Dubbo → `tu-backend`（知识库只读）。

**掌握度与动态计划：** StudyFlow 持有 `knowledge_point_mastery`；tu 学习计划表展示掌握列与「建议」高亮（`POST /api/learning/mastery/projection`）。详见 [`tu-web-ts/docs/workspace-views.md`](../tu-web-ts/docs/workspace-views.md) §3。

本地前端开发时，打开 `http://localhost:5180/notes` 可写个人记录（需 studyflow-service + Postgres 已启动）。
