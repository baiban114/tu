---
name: tu-frontend-ui
description: >-
  tu 前端 UI 约定：固定显示区域、视口内弹窗、列表分页（默认每页 10 条）、悬浮/弹出派生 UI 的关闭行为。
  在 tu-web-ts 中新增或修改 el-dialog、el-table、列表 API、右键菜单、悬浮工具栏、
  资源管理/节选/选择器等界面时使用。
---

# tu 前端 UI 约定

## 0. 动态内容的固定显示区域

动态内容出现的地方必须提前静态规定好显示区域，动态内容如列表查询展示的内容，后端发来的文本显示的内容。如果内容可能会超出区域，考虑使用滚动、分页；如果内容不够，也不允许收缩显示区域。换言之，显示区域都是写死的。而不是由动态内容的长度影响 UI 的变化。

除了顶部容器如弹窗外，子容器在规划 UI 时必须填充满父容器，不能出现无任务元素的空白。

### 实现要点

- **先定框，再填内容**：列表区、详情区、文本预览区等用固定 `height` / `min-height`（或父级 flex 分配的确定高度），不要只用内容撑开的自然高度。
- **子容器铺满父容器**：规划布局时，每一层子区域（双栏、列表槽、详情槽、滚动区）须用 `flex: 1` / `height: 100%` / grid 轨道等占满父级已分配空间；禁止父级已写死高度后，子级只按内容收缩，留下大块无交互、无信息的空白。
- **空白须有任务**：若视觉上仍有空余，应放空态、说明文案、可滚动列表区或主操作锚点等**有任务**的元素去填满；不要留「什么都没有」的死区。
- **超出**：区域内 `overflow: auto` / `el-scrollbar`，或分页（默认每页 `DEFAULT_PAGE_SIZE = 10`）；禁止把整页 / 整弹窗被内容撑高后依赖页面滚动。
- **不足**：空态、加载中、短列表时区域高度保持不变（空态/说明区 `flex: 1` 居中填满），禁止随条目变少而塌缩。
- **单条文本**：标题、URL、后端长文等用省略（`ellipsis`）或区域内换行 + 滚动，不得撑破固定框。
- **与 §1 关系**：弹窗仍须 `tu-dialog-viewport`；本条强调弹窗**内部各槽位**高度也写死且层层铺满，而不仅是「不超过视口」。

### 反例

- 选择器双栏 `max-height` 仅作上限、无固定高度 → 0～2 条结果时弹窗忽高忽矮。
- 详情区随选中资源元信息长短伸缩，主操作按钮位置上下跳动。
- 列表 `v-for` 无分页/无内部滚动，条目多时把 footer 挤出视口。
- 弹窗已固定高度，但左/右栏或滚动区未 `flex: 1` / `height: 100%` → 栏底或栏间出现大块无任务空白。

## 1. 弹出面板高度

弹出面板 UI height 不能超过浏览器内容窗口，避免滚动出现。

**弹窗本体与内部各区域**均须限制高度：打开后 `document` / `body` 不得出现纵向滚动条；列表、表单、富文本编辑区等须在各自容器内滚动，不得把整页或整弹窗撑出视口。

### 实现要点

- 对话框根节点加 `tu-dialog-viewport`（样式见 `tu-web-ts/src/assets/dialog-viewport.css`）。
- 对话框本体：`max-height: calc(100dvh - 32px)`，纵向 flex；**禁止**让 `document` / `body` 因弹窗出现纵向滚动条。
- `.el-dialog__body`：`flex: 1; min-height: 0; overflow: hidden`。
- 内容根容器（如 `.resource-picker`）：**写死高度**（如 `height: min(560px, calc(100dvh - 140px))`），不要只用 `max-height` 导致内容少时塌缩；见 §0。
- 双栏/多栏布局：每栏 `display: flex; flex-direction: column; min-height: 0; overflow: hidden`；列表区 `flex: 1; min-height: 0` + 内部 `el-scrollbar` 或 `overflow-y: auto`。
- 表单主操作（创建/保存）放在栏底 `flex-shrink: 0` 或 `position: sticky; bottom: 0`，勿随正文滚出视口。
- 可滚动内容放在内部区域（如表格 `height`/`max-height`、表单列 `overflow-y: auto`），不要给 `el-dialog__body` 设 `overflow: auto`。
- 避免用 `min-height: 68vh`、`el-scrollbar height="360px"` 等撑破视口的固定高度写法。

## 2. 列表分页

列表显示的元素需要分页查询，默认每页 10 条。

### 实现要点

- 前端常量：`tu-web-ts/src/constants/pagination.ts` 中 `DEFAULT_PAGE_SIZE = 10`，`MAX_PAGE_SIZE = 200`。
- 后端列表接口返回 `PageResponse<T>`（`items`, `total`, `page`, `pageSize`），`pageSize` 默认 10，上限 200。
- 表格数据只绑定当前页 `items`；总数用 `total`；提供 `el-pagination`。
- 筛选/切换上下文时重置 `page` 为 0。
- Mock（`src/mock/store.ts`）与后端分页语义保持一致。

## 3. 悬浮派生 UI（hover 保持）

由某一可交互区域（如 URL 文本、块、列表项）**悬浮触发**的工具栏、菜单、预览条等，属于**派生 UI**。派生 UI 与触发源应视为**同一 hover 会话**，不能把鼠标移入派生 UI 误判为「已离开触发源」。

### 实现要点（以 URL 悬浮工具栏为例）

1. **定位**：派生 UI 贴在触发源的**内容区域上方**（`placement: 'top'`），传入 `floatingWidth` / `floatingHeight`，使浮层整体位于锚点之上，不与触发文字重叠。
2. **随滚动跟贴**：派生 UI 相对触发源的位置在滚动、布局变化后须保持不变。`getAnchorRect` 每次更新须**重新测量**触发源（如 `coordsAtPos` / `getBoundingClientRect`），禁止只用 hover 时缓存的 `DOMRect`；`useAnchoredFloating` 监听 `window` 与内容滚动容器（如 `.content-scroll`）的 `scroll`（capture）及 `resize`。
3. **会话归属**：触发源 `mouseleave` / 检测丢失时**不要立刻销毁**；由页面层 `scheduleDismiss`（约 300ms）延迟关闭。
4. **移入派生 UI**：`mouseenter` 时取消 dismiss 定时器，保持 `hover` 会话；`mouseleave` 再 `scheduleDismiss`。
5. **Teleport 场景**：派生 UI 挂到 `body` 后，编辑器 `mouseleave` 仍会触发——必须用上述延迟 + 派生 UI `mouseenter` 续期，不能依赖触发源 DOM 父子关系。
6. **参考实现**：`resolveUrlHoverTargetAnchorRect` + `UrlHoverToolbar.vue` + `TuEditorPage.vue` 中 `urlHoverToolbarHovering` / `scheduleUrlHoverDismiss`。

### 反例

- 编辑器 `mouseleave` 立即 `emit(null)` → 鼠标移向工具栏途中条消失。
- 仅用 `transform: translate(-50%)` 居中、不传浮层尺寸 → 工具栏压住 URL 文字。
- 只在 hover 时保存 `anchorRect`，滚动后仍读旧坐标 → 工具栏与 URL/iframe 脱节。

## 4. 弹出 / 派生 UI（点击外部关闭）

由**点击或右键**触发的菜单、气泡、列头菜单等派生 UI（尤其 `Teleport to="body"`），在用户**点击页面其他区域**或按 **Escape** 时必须自动关闭。

> 与 §3 悬浮派生 UI 区分：hover 会话用延迟 dismiss、移入不关闭；本节适用于「点开即应能点空白关掉」的弹出层。

### 实现要点

1. **全局监听，不要只绑触发容器**：派生 UI 挂到 `body` 后，父级（如 `.left-panel`）的 `@click` **收不到**主内容区、其他面板的点击。须在菜单**可见时**于 `document`（或 `window`）注册 `click` 监听，隐藏时移除。
2. **按可见性注册/注销**：`watch(() => menu.visible, …)` 在 `true` 时 `addEventListener`，`false` 时 `removeEventListener`；`onBeforeUnmount` 再兜底移除，避免泄漏。
3. **菜单根节点阻止冒泡**：`@mousedown.stop` + `@click.stop`（必要时 `@contextmenu.prevent.stop`），避免点菜单项时事件冒泡到 `document` 导致菜单先被关掉、项内 handler 未执行。
4. **Escape**：同一 `watch` 分支可加 `keydown` 监听，`Escape` 时关闭。
5. **打开方式**：右键菜单用 `contextmenu` 打开，不会与随后的 `click` 关闭冲突；若用 `click` 打开，注意同一轮事件顺序，必要时 `nextTick` 再挂全局监听。
6. **参考实现**：`LeftPanel.vue`（页面树右键菜单）、`TableBlock.vue` / `MultiTableBlock.vue`（列头菜单）、`TuEditorPage.vue`（TOC 右键菜单）。

### 反例

- 仅在 `.left-panel` / 局部容器上 `@click="closeMenu"` → 点编辑器、右侧栏菜单不关。
- 菜单 `visible` 为 `true` 期间从不 `removeEventListener` → 泄漏或误关后续弹层。
- 菜单根未 `@click.stop`，点菜单项时 `document` 先收到冒泡 → 菜单闪关或项无效。

## 5. 区域级控件放置

作用于**整块区域**（整页、面板、画布视图等）的筛选、模式切换、批量操作，必须放在该区域的**固定锚点**（sticky 顶栏、区域 Header、右键菜单），**不得**仅放在可滚动正文开头。

### 实现要点

- 文档页：`tu-web-ts/src/components/TuEditorPage.vue` 的 `.page-chrome`（`position: sticky; top: 0`）放编辑操作；页面标签与按标签筛选在标题下 `PageTagsBar`。
- 滚动容器为 `tu-web-ts/src/views/HomeView.vue` 的 `.content-scroll`；顶栏用负水平边距与 padding 对齐内容区全宽。
- 只读模式若仍支持区域级能力（如按标签查看），顶栏在无编辑按钮时单独展示该能力。
- 对象级（单块 NodeView 工具栏）与选区级（划选浮条）不抬升到 page 顶栏。

完整规范见 `tu-web-ts/docs/region-scoped-controls.md`。

### 反例

- 将「按标签查看」放在页面标题下方 → 滚动正文后筛选条不可见。
- 把仅对当前 embed 有效的按钮放到 page 顶栏。

## 6. 弹窗内无上限列表

弹窗、气泡面板中，**长度不受固定上限约束**的列表（标签候选、搜索结果、节选列表等）不得一次性撑开整个面板，以免把底部「取消 / 保存」等操作挤出视口。

### 实现要点

- 面板本体：`flex` 纵向布局 + `max-height: calc(100dvh - 32px)`（或 `tu-dialog-viewport` / `tu-dialog-viewport-panel`），**禁止**整块 `overflow: auto`。
- **Header / Footer 固定**：`flex-shrink: 0`；操作按钮放在 footer，不随列表滚动离开视口。
- **列表区受限滚动**：候选列表容器 `flex: 1; min-height: 0; overflow-y: auto`（或 `tu-dialog-viewport-panel__scroll`），已选 chips 过多时单独 `max-height` + 滚动。
- **分页或按需加载**（默认每页 `DEFAULT_PAGE_SIZE = 10`）：
  - 后端接口：走 `PageResponse` 分页查询，只绑定当前页 `items`。
  - 前端聚合池（如 `collectAvailableTags`）：用 `paginateSlice`（`src/utils/clientPagination.ts`）客户端分页，筛选变化时重置 `page`；关闭弹窗时清空页码与查询，便于内存回收。
- 工具：`el-pagination` 或等价控件；Enter 选第一项仍针对**全量筛选结果**而非仅当前页。

### 参考实现

- 标注弹窗：`NoteEditor.vue`（标签候选分页 + 固定 footer）
- 块/页标签编辑：`BlockMetadataTagEditor.vue`
- 外部资源选择/标记节选：`ExternalResourcePicker.vue`（`tu-dialog-viewport` + 双栏内部滚动 + 表单底栏固定）
- 样式契约：`tu-web-ts/src/assets/dialog-viewport.css`

### 反例

- 弹窗根节点 `overflow: auto`，标签上百条时保存按钮需滚到底才可见。
- `v-for` 渲染全量 `availableTags` 且无分页/虚拟滚动。

## 7. 视口内完整显示（弹出面板钳位）

由点击/右键触发的固定定位菜单、气泡、列头菜单等**弹出/衍生面板**，须**完整**出现在浏览器内容窗口内，不得被屏幕下/右边缘截断导致无法点击。

### 实现要点

1. **可滚动父区域**：可能无限增长的列表/树（如左侧页面树）放在 `flex: 1; min-height: 0` 容器内，内部 `el-scrollbar` 设 `height: 100%`（或 `height: 0` + `flex: 1`），由**区域内部**滚动，不要把整页或左栏撑出视口。
2. **钳位工具**：`tu-web-ts/src/utils/viewportPanel.ts` 提供 `clampFixedPanelToViewport`、`estimateFixedPanelPosition`（渲染前预估尺寸）、`useViewportClampedFixedPanel`（挂载后 `getBoundingClientRect` 实测再钳位）。
3. **右键菜单**：保存指针 `clientX/clientY` 为源点；面板 `ref` + composable 输出 `position.left/top`；`padding` 默认 12px（与 `useAnchoredFloating` 一致）。
4. **窗口 resize**：面板可见时监听 `resize` 并重新钳位。
5. **参考实现**：`LeftPanel.vue`（页面树滚动 + 右键菜单）、`TuEditorPage.vue`（TOC 右键）、`KnowledgePointTree.vue`、`TableBlock.vue` / `MultiTableBlock.vue`（列头菜单）。

### 反例

- 直接用 `event.clientX/Y` 作 `position: fixed` 坐标 → 靠近屏幕底部时菜单下半截不可点。
- 页面树不设 `min-height: 0` / 内部滚动 → 文档少时布局异常，或多时整栏被撑出视口。
- 仅用固定宽高估算、从不 `nextTick` 实测 → 菜单项数量变化时仍可能溢出。

## 8. PDF 摘页块

文档内引用已上传 PDF 正本（`/api/files/{id}`），块元数据只保存 `fileId` + `startPage`/`endPage`，**不切割**原文件。阅读时由 PDF.js 经 HTTP Range 按需拉取字节。

### 实现要点

- 节点：`pdfExcerptBlock` + `PdfExcerptBlockView.vue`（canvas 按页渲染，`IntersectionObserver` 惰性绘制）。
- 上传选页：`PdfExcerptPicker.vue`（`tu-dialog-viewport`）；Slash / 段落手柄「PDF 摘页」。
- 序列化：`src/utils/pdfExcerpt.ts`（`<!--tu:pdf-excerpt ...-->`）；文档缓存 `src/utils/pdfDocumentCache.ts`。
- 后端：`GET /api/files/{id}` 须返回 `Accept-Ranges: bytes` 并支持 `206 Partial Content`。

## 检查清单

- [ ] 动态内容区（列表/详情/后端文本）是否有**写死的**显示区域，空内容也不塌缩、长内容用滚动或分页？
- [ ] 子容器是否填满父容器已分配空间，有无无任务元素的空白死区？
- [ ] 新 `el-dialog` 是否使用 `tu-dialog-viewport` 且打开后页面无整体滚动？
- [ ] 弹窗内双栏/列表/富文本编辑区是否 `min-height: 0` 并在内部滚动，而非撑高整窗？
- [ ] 新列表是否走后端分页 API，默认 `pageSize=10`？
- [ ] 保存/删除后是否刷新当前页或合理回退页码？
- [ ] 悬浮触发的派生 UI 是否延迟 dismiss，且移入派生 UI 不会关闭？
- [ ] 页面/内容区滚动时，派生 UI 是否仍相对触发源跟贴（实时 `getAnchorRect` + scroll 监听）？
- [ ] 点击/右键弹出的派生 UI（含 `Teleport`）是否在 `document` 上监听点击外部 + `Escape` 关闭，并在隐藏/卸载时移除监听？
- [ ] 弹出菜单根节点是否 `@mousedown.stop` / `@click.stop`，避免点项时误关？
- [ ] 固定定位弹出菜单是否经 `useViewportClampedFixedPanel` 钳位，完整显示在视口内？
- [ ] 可能无限增长的侧栏列表/树是否在内部滚动容器内（`min-height: 0` + `el-scrollbar`）？
- [ ] PDF 摘页是否只存 `fileId` + 页码、用 PDF.js + Range 渲染（非 iframe `file://` / 物理切分）？
- [ ] 新的区域级能力是否放在 sticky 顶栏 / Header / 右键菜单，而非仅正文顶部？
- [ ] 弹窗内无上限列表是否分页或按需加载，且 footer 操作固定可见？
- [ ] 跨锚点知识关联是否走 `knowledge_relation` API，而非写死 `source_kind`？（见 `docs/knowledge-relations.md`）
