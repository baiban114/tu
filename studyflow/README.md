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
| **StudyFlow** | 学习消费：每日计划、带截止日期的学习目标、**掌握度（真相源）**、效率看板；个人纯文本记录（MVP） |

浏览器 → `studyflow-service`（REST `/api/learning/**`）→ Dubbo → `tu-backend`（知识库只读）。

**掌握度与动态计划：** StudyFlow 持有 `knowledge_point_mastery`；tu 学习计划表展示掌握列与「建议」高亮（`POST /api/learning/mastery/projection`）。详见 [`tu-web-ts/docs/workspace-views.md`](../tu-web-ts/docs/workspace-views.md) §3。

本地前端开发时（需 studyflow-service + Postgres 已启动）：

- `/`：月历查看每日计划；选择日期后可分页查看、新建、修改、完成、删除或按天/周/月循环当天计划，并可关联学习目标。修改时可明确选择“当前任务”或“整个循环组”；新循环任务默认选择整组，旧版循环任务也可手动选择整组并完成归组。整组修改标题或关联目标时，各项日期和完成状态保持不变。未完成的过期计划可一键延后到今天。循环设置默认使用关联目标的截至日期；目标未设置日期或计划未关联目标时留空，由用户选择。
- `/goals`：维护学习目标及可选截止日期；每个目标可展开维护阶段里程碑，也可设置带数值总量的任务条款，并独立选择开始日期和截止日期，将总量自动平分为范围内（含首尾）的每日计划。每日任务同时显示其在条款序列中的位置。
- `/notes`：维护个人记录。
