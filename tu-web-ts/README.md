# tu-web-ts

当前前端支持两套开发数据源：

- `backend`：默认模式，请求 `/api/*` 并通过 Vite 代理转发到后端。
- `mock`：本地浏览器存储中的 mock 数据，无需后端即可完成页面树、内容编辑、引用块和块同步调试。

## 开发者模式

运行 `npm run dev` 后，页面右下角会出现 `Developer Mode` 面板，仅在开发环境显示。

- 可以随时切换 `Backend / Mock`
- 可以点击 `Reset Mock` 重置本地 mock 数据
- 当前选择会写入浏览器 `localStorage`

## 环境变量

可参考 [.env.development.example](/D:/project/tu/tu-web-ts/.env.development.example)：

```bash
VITE_DEFAULT_DATA_SOURCE=backend
VITE_DEV_PROXY_TARGET=http://localhost:18080
```

- `VITE_DEFAULT_DATA_SOURCE` 可选 `backend` 或 `mock`
- `VITE_DEV_PROXY_TARGET` 控制开发代理后端地址

## E2E 测试

前端使用 Playwright 做端到端测试，测试脚本保存在 `e2e/`，配置文件为 `playwright.config.ts`。

```bash
npm run test:e2e
npm run test:e2e:ui
```

Playwright 会自动启动 Vite，并设置 `VITE_DEFAULT_DATA_SOURCE=mock`，因此默认不依赖后端服务。

如果 Playwright 浏览器下载在国内网络下不可用，可以直接使用本机已安装的 Chrome/Chrome Canary：

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL='chrome-canary'
npm run test:e2e
```

新增或修改用户可见功能时，应同步更新功能描述，并为编辑器、nodeView、目录、悬浮工具栏等交互行为补充或更新 E2E 用例。

## 表格列操作

普通表格和多维表格共用前端列操作抽象。普通表格列头右键可在左侧或右侧新增列，也可删除列；新增列会同步表头、每行单元格和列宽。多维表格字段列头右键可打开字段设置、重命名字段、在左侧或右侧新增列以及删除字段；新增列等价于新增 `text` 字段，并会为现有记录补默认值。

多维表格默认以空白表格创建；工具栏中的 `任务看板` 会应用任务管理预设，创建任务、状态、负责人、截止日期和预估工时字段，并切换到按状态分组的看板视图。

多维表格的表格视图底部提供 `+ 新增一行` 操作，新增记录时会按当前字段类型填充默认值。任务看板支持为单条任务添加子任务，子任务可独立填写工时；看板和工具栏会汇总任务与子任务的预估工时。

工具栏中的 `学习计划` 会应用学习任务预设，创建学习任务、状态、预估工时、说明和资源字段。学习计划支持章节和步骤两级以上的树形记录：表格视图按层级缩进，章节显示后代聚合工时；看板视图只展示顶层章节卡片，并在卡片内展示子步骤树。拖动章节卡片到其他状态列会同步更新该章节及所有后代步骤状态。

`AI 生成计划` 面板可输入学习目标，并可选填写总可用小时、每日学习小时和截止日期。点击「生成」后会显示步骤日志（模型调用、知识库/联网工具等）与已用时，可随时「中止」。mock 数据源下会模拟进度并生成示例计划；backend 数据源下会调用 `POST /api/ai/learning-plan/generate/stream`（SSE），生成结果先预览，点击 `确认替换当前学习计划` 后才覆盖当前记录。同步接口 `POST /api/ai/learning-plan/generate` 仍保留供兼容。

AI Agent 的 OpenAI-compatible 接入信息完全在 `系统配置` 页面管理。后端会把 API Key 写入通用密钥库并使用应用级 AES-GCM 加密；本地开发使用后端配置文件中的开发默认加密密钥，生产部署应通过 `TU_SECRET_ENCRYPTION_KEY` 覆盖。

`系统配置` 页面还会展示 `Agent 记录`：学习计划等业务型 AI 生成会记录完整 system/user prompt、请求体、原始响应、解析输出、耗时和模型返回的 token usage；连接测试不会写入记录。mock 数据源下生成学习计划也会写入本地 mock 记录，便于调试页面展示。
