# 区域级控件放置规范

> 状态：**已实施**（文档页 `TuEditorPage` 顶栏含编辑操作；标签筛选在标题下 `PageTagsBar`）
> 关联：[`tu-frontend-ui` SKILL](../../.cursor/skills/tu-frontend-ui/SKILL.md)、[`TuEditorPage.vue`](../src/components/TuEditorPage.vue)

## 1. 原则

**作用于整块区域（page、面板、画布、列表视图等）的控件，必须放在该区域的固定锚点**，使用户在区域内部滚动时仍能操作，而不必滚回内容开头。

禁止将仅编辑类顶栏能力只放在可滚动正文中部；筛选类标签展示与页面元数据标签一并放在标题下方，便于与页面标签编辑同一区域管理。

## 2. 允许的固定锚点

按优先级选用：

| 锚点 | 适用场景 | 示例 |
|------|----------|------|
| **固定顶栏（sticky / fixed toolbar）** | 整页或主内容区的全局编辑操作 | 文档页 `page-chrome`：插入链接 / 资源 / AI 标记 |
| **标题下行（page title meta）** | 页面标签展示、按标签筛选 | `PageTagsBar`（页面标签 + 内容标签筛选） |
| **区域 Header** | 面板/侧栏/卡片的标题行内常驻操作 | 目录侧栏折叠头、资源页 Tab 头 |
| **右键菜单（context menu）** | 低频、与选中对象强相关的区域操作 | 页面树右键、TOC 节右键「编辑节标签」 |
| **与选区/焦点绑定的浮层** | 仅对当前选中块/文字有效，且需贴近选区 | NodeView 工具栏、划选浮动条 |

同一能力只应占一种主入口，避免顶栏与正文顶部重复出现。

## 3. 分类与放置

### 3.1 区域级（整页 / 整面板）

- **定义**：影响区域内全部或大部分内容，与具体块选区无关。
- **放置**：区域固定顶栏或 Header；只读模式若仍可用，筛选标签仍在标题下展示。
- **标签**：页面元数据标签与正文内可筛选标签统一在标题下 `PageTagsBar`；点击可筛选标签切换「按标签查看」，页面标签可点右上角叉号删除。

### 3.2 对象级（单个块 / 节点 / 行）

- **定义**：仅作用于当前 embed、表格行、画布节点等。
- **放置**：对象 NodeView 顶栏、行内菜单、对象右键菜单；**不要**抬升到 page 顶栏（除非批量多选）。

### 3.3 选区级（划选文字 / 多块）

- **定义**：依赖编辑器选区或套索选中。
- **放置**：浮动 `SelectionToolbar`、划选后的气泡；离开选区即隐藏。

## 4. 实现要点（文档页）

- 主滚动容器：[`HomeView`](../src/views/HomeView.vue) 内 `.content-scroll`。
- 固定顶栏：[`TuEditorPage`](../src/components/TuEditorPage.vue) 内 `.page-chrome`，`position: sticky; top: 0`，与滚动容器对齐（负边距抵消 `.content-scroll` 水平 padding）。
- 结构：
  1. `page-chrome__actions` — 编辑类按钮（仅 `editable`）
  2. 页面标题 + `PageTagsBar` — 页面标签编辑/删除，以及内容标签筛选
  3. 正文 — 可随滚动离开视口

新增 page 级编辑能力时，优先并入 `page-chrome`；标签展示与筛选优先并入标题下 `PageTagsBar`。

## 5. 检查清单

- [ ] 该控件是否影响整个区域而非单个对象？
- [ ] 用户滚动到区域中部时，是否仍能看到/触达该控件？
- [ ] 是否误放在 `.content-scroll` 内仅首屏可见的位置？
- [ ] 只读与编辑模式是否分别考虑展示（如筛选在只读仍可用）？
- [ ] 是否与对象级工具栏（NodeView、划选条）职责重复？
- [ ] 弹窗内列表是否分页/滚动受限，底部操作是否始终可见？（详见 SKILL §6）

## 6. 参考实现

| 能力 | 锚点 | 文件 |
|------|------|------|
| 按标签查看 / 页面标签 | 标题下 `PageTagsBar` | `PageTagsBar.vue` + `TuEditorPage.vue` |
| 插入链接 / 资源 | `page-chrome` 顶栏 | `TuEditorPage.vue` |
| 块标签 / 升级画板 | NodeView 顶栏 | `ResizableBlockWrapper` / `nodeview-toolbar` |
| 划选标注 / 文字标签 | 选区浮层 | `SelectionToolbar.vue` |
| 节标签编辑 | TOC 右键 | `TuEditorPage.vue` TOC context menu |
| 标注 / 标签候选 | 弹窗内分页 + 固定 footer | `NoteEditor.vue`、`BlockMetadataTagEditor.vue` |

## 7. 弹窗内无上限列表（摘要）

本规范侧重**区域锚点**；弹窗、气泡内长度不受固定上限的列表另见 [`tu-frontend-ui` SKILL §6](../../.cursor/skills/tu-frontend-ui/SKILL.md)：

- 面板 `flex` + 受限高度，footer（取消/保存）`flex-shrink: 0`
- 列表区 `min-height: 0` + 内部滚动
- 默认每页 10 条：后端 `PageResponse` 或前端 `paginateSlice`（`src/utils/clientPagination.ts`）
