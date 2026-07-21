# tu — repo guide

## Git monorepo

本目录为 **tu 平台 monorepo** 根（`git` 仓库）。子目录不再各自维护独立 `.git`：

| 路径 | 原独立仓库（历史） |
|------|-------------------|
| `tu-web-ts/` | `baiban114/tu-web-ts` |
| `tu-backend/` | `baiban114/tu-backend` |
| `tu-gateway/` | `baiban114/tu-gateway` |

`tu-integration-service/`、`tu-rag-service/`、`studyflow/`、`studyflow-service/` 从未单独建仓，直接在本仓库内维护。

## Monorepo layout

| Directory | Language/Stack | Purpose |
|-----------|---------------|---------|
| `tu-web-ts/` | Vue 3 + TypeScript + Vite | Frontend (Tiptap rich editor, X6 canvas, etc.) |
| `studyflow/` | React 19 + Vite + Turborepo | StudyFlow 学习驾驶舱 Web（port **5180**） |
| `studyflow-service/` | Java + Dubbo + PostgreSQL | 学习进度微服务（port **18082**，REST `/api/learning/**`） |
| `tu-backend/` | Java 25 + Spring Boot 4 + Maven | Backend API (MySQL/PostgreSQL via Docker) |
| `tu-gateway/` | Java + Spring Cloud Gateway | API 网关（默认端口 18080） |
| `tu-integration-service/` | Java + Spring Boot | 外部任务系统集成 |
| `tu-rag-service/` | Python + FastAPI | RAG retrieval/indexing on Qdrant |
| `tu-backend/tu-platform-api/` | Java API jar | Dubbo 契约（tu-backend Provider；studyflow-service Consumer） |
| `通用数据结构转换系统.md` | — | Design doc for DataMorph platform |

## StudyFlow (`studyflow/` + `studyflow-service/`)

独立产品 **StudyFlow**（学习驾驶舱），与 `tu-web-ts`（知识生产）分工：

| 路径 | 职责 |
|------|------|
| `studyflow/apps/web` | Vite + React 浏览器主应用 |
| `studyflow/packages/*` | 共享 API 客户端与领域算法 |
| `studyflow-service/` | 学习记录/掌握度持久化（PostgreSQL）；Dubbo 读 tu 知识库 |

**不单独建仓**；与 tu 平台同在 `d:\project\tu` git monorepo。详见各目录 `README.md`。

## Frontend (tu-web-ts)

### Quick commands (run from `tu-web-ts/`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (port 5173, proxied `/api → localhost:8080`) |
| `npm run type-check` | `vue-tsc --build` — **always run this before committing** |
| `npm run test:e2e` | Playwright E2E tests in `e2e/`, runs Vite in mock data mode |
| `npm run test:e2e:ui` | Interactive Playwright UI runner |
| `npm run build` | `run-p type-check "build-only"` — CI-equivalent check |

No linter/formatter is configured.

### Change discipline

When adding or changing user-visible frontend behavior:
- Update the feature description/docs that explain the behavior (`README.md`, `docs/`, or nearby feature catalog when applicable).
- Add or update focused Playwright coverage in `tu-web-ts/e2e/` for interaction-heavy UI, especially editor, nodeView, TOC, floating toolbar, and mock-mode workflows.
- At minimum run `npm run type-check`; run `npm run test:e2e` when the changed behavior is covered by E2E or touches editor/UI interaction.

### Frontend page layout constraints

- New top-level route pages must provide their own scroll container by default, typically `height: 100vh; overflow-y: auto; box-sizing: border-box;`, because the global `body/#app` layout uses `overflow: hidden`.

### Frontend UI conventions (dialogs & lists)

- **Dialogs**: Popup panel height must not exceed the browser content viewport (no page-level scroll when a dialog is open). Use class `tu-dialog-viewport` on `el-dialog` and styles in `tu-web-ts/src/assets/dialog-viewport.css`; scroll inside the dialog body regions only. **Fixed display regions**: slots that show dynamic content (lists, API text) must use statically sized areas—scroll/paginate when overflowing; do not shrink when content is short. **Child regions fill parents**: nested panes must stretch to fill the parent’s allocated space; no purposeless blank gaps. Agent skill: `.cursor/skills/tu-frontend-ui/SKILL.md` §0.
- **Viewport-clamped pop panels**: Click/right-click menus and similar `position: fixed` panels must stay fully inside the browser viewport (use `useViewportClampedFixedPanel` in `tu-web-ts/src/utils/viewportPanel.ts`). Unbounded side lists/trees (e.g. left page tree) scroll inside a `flex: 1; min-height: 0` + `el-scrollbar` region.
- **Lists**: Table/list UIs must use paginated APIs; default **10 items per page** (`DEFAULT_PAGE_SIZE` in `tu-web-ts/src/constants/pagination.ts`). Backend returns `PageResponse` (`items`, `total`, `page`, `pageSize`).
- **Region-scoped controls**: Features that apply to an entire page/panel/canvas (e.g. tag filter) belong in a fixed anchor (sticky toolbar, header, context menu)—not only at the top of scrollable body. See `tu-web-ts/docs/region-scoped-controls.md`.
- **Knowledge relations (Phase 1.5)**: Semantic edges connect **KnowledgePoint** IDs (`knowledge_relation.from_point_id` / `to_point_id`); page/excerpt/annotation locators are **evidence** bindings (`knowledge_point_anchor`). Soft taxonomy tree (`parent_id`) is separate from `prerequisite` edges. See `tu-web-ts/docs/knowledge-relations.md`.
- **知识图谱**：资源管理「知识图谱」Tab；默认以选定知识点为中心展开关联（进入时无预选中心点）；中心点通过通用 [`KnowledgePointPickerDialog`](tu-web-ts/src/components/knowledge/KnowledgePointPickerDialog.vue) / `openKnowledgePointPicker()` 选择
- **Popup derived UI** (click/right-click menus, teleported popovers): register `document` click + `Escape` listeners while visible; remove on hide/unmount; menu root uses `@mousedown.stop` / `@click.stop`. Do not rely on parent-container `@click` only. Hover-derived UI uses delayed dismiss instead (skill §3–§4).
- **Tree UI**: Canonical `TreeNode` + adapters in `tu-web-ts/src/utils/tree/`; read-only browse via `TreeListPanel.vue`. Page directory keeps `el-tree` in `LeftPanel.vue`（文档页右键「展开目录」可单独预览该页大纲，走 `GET /api/pages/{id}/outline`；本库挂接的 document 型资源以虚拟 `resource-document` 节点只读展示，见 `docs/tree-structure-management.md` §7.2）。See `tu-web-ts/docs/tree-structure-management.md`.

### Data source switching

Two modes, controlled by `VITE_DEFAULT_DATA_SOURCE` (default: `backend`):
- `backend` → calls `/api/*` proxied to the Java backend
- `mock` → reads/writes from `localStorage` via `src/mock/store.ts`; no backend needed

Toggle at runtime via the DevMode panel (bottom-right corner in dev mode).

### Architecture highlights

- **State**: Pinia stores in `src/stores/`; `workspace.ts` is the main store for pages and blocks.
- **Router**: `src/router/index.ts` — 3 routes: `/` (home), `/vditor-test`, `/resources`.
- **API types**: `src/api/types.ts` — central type defs (`Block`, `TextAnnotation`, etc.).
- **Mock**: `src/mock/store.ts` — full mock implementation of all page/block/knowledge-base APIs using `localStorage`.
- **Page types**: `PageItem.pageType` is `document` (default), `mindmap`, or `x6board`. Canvas pages (`mindmap` / `x6board`) render in `HomeView` via dedicated `.content-canvas` (not `.content-scroll` / `TuEditorPage`); `CanvasPage.vue` fills the area with a single primary X6 embed in `PageContent.embeds` + `metadata.primaryEmbedId`. If tree `pageType` is missing, workspace infers canvas type from content. Utilities: `tu-web-ts/src/utils/boardPageContent.ts`. Shared canvas UI: `BoardCanvasShell.vue` + `X6BoardBlock.vue` (embedded via `X6BlockView`, full-page via `CanvasPage`). Document内 x6 embed 可通过 NodeView 工具栏「升级为思维导图页/画板页」提升为独立页。Mindmap 节点富文本模式：`X6NodeOverlay` 内嵌 `TuEditor`，通过属性面板「文字模式」切换，graphData 存 `textMode`/`richContent`。

### Rich text editor

The project is **migrating from Vditor to Tiptap** (branch `feat/rich-text-editor-tiptap`):
- **TuEditor.vue** — new Tiptap-based editor component (single document, no block-level rendering).
- **TuEditorPage.vue** — page-level editor using TuEditor with `v-model:blocks`.
- **Page.vue** — legacy Vditor-based page editor (still used on main branch).

Key Tiptap architecture notes:
- `src/editor/extensions/` — custom node extensions (`ParagraphNode`, `X6BlockNode`, etc.) + extensions (`HeadingEnterFix`, `BlockActions`, `SlashCommand`).
- `src/editor/converters.ts` — `blocksToTipTap` and `tipTapToBlocks` convert between Block[] and Tiptap JSON (the boundary between data layer and rendering layer).
- `ParagraphNode` replaces StarterKit's default paragraph (configured with `paragraph: false`).
- `HeadingNode` replaces StarterKit's default heading (`heading: false`); attrs include `blockId`, optional `sourceBinding` (`HeadingSourceBinding` → ResourceExcerpt), and `sectionCollapsed` for heading-section fold state.
- **Enter in a heading** → `HeadingEnterFix` extension intercepts, calls `splitBlock` + `setNode('paragraph')` to always create a paragraph.
- **标记来源（heading source）**: bind h1–h6 to a `ResourceExcerpt` via selection toolbar or TOC context menu; persisted as `<!--tu:heading-source ...-->` comment before the ATX heading line in page `content`; badge via `HeadingSourceDecorations`; indexed by `ReferenceService` as `source_kind=headingSource`. Deep link: `/resources?tab=items&itemId=…&excerptId=…`.
- **标题节折叠（heading section fold）**: section boundaries follow the same flat TOC rules as the page outline (`collectFlatTocEntries`), including ref/external-resource group titles with `tocSettings` / `headingLevel`; collapsing hides content until the next TOC entry at the same or higher level. Local headings persist via `<!--tu:heading-fold ...-->`; embed groups use `sectionCollapsed` on the node; ref-inner headings use `metadata.sectionCollapsedChildren`. Not linked to TOC expand/collapse.
- `RichTextEditor.vue` is the Vditor-based component (legacy; being replaced).
- Annotation highlights (`TextAnnotation[]`) stored in `Block.metadata.annotations` → rendered via DOM Range API in `src/utils/annotations.ts`.

### Block data model

Central type: `Block` (`src/api/types.ts`). Fields:
- `id`, `type` (`richtext`, `x6`, `line`, `ref`, `container`, `spacer`, `table`)
- `content` (markdown string for richtext blocks)
- `metadata` (freeform JSON for tags, annotations, etc.)
- `children` (for `container` type)
- Type-specific fields: `graphData`, `timelineData`, `tableData`, `refId`/`refType`, `spacerHeight`

Persistence: `POST /api/blocks/sync` via `blockSyncManager.ts` (debounced 500ms after `content-change` emit).

### Rich content block types

- **X6 canvas** (`x6`): rendered by `X6Component.vue` using `@antv/x6`, with graph data stored in `block.graphData`. Shared graph helpers live in `tu-web-ts/src/components/x6/` (node/edge factories, blueprints). Variants are selected via `graphData.blueprintMeta.kind` (e.g. `task-flow`, `mindmap`); insert **思维导图** from the slash menu (`x6-mindmap`).
- **Timeline** (`line`): rendered by `line.vue` component.
- **Reference** (`ref`): rendered by `ReferencedBlockRenderer.vue`, loads remote block content by `refId`.
- **Table** (`table`): rendered by `TableBlock.vue` (simple editable table).
- **Spacer** (`spacer`): visual spacer with adjustable height.

## Backend (tu-backend)

Java 25 + Spring Boot 4.1 + Maven 多模块：`tu-platform-api`（Dubbo 契约 jar）、`tu-backend-app`（Spring Boot 可执行应用）。MySQL mode by default; PostgreSQL also supported.

Dependency stack (managed in `tu-backend/pom.xml`): Spring Boot `4.1.0`, Spring Cloud `2025.1.2`, Spring AI `2.0.0` GA.

```powershell
# Local dev (MySQL)
$env:SPRING_PROFILES_ACTIVE='mysql'
$env:SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/tu_db?...'
$env:SPRING_DATASOURCE_USERNAME='tu'
$env:SPRING_DATASOURCE_PASSWORD='tu123456'
mvn spring-boot:run -pl tu-backend-app
```

Docker: `docker compose up -d --build` starts MySQL, backend, RAG service, Qdrant, and Elasticsearch (page full-text search).

### Backend debugging and logging constraints

- When an API returns `{"code":50000,"message":"internal server error"}`, inspect backend logs first; the API envelope intentionally hides unhandled exception details from clients.
- `GlobalExceptionHandler` must log `BusinessException`, validation errors, and unhandled exceptions with stack traces before returning the API envelope.
- Business-facing failures from integrations or AI calls should be wrapped as `BusinessException` with enough context for local debugging, but must never include secrets such as API Keys.
- Auxiliary telemetry, audit, or Agent run-log persistence must not mask the original business exception. If recording fails, log that secondary failure and rethrow the original exception.
- After changing Spring-managed constructors or bean wiring, add or run a minimal Spring context/bean creation test; pure unit tests that instantiate classes directly do not catch constructor selection problems.

### Business AI agent tool loop

- **Stack**: Spring AI 2.0.0 GA `ToolCallingManager` + manual `while (hasToolCalls)` loop in `OpenAiCompatibleChatClient.runToolLoop()` (`AiAgentToolLoopClient`). `@Tool` beans are registered via `MethodToolCallbackProvider` (`AiAgentToolCallbackSupport`).
- **Tools** (`AiAgentTools` + optional `AiAgentWebSearchTools`): `searchKnowledgeBasePages` (ES), `queryKnowledgeBaseRag` (RAG; needs request `kbId`), `searchWeb` (generic Tavily web search; only registered when user sets `enableWebSearch=true`). Scenario services (e.g. learning plan) add task-specific search guidance in their system/user prompts.
- **Learning plan**: `POST /api/ai/learning-plan/generate/stream` (SSE progress + final plan in `completed` event) is used by the frontend; sync `POST /api/ai/learning-plan/generate` remains for compatibility. Tool loop enabled by default (`ai.agent.tool-loop.enabled=true`). Frontend passes current `kbId` and optional `enableWebSearch` checkbox. Progress events: `started`, `model_call`, `tool_call`, `tool_done`, `parsing`, `completed`, `failed`, `cancelled` (fields: `phase`, `message`, `round`, `toolName`, `elapsedMs`, optional `result` on `completed`). Client abort closes SSE and cooperative cancel stops further tool/model rounds.
- **Document marking (MVP)**: `POST /api/ai/document-marking/analyze/stream` — manual trigger from `TuEditorPage` toolbar「AI 分析标记（整页）」or section handle「AI 分析标记（本节）` (optional `sectionHeadingBlockId` / `sectionEmbedBlockId` / `sectionTitle` in request); returns suggestions only (preview → user confirms → frontend `applyAiMarkingSuggestions`). Protected manual markers (`markerSource=user`, `source_provenance=user`) are never overwritten. AI markers use `markerSource=ai` / `source_provenance=ai`; UI shows AI chip; optional「替换本页 AI 标记」clears AI markers before apply. `DELETE /api/ai/document-marking/pages/{pageId}/ai-markers` removes AI relations. Mock: `tu-web-ts/src/api/aiDocumentMarking.ts`. See `tu-web-ts/docs/knowledge-relations.md`.
- **Config** (`application.yml`): `AI_AGENT_TOOL_LOOP_ENABLED`, `AI_AGENT_MAX_TOOL_ROUNDS` (default 8), `TAVILY_API_KEY` (server infra only; user toggles web search per request). HTTP client timeouts are configured in **Settings → AI Agent** (`connectTimeoutSeconds`, `readTimeoutSeconds`, `requestTimeoutSeconds`; defaults 30 / 300 / 300). `application.yml` `ai.agent.http.*` env vars (`AI_AGENT_HTTP_*`) seed defaults when DB fields are unset.
- **Disable loop**: set `ai.agent.tool-loop.enabled=false` to fall back to single-shot `completeJson`.

### External resource book chapters

Book-type `ResourceItem` may define a multi-level chapter tree (`ResourceChapter`, table `external_resource_chapter`); excerpts optionally link via nullable `chapterId`. **Document** and **web-link** resource items support flat excerpts only (no chapter tree). Bootstrap seeds `book` and `document` resource types on startup. See `tu-web-ts/docs/tree-structure-management.md` §7.1 for the resource tree rules.

### Global page search (Elasticsearch)

- **Index**: page title + block body (one ES document per block); keyword search via `GET /api/search?q=&limit=`.
- **UI**: `GlobalSearchBox` in `LeftPanel.vue` (between auth and knowledge-base list); mock mode uses `searchPagesMock` in `src/mock/store.ts`.
- **Infra**: `docker compose -f docker-compose.infra.yml up -d elasticsearch` (port 9200).
- **Config**: `SEARCH_ENABLED` (default `true`), `ELASTICSEARCH_URIS`, `SEARCH_INDEX` (`tu_pages`), `SEARCH_ES_API_VERSION` (default `8` for ES 8.x docker image; set `9` when server is Elasticsearch 9.x). Set `SEARCH_ENABLED=false` for local dev without ES.
- **Reindex**: after first ES startup or bulk import, call `POST /api/search/reindex` to backfill historical pages.

### RAG/ES index timing

- **Elasticsearch**: indexed immediately on every page save / title change / block update (`PageIndexCoordinator.onPageContentChanged`).
- **RAG**: deferred — marked dirty on save; indexed on flush when:
  1. User navigates away — frontend `POST /api/index/pages/{pageId}/flush` from `workspace.selectPage` / `selectKb`
  2. Scheduled sweep — `@Scheduled` every `INDEX_FLUSH_INTERVAL_MS` (default 5 min)
  3. Manual — `POST /api/rag/reindex/page/{pageId}`

Deletes remove both indexes immediately. RAG flush uses fingerprint skip (`INDEX_FINGERPRINT_ENABLED`, default true) to skip unchanged content.

### File storage (MinIO / S3)

- **Purpose**: editor paste/upload stores images as URLs (`/api/files/{id}`), not Base64 in markdown. PDF excerpts upload the full PDF once; document blocks reference `fileId` + page range only (no file splitting).
- **API**: `POST /api/files` (multipart `file`), `GET /api/files/{id}` (inline stream; supports `Range: bytes=…` → `206` for PDF.js partial loading).
- **PDF excerpt block**: `pdfExcerptBlock` node + `PdfExcerptPicker` (slash「PDF 摘页」); serialization `<!--tu:pdf-excerpt ...-->` via `src/utils/pdfExcerpt.ts`; render via PDF.js + `src/utils/pdfDocumentCache.ts`.
- **Standalone MinIO** (when other containers already run): `docker compose -f docker-compose.minio.yml --env-file .env.minio up -d` in `tu-backend/` — Compose project `minio`, container `minio`. See `README-compose.md`.
- **Config**: `STORAGE_ENABLED`, `STORAGE_S3_ENDPOINT` (default `http://localhost:9000`), `STORAGE_S3_*` credentials/bucket (`tu-files`), `STORAGE_MAX_PDF_FILE_SIZE` (default 200MB). Backend auto-creates bucket on first upload.
- **Frontend**: `src/api/fileStorage.ts`; `TuEditor` paste uploads via API (mock mode uses `blob:` URLs).

## RAG service (tu-rag-service)

Python FastAPI on port 19080. Backend proxies requests. Qdrant on port 6333 for vector storage.
