export type ProductFeatureStatus =
  | 'idea'
  | 'design'
  | 'development'
  | 'testing'
  | 'released'
  | 'paused';

export interface ProductFeatureStatusOption {
  value: ProductFeatureStatus;
  label: string;
  tone: 'info' | 'primary' | 'warning' | 'success' | 'danger';
}

export interface ProductFeature {
  id: string;
  name: string;
  module: string;
  description: string;
  status: ProductFeatureStatus;
  owner?: string;
  note?: string;
  source?: 'catalog' | 'local';
}

export const productFeatureStatuses: ProductFeatureStatusOption[] = [
  { value: 'idea', label: '构想', tone: 'info' },
  { value: 'design', label: '设计中', tone: 'primary' },
  { value: 'development', label: '开发中', tone: 'warning' },
  { value: 'testing', label: '验证中', tone: 'warning' },
  { value: 'released', label: '已发布', tone: 'success' },
  { value: 'paused', label: '暂停', tone: 'danger' },
];

export const productFeatureCatalog: ProductFeature[] = [
  {
    id: 'workspace-knowledge-pages',
    module: '知识库',
    name: '知识库与页面树',
    description: '管理知识库、页面层级和当前工作区内容。',
    status: 'released',
    owner: 'Product',
  },
  {
    id: 'page-block-editor',
    module: '编辑器',
    name: '块编辑页面',
    description: '以块为单位编辑页面内容，支持块选择、排序、提取和保存。',
    status: 'released',
    owner: 'Editor',
  },
  {
    id: 'rich-text-block',
    module: '编辑器',
    name: '富文本块',
    description: '基于 Vditor 编辑和渲染 Markdown/HTML 内容。',
    status: 'released',
    owner: 'Editor',
  },
  {
    id: 'page-block-tags',
    module: '编辑器',
    name: '页面、块与节标签',
    description: '页面级 metadata.tags；块级 embed metadata.tags；目录节 metadata.sectionTags；划选文字 metadata.textTagSpans；划选「标注」统一编辑笔记与文字标签；标签筛选条按节/块/文字标签严格筛选；候选标签在知识库内复用。',
    status: 'testing',
    owner: 'Editor',
  },
  {
    id: 'fenced-code-block',
    module: '编辑器',
    name: '围栏代码块',
    description: 'Markdown ``` 围栏代码块渲染为带顶栏的代码块；顶栏可切换语言（Java、XML、JSON、纯文本等）；lowlight 语法高亮（输入时纯文本，停顿约 0.5s 或移出块后上色）。',
    status: 'testing',
    owner: 'Editor',
  },
  {
    id: 'table-block',
    module: '编辑器',
    name: '表格块',
    description: '文档表格块，支持键盘加行、行列选择、边框插入和富文本单元格。',
    status: 'development',
    owner: 'Editor',
  },
  {
    id: 'canvas-block',
    module: '编辑器',
    name: '画板块',
    description: '图形画板节点，支持节点富文本内容和图形数据保存。',
    status: 'development',
    owner: 'Editor',
  },
  {
    id: 'mindmap-page',
    module: '知识库',
    name: '思维导图页面',
    description: '页面树可新建 mindmap 类型页面；CanvasPage 独占画布区；文档内 embed 可升级为独立页；节点支持富文本模式；节点拖拽以虚线连接预览重挂载位置。',
    status: 'testing',
    owner: 'Editor',
  },
  {
    id: 'x6board-page',
    module: '知识库',
    name: '画板页面',
    description: 'pageType=x6board 独占通用 X6 画板页；与 mindmap 共用 CanvasPage / BoardCanvasShell 架构。',
    status: 'testing',
    owner: 'Editor',
  },
  {
    id: 'link-insert',
    module: '外部资源',
    name: '插入链接',
    description: '从操作栏或粘贴识别 URL，插入 Markdown 链接并登记外部资源。',
    status: 'testing',
    owner: 'Resource',
  },
  {
    id: 'network-image-tools',
    module: '外部资源',
    name: '网络图片工具',
    description: '识别图片 URL，以 HTML 图片插入并提供宽度调整工具。',
    status: 'development',
    owner: 'Resource',
  },
  {
    id: 'external-resource-manager',
    module: '外部资源',
    name: '外部资源管理',
    description: '管理资源类型、抽象归类 Work 和具体资源 Item。',
    status: 'testing',
    owner: 'Resource',
  },
  {
    id: 'external-resource-excerpt-from-selection',
    module: '外部资源',
    name: '选中文本标记节选',
    description: '在富文本编辑器中划选引用内容，可从选择浮条创建图书外部资源节选。成功后记为用户「学习进行中」目标（Item+Excerpt）；下次粘贴正文或新建 Markdown 引用块时，划选工具栏上方可倒计时确认是否用该目标自动标记。',
    status: 'testing',
    owner: 'Resource',
  },
  {
    id: 'learning-in-progress-from-resource-mark',
    module: '外部资源',
    name: '学习进行中目标',
    description: '用户标记节选后，按当前用户将 ResourceItem/Excerpt 记为「进行中」学习目标（有节选优先节选）；文档页顶栏芯片可跳转/清除；粘贴或新建引用时可倒计时确认用该目标自动标记。不依赖预先创建学习计划。',
    status: 'testing',
    owner: 'Resource',
  },
  {
    id: 'external-resource-excerpt-from-block',
    module: '外部资源',
    name: '块级标记节选',
    description: '段落手柄、嵌入块工具栏或目录右键可将整块/section/引用区域标记为外部资源节选。',
    status: 'testing',
    owner: 'Resource',
  },
  {
    id: 'external-resource-excerpt-basis',
    module: '外部资源',
    name: '设置节选依据',
    description: '选中文本、块或目录 section 可绑定外部资源实体或节选作为依据；依据以绿色高亮或块角标展示。',
    status: 'testing',
    owner: 'Resource',
  },
  {
    id: 'heading-source-binding',
    module: '外部资源',
    name: '标题标记来源',
    description: '在 Markdown 标题上绑定 ResourceExcerpt，持久化于文档注释，编辑器与目录可识别并跳转资源页。',
    status: 'testing',
    owner: 'Resource',
  },
  {
    id: 'heading-section-fold',
    module: '富文本',
    name: '标题节折叠',
    description: '正文标题左侧 ▶/▼ 折叠/展开该标题下至同级标题前的内容；仅隐藏视图，折叠状态持久化为 tu:heading-fold 注释。',
    status: 'testing',
    owner: 'Editor',
  },
  {
    id: 'local-file-sync',
    module: '存储',
    name: '本地文件绑定保存',
    description: '检测页面绑定的本地文件并展示保存状态。',
    status: 'testing',
    owner: 'Storage',
  },
  {
    id: 'mock-backend-switch',
    module: '开发者模式',
    name: '数据源切换',
    description: '在 Mock 数据和后端接口之间切换，并支持重置 Mock 数据。',
    status: 'released',
    owner: 'Dev',
  },
  {
    id: 'product-feature-management',
    module: '开发者模式',
    name: '产品功能管理',
    description: '从功能维度查看当前产品能力，并维护开发流程状态。',
    status: 'development',
    owner: 'Product',
  },
];
