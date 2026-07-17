---
name: AI文档标记 Phase2 设计
overview: AI 文档标记 Phase 2 设计草案索引。主文档 tu-web-ts/docs/ai-document-marking-phase2-design.md；本期仅设计，不实施代码。六条设计条目均已 designed。
todos:
  - id: slice
    content: "§1 文档结构化切片（locator 与粒度）"
    status: completed
  - id: protected-blockquote
    content: "§6 blockquote 节选 Protected + 种子上下文"
    status: completed
  - id: resource-ctx
    content: "§2 资源上下文加厚"
    status: completed
  - id: agent-tools
    content: "§4 Agent 专用工具"
    status: completed
  - id: prompt-strategy
    content: "§3 Prompt 与推断策略"
    status: completed
  - id: apply-mark-excerpt
    content: "§5 markExcerpt 写回文档与应用路径"
    status: completed
isProject: false
---

# AI 文档标记 Phase 2 — 设计索引

主设计稿（Git 真源）：[`tu-web-ts/docs/ai-document-marking-phase2-design.md`](../../tu-web-ts/docs/ai-document-marking-phase2-design.md)

MVP 行为说明：[`tu-web-ts/docs/knowledge-relations.md`](../../tu-web-ts/docs/knowledge-relations.md) §6

## 设计条目状态

| ID | § | 标题 | 状态 |
|----|---|------|------|
| `slice` | §1 | 文档结构化切片 | designed |
| `resource-ctx` | §2 | 资源上下文加厚 | designed |
| `prompt-strategy` | §3 | Prompt 与推断策略 | designed |
| `agent-tools` | §4 | Agent 专用工具 | designed |
| `apply-mark-excerpt` | §5 | markExcerpt 写回文档 | designed |
| `protected-blockquote` | §6 | blockquote 节选 Protected + 种子上下文 | designed |

## 建议实现顺序（尚未开始）

1. §6 + §1 — Protected/Seed + blockquote locator
2. §2 + §4 — 资源上下文 + Agent 工具
3. §3 — Prompt 修订
4. §5 — 前端 apply 写回

## 跨 Agent 开场白

```text
继续 AI 文档标记 Phase 2 设计，只写设计稿不实现代码。
主文档：tu-web-ts/docs/ai-document-marking-phase2-design.md
计划索引：.cursor/plans/ai-document-marking-phase2.plan.md
本次设计条目：{slice | resource-ctx | prompt-strategy | agent-tools | apply-mark-excerpt | protected-blockquote}
请先读该条 §N 现状，帮我补全或修订「设计思路」和「开放问题」，更新文档与 plan todo 状态。
```

## 进入实现

全部条目 `designed` 后，新开实现计划/PR，引用设计稿 §N，勿重复讨论已决事项。
