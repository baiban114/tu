# 工作区视图（Workspace Views）

> 状态：**MVP 已实施**（首个视图：学习计划）

## 1. 概念

左侧边栏可在 **知识库** 与 **视图** 之间切换：

| 模式 | 列表 | 下方主区 |
|------|------|----------|
| 知识库 | 知识库列表 | 页面树（真实存储） |
| 视图 | 视图目录 | 该视图拼出的**虚拟数据库** |

视图不另建仓库，而是叠在当前知识库的 **KnowledgePoint / knowledge_relation / 资源证据锚点** 之上，按规则动态计算行集。

## 2. 学习计划视图

**入口：** 侧栏 → 视图 →「学习计划」

**目标种子（优先级）：**

1. 「选目标」弹窗选用 / 新建的 StudyFlow `learning_goal`（写回当前目标）  
2. StudyFlow 当前目标（自动）  
3. 文档顶栏「进行中」资源目标（`LearningInProgress`）  

**StudyFlow API：** `GET/POST/PUT /api/learning/goals*`（经 gateway 或 Vite `/api/learning` → `:18082`）

**拼装：**

1. 解析种子知识点 ID  
2. 对每个种子调用 `GET /api/kbs/{kbId}/knowledge-graph?mode=prerequisite&direction=in&depth=8`（`prerequisite` 边为 from=当前点 → to=前置点；`direction=in` 沿出边展开前置闭包）  
3. **若已有可用前置链路（≥2 个知识点）**：合并节点/边并拓扑排序展示；列表支持多选（Ctrl/⌘、Shift、勾选），分页默认 **20**；行可展开查看 `summary` / AI 细粒度 `children`  
4. **若链路不足**：打开 AI 路线对话；侧栏已选项出现在弹窗上方并作为关注种子；SSE 推理过程含模型思考文本与工具调用；确认应用后写回知识点与 `prerequisite`  

「选目标」后若库内已有链路则直接展示；不足或点击「AI 路线」时打开大窗口：**左侧**复用学习计划同款路线表（`LearningPlanRouteTable`，默认载入当前步骤），**右侧**加高对话区（开场即可输入，推理过程对话内折叠，生成中可「停止」）；内容区高度为 `calc(100dvh - 168px)` 以免发送按钮被 footer 挡住。生成中与完成后均可「保存」（写入知识库、不关窗）；「确认应用并关闭」为保存并关闭。模型输出默认简体中文。嵌套 `children` 写回软分类树 `parent_id`；学习顺序仍按深度优先展开后的相邻 `prerequisite`。步数由 AI 按目标与前置自行决定（用户不设「最大步数」）。

## 3. 与 StudyFlow 的分工（掌握度）

约定：**结构在 tu，学习者状态在 StudyFlow**；tu 文档旁仍可即时看/改计划并打开材料。

| 层 | 真相源 | 在 tu 学习视图中的表现 |
|----|--------|------------------------|
| **结构层** | tu：`KnowledgePoint` + `prerequisite`；AI 路线写回同一套 | 侧栏表、AI 路线弹窗；增删改序、确认应用 |
| **进度层** | StudyFlow：`knowledge_point_mastery`（`unknown` / `learning` / `mastered`） | 「掌握」列芯片（可点切换）、**建议**高亮；经 `POST /api/learning/mastery/projection` |

动态「建议下一项」= 学习顺序中第一个非 `mastered` 的点。StudyFlow 前端 `/mastery` 可手工维护；tu 侧栏点击芯片写回同一 API。勿在 tu 库复制掌握度。

## 4. 代码位置

- `src/workspaceViews/` — 类型、目录、拼装纯函数  
- `src/stores/workspaceViews.ts` — 侧栏模式与重建  
- `src/components/workspaceViews/LearningPlanViewPanel.vue` — 虚拟表 UI  
- `src/components/workspaceViews/LearningPlanRouteTable.vue` — 共用路线表  
- `src/components/workspaceViews/LearningRouteChatDialog.vue` — AI 路线 Hybrid 弹窗  

## 5. 标签检索视图

**入口：** 侧栏 → 视图 →「标签检索」

在**主内容区**展示。按指定的标签检索该知识库中被标记的内容，分三类作用域：

| 作用域 | 含义 | 来源 |
|--------|------|------|
| `section` | 文档单元（h1–h6 章节） | `metadata.sectionTags`，key 为 `local:{blockId}` / `ref-group:{id}` / `ref-child:{id}` 等 |
| `block` | 块 / nodeView（richtext 段落、x6 画板、表格等） | 块的 metadata 标签 |
| `text` | 富文本中划选并标记的文字范围 | `metadata.textTagSpans` |

**匹配：** 按标签 `label` 规范化后（`normalizeTagLabel`）相等；一次检索只针对一个选定标签。

**展示：** 分页表格（默认 10/页，`DEFAULT_PAGE_SIZE`），按 `updatedAt` 倒序。行可**展开**以只读原格式内联预览被标记内容：

- `section`：提取该 heading 节点及其后兄弟，直到下一个同级或更高级标题，合成只读 Tiptap 文档渲染
- `block`：提取该块单个节点为只读文档渲染
- `text`：有稳定 blockId 时预览所属原始段落，否则展示保存的选中文字快照

标题列优先取章节标题 / 块首行，缺失回退标签 label。「打开页面」切回知识库模式并定位到该页。

**数据源：** 后端聚合 `GET /api/kbs/{kbId}/tags`（标签池）与 `GET /api/kbs/{kbId}/tagged-content?tagLabel=&page=&pageSize=`；mock 走 `collectKbTagsMock` / `searchTaggedContentMock`。时间戳 mock 用 `pageUpdatedAt`，后端用 `page_content.updated_at`。

**代码位置：**

- `src/api/taggedContent.ts` — API 客户端
- `src/components/workspaceViews/TagContentViewPanel.vue` — 主区面板
- `src/components/workspaceViews/TaggedContentExpander.vue` — 行展开只读渲染
- `src/utils/taggedContentExpansion.ts` — 章节 / 块提取
- `src/mock/taggedContent.ts` + `src/mock/store.ts` — mock 实现
- 后端 `com.tu.backend.tag`（controller / service / DTO）  
