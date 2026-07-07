# 引用块获取与加载原理

本文只介绍当前项目中引用块内容的获取、加载和展示原理，不展开插入交互、编辑回写或后端正式接口设计。

## 数据来源

当前可被引用的候选块数据来自 [src/api/page.ts](/D:/project/tu/tu-web-ts/src/api/page.ts) 中的 `listAllBlocks()`。

它的实现方式是：

- 从 mock 存储 `_contents` 中遍历所有页面的块数据。
- 过滤掉 `ref` 和 `spacer` 类型，只保留可直接被引用的原始块。
- 为每个块补充 `pageId` 和 `pageTitle`，作为引用展示时的来源页元信息。

因此，引用块选择器看到的候选项，并不是来自引用块本身，而是来自所有页面里已经存在的原始块集合。

## 加载入口

当前引用内容进入前端有两条入口。

### 1. 页面切换时注册当前页块

[src/stores/workspace.ts](/D:/project/tu/tu-web-ts/src/stores/workspace.ts) 的 `selectPage()` 在切换页面时会先调用 `getPageContent(pageId)` 拉取当前页块列表，然后调用 `registryStore.registerBlocks(currentBlocks.value, pageId, pageTitle)`。

这一步的作用不是“创建引用块”，而是把当前页面中已有的原始块注册进全局 registry，供其他页面上的引用块直接读取。

### 2. 打开引用块选择器时加载全量候选块

[src/components/BlockPicker.vue](/D:/project/tu/tu-web-ts/src/components/BlockPicker.vue) 监听弹窗 `visible` 状态。当弹窗打开时，会调用 `registryStore.loadAll()`。

`loadAll()` 位于 [src/stores/blockRegistry.ts](/D:/project/tu/tu-web-ts/src/stores/blockRegistry.ts)，内部通过 `listAllBlocks()` 拉取全部可引用块，并写入全局 registry。

这条路径的目标是让“选择引用源”时有完整候选列表，而不是只依赖当前已打开页面的数据。

## 运行时缓存机制

[src/stores/blockRegistry.ts](/D:/project/tu/tu-web-ts/src/stores/blockRegistry.ts) 中的 registry 是引用块功能的运行时缓存中心。

它的职责是：

- 维护一个 `Map<string, BlockWithMeta>`，键是原始块的 `block.id`。
- 通过 `registerBlocks()` 写入当前页面加载到的块。
- 通过 `loadAll()` 写入全量候选块。
- 通过 `getBlock(id)` 返回原始块内容。
- 通过 `getMeta(id)` 返回来源页面等元信息。

这里要注意两个边界：

- registry 是前端运行时缓存，不是引用块本身的数据结构。
- 引用块本体只保存 `refId`，不保存完整展示内容。

也就是说，引用块真正显示什么内容，取决于 registry 里是否已经存在对应 `refId` 指向的原始块。

## 页面渲染过程

[src/components/Page.vue](/D:/project/tu/tu-web-ts/src/components/Page.vue) 在渲染 `ref` 类型块时，不读取 `ref` 自己的 `content`，而是使用 `refId` 去 registry 中查原始块。

当前渲染流程可以概括为：

- 先通过 `registryStore.getMeta(refId)` 取来源页标题，用于显示“引用自：某页面”。
- 再通过 `registryStore.getBlock(refId)` 取原始块内容。
- 如果原始块是普通富文本，就把它的 `content` 传给 `RichTextEditor` 展示。
- 如果原始块是 `x6`，就把它的 `graphData` 传给 `X6Component` 展示。

因此，`Page.vue` 里的引用块更像一个“指针块”：它负责持有 `refId` 并在渲染时解析目标，而不是复制一份目标块内容。

## 简短时序

1. 原始块通过页面加载流程或全量候选加载流程进入 registry。
2. 引用块本体只保存 `refId`。
3. `Page.vue` 渲染引用块时，按 `refId` 查询 registry。
4. 命中后取到原始块内容和来源页元信息。
5. 再按原始块类型渲染为富文本或默认画板。

## 当前边界

本文不覆盖以下内容：

- 插入引用块的交互流程。
- 编辑引用内容后的回写机制。
- 后端真实接口设计。
