# Markdown 超链接 — 定位系统 › 搜索系统

> 状态：**已实施（首版：资源章节树）**  
> 关联：[knowledge-relations.md §3](./knowledge-relations.md)（证据 locator）、编辑器 `TuLink` / `linkLabelSuggest*`

## 1. 目标与边界

编辑器内 Markdown 链接 `[文字](href)` 是访问**定位系统**与**搜索系统**的主入口：

| 系统 | 职责 |
|------|------|
| **定位系统** | 稳定地址（locator / href）与导航跳转 |
| **搜索系统** | 在已确认作用域内浏览一层，或用关键字深度发现更深层目标 |

- **内部链**：`page:…`、`resource:…`（与证据锚点同源）
- **外部链**：`http(s)://…`（不走站内 locator 导航）
- `[]` 内文字是人读路径 / 搜索草稿；**href 是定位真源**，不可被显示文字替代

## 2. 定位系统（Locator）

规范地址与证据层对齐，详见 [knowledge-relations.md §3](./knowledge-relations.md)。超链接侧常用：

| 目标 | locator | 跳转 |
|------|---------|------|
| 文档页 | `page:{pageId}` | 打开页面 |
| 页内标题 | `page:{pageId}:heading:{blockId}` | 打开页并滚到标题 |
| 资源实体 | `resource:{itemId}` | 资源管理 Tab + `itemId` |
| 资源章节 | `resource:{itemId}:chapter:{chapterId}` | 同上 + `chapterId` |
| 资源节选 | `resource:{itemId}:excerpt:{excerptId}` | 同上 + `excerptId` |

解析与导航：[`knowledgeAnchor.ts`](../src/utils/knowledgeAnchor.ts)（`parseLocator` / `navigateKnowledgeAnchor`）。

## 3. 搜索系统（Search）— 默认能力

对任意**已解析作用域**（资源实体根、章节节点；后续可扩展页大纲）统一两档：

| 模式 | 触发 | 语义 | 结果集 |
|------|------|------|--------|
| **Browse** | 作用域后 `>` 且末段为空（如 `王道>`、`王道>第1章>`） | 目录浏览 | **仅直接子节点** |
| **DeepSearch** | 末段为关键字（如 `王道>TCP`、`王道>第1章>握手`） | 搜索引擎 | 作用域**子树内全部后代**标题匹配 |

### 3.1 排序（DeepSearch）

精确匹配 > 前缀匹配 > 包含；同档更浅深度优先，再稳定序（`sortOrder` / 标题）。

### 3.2 展示与写入分离

| 层 | 规则 |
|----|------|
| 列表主文案 | 只显示命中节点自身名称（不重复已确认祖先） |
| 次要说明 | 相对当前作用域的面包屑（消歧） |
| 选中写入 `[]` | 完整可读路径（`资源 > … > 节点`），便于继续 `>` |
| href | 始终写规范 locator |

### 3.3 查询语法（`[]` 内）

`parseLinkLabelQuery`（[`linkLabelSuggestQuery.ts`](../src/editor/linkLabelSuggestQuery.ts)）：

| 字段 | 含义 |
|------|------|
| `pageQuery` | 根作用域关键字（页名 / 资源名） |
| `pathSegments` | 已确认的路径祖先（Browse 栈） |
| `childQuery` | 当前档关键字；空 = Browse，非空 = DeepSearch |
| `headingQuery` | 页内标题检索用的合并针 |
| `pageRange` | 可选 PDF 式起止页（`-12` / `-12-20`）；写入资源 href 的 `#page=` |

示例：

- `王道>` → Browse 资源根下一层
- `王道 > 第1章>` → Browse「第1章」直接子节点
- `王道 > TCP` → 在资源根子树 DeepSearch「TCP」
- `王道 > 第1章 > 握手` → 在「第1章」子树 DeepSearch「握手」
- `王道-12` / `王道-12-20` → 匹配资源并附带 `#page=12` / `#page=12-20`（与 PDF 摘页起止相同）
- `王道>12-20` / `王道>第1章>3-5` → 在对应作用域定位，href 写 `#page=`；选中写入标签带 `-12-20`

## 4. 编辑器行为

1. **TuLink IR**：光标进入已有链接时展开为 `[label](href)` 源码，离开后折叠。
2. **`[]` 建议菜单**：仅在**源文本 IR**（或未完成的 `[query`）内改动 label 后出现；纯移动光标路过不展开。自动保存对 IR 做快照折叠写入，不改动实时文档（避免源文本闪烁/空格被 trim）。↓ 进入列表；回车选中 → 写入 `applyLabel` + locator href。离开链接后 IR 再折叠为渲染链。
3. **首版树数据**：`ResourceChapter` + 归属当前作用域子树的 `ResourceExcerpt`。
4. **文档页标题**：DeepSearch 仍走页内标题检索；列表主文案仅标题文本，`applyLabel` 为 `文档 > 标题`。

## 5. 代码地图

| 模块 | 职责 |
|------|------|
| [`hierarchicalScopeSearch.ts`](../src/editor/hierarchicalScopeSearch.ts) | Browse / DeepSearch 纯函数 + 排序 |
| [`linkLabelSuggestQuery.ts`](../src/editor/linkLabelSuggestQuery.ts) | 查询解析、locator 构造、`LinkSuggestItem` |
| [`linkLabelSuggest.ts`](../src/editor/linkLabelSuggest.ts) | 拉取候选、资源树接线 |
| [`linkLabelSuggestApply.ts`](../src/editor/linkLabelSuggestApply.ts) | 选中写入（`applyLabel ?? label`） |
| [`knowledgeAnchor.ts`](../src/utils/knowledgeAnchor.ts) | 定位解析与导航 |

## 6. 演进

- 页大纲树复用同一 Search 原语（Browse 一层 / 子树 DeepSearch）
- 节选嵌套树与章节树统一为「作用域节点」适配器
- 全局搜索与 `[]` 建议共享排序契约
