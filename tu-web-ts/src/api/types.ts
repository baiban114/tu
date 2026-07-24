export interface GraphData {
  cells?: Array<Record<string, unknown>>;
  nodes: Array<{
    id: string;
    x?: number;
    y?: number;
    position?: {
      x?: number;
      y?: number;
      [key: string]: unknown;
    };
    width?: number;
    height?: number;
    size?: {
      width?: number;
      height?: number;
      [key: string]: unknown;
    };
    label?: string;
    shape?: string;
    style?: {
      x?: number;
      y?: number;
      [key: string]: unknown;
    };
    attrs?: Record<string, unknown>;
    ports?: Record<string, unknown>;
    data?: {
      label?: string;
      time?: string;
      done?: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  edges: Array<{
    id?: string;
    source: string | Record<string, unknown>;
    target: string | Record<string, unknown>;
    attrs?: Record<string, unknown>;
    router?: string | Record<string, unknown>;
    connector?: string | Record<string, unknown>;
    labels?: Array<Record<string, unknown>>;
    data?: {
      done?: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  blueprintMeta?: {
    anchor: {
      x: number;
      y: number;
    };
    extractedCenter?: {
      x: number;
      y: number;
    };
    extractedCount?: number;
    kind?: string;
    direction?: 'LR' | 'RL' | 'TB' | 'BT';
  };
  /** UML 对象模型快照，仅 X6 画板序列化时使用 */
  uml?: Record<string, unknown>;
}

export interface BlockTag {
  id: string;
  label: string;
  color?: string;
}

/** Page-level text-range tags stored in metadata.textTagSpans. */
export interface TextTagSpan {
  id: string;
  tags: BlockTag[];
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  from?: number;
  to?: number;
  blockId?: string;
  anchorVersion?: number;
  lastResolvedAt?: number;
  unresolved?: boolean;
}

export interface SpannedBlockInfo {
  blockId: string;
  blockType: string;
  title?: string;
}

/** 知识标记来源：缺省视为 user（兼容旧数据） */
export type KnowledgeMarkerSource = 'user' | 'ai'

/** PDF 摘页块内纵向划选区域锚点（页码 + ratio） */
export interface PdfRegionAnchor {
  blockId: string;
  /** Stable PDF file id — survives PDF↔link conversion when blockId is recreated. */
  fileId?: string;
  /** Resource entity id — notes bound here appear on any embed of this resource. */
  resourceItemId?: string;
  startPage: number;
  endPage: number;
  clipTop: number;
  clipBottom: number;
}

export interface TextAnnotation {
  id: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  note: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  from?: number;
  to?: number;
  blockId?: string;
  anchorVersion?: number;
  lastResolvedAt?: number;
  unresolved?: boolean;
  scope?: 'text' | 'block' | 'compound' | 'pdfRegion';
  spannedBlockIds?: string[];
  spannedBlockMetadata?: SpannedBlockInfo[];
  /** PDF 摘页块内划选区域（scope=pdfRegion） */
  pdfRegion?: PdfRegionAnchor;
  /** note（默认）、依据标注、或已标记的资源节选 */
  kind?: 'note' | 'basis' | 'excerpt';
  /** 依据标注绑定的外部资源节选 */
  basisBinding?: HeadingSourceBinding;
  /** 标记来源；缺省视为 user */
  markerSource?: KnowledgeMarkerSource;
}

export interface BlockMetadata {
  tags?: BlockTag[];
  [key: string]: unknown;
}

export interface TableBlockData {
  textMode?: 'plain' | 'rich';
  headers: string[];
  rows: string[][];
  columnWidths?: number[];
  rowHeights?: number[];
}

export type MultiTableFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'singleSelect'
  | 'checkbox'
  | 'url'
  | 'estimatedHours'
  | 'lifecycle';

export interface MultiTableFieldOption {
  id: string;
  label: string;
  color?: string;
}

export interface MultiTableField {
  id: string;
  name: string;
  type: MultiTableFieldType;
  options?: MultiTableFieldOption[];
  required?: boolean;
  lifecyclePreset?: boolean;
}

export interface MultiTableRecord {
  id: string;
  values: Record<string, string | number | boolean | null>;
  subtasks?: MultiTableSubtask[];
  parentId?: string | null;
  order?: number;
  nodeType?: 'section' | 'step';
}

export interface MultiTableSubtask {
  id: string;
  title: string;
  estimatedHours: number;
  done?: boolean;
}

export interface MultiTableView {
  id: string;
  name: string;
  type: 'table' | 'kanban';
  groupByFieldId?: string;
}

export interface MultiTableData {
  fields: MultiTableField[];
  records: MultiTableRecord[];
  views: MultiTableView[];
  activeViewId?: string;
}

export interface ExternalResourceSnapshot {
  resourceTitle: string;
  resourceTypeName?: string;
  workTitle?: string;
  identityFieldLabel?: string;
  identityValue?: string;
  sourceUrl?: string;
  edition?: string;
  note?: string;
  excerptTitle?: string;
  chapterTitle?: string;
  excerptLocator?: string;
  excerptText?: string;
  excerptNote?: string;
}

export interface ExternalResourceEmbedData {
  resourceItemId: string;
  resourceExcerptId?: string | null;
  mode: 'resource' | 'excerpt';
  snapshot: ExternalResourceSnapshot;
}

/** 标题节点绑定的外部资源节选（持久化于 heading attrs + markdown 注释） */
export interface HeadingSourceBinding {
  resourceItemId: string;
  /** 标题来源必填；依据标注可仅挂靠资源实体 */
  resourceExcerptId?: string | null;
  snapshot: Pick<ExternalResourceSnapshot,
    'resourceTitle' | 'resourceTypeName' | 'workTitle' | 'excerptTitle' | 'excerptLocator'>;
  /** 标记来源；缺省视为 user */
  markerSource?: KnowledgeMarkerSource;
}

/**
 * 嵌入对象 — 非文本类型的内容，在 markdown content 中用占位符标记位置。
 * 占位符格式: <!--tu:embed id="..." type="..."-->
 */
export interface EmbeddedObject {
  id: string
  type: 'x6' | 'table' | 'multiTable' | 'timeline' | 'ref' | 'spacer' | 'externalResource'
  title?: string
  graphData?: GraphData
  tableData?: TableBlockData
  multiTableData?: MultiTableData
  timelineData?: Array<{
    id: string
    title: string
    content: string
    date: string
    color: string
    lightColor: string
    type: 'normal' | 'milestone'
  }>
  refId?: string
  refType?: 'block' | 'page'
  externalResource?: ExternalResourceEmbedData
  spacerHeight?: number
  width?: number | string
  height?: number
  metadata?: Record<string, unknown>
}

import type { JSONContent } from '@tiptap/core'

/**
 * 页面级内容模型 — 取代 Block[]。
 * - document (schemaVersion 2+): Tiptap doc JSON，含 x6Block 等嵌入节点
 * - content/embeds: v1 兼容；v2 文档页保存时置空
 * - annotations: 页面级别划选标注
 */
export interface PageContent {
  /** Tiptap ProseMirror document（schemaVersion 2+ 真源） */
  document?: JSONContent
  schemaVersion?: number
  /** @deprecated v1 markdown；v2 文档页为空 */
  content: string
  /** @deprecated v1 旁路嵌入；v2 文档页为空（嵌入在 document 内） */
  embeds: EmbeddedObject[]
  annotations: TextAnnotation[]
  metadata?: Record<string, unknown>
}

/** @deprecated 使用 EmbeddedObject + PageContent 替代 */
export interface Block {
  id: string;
  type: 'richtext' | 'richText' | 'line' | 'x6' | 'ref' | 'container' | 'spacer' | 'table' | string;
  title?: string;
  content?: string;
  metadata?: BlockMetadata;
  refId?: string;
  refType?: 'block' | 'page';
  externalResource?: ExternalResourceEmbedData;
  graphData?: GraphData;
  tableData?: TableBlockData;
  multiTableData?: MultiTableData;
  timelineData?: Array<{
    id: string;
    title: string;
    content: string;
    date: string;
    color: string;
    lightColor: string;
    type: 'normal' | 'milestone';
  }>;
  blockHeight?: number;
  spacerHeight?: number;
  width?: number | string;
  height?: number;
  layout?: 'horizontal' | 'vertical' | 'free';
  containerPosition?: {
    x: number;
    y: number;
    z?: number;
  };
  children?: Block[];
  [key: string]: unknown;
}

export type PageType = 'document' | 'mindmap' | 'x6board';

export interface PageItem {
  id: string;
  kbId: string;
  parentId: string | null;
  title: string;
  order: number;
  pageType?: PageType;
  children?: PageItem[];
}

/** @deprecated 使用新 PageContent 替代 */
export interface PageBlocks {
  pageId: string;
  blocks: Block[];
}

export interface BlockWithMeta {
  block: Block;
  pageId: string;
  pageTitle: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

export interface RoadmapNode {
  title?: string;
  name?: string;
  description?: string;
  content?: string;
  children?: RoadmapNode[];
}

export interface ImportRoadmapPayload {
  name?: string;
  icon?: string;
  description?: string;
  root?: RoadmapNode;
  pages?: RoadmapNode[];
  roadmap?: RoadmapNode | RoadmapNode[] | unknown;
}

export interface ImportRoadmapResult {
  knowledgeBase: KnowledgeBase;
  pages: PageItem[];
  pageCount: number;
}

export type KnowledgeAnchorKind =
  | 'page'
  | 'heading'
  | 'section'
  | 'annotation'
  | 'textSpan'
  | 'block'
  | 'resourceItem'
  | 'resourceExcerpt';

export interface KnowledgeAnchor {
  kind: KnowledgeAnchorKind;
  locator: string;
  snapshot?: Record<string, unknown>;
}

export interface RelationTypeDef {
  id: string;
  kbId: string | null;
  typeKey: string;
  label: string;
  color?: string | null;
  icon?: string | null;
  bidirectional: boolean;
  system: boolean;
  enabled: boolean;
}

export interface KnowledgeRelation {
  id: string;
  kbId: string;
  relationTypeKey: string;
  relationTypeLabel: string;
  relationTypeColor?: string | null;
  bidirectional: boolean;
  fromPointId?: string | null;
  toPointId?: string | null;
  fromPointTitle?: string | null;
  toPointTitle?: string | null;
  from?: KnowledgeAnchor | null;
  to?: KnowledgeAnchor | null;
  note?: string | null;
  sourceProvenance: string;
  status: string;
}

export interface RelationsByAnchor {
  locator: string;
  outgoing: KnowledgeRelation[];
  incoming: KnowledgeRelation[];
}

export interface RelationsByPoint {
  pointId: string;
  outgoing: KnowledgeRelation[];
  incoming: KnowledgeRelation[];
}

export type DocumentMarkingAction = 'bindSource' | 'setBasis' | 'markExcerpt' | 'createRelation';

export interface DocumentMarkingSuggestion {
  id: string;
  action: DocumentMarkingAction;
  locator: string;
  relationTypeKey?: string | null;
  resourceItemId?: string | null;
  resourceExcerptId?: string | null;
  excerptText?: string | null;
  excerptTitle?: string | null;
  toPointId?: string | null;
  confidence?: number | null;
  reason?: string | null;
  markerSource?: KnowledgeMarkerSource;
}

export interface DocumentMarkingResponse {
  runId: string;
  suggestions: DocumentMarkingSuggestion[];
}

export interface KnowledgePoint {
  id: string;
  kbId: string;
  parentId?: string | null;
  title: string;
  summary?: string | null;
  status: string;
  estimatedHours?: number | null;
  sortOrder: number;
  aliases?: string[];
  children?: KnowledgePoint[];
}

export interface PageKnowledgeContext {
  pageId: string;
  pagePoints: KnowledgePoint[];
  prerequisites: KnowledgePoint[];
  successors: KnowledgePoint[];
}

export interface KnowledgePointAlias {
  id: string;
  knowledgePointId: string;
  alias: string;
}

export interface KnowledgePointGenerationItem {
  locator: string;
  pointId: string | null;
  title: string;
  status: 'created' | 'skipped' | 'failed' | string;
}

export interface KnowledgePointGenerationPreviewItem {
  locator: string;
  kind: KnowledgeAnchorKind | string;
  title: string;
  pageId: string;
  pageTitle: string;
  status: 'would_create' | 'would_skip' | string;
}

export interface KnowledgePointGenerationPreview {
  items: KnowledgePointGenerationPreviewItem[];
  total: number;
}

export interface KnowledgePointGenerationResult {
  created: number;
  skipped: number;
  failed: number;
  items: KnowledgePointGenerationItem[];
}

export interface KnowledgePointAnchor {
  id: string;
  knowledgePointId: string;
  kind: KnowledgeAnchorKind;
  locator: string;
  snapshot?: Record<string, unknown>;
  role: string;
  primary: boolean;
}

export type KnowledgeGraphMode = 'full' | 'centered' | 'prerequisite' | 'page';
export type KnowledgeGraphDirection = 'out' | 'in' | 'both';

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  parentId?: string | null;
  estimatedHours?: number | null;
  summary?: string | null;
  sortOrder: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  fromPointId: string;
  toPointId: string;
  relationTypeKey: string;
  label: string;
  color?: string | null;
  bidirectional: boolean;
}

export interface KnowledgeGraphMeta {
  mode: KnowledgeGraphMode;
  centerPointId?: string | null;
  totalPoints: number;
  totalRelations: number;
  truncated: boolean;
  warnings: string[];
  /** Page-local knowledge point ids (page relation graph mode). */
  focusPointIds?: string[];
}

export interface KnowledgeGraphResponse {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  meta: KnowledgeGraphMeta;
}
