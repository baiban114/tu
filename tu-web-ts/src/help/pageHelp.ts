import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { PageType } from '@/api/types'

export interface PageHelpSubsystem {
  name: string
  role: string
}

export interface PageHelp {
  id: string
  title: string
  summary: string
  features: string[]
  subsystems: PageHelpSubsystem[]
}

const SUB = {
  backend: { name: 'tu-backend', role: '知识库、页面/块、资源、标注与设置等业务 API。' },
  gateway: { name: 'tu-gateway', role: '统一入口代理前端 `/api` 到后端服务。' },
  es: { name: 'Elasticsearch', role: '页面全文检索（标题与块正文）。' },
  rag: { name: 'tu-rag-service + Qdrant', role: '语义检索与知识库 RAG 索引。' },
  minio: { name: 'MinIO / S3', role: '图片与 PDF 等文件对象存储。' },
  ai: { name: 'AI Agent', role: '学习计划、文档标记等 OpenAI-compatible 工具循环。' },
  kaneo: { name: 'Kaneo（经 tu-integration-service）', role: '外部任务系统读写与页面/块关联。' },
  mock: { name: 'Mock 数据源', role: '开发模式下用 localStorage 模拟 API，可不启动后端。' },
} as const

const catalog: Record<string, PageHelp> = {
  'home.workspace': {
    id: 'home.workspace',
    title: '工作区',
    summary: '左侧管理知识库与页面树，右侧打开文档或画布页。顶栏可跳转到任务、资源与系统设置。',
    features: [
      '创建与切换知识库，浏览/拖拽页面树层级。',
      '全局搜索定位页面与内容片段。',
      '选择页面后进入文档编辑或思维导图/画板。',
      '开发模式下可切换 Backend / Mock 数据源。',
    ],
    subsystems: [SUB.backend, SUB.gateway, SUB.es, SUB.mock],
  },
  'home.document': {
    id: 'home.document',
    title: '文档页面',
    summary: '基于 Tiptap 的单文档编辑器：标题、大纲目录、块级嵌入、标注与 AI 标记等。',
    features: [
      '富文本、标题、代码块、表格、引用块、X6/PDF 等嵌入。',
      '悬停段落左侧圆点：段落级插入、标注、节选、剪切/复制/删除；悬停标题装订线或折叠区：节级操作（来源、节标签、AI 本节等）；嵌入块左侧：块级拖拽与操作。',
      '右侧页面目录：跳转、展开/收起、节级操作与来源徽章。',
      '划选工具栏：链接、标注、标签、标记节选与设置依据；标记节选后记为「学习进行中」目标（顶栏芯片显示资源实体名），下次粘贴正文或新建引用块时可确认「标记为「节选/资源名」」并自动追加为同级引用块。',
      '顶栏「进行中」芯片：展示当前学习目标对应的资源实体，点击跳转资源页，可清除。',
      '顶栏「显示标注」：在有标注的段落右侧显示入口，点击查看相关标注。',
      '文档正文底部可发表评论；笔记弹层底部也可评论，支持对评论再评论。',
      'AI 分析标记（整页/本节）：打开弹窗后需点击「开始分析」才会请求；关闭弹窗会中止进行中的分析。建议预览后由用户确认应用。',
      '页面/块/节/文字标签筛选；粘贴图片上传为文件 URL。',
    ],
    subsystems: [SUB.backend, SUB.minio, SUB.es, SUB.rag, SUB.ai, SUB.mock],
  },
  'home.mindmap': {
    id: 'home.mindmap',
    title: '思维导图页',
    summary: '整页 X6 思维导图画布，节点可切换纯文本/富文本，支持折叠子树与导出到内容树。',
    features: [
      '全屏画布编辑思维导图结构与节点内容。',
      '节点悬浮展开/收起、文字模式切换。',
      '可作为引用块嵌入其他文档页。',
    ],
    subsystems: [SUB.backend, SUB.gateway, SUB.mock],
  },
  'home.x6board': {
    id: 'home.x6board',
    title: '画板页',
    summary: '整页 X6 自由画板，适合流程图、任务流等蓝图；内容持久化为页面主嵌入。',
    features: [
      '全屏画布编辑节点与连线。',
      '材料库与蓝图类型（如任务流）。',
      '文档内 X6 块可升级为独立画板页。',
    ],
    subsystems: [SUB.backend, SUB.gateway, SUB.mock],
  },
  resources: {
    id: 'resources',
    title: '引用与外部资源',
    summary: '统一管理页面内引用、外部资源实体、知识点与知识关联图谱。',
    features: [
      '按 Tab 查看引用、资源实体、归类、类型与 URL 规则。',
      '管理知识点树、语义关联与只读知识图谱。',
      '处理孤立标注与对象管理。',
    ],
    subsystems: [SUB.backend, SUB.gateway, SUB.mock],
  },
  'resources.references': {
    id: 'resources.references',
    title: '引用管理',
    summary: '查看知识库内页面的内部引用、外部链接与标注引用，支持筛选与跳转修复。',
    features: [
      '按类型/状态/关键词筛选引用列表（分页）。',
      '区分内部页引用、外部 URL、标注绑定等。',
      '从引用定位到源页面或目标资源。',
    ],
    subsystems: [SUB.backend, SUB.gateway, SUB.mock],
  },
  'resources.items': {
    id: 'resources.items',
    title: '资源实体',
    summary: '维护书目、文档、网页链接等 ResourceItem；书籍可建章节树并挂节选。',
    features: [
      '创建/编辑资源实体，关联类型与归类。',
      '书籍章节树；节选可绑定章节。',
      '文档/网页以扁平节选列表管理。',
      '节选列表可打开该资源只读全文，并定位到对应片段。',
    ],
    subsystems: [SUB.backend, SUB.minio, SUB.mock],
  },
  'resources.works': {
    id: 'resources.works',
    title: '资源归类',
    summary: '对资源实体做作品/系列等归类维度，便于筛选与聚合。',
    features: [
      '创建与维护归类节点。',
      '在资源实体侧关联归类后用于列表过滤。',
    ],
    subsystems: [SUB.backend, SUB.mock],
  },
  'resources.types': {
    id: 'resources.types',
    title: '资源类型',
    summary: '定义资源实体的类型元数据（如书、文档、网页链接）及展示图标。',
    features: [
      '维护资源类型列表。',
      '类型决定实体是否支持章节树等能力。',
    ],
    subsystems: [SUB.backend, SUB.mock],
  },
  'resources.urlRules': {
    id: 'resources.urlRules',
    title: 'URL 聚类规则',
    summary: '配置外部 URL 如何归并到资源项，减少重复实体。',
    features: [
      '编写匹配/聚类规则。',
      '应用到引用与资源识别流程。',
    ],
    subsystems: [SUB.backend, SUB.mock],
  },
  'resources.objects': {
    id: 'resources.objects',
    title: '对象管理',
    summary: '浏览与管理系统内可引用对象，配合页面引用绑定。',
    features: [
      '对象列表与详情查看。',
      '与页面/引用体系配合使用。',
    ],
    subsystems: [SUB.backend, SUB.mock],
  },
  'resources.orphaned': {
    id: 'resources.orphaned',
    title: '孤立标注',
    summary: '查找目标失效或悬空的文本标注，便于清理或重新绑定。',
    features: [
      '列出孤立标注。',
      '跳转源页或删除无效标注。',
    ],
    subsystems: [SUB.backend, SUB.mock],
  },
  'resources.knowledgePoints': {
    id: 'resources.knowledgePoints',
    title: '知识点',
    summary: '维护知识库内知识点分类树（父子、排序），并查看知识点详情与锚点。',
    features: [
      '树形浏览、拖拽改父级/排序、右键提升为同级。',
      '新建、重命名、删除（有子节点时限制）。',
      '与证据锚点、知识关联配合。',
    ],
    subsystems: [SUB.backend, SUB.mock],
  },
  'resources.knowledgeRelations': {
    id: 'resources.knowledgeRelations',
    title: '知识关联',
    summary: '管理知识点之间的语义边（如前置关系），可挂页面/节选等证据定位。',
    features: [
      '创建/筛选知识关联列表（分页）。',
      '关联两端为知识点；证据可为页面锚点。',
      '与 AI 文档标记产生的建议衔接。',
    ],
    subsystems: [SUB.backend, SUB.ai, SUB.mock],
  },
  'resources.knowledgeGraph': {
    id: 'resources.knowledgeGraph',
    title: '知识图谱',
    summary: '将知识点与关联投影为只读 X6 图：以选定知识点为中心展开关联，或查看前置子图。',
    features: [
      '只读图谱浏览与模式切换。',
      '从知识点详情「在图谱中查看 / 前置子图」进入。',
    ],
    subsystems: [SUB.backend, SUB.mock],
  },
  tasks: {
    id: 'tasks',
    title: '任务管理',
    summary: '接入 Kaneo 等外部任务系统：配置连接、同步项目/任务，并关联到 tu 页面或块。',
    features: [
      '保存集成 API Key（明文不回显）。',
      '拉取项目与任务列表，支持写入外部系统。',
      '将任务关联到本地页面或块。',
    ],
    subsystems: [SUB.backend, SUB.kaneo, SUB.gateway],
  },
  settings: {
    id: 'settings',
    title: '系统设置',
    summary: '配置编辑器偏好与 AI Agent 接入；可查看 Agent 运行记录。',
    features: [
      '编辑器：文本选择工具栏等开关（持久化）。',
      'AI：Base URL、模型、密钥、超时与联网搜索等。',
      'Agent 记录：学习计划等调用的 prompt/响应与耗时。',
      '连接测试（测试不写 Agent 记录）。',
    ],
    subsystems: [SUB.backend, SUB.ai, SUB.mock],
  },
}

export type WorkspacePageHelpType = PageType | null | undefined

/**
 * Resolve user-facing help for the current route and optional workspace page type.
 */
export function resolvePageHelp(
  route: Pick<RouteLocationNormalizedLoaded, 'path' | 'name' | 'query'>,
  pageType?: WorkspacePageHelpType,
): PageHelp {
  const path = route.path.replace(/\/$/, '') || '/'

  if (path === '/' || route.name === 'home') {
    if (!pageType) return catalog['home.workspace']
    if (pageType === 'mindmap') return catalog['home.mindmap']
    if (pageType === 'x6board') return catalog['home.x6board']
    return catalog['home.document']
  }

  if (path === '/resources' || route.name === 'resources') {
    const tab = typeof route.query.tab === 'string' ? route.query.tab : 'references'
    const key = `resources.${tab}`
    return catalog[key] ?? catalog.resources
  }

  if (path === '/tasks' || route.name === 'tasks') {
    return catalog.tasks
  }

  if (path === '/settings' || route.name === 'settings') {
    return catalog.settings
  }

  return catalog['home.workspace']
}
