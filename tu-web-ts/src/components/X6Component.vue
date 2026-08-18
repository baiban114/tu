<script lang="ts">
// Module-level shared state: the stage element of the canvas that most recently
// received a pointer/focus interaction. Used to route document-level `paste`
// events to exactly one X6Component instance when several coexist.
let activeX6StageElement: HTMLElement | null = null;

function markActiveX6Stage(el: HTMLElement) {
  activeX6StageElement = el;
}

function getActiveX6Stage(): HTMLElement | null {
  return activeX6StageElement;
}

// Shape name for canvas-pasted link nodes; registration happens once globally.
const BOARD_LINK_SHAPE = 'board-link-card';
let boardLinkShapeRegistered = false;
function setBoardLinkShapeRegistered(value: boolean) {
  boardLinkShapeRegistered = value;
}
function isBoardLinkShapeRegistered(): boolean {
  return boardLinkShapeRegistered;
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import X6NodeOverlay from './X6NodeOverlay.vue';
import X6CellContentPanel from './X6CellContentPanel.vue';
import X6MaterialLibrary from './X6MaterialLibrary.vue';
import LinkPresentationModeBar from './LinkPresentationModeBar.vue';
import { useMaterialLibraryStore } from '@/stores/materialLibrary';
import { useBlockRegistryStore } from '@/stores/blockRegistry';
import { useObjectModelStore } from '@/stores/objectModel';
import { useOutlineCacheStore } from '@/stores/outlineCache';
import { useWorkspaceStore } from '@/stores/workspace';
import type {
  BoardOperationHistoryEntry,
  BoardOperationSnapshot,
  GraphData,
} from '@/api/types';
import type { PageItem } from '@/api/page';
import type { UmlClassDefinition, UmlModel } from '@/stores/objectModel';
import {
  X6_MATERIAL_MIME,
  X6_SHAPE_MIME,
  beginMaterialDrag,
  didMaterialDragMove,
  endMaterialDrag,
  parseShapeDragPayload,
  resetMaterialDrag,
  trackMaterialDrag,
  type ShapeDragPayload,
} from '@/components/x6/materialDrag';
import {
  cellContentBindingToData,
  readCellContentBinding,
  type CellContentBinding,
} from '@/utils/cellContent';
import { fallbackPageTitleFromUrl, type UrlDisplayMode } from '@/utils/urlDisplay';
import { uploadFile } from '@/api/fileStorage';
import { findClipboardImageFileOnly } from '@/editor/pasteHtmlContent';
import {
  type Cell,
  Clipboard,
  type Edge,
  Graph,
  History,
  Keyboard,
  type Node,
  type ResizeDirection,
  Selection,
  Shape,
  Snapline,
  Transform,
} from '@antv/x6';
import {
  type CellData,
  createId,
  mergeDeep,
  isPlainObject,
  getCellPosition,
  getCellSize,
  extractNodeLabel,
  createNodePorts,
  createBoardReferencePorts,
  getBoardInterfacePortArgs,
  type BoardInterfaceSide,
  createNodeMetadata,
  createEdgeMetadata,
  createUmlClassNode,
  formatUmlClassLabel,
  createTaskNode,
  createMindmapNode,
  createStarterGraphData,
  resolveBlueprintStarter,
  getBlueprintRegionLabel,
  isTaskFlowBlueprint,
  isMindmapBlueprint,
  syncMindmapEdgeStyles,
  addMindmapChild,
  addMindmapSibling,
  expandMindmapDeleteTargets,
  attachMindmapDirection,
  readMindmapDirection,
  canConnectMindmapEdge,
  filterDeletableCells,
  applyMindmapCollapseState,
  toggleMindmapNodeCollapse,
  createMindmapRefTocContext,
  isApplyingMindmapCollapseState,
  isApplyingMindmapDragPreview,
  isMindmapRefBlockNode,
  materializeRefBlockTocChildrenIfNeeded,
  nodeHasMindmapExpandableChildren,
  readMindmapChildrenCollapsed,
  readMindmapNodeCollapsedForDisplay,
  syncMindmapRefBlockTocFromSource,
  getMindmapCollapseButtonStyle,
  beginMindmapNodeDrag,
  commitMindmapDragDrop,
  endMindmapNodeDrag,
  findMindmapRootId,
  findMindmapDropTarget,
  layoutMindmapGraph,
  fitMindmapNodeToText,
  fitAllMindmapNodesToText,
  relayoutMindmapGraphAfterDelete,
  getLastMindmapDragPointer,
  updateMindmapDragPreview,
  collectMindmapDescendantIds,
  ensureMindmapConnectorRegistered,
  MINDMAP_CONNECTOR_NAME,
  EDGE_Z_INDEX,
  MINDMAP_DRAG_PREVIEW_EDGE_ID,
  MINDMAP_DRAG_PREVIEW_OPTION,
  BOARD_SOURCE_ARROWHEAD_TOOL,
  BOARD_TARGET_ARROWHEAD_TOOL,
  BOARD_FREE_SOURCE_ARROWHEAD_TOOL,
  BOARD_FREE_TARGET_ARROWHEAD_TOOL,
  BOARD_PLAIN_SOURCE_ARROWHEAD_TOOL,
  BOARD_PLAIN_TARGET_ARROWHEAD_TOOL,
  ensureSnappingArrowheadToolsRegistered,
  ensureFreeAnchorArrowheadToolsRegistered,
  ensurePlainArrowheadToolsRegistered,
  ensureOrthSmartRouterRegistered,
  ORTH_SMART_ROUTER_NAME,
  STRAIGHT_ROUTER_NAME,
  LINE_ROUTER_NAME,
  snapFreeEdgeTerminals,
  isBoardGroupNodeData,
  type NodePreset,
} from '@/components/x6';

const BLUEPRINT_ANCHOR = { x: 480, y: 280 } as const;

interface Props {
  /** Standalone canvas page id; absent for document-embedded boards. */
  pageId?: string;
  graphData?: GraphData;
  graphSourceKind?: string | null;
  editable?: boolean;
  width?: number;
  height?: number;
  layoutMode?: 'fixed' | 'fill';
  blockActionsEnabled?: boolean;
  sourceLoadEnabled?: boolean;
  sourceWriteBackEnabled?: boolean;
  /** Top editing toolbar (default true). */
  toolbarEnabled?: boolean;
  /** Right inspector panel (default true). */
  inspectorEnabled?: boolean;
  /** Initial inspector open state when inspectorEnabled (default true). */
  inspectorDefaultVisible?: boolean;
  /** Auto-open inspector when a node is selected (default false). */
  openInspectorOnNodeSelect?: boolean;
  /** Disable nested board-reference previews inside an already nested preview. */
  referencePreviewEnabled?: boolean;
  /** Keep all graph content fitted when the host container is resized. */
  autoFitOnResize?: boolean;
}

/** 画板节点可互相转换的样式（graphCells NodePreset 去掉 umlClass） */
type BoardNodeStylePreset = Exclude<NodePreset, 'umlClass'>;

const BOARD_NODE_STYLE_PRESETS: readonly BoardNodeStylePreset[] = ['rect', 'round', 'ellipse', 'diamond'];

type SelectedCellState =
  | {
      kind: 'node';
      id: string;
      shape: string;
      /** 当前节点样式（'' 表示图片/链接卡片等不可转换的自定义形状） */
      preset: BoardNodeStylePreset | '';
      label: string;
      fill: string;
      stroke: string;
      width: number;
      height: number;
      textMode: 'plain' | 'rich';
      richContent: string;
      /** 粘贴链接生成的节点：目标 URL（空表示非链接节点） */
      linkUrl: string;
      /** 链接展示形式（移植文档链接 toolbar） */
      linkDisplay: UrlDisplayMode;
      /** 粘贴图片生成的节点：图片 URL（空表示非图片节点） */
      imageUrl: string;
      isRefBlock: boolean;
      refBlockId: string;
      refType: 'block' | 'page';
      refSourceLabel: string;
      boardReferenceDisplay: 'card' | 'content';
      canPreviewBoardReference: boolean;
      /** 定位系统 locator（目录思维导图等） */
      sourceLocator: string;
      tocEntryId: string;
      contentBinding: CellContentBinding;
      /** 是否为组合容器节点 */
      isGroup: boolean;
      /** 组合容器的直接成员节点数 */
      groupSize: number;
      /** 组合边框预设样式 */
      boardGroupBorder: BoardGroupBorderPreset;
      /** 当前 Z 轴层级（null 表示未设置，由 X6 自动分配） */
      zIndex: number | null;
    }
  | {
      kind: 'edge';
      id: string;
      label: string;
      stroke: string;
      router: string;
      connector: string;
      contentBinding: CellContentBinding;
      /** 当前 Z 轴层级（null 表示未设置，由 X6 自动分配） */
      zIndex: number | null;
    };

const props = withDefaults(defineProps<Props>(), {
  pageId: undefined,
  graphData: undefined,
  graphSourceKind: null,
  editable: true,
  width: 960,
  height: 540,
  layoutMode: 'fixed',
  blockActionsEnabled: true,
  sourceLoadEnabled: false,
  sourceWriteBackEnabled: false,
  toolbarEnabled: true,
  inspectorEnabled: true,
  inspectorDefaultVisible: true,
  openInspectorOnNodeSelect: false,
  referencePreviewEnabled: true,
  autoFitOnResize: false,
});

interface InsertRefRequestPayload {
  x: number;
  y: number;
}

const emit = defineEmits<{
  (e: 'graph-data-change', graphData: GraphData): void;
  (e: 'request-insert-ref', payload: InsertRefRequestPayload): void;
  (e: 'sync-from-source'): void;
  (e: 'sync-to-source', graphData: GraphData): void;
  (e: 'active'): void;
  (e: 'navigate-source-locator', payload: { locator: string; label: string; tocEntryId?: string }): void;
  (e: 'preview-source-content', payload: { locator: string; label: string; tocEntryId?: string }): void;
}>();

const stageRef = ref<HTMLDivElement | null>(null);
const rootRef = ref<HTMLDivElement | null>(null);
const isFullscreen = ref(false);

/** 切换画板全屏/退出全屏。 */
function toggleFullscreen() {
  const el = rootRef.value;
  if (!el) return;
  if (!document.fullscreenElement) {
    el.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
  // 全屏/退出全屏后容器尺寸变化，ResizeObserver 会自动触发 graph resize
  // 但Fullscreen API 的尺寸变化可能在 RO 通知之前完成，延迟一帧确保
  requestAnimationFrame(() => {
    if (graph && stageRef.value) {
      resizeGraph();
    }
  });
}
const containerRef = ref<HTMLDivElement | null>(null);
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 3;
const ZOOM_FACTOR = 1.1;
const nodeOverlayRefs = ref<Record<string, {
  getMarkdownLinkAnchor?: () => { top: number; left: number } | undefined;
  insertMarkdownLink?: (label: string, url: string, display?: 'link' | 'image') => boolean;
  updateInsertedLinkDisplay?: (display: 'link' | 'image') => boolean;
  updateInsertedImageWidth?: (widthPercent: number) => boolean;
}>>({});

// --- Pasted link card node (HTML shape) ---
// Pasting a URL without selection creates a link node; the inspector reuses the
// document link toolbar (LinkPresentationModeBar) to switch its display mode.

function isCustomPastedShape(shape: string): boolean {
  return shape === 'image' || shape === BOARD_LINK_SHAPE;
}

function ensureBoardLinkShapeRegistered() {
  if (isBoardLinkShapeRegistered()) return;
  setBoardLinkShapeRegistered(true);
  Shape.HTML.register({
    shape: BOARD_LINK_SHAPE,
    width: 320,
    height: 96,
    effect: ['data'],
    html(cell) {
      const wrap = document.createElement('div');
      wrap.className = 'x6-board-link-card';
      wrap.style.cssText = [
        'width: 100%; height: 100%; box-sizing: border-box;',
        'border: 1.6px solid #1677ff; border-radius: 6px; background: #ffffff;',
        'display: flex; align-items: center; justify-content: center;',
        'overflow: hidden; font-size: 13px; color: #003a8c;',
      ].join(' ');
      const data = (cell.getData() ?? {}) as Record<string, unknown>;
      const url = typeof data.linkUrl === 'string' ? data.linkUrl : '';
      const display = typeof data.linkDisplay === 'string' ? data.linkDisplay : 'link';
      wrap.dataset.display = display;
      if (display === 'image') {
        const img = document.createElement('img');
        img.src = url;
        img.alt = url;
        img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
        wrap.appendChild(img);
      } else if (display === 'iframe') {
        const frame = document.createElement('iframe');
        frame.src = url;
        frame.title = url;
        frame.style.cssText = 'width: 100%; height: 100%; border: 0;';
        wrap.appendChild(frame);
      } else {
        const text = document.createElement('span');
        text.style.cssText = 'padding: 6px 12px; word-break: break-all; text-align: center;';
        text.textContent = display === 'title' ? fallbackPageTitleFromUrl(url) : url;
        wrap.appendChild(text);
      }
      return wrap;
    },
  });
}

const canUndo = ref(false);
const canRedo = ref(false);
const gridVisible = ref(true);
const zoomPercent = ref(100);
const selectedCellsCount = ref(0);
const deletableSelectionCount = ref(0);
const selectedCell = ref<SelectedCellState | null>(null);
const extractingSelectionBoard = ref(false);
/** 组合按钮状态：'' 禁用 / 'group' 可组合 / 'ungroup' 可取消组合 */
const groupActionButtonMode = ref<'' | 'group' | 'ungroup'>('');
/** 子元素按钮状态：'' 禁用 / 'child' 可设为子元素 / 'detach' 可取消子元素 */
const childActionButtonMode = ref<'' | 'child' | 'detach'>('');
const objectModelStore = useObjectModelStore();
const materialLibraryStore = useMaterialLibraryStore();
const outlineCacheStore = useOutlineCacheStore();
const workspaceStore = useWorkspaceStore();

function resolvePageTitleForRef(pageId: string): string {
  const find = (nodes: PageItem[]): string | null => {
    for (const node of nodes) {
      if (node.id === pageId) return node.title;
      if (node.children?.length) {
        const nested = find(node.children);
        if (nested) return nested;
      }
    }
    return null;
  };
  return find(workspaceStore.pageTree)?.trim() || pageId;
}

const mindmapRefTocContext = createMindmapRefTocContext({
  structureSource: 'outline',
  getPageOutline: (pageId) => outlineCacheStore.getPageNodes(pageId),
  getBlockOutline: (blockId) => outlineCacheStore.getBlockNodes(blockId),
  getPageTitle: (pageId) => resolvePageTitleForRef(pageId),
  onCollapseSettled: () => settleMindmapCollapseInteraction(),
});
const inspectorTab = ref<'inspector' | 'library' | 'operations'>('inspector');
const inspectorNodeStyleOpen = ref(false);
const inspectorNodeContentOpen = ref(true);
const inspectorZAxisOpen = ref(true);
const toolbarVisible = ref(props.toolbarEnabled);
const inspectorVisible = ref(props.inspectorEnabled && props.inspectorDefaultVisible);
const BOARD_OPERATION_HISTORY_LIMIT = 30;
const BOARD_OPERATION_HISTORY_PAGE_SIZE = 30;
const operationHistory = ref<BoardOperationHistoryEntry[]>([]);
const operationHistoryPage = ref(1);
const rollbackConfirmId = ref<string | null>(null);
const operationNotice = ref('');
let pendingOperationLabel: string | null = null;
let pendingOperationBefore: BoardOperationSnapshot | null = null;
let lastCommittedOperationSnapshot = '';

const pagedOperationHistory = computed(() => {
  const start = (operationHistoryPage.value - 1) * BOARD_OPERATION_HISTORY_PAGE_SIZE;
  return operationHistory.value.slice(start, start + BOARD_OPERATION_HISTORY_PAGE_SIZE);
});

const operationHistoryPageCount = computed(() => (
  Math.max(1, Math.ceil(operationHistory.value.length / BOARD_OPERATION_HISTORY_PAGE_SIZE))
));
type CanvasInteractionMode = 'select' | 'pan';
const canvasInteractionMode = ref<CanvasInteractionMode>('select');
/** Hold Space to temporarily pan (grab cursor), without changing toolbar mode. */
const spacePanActive = ref(false);
let stagePointerInside = false;
let mindmapDragActiveNodeId: string | null = null;
let mindmapDragMoved = false;
let mindmapDragSessionStarted = false;
let boardReferenceDragNodeId: string | null = null;
let boardInterfaceDrag: { nodeId: string; portId: string } | null = null;
const referenceInterfaceOriginalTerminals = new Map<string, {
  direction: ExtractedBoardInterfaceDirection;
  terminal: unknown;
}>();

// Node overlay state — unified for plain and rich text editing
const editingNodeId = ref<string | null>(null);
const nodeOverlays = ref<Array<{
  id: string;
  style: Record<string, string>; 
  textMode: 'plain' | 'rich';
  label: string;
  richContent: string;
  boardReferencePageId: string;
  boardReferenceTitle: string;
  boardReferenceInterfaces: Array<{
    edgeId: string;
    portId: string;
    direction: ExtractedBoardInterfaceDirection;
    side: BoardInterfaceSide;
    ratio: number;
  }>;
}>>([]);
const graphSourceRegion = ref<{
  kind: string;
  label: string;
  style: Record<string, string>;
} | null>(null);

interface MindmapCollapseButtonState {
  nodeId: string;
  collapsed: boolean;
  style: Record<string, string>;
}

const mindmapCollapseHoverNodeId = ref<string | null>(null);
const mindmapCollapseLoadingNodeId = ref<string | null>(null);
const mindmapCollapseButtons = ref<MindmapCollapseButtonState[]>([]);
let mindmapCollapseHideTimer: number | null = null;

// Edge inline editing state (kept here, edge editing not split into sub-component)
const edgeInlineEditing = ref(false);
const edgeInlineEditId = ref<string | null>(null);
const edgeInlineEditStyle = ref<Record<string, string>>({});
const edgeInlineEditText = ref('');
const edgeInlineInputRef = ref<HTMLTextAreaElement | null>(null);

const isEditable = computed(() => props.editable !== false);
const isTaskFlow = computed(() => isTaskFlowBlueprint(props.graphData));
const isMindmap = computed(() => isMindmapBlueprint(props.graphData));
const hasGraphSourceActions = computed(() => props.sourceLoadEnabled || props.sourceWriteBackEnabled);
const isFillLayout = computed(() => props.layoutMode === 'fill')
const isNodeEditing = computed(() => editingNodeId.value != null)
const chromeBare = computed(
  () => !props.toolbarEnabled && (!props.inspectorEnabled || !inspectorVisible.value),
)
const hasExplicitSize = computed(() => props.width != null && props.height != null)
const editorStyle = computed(() => {
  if (isFillLayout.value) {
    return {
      height: '100%',
      minHeight: '0',
    }
  }
  if (hasExplicitSize.value) {
    return {
      height: `${props.height}px`,
    }
  }
  return {}
})
const stageStyle = computed(() => {
  if (isFillLayout.value) return { height: '100%', minHeight: '0', flex: '1' }
  if (hasExplicitSize.value) return { height: '100%', minHeight: '0' }
  return { minHeight: `${props.height || 540}px` }
})
const effectiveWidth = computed(() => props.width ?? 960)
const effectiveHeight = computed(() => props.height ?? 540)
const selectionSummary = computed(() => {
  if (selectedCellsCount.value === 0) return '未选中对象';
  if (selectedCellsCount.value > 1) return `已选中 ${selectedCellsCount.value} 个对象`;
  if (!selectedCell.value) return '已选中 1 个对象';
  return selectedCell.value.kind === 'node'
    ? `节点: ${selectedCell.value.label || selectedCell.value.id}`
    : `连线: ${selectedCell.value.label || selectedCell.value.id}`;
});
const taskSequenceSummary = computed(() => {
  if (!isTaskFlow.value) return [] as string[];
  const data = normalizeGraphData(props.graphData);
  const taskNodes = data.nodes.filter((node) => node.data?.taskRole === 'task');
  if (!taskNodes.length) return [];

  const taskIds = new Set(taskNodes.map((node) => node.id));
  const incomingCount = new Map(taskNodes.map((node) => [node.id, 0]));
  const nextById = new Map<string, string>();
  const labelById = new Map(taskNodes.map((node) => [node.id, String(node.label ?? node.data?.label ?? '未命名任务')]));

  data.edges.forEach((edge) => {
    const sourceId = typeof edge.source === 'string' ? edge.source : typeof edge.source?.cell === 'string' ? edge.source.cell : '';
    const targetId = typeof edge.target === 'string' ? edge.target : typeof edge.target?.cell === 'string' ? edge.target.cell : '';
    if (!taskIds.has(sourceId) || !taskIds.has(targetId)) return;
    nextById.set(sourceId, targetId);
    incomingCount.set(targetId, (incomingCount.get(targetId) ?? 0) + 1);
  });

  const ordered: string[] = [];
  const visited = new Set<string>();
  let cursor = taskNodes.find((node) => (incomingCount.get(node.id) ?? 0) === 0)?.id ?? taskNodes[0].id;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    ordered.push(labelById.get(cursor) ?? '未命名任务');
    cursor = nextById.get(cursor) ?? '';
  }

  taskNodes.forEach((node) => {
    if (!visited.has(node.id)) ordered.push(labelById.get(node.id) ?? '未命名任务');
  });

  return ordered;
});
let graph: Graph | null = null;
let resizeObserver: ResizeObserver | null = null;
let syncTimer: number | null = null;
let isApplyingExternalData = false;
let isUserInteracting = false;
let pendingSyncAfterInteraction = false;
let lastSerializedSnapshot = '';
let lastStructuralSnapshot = '';
let pendingNodeInternalClickId: string | null = null;
let suppressNextNodeInternalClickId: string | null = null;
let lastMaterialInsertTime = 0;
const MATERIAL_INSERT_DEBOUNCE_MS = 300;
/** Suppress shape-button click after an HTML5 drag session (dragend → click). */
let suppressShapeButtonClick = false;

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeUmlModel(value: unknown): UmlModel {
  const source = isPlainObject(value) ? value : {};
  const classes = Array.isArray(source.classes)
    ? source.classes.map((item: any) => ({
      id: typeof item.id === 'string' ? item.id : createId('uml-class'),
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Class',
      attributes: Array.isArray(item.attributes) ? item.attributes.filter((line: unknown): line is string => typeof line === 'string') : [],
      methods: Array.isArray(item.methods) ? item.methods.filter((line: unknown): line is string => typeof line === 'string') : [],
      nodeId: typeof item.nodeId === 'string' ? item.nodeId : undefined,
    }))
    : [];
  const classIds = new Set(classes.map((item) => item.id));
  const objects = Array.isArray(source.objects)
    ? source.objects
      .map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : createId('uml-object'),
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'object',
        classId: typeof item.classId === 'string' ? item.classId : '',
        propertyValues: isPlainObject(item.propertyValues) ? item.propertyValues as Record<string, string> : {},
      }))
      .filter((item) => classIds.has(item.classId))
    : [];
  return { classes, objects };
}

function normalizeNode(node: CellData, mindmap = false): CellData {
  // Canvas-pasted image / link-card nodes keep their own shape and rendering;
  // do not rebuild them through the board preset factories.
  if (typeof node.shape === 'string' && isCustomPastedShape(node.shape)) {
    return { ...node };
  }
  // Group container nodes keep their dashed-frame appearance as-is.
  if (node.data?.boardGroup === true) {
    return { ...node };
  }
  const mindRole = node.data?.mindRole;
  const isMindmapRefBlock = mindmap && (node.data?.refKind === 'block-ref' || node.data?.refBlockId);
  if (mindmap && (mindRole === 'root' || mindRole === 'topic' || isMindmapRefBlock)) {
    const position = getCellPosition(node);
    const nodeSize = getCellSize(node);
    const base = createMindmapNode({
      id: node.id,
      x: position.x,
      y: position.y,
      width: nodeSize.width,
      height: nodeSize.height,
      label: extractNodeLabel(node),
      mindRole: mindRole === 'root' ? 'root' : 'topic',
      data: {
        ...node.data,
        ...(mindRole === 'root' ? { deleteProtected: true } : {}),
        ...(isMindmapRefBlock && node.data?.childrenCollapsed == null ? { childrenCollapsed: true } : {}),
        ...(isMindmapRefBlock && !node.data?.refTocCollapsed ? { refTocCollapsed: {} } : {}),
      },
    });
    return {
      ...base,
      ...node,
      x: position.x,
      y: position.y,
      width: nodeSize.width ?? base.width,
      height: nodeSize.height ?? base.height,
      attrs: mergeDeep(base.attrs, node.attrs ?? {}),
      ports: node.ports ?? base.ports,
    };
  }

  const preset = (node.data?.preset as NodePreset | undefined)
    ?? (node.shape === 'ellipse'
      ? 'ellipse'
      : node.shape === 'polygon'
        ? 'diamond'
        : node.attrs?.body?.rx
        ? 'round'
        : 'rect');
  const position = getCellPosition(node);
  const nodeSize = getCellSize(node);
  if (preset === 'umlClass') {
    const definition = normalizeUmlModel({ classes: [node.data?.umlDefinition ?? {
      id: node.data?.umlClassId,
      name: extractNodeLabel(node).split('\n')[0],
      attributes: [],
      methods: [],
      nodeId: node.id,
    }] }).classes[0];
    const base = createUmlClassNode(definition, {
      id: node.id,
      x: position.x,
      y: position.y,
      width: nodeSize.width,
      height: nodeSize.height,
      data: {
        ...node.data,
        umlClassId: definition.id,
      },
    });
    return {
      ...base,
      ...node,
      x: position.x,
      y: position.y,
      width: nodeSize.width ?? base.width,
      height: nodeSize.height ?? base.height,
      position: {
        ...(isPlainObject(node.position) ? node.position : {}),
        x: position.x,
        y: position.y,
      },
      size: {
        ...(isPlainObject(node.size) ? node.size : {}),
        width: nodeSize.width ?? base.width,
        height: nodeSize.height ?? base.height,
      },
      attrs: mergeDeep(base.attrs, node.attrs ?? {}),
      ports: node.ports ?? base.ports,
    };
  }

  const base = createNodeMetadata(preset, {
    id: node.id,
    x: position.x,
    y: position.y,
    width: nodeSize.width,
    height: nodeSize.height,
    label: extractNodeLabel(node),
    data: node.data,
  });

  return {
    ...base,
    ...node,
    x: position.x,
    y: position.y,
    width: nodeSize.width ?? base.width,
    height: nodeSize.height ?? base.height,
    position: {
      ...(isPlainObject(node.position) ? node.position : {}),
      x: position.x,
      y: position.y,
    },
    size: {
      ...(isPlainObject(node.size) ? node.size : {}),
      width: nodeSize.width ?? base.width,
      height: nodeSize.height ?? base.height,
    },
    attrs: mergeDeep(base.attrs, node.attrs ?? {}),
    ports: node.ports ?? base.ports,
  };
}

function normalizeEdge(edge: CellData, mindmap = false): CellData {
  if (mindmap) {
    return createEdgeMetadata(edge, {
      router: { name: 'normal' },
      connector: { name: 'smooth' },
      attrs: {
        line: {
          stroke: '#8c8c8c',
          strokeWidth: 2,
          targetMarker: { name: 'classic', size: 8 },
        },
      },
    });
  }

  const router = edge.router;
  const routerName = typeof router === 'string' ? router : router?.name;
  // Migrate legacy 'orth'/'manhattan' to 'orth-smart' (delegates to orth for far nodes,
  // straight line for close nodes). 'normal' and other explicit routers are preserved.
  const resolvedRouter = !routerName || routerName === 'orth' || routerName === 'manhattan'
    ? { name: ORTH_SMART_ROUTER_NAME }
    : router;
  return createEdgeMetadata(edge, { router: resolvedRouter });
}

function normalizeGraphData(data?: GraphData): GraphData {
  const resolved = resolveBlueprintStarter(data ?? undefined);
  const mindmap = isMindmapBlueprint(resolved);

  if (Array.isArray(resolved.cells)) {
    const cells = resolved.cells.map((cell) => {
      const item = cell as CellData;
      return item.shape === 'edge' || item.source || item.target
        ? normalizeEdge(item, mindmap)
        : normalizeNode(item, mindmap);
    });
    return {
      ...resolved,
      cells,
      nodes: cells.filter((cell) => !(cell.shape === 'edge' || cell.source || cell.target)),
      edges: cells.filter((cell) => cell.shape === 'edge' || cell.source || cell.target),
    } as GraphData;
  }

  const nodes = (resolved.nodes ?? []).map((node) => normalizeNode(node as CellData, mindmap));
  const edges = (resolved.edges ?? []).map((edge) => normalizeEdge(edge as CellData, mindmap));
  return {
    ...resolved,
    cells: [...nodes, ...edges],
    nodes,
    edges,
  } as GraphData;
}

function getGraphSnapshot(data?: GraphData) {
  // Ignore volatile cell body content so typing in the inspector does not
  // fromJSON-reload the whole graph (which clears selection / can break hit targets).
  return JSON.stringify(stripVolatileCellContent(normalizeGraphData(data)));
}

function stripVolatileCellContent(data: GraphData): GraphData {
  const stripCell = (cell: Record<string, unknown>) => {
    const rawData = cell.data;
    if (!rawData || typeof rawData !== 'object') return cell;
    const nextData = { ...(rawData as Record<string, unknown>) };
    delete nextData.contentDocument;
    return { ...cell, data: nextData };
  };
  const { operationHistory: _operationHistory, ...persistentGraph } = data;
  return {
    ...persistentGraph,
    cells: Array.isArray(data.cells)
      ? data.cells.map((cell) => stripCell(cell as Record<string, unknown>))
      : data.cells,
    nodes: Array.isArray(data.nodes)
      ? data.nodes.map((node) => stripCell(node as Record<string, unknown>))
      : data.nodes,
    edges: Array.isArray(data.edges)
      ? data.edges.map((edge) => stripCell(edge as Record<string, unknown>))
      : data.edges,
  } as GraphData;
}

function restoreReferenceInterfaceTerminal(cell: CellData): CellData {
  const original = referenceInterfaceOriginalTerminals.get(String(cell.id));
  if (!original) return cell;
  const terminal = JSON.parse(JSON.stringify(original.terminal)) as unknown;
  return {
    ...cell,
    ...(original.direction === 'out' ? { target: terminal } : { source: terminal }),
  } as CellData;
}

function serializeGraphData(): GraphData {
  if (!graph) {
    return { cells: [], nodes: [], edges: [], uml: objectModelStore.model };
  }

  const nodes = graph.getNodes().map((node) => node.toJSON() as CellData);
  const edges = graph.getEdges()
    .filter((edge) => edge.id !== MINDMAP_DRAG_PREVIEW_EDGE_ID)
    .map((edge) => restoreReferenceInterfaceTerminal(edge.toJSON() as CellData));
  const blueprintMeta = props.graphData?.blueprintMeta ?? undefined;
  return {
    cells: (graph.toJSON().cells as CellData[])
      .filter((cell) => cell.id !== MINDMAP_DRAG_PREVIEW_EDGE_ID)
      .map(restoreReferenceInterfaceTerminal),
    nodes,
    edges,
    ...(blueprintMeta ? { blueprintMeta } : {}),
    uml: objectModelStore.model as Record<string, unknown>,
  } as GraphData;
}

function createOperationSnapshot(data: GraphData): BoardOperationSnapshot {
  const normalized = normalizeGraphData(data);
  return {
    cells: JSON.parse(JSON.stringify(normalized.cells ?? [])) as Array<Record<string, unknown>>,
    ...(normalized.blueprintMeta
      ? { blueprintMeta: JSON.parse(JSON.stringify(normalized.blueprintMeta)) }
      : {}),
    ...(normalized.uml
      ? { uml: JSON.parse(JSON.stringify(normalized.uml)) as Record<string, unknown> }
      : {}),
  };
}

function snapshotToGraphData(snapshot: BoardOperationSnapshot): GraphData {
  return normalizeGraphData({
    cells: JSON.parse(JSON.stringify(snapshot.cells)),
    nodes: [],
    edges: [],
    ...(snapshot.blueprintMeta
      ? { blueprintMeta: JSON.parse(JSON.stringify(snapshot.blueprintMeta)) }
      : {}),
    ...(snapshot.uml
      ? { uml: JSON.parse(JSON.stringify(snapshot.uml)) as Record<string, unknown> }
      : {}),
  });
}

function operationSnapshotKey(snapshot: BoardOperationSnapshot): string {
  return JSON.stringify(snapshot);
}

function loadOperationHistory(data?: GraphData) {
  operationHistory.value = Array.isArray(data?.operationHistory)
    ? data.operationHistory.slice(0, BOARD_OPERATION_HISTORY_LIMIT)
    : [];
  operationHistoryPage.value = Math.min(
    operationHistoryPage.value,
    Math.max(1, Math.ceil(operationHistory.value.length / BOARD_OPERATION_HISTORY_PAGE_SIZE)),
  );
  rollbackConfirmId.value = null;
}

/** Capture the exact state before a meaningful user action starts. */
function markBoardOperation(label: string) {
  if (!graph || isApplyingExternalData) return;
  pendingOperationLabel = label;
  pendingOperationBefore = createOperationSnapshot(serializeGraphData());
}

function formatOperationTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function appendOperationRecord(current: BoardOperationSnapshot) {
  const before = pendingOperationBefore
    ?? (lastCommittedOperationSnapshot
      ? JSON.parse(lastCommittedOperationSnapshot) as BoardOperationSnapshot
      : current);
  const beforeKey = operationSnapshotKey(before);
  const currentKey = operationSnapshotKey(current);
  if (beforeKey === currentKey) {
    pendingOperationLabel = null;
    pendingOperationBefore = null;
    return;
  }

  operationHistory.value = [
    {
      id: createId('board-operation'),
      label: pendingOperationLabel ?? '编辑画板',
      createdAt: Date.now(),
      before,
    },
    ...operationHistory.value,
  ].slice(0, BOARD_OPERATION_HISTORY_LIMIT);
  operationHistoryPage.value = 1;
  pendingOperationLabel = null;
  pendingOperationBefore = null;
}

function emitGraphData(): GraphData | null {
  if (!graph || isApplyingExternalData) return null;
  const core = normalizeGraphData(serializeGraphData());
  const currentOperationSnapshot = createOperationSnapshot(core);
  appendOperationRecord(currentOperationSnapshot);
  const payload: GraphData = {
    ...core,
    operationHistory: operationHistory.value,
  };
  const snapshot = JSON.stringify(payload);
  if (snapshot === lastSerializedSnapshot) return payload;
  lastCommittedOperationSnapshot = operationSnapshotKey(currentOperationSnapshot);
  lastSerializedSnapshot = snapshot;
  lastStructuralSnapshot = JSON.stringify(stripVolatileCellContent(payload));
  emit('graph-data-change', payload);
  return payload;
}

function updateUndoRedoState() {
  if (!graph) return;
  canUndo.value = graph.canUndo();
  canRedo.value = graph.canRedo();
  zoomPercent.value = Math.round(graph.zoom() * 100);
}

/**
 * Ctrl/Meta + wheel must zoom even when the event target is a stage overlay
 * (node chrome, collapse buttons) or a scrollable ancestor (e.g. el-dialog).
 * X6's built-in mousewheel only listens on graph.container, so without this
 * capture handler the event bubbles and pans/scrolls the page instead.
 */
function handleStageCtrlWheel(e: WheelEvent) {
  if (!graph) return;
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  e.stopPropagation();

  const current = graph.zoom();
  const next = e.deltaY < 0
    ? Math.min(ZOOM_MAX, current * ZOOM_FACTOR)
    : Math.max(ZOOM_MIN, current / ZOOM_FACTOR);
  if (Math.abs(next - current) < 1e-6) return;

  try {
    const origin = graph.clientToGraph(e.clientX, e.clientY);
    graph.zoom(next, { absolute: true, center: origin });
  } catch {
    graph.zoom(next, { absolute: true });
  }
  updateUndoRedoState();
}

function bindStageCtrlWheel() {
  stageRef.value?.addEventListener('wheel', handleStageCtrlWheel, {
    capture: true,
    passive: false,
  });
}

function unbindStageCtrlWheel() {
  stageRef.value?.removeEventListener('wheel', handleStageCtrlWheel, {
    capture: true,
  } as EventListenerOptions);
}

/**
 * 画板滚轮平移：无修饰键时滚动滚轮上下移动画面（类比文档滚动）。
 * - Ctrl/Meta + wheel 仍由 handleStageCtrlWheel 负责缩放；
 * - 光标位于输入类目标（输入框/编辑器）时让位原生滚动；
 * - 方向约定：向下滚动（deltaY>0）内容上移（ty 减小），即向下查看更下方内容。
 */
function handleStageWheelPan(e: WheelEvent) {
  if (!graph) return;
  if (e.ctrlKey || e.metaKey) return;
  if (isCanvasTypingTarget(e.target)) return;

  e.preventDefault();
  e.stopPropagation();

  // 归一化 Firefox 的行/页模式为像素
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;
  else if (e.deltaMode === 2) dy *= 100;

  const { tx, ty } = graph.translate();
  graph.translate(tx, ty - dy);
}

function bindStageWheelPan() {
  stageRef.value?.addEventListener('wheel', handleStageWheelPan, {
    capture: true,
    passive: false,
  });
}

function unbindStageWheelPan() {
  stageRef.value?.removeEventListener('wheel', handleStageWheelPan, {
    capture: true,
  } as EventListenerOptions);
}

function isCanvasTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .x6-node-plain-input, .ProseMirror, .tu-editor-content',
    ),
  );
}

function getEffectiveCanvasInteractionMode(): CanvasInteractionMode {
  return spacePanActive.value ? 'pan' : canvasInteractionMode.value;
}

function beginSpacePan() {
  if (spacePanActive.value) return;
  spacePanActive.value = true;
  applyCanvasInteractionMode();
}

function endSpacePan() {
  if (!spacePanActive.value) return;
  spacePanActive.value = false;
  applyCanvasInteractionMode();
}

function handleSpacePanKeyDown(e: KeyboardEvent) {
  if (e.code !== 'Space') return;
  if (e.repeat) return;
  if (editingNodeId.value != null || edgeInlineEditing.value) return;
  if (isCanvasTypingTarget(e.target) || isCanvasTypingTarget(document.activeElement)) return;
  if (!stagePointerInside) return;
  e.preventDefault();
  beginSpacePan();
}

function handleSpacePanKeyUp(e: KeyboardEvent) {
  if (e.code !== 'Space') return;
  endSpacePan();
}

function handleSpacePanWindowBlur() {
  endSpacePan();
}

function handleStagePointerEnter() {
  stagePointerInside = true;
}

function handleStagePointerLeave() {
  stagePointerInside = false;
  endSpacePan();
}

function bindSpacePanListeners() {
  window.addEventListener('keydown', handleSpacePanKeyDown, true);
  window.addEventListener('keyup', handleSpacePanKeyUp, true);
  window.addEventListener('blur', handleSpacePanWindowBlur);
  stageRef.value?.addEventListener('pointerenter', handleStagePointerEnter);
  stageRef.value?.addEventListener('pointerleave', handleStagePointerLeave);
}

function unbindSpacePanListeners() {
  window.removeEventListener('keydown', handleSpacePanKeyDown, true);
  window.removeEventListener('keyup', handleSpacePanKeyUp, true);
  window.removeEventListener('blur', handleSpacePanWindowBlur);
  stageRef.value?.removeEventListener('pointerenter', handleStagePointerEnter);
  stageRef.value?.removeEventListener('pointerleave', handleStagePointerLeave);
  endSpacePan();
  stagePointerInside = false;
}

interface RightButtonPanState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startTranslateX: number;
  startTranslateY: number;
}

let rightButtonPanState: RightButtonPanState | null = null;

/**
 * 画板自行接管右键拖动。必须在 pointerdown 捕获阶段终止原事件，否则部分
 * 浏览器会在后续 mousedown/contextmenu 之前启动内置的右键手势。
 */
function handleStageRightPointerDown(e: PointerEvent) {
  if (e.button !== 2 || !graph || !stageRef.value) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  markStageActiveForBoardPaste();

  const { tx, ty } = graph.translate();
  rightButtonPanState = {
    pointerId: e.pointerId,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startTranslateX: tx,
    startTranslateY: ty,
  };
  try {
    stageRef.value.setPointerCapture?.(e.pointerId);
  } catch {
    // Synthetic tests and older browsers can reject capture for an inactive pointer.
    // Window-level move/up listeners still keep the custom pan functional.
  }
}

function handleRightButtonPanMove(e: PointerEvent) {
  const state = rightButtonPanState;
  if (!state || e.pointerId !== state.pointerId || !graph) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  graph.translate(
    state.startTranslateX + e.clientX - state.startClientX,
    state.startTranslateY + e.clientY - state.startClientY,
  );
  updateNodeOverlays();
}

function finishRightButtonPan(e: PointerEvent) {
  const state = rightButtonPanState;
  if (!state || e.pointerId !== state.pointerId) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  try {
    if (stageRef.value?.hasPointerCapture?.(state.pointerId)) {
      stageRef.value.releasePointerCapture(state.pointerId);
    }
  } catch {
    // Pointer capture may already have been released by the browser.
  }
  rightButtonPanState = null;
}

function cancelRightButtonPan() {
  try {
    if (rightButtonPanState && stageRef.value?.hasPointerCapture?.(rightButtonPanState.pointerId)) {
      stageRef.value.releasePointerCapture(rightButtonPanState.pointerId);
    }
  } catch {
    // Pointer capture may already have been released by the browser.
  }
  rightButtonPanState = null;
}

function bindRightButtonPanListeners() {
  stageRef.value?.addEventListener('pointerdown', handleStageRightPointerDown, true);
  window.addEventListener('pointermove', handleRightButtonPanMove, true);
  window.addEventListener('pointerup', finishRightButtonPan, true);
  window.addEventListener('pointercancel', finishRightButtonPan, true);
  window.addEventListener('blur', cancelRightButtonPan);
}

function unbindRightButtonPanListeners() {
  stageRef.value?.removeEventListener('pointerdown', handleStageRightPointerDown, true);
  window.removeEventListener('pointermove', handleRightButtonPanMove, true);
  window.removeEventListener('pointerup', finishRightButtonPan, true);
  window.removeEventListener('pointercancel', finishRightButtonPan, true);
  window.removeEventListener('blur', cancelRightButtonPan);
  cancelRightButtonPan();
}

function getNodeLabel(node: Node) {
  const value = node.attr('label/text');
  return typeof value === 'string' ? value : '';
}

function isNodeSoleSelected(node: Node) {
  const cells = graph?.getSelectedCells() ?? [];
  return cells.length === 1 && cells[0].id === node.id;
}

function getEdgeLabel(edge: Edge) {
  const labels = edge.getLabels();
  if (!labels.length) return '';
  const label = labels[0] as Record<string, any>;
  return typeof label === 'string' ? label : (label?.attrs?.label?.text ?? '');
}

function ensureEdgeHitTarget(edge: Edge) {
  // Transparent wrap is the click target; visible line has pointer-events: none.
  // Selected CSS / attrs merges sometimes shrink or restyle wrap — restore it.
  edge.attr('wrap/stroke', 'transparent');
  edge.attr('wrap/strokeWidth', 12);
  edge.attr('line/pointerEvents', 'none');
}

function setEdgeLabel(edge: Edge, text: string) {
  if (!text.trim()) {
    edge.setLabels([]);
    ensureEdgeHitTarget(edge);
    return;
  }

  edge.setLabels([
    {
      attrs: {
        label: {
          text,
          fill: '#52616b',
          fontSize: 12,
        },
      },
    },
  ]);
  ensureEdgeHitTarget(edge);
}

// --- Node overlay helpers ---

function getNodeOverlayStyle(node: Node): Record<string, string> {
  if (!graph || !stageRef.value) return {};
  const bbox = node.getBBox();
  const zoom = graph.zoom();
  const { tx, ty } = graph.translate();
  const left = bbox.x * zoom + tx;
  const top = bbox.y * zoom + ty;
  const width = bbox.width * zoom;
  const height = bbox.height * zoom;
  return {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    zIndex: '1000',
    fontSize: `${Math.max(12, 14 * zoom)}px`,
  };
}

function updateGraphSourceRegion() {
  const kind = props.graphSourceKind ?? props.graphData?.blueprintMeta?.kind;
  if (!graph || !kind) {
    graphSourceRegion.value = null;
    return;
  }

  const nodes = graph.getNodes();
  if (nodes.length === 0) {
    graphSourceRegion.value = null;
    return;
  }

  const zoom = graph.zoom();
  const { tx, ty } = graph.translate();
  const boxes = nodes.map((node) => node.getBBox());
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  const padding = 28;

  graphSourceRegion.value = {
    kind,
    label: getBlueprintRegionLabel(kind),
    style: {
      left: `${(minX - padding) * zoom + tx}px`,
      top: `${(minY - padding) * zoom + ty}px`,
      width: `${(maxX - minX + padding * 2) * zoom}px`,
      height: `${(maxY - minY + padding * 2) * zoom}px`,
    },
  };
}

function updateNodeOverlays() {
  if (!graph) {
    nodeOverlays.value = [];
    graphSourceRegion.value = null;
    return;
  }
  nodeOverlays.value = graph.getNodes()
    .filter((node) => !isBoardGroupNode(node))
    .map(node => {
      const data = node.getData<Record<string, any>>() ?? {};
      return {
        id: node.id,
        style: getNodeOverlayStyle(node),
        textMode: (data.textMode ?? 'plain') as 'plain' | 'rich',
        label: getNodeLabel(node),
        richContent: data.richContent ?? '',
        boardReferencePageId: props.referencePreviewEnabled
          && data.boardReferenceDisplay === 'content'
          && data.refType === 'page'
          && typeof data.refBlockId === 'string'
          ? data.refBlockId
          : '',
        boardReferenceTitle: typeof data.refBlockId === 'string'
          ? buildRefSourceLabel(data.refBlockId, data.refType === 'page' ? 'page' : 'block')
          : '',
        boardReferenceInterfaces: Array.isArray(data.extractedInterfaces)
          ? data.extractedInterfaces.flatMap((item: unknown) => {
            if (!item || typeof item !== 'object') return [];
            const value = item as Record<string, unknown>;
            const side = value.side;
            if (
              typeof value.edgeId !== 'string'
              || typeof value.portId !== 'string'
              || typeof value.ratio !== 'number'
              || !['top', 'right', 'bottom', 'left'].includes(String(side))
            ) return [];
            return [{
              edgeId: value.edgeId,
              portId: value.portId,
              direction: value.direction === 'in' ? 'in' : 'out',
              side: side as BoardInterfaceSide,
              ratio: Math.min(0.92, Math.max(0.08, value.ratio)),
            }];
          })
          : [],
      };
    });
  updateGraphSourceRegion();
  updateMindmapCollapseOverlays();
}

function clearMindmapCollapseHideTimer() {
  if (mindmapCollapseHideTimer !== null) {
    window.clearTimeout(mindmapCollapseHideTimer);
    mindmapCollapseHideTimer = null;
  }
}

function showMindmapCollapseForNode(nodeId: string) {
  if (!isMindmap.value) return;
  clearMindmapCollapseHideTimer();
  mindmapCollapseHoverNodeId.value = nodeId;
  updateMindmapCollapseOverlays();
}

function scheduleHideMindmapCollapse() {
  clearMindmapCollapseHideTimer();
  mindmapCollapseHideTimer = window.setTimeout(() => {
    mindmapCollapseHoverNodeId.value = null;
    mindmapCollapseHideTimer = null;
    updateMindmapCollapseOverlays();
  }, 160);
}

function updateMindmapCollapseOverlays() {
  const g = graph;
  if (!g || !isMindmap.value) {
    mindmapCollapseButtons.value = [];
    return;
  }

  const direction = readMindmapDirection(props.graphData);
  const candidateIds = new Set<string>();
  if (mindmapCollapseHoverNodeId.value) {
    candidateIds.add(mindmapCollapseHoverNodeId.value);
  }
  g.getSelectedCells().forEach((cell) => {
    if (g.isNode(cell) && cell.isVisible()) {
      candidateIds.add(cell.id);
    }
  });

  const buttons: MindmapCollapseButtonState[] = [];
  candidateIds.forEach((nodeId) => {
    const node = g.getCellById(nodeId);
    if (!node || !g.isNode(node) || !node.isVisible()) return;
    if (!nodeHasMindmapExpandableChildren(g, node, mindmapRefTocContext)) return;
    buttons.push({
      nodeId,
      collapsed: readMindmapNodeCollapsedForDisplay(g, node),
      style: getMindmapCollapseButtonStyle(node, g, direction),
    });
  });

  mindmapCollapseButtons.value = buttons;
}

async function ensureMindmapRefOutlineLoaded(refBlockId: string, refType: 'block' | 'page') {
  const load = (force: boolean) => (
    refType === 'page'
      ? outlineCacheStore.ensurePageOutline(refBlockId, { force })
      : outlineCacheStore.ensureBlockOutline(refBlockId, { force })
  );
  const nodes = await load(false);
  if (nodes.length === 0) {
    return load(true);
  }
  return nodes;
}

async function ensureMindmapRefOutlineForNode(node: Node) {
  if (!graph) return;

  if (isMindmapRefBlockNode(node)) {
    const data = node.getData<Record<string, any>>() ?? {};
    const refBlockId = typeof data.refBlockId === 'string' ? data.refBlockId : '';
    if (!refBlockId) return;
    const refType: 'block' | 'page' = data.refType === 'page' ? 'page' : 'block';
    await ensureMindmapRefOutlineLoaded(refBlockId, refType);
    return;
  }

  const data = node.getData<Record<string, any>>() ?? {};
  const refParentId = typeof data.refTocParentRefId === 'string' ? data.refTocParentRefId : '';
  const entryId = typeof data.refTocEntryId === 'string' ? data.refTocEntryId : '';
  if (!refParentId || !entryId) return;

  const refParent = graph.getCellById(refParentId);
  if (!refParent || !graph.isNode(refParent) || !isMindmapRefBlockNode(refParent)) return;

  const parentData = refParent.getData<Record<string, any>>() ?? {};
  const refBlockId = typeof parentData.refBlockId === 'string' ? parentData.refBlockId : '';
  if (!refBlockId) return;
  const refType: 'block' | 'page' = parentData.refType === 'page' ? 'page' : 'block';
  await ensureMindmapRefOutlineLoaded(refBlockId, refType);
}

async function onMindmapCollapseButtonClick(nodeId: string) {
  // Collapse/expand is a view interaction — allow in read-only mindmap previews.
  if (!graph) return;
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return;

  const willExpand = readMindmapNodeCollapsedForDisplay(graph, node);
  if (willExpand) {
    mindmapCollapseLoadingNodeId.value = nodeId;
    try {
      await ensureMindmapRefOutlineForNode(node);
    } finally {
      mindmapCollapseLoadingNodeId.value = null;
    }
  }

  handleMindmapNodeCollapse(node);
}

/** 思维导图收起/可见性变更后的统一 UI 结算（选中虚框、悬浮按钮、编辑态等）。 */
function settleMindmapCollapseInteraction() {
  if (!graph) return;

  if (mindmapCollapseHoverNodeId.value) {
    const hovered = graph.getCellById(mindmapCollapseHoverNodeId.value);
    if (!hovered?.isVisible()) {
      mindmapCollapseHoverNodeId.value = null;
    }
  }

  if (editingNodeId.value) {
    const editing = graph.getCellById(editingNodeId.value);
    if (!editing?.isVisible()) {
      handleNodeOverlayCancel(editingNodeId.value);
    }
  }

  if (mindmapDragActiveNodeId) {
    const dragged = graph.getCellById(mindmapDragActiveNodeId);
    if (!dragged?.isVisible()) {
      cancelMindmapNodeDrag();
    }
  }

  refreshSelectedCellState();
  updateMindmapCollapseOverlays();
  updateNodeOverlays();
}

function handleMindmapNodeCollapse(node: Node) {
  if (!graph || !isMindmap.value) return;
  toggleMindmapNodeCollapse(
    graph,
    node,
    readMindmapDirection(props.graphData),
    mindmapRefTocContext,
  );
  // Persist collapse only when the canvas is editable; outline preview is ephemeral.
  if (isEditable.value) {
    scheduleSync();
  }
}

function suspendCanvasInteractionForEdit() {
  graph?.disablePanning();
  graph?.disableSelection();
}

function cancelMindmapNodeDrag() {
  if (!graph || !mindmapDragActiveNodeId) return;
  const draggedNode = graph.getCellById(mindmapDragActiveNodeId);
  if (draggedNode && graph.isNode(draggedNode)) {
    endMindmapNodeDrag(graph, readMindmapDirection(props.graphData));
  }
  mindmapDragActiveNodeId = null;
  mindmapDragMoved = false;
  mindmapDragSessionStarted = false;
}

function applyCanvasInteractionMode() {
  if (!graph || editingNodeId.value != null || edgeInlineEditing.value) return;

  if (isStraightLineMode.value) {
    // 直线绘制模式：禁用选择，右键拖拽画布
    cancelMindmapNodeDrag();
    graph.options.panning.eventTypes = ['rightMouseDown'];
    graph.enablePanning();
    graph.disableSelection();
    graph.cleanSelection();
    return;
  }

  if (getEffectiveCanvasInteractionMode() === 'pan') {
    cancelMindmapNodeDrag();
    graph.options.panning.eventTypes = ['leftMouseDown'];
    graph.enablePanning();
    graph.disableSelection();
    graph.cleanSelection();
    refreshSelectedCellState();
  } else {
    graph.options.panning.eventTypes = ['rightMouseDown'];
    graph.enablePanning();
    graph.enableSelection();
  }
}

function restoreCanvasInteractionAfterEdit() {
  applyCanvasInteractionMode();
}

function setCanvasInteractionMode(mode: CanvasInteractionMode) {
  if (canvasInteractionMode.value === mode) return;
  canvasInteractionMode.value = mode;
  applyCanvasInteractionMode();
}

// Handlers called by X6NodeOverlay emit events

function handleNodeOverlayCommit(nodeId: string, text: string) {
  const node = graph?.getCellById(nodeId);
  if (node && graph?.isNode(node)) {
    node.attr('label/text', text);
    node.attr('label/visibility', 'visible');
    if (isNodeContainer(node)) {
      positionContainerLabel(node);
    }
    if (isMindmap.value && fitMindmapNodeToText(node) && graph) {
      layoutMindmapGraph(graph, readMindmapDirection(props.graphData));
    }
  }
  suppressNextNodeInternalClickId = nodeId;
  editingNodeId.value = null;
  restoreCanvasInteractionAfterEdit();
  updateNodeOverlays();
  scheduleSync();
}

function handleNodeOverlayCancel(nodeId: string) {
  const node = graph?.getCellById(nodeId);
  if (node && graph?.isNode(node)) {
    const data = node.getData<Record<string, any>>() ?? {};
    if (data.textMode !== 'rich') {
      node.attr('label/visibility', 'visible');
    }
  }
  suppressNextNodeInternalClickId = nodeId;
  editingNodeId.value = null;
  pendingNodeInternalClickId = null;
  restoreCanvasInteractionAfterEdit();
}

function handleRichChange(nodeId: string, markdown: string) {
  const node = graph?.getCellById(nodeId);
  if (node && graph?.isNode(node)) {
    node.updateData({ richContent: markdown });
  }
  updateNodeOverlays();
  scheduleSync();
}

function setNodeOverlayRef(el: unknown, nodeId: string) {
  if (el) {
    nodeOverlayRefs.value[nodeId] = el as {
      getMarkdownLinkAnchor?: () => { top: number; left: number } | undefined;
      insertMarkdownLink?: (label: string, url: string, display?: 'link' | 'image') => boolean;
      updateInsertedLinkDisplay?: (display: 'link' | 'image') => boolean;
      updateInsertedImageWidth?: (widthPercent: number) => boolean;
    };
  } else {
    delete nodeOverlayRefs.value[nodeId];
  }
}

function insertMarkdownLink(label: string, url: string, display: 'link' | 'image' = 'link'): boolean {
  if (!isEditable.value || !editingNodeId.value) return false;
  return nodeOverlayRefs.value[editingNodeId.value]?.insertMarkdownLink?.(label, url, display) ?? false;
}

function getMarkdownLinkAnchor(): { top: number; left: number } | undefined {
  if (!isEditable.value || !editingNodeId.value) return undefined;
  return nodeOverlayRefs.value[editingNodeId.value]?.getMarkdownLinkAnchor?.();
}

function updateInsertedLinkDisplay(display: 'link' | 'image'): boolean {
  if (!isEditable.value || !editingNodeId.value) return false;
  return nodeOverlayRefs.value[editingNodeId.value]?.updateInsertedLinkDisplay?.(display) ?? false;
}

function updateInsertedImageWidth(widthPercent: number): boolean {
  if (!isEditable.value || !editingNodeId.value) return false;
  return nodeOverlayRefs.value[editingNodeId.value]?.updateInsertedImageWidth?.(widthPercent) ?? false;
}

// --- Edge inline editing helpers ---

function getEdgeOverlayStyle(edge: Edge): Record<string, string> {
  if (!graph || !stageRef.value) return {};
  const zoom = graph.zoom();
  const { tx, ty } = graph.translate();

  const sourceNode = edge.getSourceNode();
  const targetNode = edge.getTargetNode();
  let midX = 0, midY = 0;

  if (sourceNode && targetNode) {
    const sBBox = sourceNode.getBBox();
    const tBBox = targetNode.getBBox();
    midX = (sBBox.x + sBBox.width / 2 + tBBox.x + tBBox.width / 2) / 2;
    midY = (sBBox.y + sBBox.height / 2 + tBBox.y + tBBox.height / 2) / 2;
  }

  const edgeWidth = 160;
  const edgeHeight = 40;
  return {
    position: 'absolute',
    left: `${midX * zoom + tx - edgeWidth / 2}px`,
    top: `${midY * zoom + ty - edgeHeight / 2}px`,
    width: `${edgeWidth}px`,
    height: `${edgeHeight}px`,
    zIndex: '1000',
    fontSize: `${Math.max(11, 12 * zoom)}px`,
  };
}

function commitEdgeInlineEdit() {
  if (!graph || !edgeInlineEditId.value) return;
  const edge = graph.getCellById(edgeInlineEditId.value);
  if (edge && graph.isEdge(edge)) {
    setEdgeLabel(edge, edgeInlineEditText.value);
  }
  edgeInlineEditing.value = false;
  edgeInlineEditId.value = null;
  restoreCanvasInteractionAfterEdit();
  scheduleSync();
}

function cancelEdgeInlineEdit() {
  edgeInlineEditing.value = false;
  edgeInlineEditId.value = null;
  restoreCanvasInteractionAfterEdit();
}

function handleEdgeEditKeydown(e: KeyboardEvent) {
  e.stopPropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelEdgeInlineEdit();
  } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    commitEdgeInlineEdit();
  }
}

// --- Text mode toggle ---

function toggleNodeTextMode(mode: 'plain' | 'rich') {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'node') return;
  const node = graph.getCellById(selectedCell.value.id);
  if (!node || !graph.isNode(node)) return;

  const currentData = node.getData<Record<string, any>>() ?? {};

  if (mode === 'rich' && currentData.textMode !== 'rich') {
    const plainText = getNodeLabel(node);
    node.updateData({
      textMode: 'rich',
      richContent: currentData.richContent || plainText,
    });
    node.attr('label/visibility', 'hidden');
  } else if (mode === 'plain' && currentData.textMode !== 'plain') {
    node.updateData({ textMode: 'plain' });
    node.attr('label/visibility', 'visible');
  }

  refreshSelectedCellState();
  scheduleSync();
  updateNodeOverlays();
}

/** 从 data.preset 推断当前节点样式，旧数据回退按 shape 猜测 */
function resolveBoardNodeStylePreset(node: Node, nodeData: Record<string, any>): BoardNodeStylePreset | '' {
  if (nodeData.boardGroup === true) return '';
  const raw = nodeData.preset;
  if ((BOARD_NODE_STYLE_PRESETS as readonly string[]).includes(raw)) {
    return raw as BoardNodeStylePreset;
  }
  if (node.shape === 'ellipse') return 'ellipse';
  if (node.shape === 'polygon') return 'diamond';
  if (node.shape === 'rect') {
    const rx = Number(node.attr('body/rx')) || 0;
    return rx > 0 ? 'round' : 'rect';
  }
  return '';
}

function refreshSelectedCellState() {
  if (!graph) {
    return;
  }

  const cells = graph.getSelectedCells();
  selectedCellsCount.value = cells.length;
  deletableSelectionCount.value = resolveDeletableCellsForDelete().length;
  selectedCell.value = null;
  if (cells.length !== 1 || !graph.isNode(cells[0])) {
    graph.clearTransformWidgets();
  }

  if (cells.length === 1) {
    const [cell] = cells;

    if (graph.isNode(cell)) {
      const size = cell.getSize();
      const nodeData = cell.getData<Record<string, any>>() ?? {};
      const refBlockId = typeof nodeData.refBlockId === 'string' ? nodeData.refBlockId : '';
      const refType: 'block' | 'page' = nodeData.refType === 'page' ? 'page' : 'block';
      const isRefBlock = nodeData.refKind === 'block-ref' || Boolean(refBlockId);
      const referencedPage = refType === 'page' && refBlockId
        ? findPageInTree(workspaceStore.pageTree, refBlockId)
        : null;
      const canPreviewBoardReference = refType === 'page' && (
        nodeData.extractedBoardReference === true
        || referencedPage?.pageType === 'x6board'
        || referencedPage?.pageType === 'mindmap'
      );
      const sourceLocator = typeof nodeData.sourceLocator === 'string' ? nodeData.sourceLocator.trim() : '';
      const tocEntryId = typeof nodeData.tocEntryId === 'string' ? nodeData.tocEntryId : '';
      const linkUrl = typeof nodeData.linkUrl === 'string' ? nodeData.linkUrl : '';
      const rawLinkDisplay = nodeData.linkDisplay;
      const linkDisplay: UrlDisplayMode = rawLinkDisplay === 'iframe' || rawLinkDisplay === 'title'
        || rawLinkDisplay === 'pdf' || rawLinkDisplay === 'image'
        ? rawLinkDisplay
        : 'link';
      const imageUrl = typeof nodeData.imageUrl === 'string'
        ? nodeData.imageUrl
        : (cell.shape === 'image' ? String(cell.attr('image/xlinkHref') ?? '') : '');
      selectedCell.value = {
        kind: 'node',
        id: cell.id,
        shape: cell.shape,
        preset: resolveBoardNodeStylePreset(cell, nodeData),
        label: getNodeLabel(cell),
        fill: (cell.attr('body/fill') as string) || '#ffffff',
        stroke: (cell.attr('body/stroke') as string) || '#1677ff',
        width: size.width,
        height: size.height,
        textMode: nodeData.textMode ?? 'plain',
        richContent: nodeData.richContent ?? '',
        linkUrl,
        linkDisplay,
        imageUrl,
        isRefBlock,
        refBlockId,
        refType,
        refSourceLabel: isRefBlock && refBlockId ? buildRefSourceLabel(refBlockId, refType) : '',
        boardReferenceDisplay: nodeData.boardReferenceDisplay === 'content' ? 'content' : 'card',
        canPreviewBoardReference,
        sourceLocator,
        tocEntryId,
        contentBinding: readCellContentBinding(nodeData),
        isGroup: nodeData.boardGroup === true,
        groupSize: nodeData.boardGroup === true ? (cell.getChildren() ?? []).length : 0,
        boardGroupBorder: nodeData.boardGroup === true ? getBoardGroupBorderPreset(cell as Node) : 'tight',
        zIndex: cell.getZIndex() ?? null,
      };
    } else if (graph.isEdge(cell)) {
      const router = cell.getRouter();
      const connector = cell.getConnector();
      const edgeData = cell.getData<Record<string, unknown>>() ?? {};
      const connectorName = typeof connector === 'string' ? connector : (connector?.name ?? 'rounded');
      const routerName = typeof router === 'string'
        ? router
        : (router?.name ?? (connectorName === MINDMAP_CONNECTOR_NAME ? 'normal' : 'orth'));
      selectedCell.value = {
        kind: 'edge',
        id: cell.id,
        label: getEdgeLabel(cell),
        stroke: (cell.attr('line/stroke') as string) || '#52616b',
        router: routerName,
        connector: connectorName,
        contentBinding: readCellContentBinding(edgeData),
        zIndex: cell.getZIndex() ?? null,
      };
    }
  }

  // 工具栏「组合/取消组合」「设为子元素/取消子元素」按钮状态。
  // 取消类操作（取消组合/取消子元素）仅在单选命中目标时可用。
  if (!isMindmap.value) {
    const g = graph;
    const selectedNodes: Node[] = g ? (cells.filter((cell) => g.isNode(cell)) as Node[]) : [];
    const groupContainers = selectedNodes.filter((node) => isBoardGroupNode(node));
    // 子元素相关判定只看非组合容器节点（与 makeChildOfParent/detachFromParent 一致）
    const plainNodes = selectedNodes.filter((node) => !isBoardGroupNode(node));
    const isSingleSelection = cells.length === 1;

    // 取消组合：仅单选一个组合容器时可用；多选或选中父元素等场景禁用
    if (isSingleSelection && groupContainers.length === 1) {
      groupActionButtonMode.value = 'ungroup';
    } else if (groupContainers.length === 0 && plainNodes.length >= 2) {
      groupActionButtonMode.value = 'group';
    } else {
      groupActionButtonMode.value = '';
    }

    // 子元素按钮状态：
    // - 单选一个子元素（存在 nodeContainer 父节点）→ 取消子元素（可分离）
    // - 多选（≥2 个非组合节点）→ 设为子元素。末选节点为父元素、先选节点为子元素；
    //   父元素（容器）自身也可以是其他元素的子元素（嵌套父子关系），
    //   因此只要选中了 ≥2 个节点即可设为子元素，具体有效性由
    //   makeChildOfParent（环检测等）判断
    // - 其余（无选中、单选父容器等）→ 禁用
    if (
      isSingleSelection &&
      plainNodes.length === 1 &&
      findNodeContainerParent(plainNodes[0]) !== null
    ) {
      childActionButtonMode.value = 'detach';
    } else if (
      plainNodes.length >= 2
      && plainNodes
        .slice(0, -1)
        .some((child) => canAttachNodeToParent(child, plainNodes[plainNodes.length - 1]))
    ) {
      childActionButtonMode.value = 'child';
    } else {
      childActionButtonMode.value = '';
    }
  } else {
    groupActionButtonMode.value = '';
    childActionButtonMode.value = '';
  }

  updateUndoRedoState();
}

/**
 * Re-derive the X6 "selected" class for every cell from the authoritative
 * selection set.
 *
 * The selection plugin runs with `showNodeSelectionBox: false`, so the visual
 * selected state is driven purely by CSS on the `x6-node-selected` /
 * `x6-edge-selected` classes. X6 adds that class when a cell enters the
 * selection collection, but with the graph in async-render mode a rubberband
 * selects every cell in one batch while ctrl/⌘+click adds cells incrementally —
 * and earlier cells can end up without the class, so only the last-clicked node
 * looks selected. Reconciling from `getSelectedCells()` on every
 * `selection:changed` keeps click and rubberband multi-select visually identical.
 */
function reconcileSelectionHighlight() {
  if (!graph) return;
  const selectedIds = new Set(graph.getSelectedCells().map((cell) => cell.id));
  const cells: Array<Node | Edge> = [...graph.getNodes(), ...graph.getEdges()];
  cells.forEach((cell) => {
    const view = graph!.findViewByCell(cell);
    if (!view) return;
    const className = cell.isNode() ? 'x6-node-selected' : 'x6-edge-selected';
    if (selectedIds.has(cell.id)) {
      view.addClass(className);
    } else {
      view.removeClass(className);
    }
  });
}

/**
 * Keep multi-select visuals aligned with rubberband selection.
 *
 * Transform plugin listens to `node:click` and always creates a resize widget
 * for the clicked node. That runs after `selection:changed` (where we already
 * call `clearTransformWidgets()`), so ctrl/⌘+click leaves corner handles on the
 * last node only. Re-clear when the selection is not exactly one node.
 */
function openInspectorForNodeSelection() {
  if (!props.inspectorEnabled || !props.openInspectorOnNodeSelect || !graph) return;
  const cells = graph.getSelectedCells();
  if (cells.some((cell) => graph!.isNode(cell))) {
    inspectorVisible.value = true;
    inspectorTab.value = 'inspector';
  }
}

function finalizeSelectionVisualState() {
  if (!graph) return;
  reconcileSelectionHighlight();
  syncEdgeTools();
  const cells = graph.getSelectedCells();
  if (cells.length !== 1 || !graph.isNode(cells[0])) {
    graph.clearTransformWidgets();
  }
  openInspectorForNodeSelection();
}

/**
 * 在连线中点插入矩形环节，将连线拆分为两段（源 → 矩形 → 目标）。
 * 新连线继承原连线的路由器、连接器和线条样式。
 */
function insertRelayOnEdge(edge: Edge) {
  if (!graph || !isEditable.value) return;

  const source = edge.getSource();
  const target = edge.getTarget();
  const router = edge.getRouter();
  const connector = edge.getConnector();
  const lineAttrs = edge.attr('line');

  const sourcePoint = edge.getSourcePoint();
  const targetPoint = edge.getTargetPoint();
  const midX = (sourcePoint.x + targetPoint.x) / 2;
  const midY = (sourcePoint.y + targetPoint.y) / 2;

  const relayWidth = 80;
  const relayHeight = 32;
  const relayNode = graph.addNode(createNodeMetadata('rect', {
    x: midX - relayWidth / 2,
    y: midY - relayHeight / 2,
    width: relayWidth,
    height: relayHeight,
    label: '',
  }));

  const edgeAttrs = lineAttrs && typeof lineAttrs === 'object'
    ? { line: lineAttrs }
    : undefined;

  graph.batchUpdate(() => {
    // 源 → 矩形
    graph!.addEdge(createEdgeMetadata({
      source,
      target: { cell: relayNode.id },
      router,
      connector,
      attrs: edgeAttrs,
    }));
    // 矩形 → 目标
    graph!.addEdge(createEdgeMetadata({
      source: { cell: relayNode.id },
      target,
      router,
      connector,
      attrs: edgeAttrs,
    }));
    // 移除原连线
    edge.remove({ disconnect: true });
  });

  graph.cleanSelection();
  graph.select(relayNode);
  refreshSelectedCellState();
  scheduleSync();
}

/**
 * Mount bend-anchor / arrowhead tools only on the sole selected edge.
 * Hover-mounted `vertices` tools capture the first click as "add vertex"
 * (black dots) and prevent a clean edge selection for the inspector.
 */
function syncEdgeTools() {
  if (!graph) return;
  const selected = graph.getSelectedCells();
  const soleEdge = selected.length === 1 && graph.isEdge(selected[0])
    ? selected[0]
    : null;

  for (const edge of graph.getEdges()) {
    const view = graph.findViewByCell(edge);
    if (!view) continue;
    if (!isEditable.value || !soleEdge || edge.id !== soleEdge.id) {
      view.removeTools();
      continue;
    }
    // 直线（自由锚点）路由器：端点可铆钉在节点任意位置，使用自由锚点箭头工具。
    // 纯直线路由器：端点始终为自由点，不绑定任何节点，使用纯直线箭头工具。
    // 其他路由器（智能正交/正交）：端点吸附到节点边界，使用吸附箭头工具。
    const edgeRouter = edge.getRouter();
    const edgeRouterName = typeof edgeRouter === 'string'
      ? edgeRouter
      : (edgeRouter?.name ?? '');
    const useFreeAnchor = !isMindmap.value && edgeRouterName === STRAIGHT_ROUTER_NAME;
    const usePlain = !isMindmap.value && edgeRouterName === LINE_ROUTER_NAME;
    const sourceTool = isMindmap.value
      ? 'source-arrowhead'
      : useFreeAnchor
        ? BOARD_FREE_SOURCE_ARROWHEAD_TOOL
        : usePlain
          ? BOARD_PLAIN_SOURCE_ARROWHEAD_TOOL
          : BOARD_SOURCE_ARROWHEAD_TOOL;
    const targetTool = isMindmap.value
      ? 'target-arrowhead'
      : useFreeAnchor
        ? BOARD_FREE_TARGET_ARROWHEAD_TOOL
        : usePlain
          ? BOARD_PLAIN_TARGET_ARROWHEAD_TOOL
          : BOARD_TARGET_ARROWHEAD_TOOL;
    const items: Array<{ name: string; args?: Record<string, unknown> }> = [
      { name: 'vertices' },
      { name: sourceTool },
      { name: targetTool },
    ];
    // Mindmap: delete via selection + Delete/toolbar, not an on-edge remove button.
    if (!isMindmap.value) {
      // 在连线中点添加「插入环节」按钮（+ 图标）
      items.push({
        name: 'button',
        args: {
          distance: 0.5,
          offset: 0,
          markup: [
            {
              tagName: 'circle',
              selector: 'button',
              attrs: { r: 9, fill: '#52616b', cursor: 'pointer' },
            },
            {
              tagName: 'path',
              selector: 'icon',
              attrs: {
                d: 'M -4 0 L 4 0 M 0 -4 L 0 4',
                fill: 'none',
                stroke: '#FFFFFF',
                'stroke-width': 2,
                'pointer-events': 'none',
              },
            },
          ],
          onClick: ({ cell }: { cell: Edge }) => insertRelayOnEdge(cell),
        },
      });
      items.push({ name: 'button-remove', args: { distance: -30 } });
    }
    view.addTools({ items });
  }
}

function scheduleSync() {
  if (!graph || isApplyingExternalData) return;
  if (isApplyingMindmapDragPreview()) return;

  refreshSelectedCellState();

  if (isUserInteracting) {
    pendingSyncAfterInteraction = true;
    if (syncTimer !== null) {
      window.clearTimeout(syncTimer);
      syncTimer = null;
    }
    return;
  }

  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
  }

  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    if (isUserInteracting) {
      pendingSyncAfterInteraction = true;
      return;
    }
    emitGraphData();
  }, 120);
}

function startUserInteraction() {
  isUserInteracting = true;
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }
}

function finishUserInteraction() {
  const shouldSync = pendingSyncAfterInteraction;
  isUserInteracting = false;
  pendingSyncAfterInteraction = false;

  if (shouldSync) {
    refreshSelectedCellState();
    emitGraphData();
    return;
  }

  refreshSelectedCellState();
}

function applyGraphData(data?: GraphData, fitView = false) {
  if (!graph) return;

  const normalized = normalizeGraphData(data);
  // 画板：把历史遗留的「悬空」自由点端点吸附回最近节点边界，统一端点样式。
  const normalizedData = isMindmap.value ? normalized : snapFreeEdgeTerminals(normalized);
  loadOperationHistory(normalizedData);
  lastCommittedOperationSnapshot = operationSnapshotKey(createOperationSnapshot(normalizedData));
  pendingOperationLabel = null;
  pendingOperationBefore = null;
  const incomingUml = (data as Record<string, any> | undefined)?.uml;
  if (incomingUml) {
    objectModelStore.replaceModel(incomingUml);
  }
  const structuralSnapshot = JSON.stringify(stripVolatileCellContent(normalizedData));
  const snapshot = JSON.stringify(normalizedData);

  // Same topology: only patch cell content bindings, keep selection/hit targets.
  if (structuralSnapshot === lastStructuralSnapshot && graph.getCellCount() > 0) {
    patchCellContentFromGraphData(normalizedData);
    lastSerializedSnapshot = snapshot;
    refreshSelectedCellState();
    return;
  }

  if (snapshot === lastSerializedSnapshot) {
    refreshSelectedCellState();
    return;
  }

  isApplyingExternalData = true;
  isUserInteracting = false;
  pendingSyncAfterInteraction = false;
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }
  lastSerializedSnapshot = snapshot;
  lastStructuralSnapshot = structuralSnapshot;
  graph.fromJSON({ cells: normalizedData.cells ?? [] });
  restoreLoadedNodeWorldPositions(normalizedData);
  const migratedBoardReferenceInterfaces = ensureBoardReferenceInterfacePorts();
  graph.cleanSelection();
  graph.getEdges().forEach((edge) => ensureEdgeHitTarget(edge));
  syncTaskFlowEdgeState();
  if (isMindmap.value) {
    fitAllMindmapNodesToText(graph.getNodes());
    layoutMindmapGraph(graph, readMindmapDirection(props.graphData));
  }
  void syncMindmapGraphStateWithOutlines();

  // Hide SVG labels for rich-text nodes after loading
  graph.getNodes().forEach(n => {
    const d = n.getData<Record<string, any>>() ?? {};
    if (d.textMode === 'rich') {
      n.attr('label/visibility', 'hidden');
    }
  });

  refreshSelectedCellState();
  updateNodeOverlays();
  syncEdgeTools();

  nextTick(() => {
    if (!graph) return;
    if (isMindmap.value) {
      applyMindmapGraphState();
    }
    if (fitView) {
      if (graph.getCellCount() > 0) {
        graph.zoomToFit({ padding: 24, maxScale: 1 });
        graph.centerContent();
      } else {
        graph.zoomTo(1);
      }
    }
    isApplyingExternalData = false;
    if (isMindmap.value || migratedBoardReferenceInterfaces) {
      const laidOut = normalizeGraphData(serializeGraphData());
      const laidOutSnapshot = JSON.stringify(laidOut);
      if (laidOutSnapshot !== snapshot) {
        lastSerializedSnapshot = laidOutSnapshot;
        lastStructuralSnapshot = JSON.stringify(stripVolatileCellContent(laidOut));
        emit('graph-data-change', laidOut);
      }
    }
  });
}

function patchCellContentFromGraphData(data: GraphData) {
  if (!graph) return;
  const cells = [
    ...(Array.isArray(data.cells) ? data.cells : []),
    ...(Array.isArray(data.nodes) ? data.nodes : []),
    ...(Array.isArray(data.edges) ? data.edges : []),
  ];
  const seen = new Set<string>();
  for (const cell of cells) {
    const id = typeof cell.id === 'string' ? cell.id : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const graphCell = graph.getCellById(id);
    if (!graphCell) continue;
    const incoming = (cell as CellData).data;
    if (!incoming || typeof incoming !== 'object') continue;
    graphCell.updateData(cellContentBindingToData(
      readCellContentBinding(incoming as Record<string, unknown>),
    ));
  }
}

function getCanvasCenter() {
  if (!graph || !stageRef.value) return { x: 120, y: 120 };
  const rect = stageRef.value.getBoundingClientRect();
  const point = graph.clientToLocal(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return {
    x: Math.max(40, point.x - 80),
    y: Math.max(40, point.y - 32),
  };
}

function getSelectionBounds(cells: Array<Node | Edge>) {
  if (!cells.length) return null;

  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  cells.forEach((cell) => {
    try {
      const box = cell.getBBox();
      boxes.push({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
    } catch {
      // ignore cells that cannot provide a usable bounding box
    }
  });

  if (!boxes.length) return null;

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function offsetCellPosition(cell: CellData, offsetX: number, offsetY: number): CellData {
  const nextCell = JSON.parse(JSON.stringify(cell)) as CellData;

  if (typeof nextCell.x === 'number') {
    nextCell.x += offsetX;
  }
  if (isPlainObject(nextCell.position)) {
    nextCell.position = {
      ...nextCell.position,
      ...(typeof nextCell.position.x === 'number' ? { x: nextCell.position.x + offsetX } : {}),
      ...(typeof nextCell.position.y === 'number' ? { y: nextCell.position.y + offsetY } : {}),
    };
  }
  if (typeof nextCell.style?.x === 'number') {
    nextCell.style.x += offsetX;
  }

  if (typeof nextCell.y === 'number') {
    nextCell.y += offsetY;
  }
  if (typeof nextCell.style?.y === 'number') {
    nextCell.style.y += offsetY;
  }

  if (Array.isArray(nextCell.vertices)) {
    nextCell.vertices = nextCell.vertices.map((vertex: Record<string, any>) => ({
      ...vertex,
      ...(typeof vertex.x === 'number' ? { x: vertex.x + offsetX } : {}),
      ...(typeof vertex.y === 'number' ? { y: vertex.y + offsetY } : {}),
    }));
  }

  if (Array.isArray(nextCell.labels)) {
    nextCell.labels = nextCell.labels.map((label: Record<string, any>) => {
      if (!label || typeof label !== 'object') return label;
      const nextLabel = { ...label };
      if (typeof nextLabel.offset === 'object' && nextLabel.offset) {
        nextLabel.offset = {
          ...nextLabel.offset,
          ...(typeof nextLabel.offset.x === 'number' ? { x: nextLabel.offset.x + offsetX } : {}),
          ...(typeof nextLabel.offset.y === 'number' ? { y: nextLabel.offset.y + offsetY } : {}),
        };
      }
      return nextLabel;
    });
  }

  const translateTerminal = (terminal: unknown) => {
    if (!terminal || typeof terminal !== 'object') return terminal;
    const nextTerminal = terminal as Record<string, any>;
    if (typeof nextTerminal.cell === 'string') return nextTerminal;

    return {
      ...nextTerminal,
      ...(typeof nextTerminal.x === 'number' ? { x: nextTerminal.x + offsetX } : {}),
      ...(typeof nextTerminal.y === 'number' ? { y: nextTerminal.y + offsetY } : {}),
    };
  };

  if (nextCell.source) {
    nextCell.source = translateTerminal(nextCell.source);
  }

  if (nextCell.target) {
    nextCell.target = translateTerminal(nextCell.target);
  }

  return nextCell;
}

/** Build a clean GraphData from the currently selected cells (normalised, no blueprint meta). */
function buildMaterialGraphData(): GraphData | null {
  if (!graph) return null;

  const selectedCells = graph.getSelectedCells();
  if (!selectedCells.length) return null;

  const selectedNodesMap = new Map<string, Node>();
  const selectedEdgesMap = new Map<string, Edge>();

  selectedCells.forEach((cell) => {
    if (graph?.isNode(cell)) {
      selectedNodesMap.set(cell.id, cell);
      return;
    }

    if (graph?.isEdge(cell)) {
      selectedEdgesMap.set(cell.id, cell);
      const sourceNode = cell.getSourceNode();
      const targetNode = cell.getTargetNode();
      if (sourceNode) selectedNodesMap.set(sourceNode.id, sourceNode);
      if (targetNode) selectedNodesMap.set(targetNode.id, targetNode);
    }
  });

  const selectedNodeIds = new Set(selectedNodesMap.keys());

  graph.getEdges().forEach((edge) => {
    const sourceNode = edge.getSourceNode();
    const targetNode = edge.getTargetNode();
    if (!sourceNode || !targetNode) return;
    if (!selectedNodeIds.has(sourceNode.id) || !selectedNodeIds.has(targetNode.id)) return;
    selectedEdgesMap.set(edge.id, edge);
  });

  const selectedNodes = Array.from(selectedNodesMap.values());
  const selectedEdges = Array.from(selectedEdgesMap.values()).filter((edge) => {
    const sourceNode = edge.getSourceNode();
    const targetNode = edge.getTargetNode();
    if (!sourceNode || !targetNode) return false;
    return selectedNodeIds.has(sourceNode.id) && selectedNodeIds.has(targetNode.id);
  });

  if (!selectedNodes.length) return null;

  const nodeData = selectedNodes.map((node) => ({ id: node.id, ...node.toJSON() }));
  const edgeData = selectedEdges.map((edge) => ({ id: edge.id, ...edge.toJSON() }));

  const raw = { cells: [...nodeData, ...edgeData], nodes: nodeData, edges: edgeData } as unknown as GraphData
  return normalizeGraphData(raw)
}

type ExtractedBoardInterfaceDirection = 'in' | 'out';

interface ExtractedBoardInterfaceData {
  direction: ExtractedBoardInterfaceDirection;
  externalCellId: string;
  externalLabel: string;
  originalTerminal: unknown;
  side: BoardInterfaceSide;
  ratio: number;
  portId: string;
}

/** Upgrade references extracted before dedicated border ports were introduced. */
function ensureBoardReferenceInterfacePorts(): boolean {
  if (!graph) return false;
  let changed = false;
  graph.getNodes().forEach((node) => {
    const data = node.getData<Record<string, unknown>>() ?? {};
    if (!data.extractedBoardReference || !Array.isArray(data.extractedInterfaces)) return;
    const rawItems = data.extractedInterfaces.filter((item): item is Record<string, unknown> => (
      Boolean(item) && typeof item === 'object'
    ));
    if (!rawItems.length) return;
    const normalizedItems = rawItems.flatMap((item, index) => {
      const nested = item.boardInterface && typeof item.boardInterface === 'object'
        ? item.boardInterface as Record<string, unknown>
        : {};
      const edgeId = typeof item.edgeId === 'string' ? item.edgeId : '';
      if (!edgeId) return [];
      const direction: ExtractedBoardInterfaceDirection = item.direction === 'in' || nested.direction === 'in'
        ? 'in'
        : 'out';
      const rawSide = item.side ?? nested.side;
      const side: BoardInterfaceSide = ['top', 'right', 'bottom', 'left'].includes(String(rawSide))
        ? rawSide as BoardInterfaceSide
        : direction === 'in' ? 'left' : 'right';
      const rawRatio = typeof item.ratio === 'number'
        ? item.ratio
        : typeof nested.ratio === 'number' ? nested.ratio : (index + 1) / (rawItems.length + 1);
      const ratio = Math.min(0.92, Math.max(0.08, rawRatio));
      const portId = typeof item.portId === 'string'
        ? item.portId
        : typeof nested.portId === 'string' ? nested.portId : `board-interface-${edgeId}`;
      return [{ ...item, edgeId, portId, direction, side, ratio }];
    });
    if (!normalizedItems.length) return;

    const needsMigration = JSON.stringify(normalizedItems) !== JSON.stringify(rawItems);
    const interfacePorts = normalizedItems.map(({ portId, side, ratio }) => ({ portId, side, ratio }));
    node.setProp('ports', createBoardReferencePorts(interfacePorts));
    normalizedItems.forEach((item) => {
      const edge = graph?.getCellById(item.edgeId);
      if (!edge || !graph?.isEdge(edge)) return;
      const source = edge.getSource();
      const target = edge.getTarget();
      if (
        getCellIdFromTerminal(source) === node.id
        && (source as unknown as Record<string, unknown>).port !== item.portId
      ) {
        edge.setSource({ ...source, cell: node.id, port: item.portId });
        changed = true;
      }
      if (
        getCellIdFromTerminal(target) === node.id
        && (target as unknown as Record<string, unknown>).port !== item.portId
      ) {
        edge.setTarget({ ...target, cell: node.id, port: item.portId });
        changed = true;
      }
    });
    if (needsMigration) {
      node.setData({ ...data, extractedInterfaces: normalizedItems });
      changed = true;
    }
  });
  return changed;
}

function resolveBoardInterfaceDock(
  point: { x: number; y: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { side: BoardInterfaceSide; ratio: number } {
  const overflows: Array<{ side: BoardInterfaceSide; distance: number }> = [
    { side: 'left', distance: bounds.minX - point.x },
    { side: 'right', distance: point.x - bounds.maxX },
    { side: 'top', distance: bounds.minY - point.y },
    { side: 'bottom', distance: point.y - bounds.maxY },
  ];
  const side = overflows.sort((left, right) => right.distance - left.distance)[0]?.side ?? 'right';
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const rawRatio = side === 'left' || side === 'right'
    ? (point.y - bounds.minY) / height
    : (point.x - bounds.minX) / width;
  return { side, ratio: Math.min(0.92, Math.max(0.08, rawRatio)) };
}

function getCellIdFromTerminal(terminal: unknown): string {
  if (typeof terminal === 'string') return terminal;
  if (!terminal || typeof terminal !== 'object') return '';
  const cell = (terminal as Record<string, unknown>).cell;
  return typeof cell === 'string' ? cell : '';
}

function getBoardNodeLabel(node: Node): string {
  const attrLabel = node.attr('label/text');
  if (typeof attrLabel === 'string' && attrLabel.trim()) return attrLabel.trim();
  const data = node.getData<Record<string, unknown>>() ?? {};
  for (const key of ['label', 'title', 'name']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return node.id;
}

function computeExternalInterfacePoint(
  internalNode: Node,
  externalNode: Node,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { x: number; y: number } {
  const internalBox = internalNode.getBBox();
  const externalBox = externalNode.getBBox();
  const start = {
    x: internalBox.x + internalBox.width / 2,
    y: internalBox.y + internalBox.height / 2,
  };
  const end = {
    x: externalBox.x + externalBox.width / 2,
    y: externalBox.y + externalBox.height / 2,
  };
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) dx = 1;

  const margin = 56;
  const candidates: number[] = [];
  if (dx > 0) candidates.push((bounds.maxX + margin - start.x) / dx);
  if (dx < 0) candidates.push((bounds.minX - margin - start.x) / dx);
  if (dy > 0) candidates.push((bounds.maxY + margin - start.y) / dy);
  if (dy < 0) candidates.push((bounds.minY - margin - start.y) / dy);
  const positive = candidates.filter((value) => Number.isFinite(value) && value > 0);
  const scale = positive.length ? Math.min(...positive) : 1;
  return {
    x: start.x + dx * scale,
    y: start.y + dy * scale,
  };
}

function offsetExtractedTerminal(terminal: unknown, dx: number, dy: number): unknown {
  if (!terminal || typeof terminal !== 'object') return terminal;
  const value = terminal as Record<string, unknown>;
  if (typeof value.cell === 'string') return terminal;
  if (typeof value.x === 'number' && typeof value.y === 'number') {
    return { ...value, x: value.x + dx, y: value.y + dy };
  }
  return terminal;
}

interface FrozenExtractedNodeLayout {
  node: Node;
  position: { x: number; y: number };
  size: { width: number; height: number };
  parentId: string;
  depth: number;
  order: number;
}

/** Freeze every selected node in absolute graph coordinates before serialization. */
function freezeExtractedNodeLayouts(
  selectedNodes: Map<string, Node>,
): FrozenExtractedNodeLayout[] {
  const selectedIds = new Set(selectedNodes.keys());
  return [...selectedNodes.values()].map((node, order) => {
    const position = node.getPosition();
    const size = node.getSize();
    const parent = node.getParent();
    const parentId = parent && selectedIds.has(parent.id) ? parent.id : '';
    let depth = 0;
    let ancestor = parent;
    const visited = new Set<string>([node.id]);
    while (ancestor && selectedIds.has(ancestor.id) && !visited.has(ancestor.id)) {
      visited.add(ancestor.id);
      depth += 1;
      ancestor = ancestor.getParent();
    }
    return {
      node,
      position: { x: position.x, y: position.y },
      size: { width: size.width, height: size.height },
      parentId,
      depth,
      order,
    };
  });
}

/** Re-assert serialized absolute positions after X6 restores embed relations. */
function restoreLoadedNodeWorldPositions(data: GraphData) {
  if (!graph) return;
  const positions = new Map(
    data.nodes.map((node) => [node.id, getCellPosition(node as CellData)]),
  );
  graph.getNodes().forEach((node) => {
    const expected = positions.get(node.id);
    if (!expected) return;
    const actual = node.getPosition();
    if (actual.x === expected.x && actual.y === expected.y) return;
    node.setPosition(expected.x, expected.y);
  });
}

function collectExtractableSelectedNodes(g: Graph): Map<string, Node> {
  const selectedNodes = new Map<string, Node>();
  g.getSelectedCells().forEach((cell) => {
    if (g.isNode(cell)) {
      selectedNodes.set(cell.id, cell as Node);
      return;
    }
    // Rubberband selection can contain a crossing edge even when one of its
    // endpoint nodes is only partially covered. Treat an explicitly selected
    // edge and both endpoints as one extractable unit so mixed selections do
    // not silently lose the endpoint node.
    if (!g.isEdge(cell)) return;
    const sourceNode = cell.getSourceNode();
    const targetNode = cell.getTargetNode();
    if (sourceNode) selectedNodes.set(sourceNode.id, sourceNode);
    if (targetNode) selectedNodes.set(targetNode.id, targetNode);
  });

  // Expand every selected group/container after collecting direct selections
  // and edge endpoints. The queue also handles nested containers reliably.
  const pending = [...selectedNodes.values()];
  for (let index = 0; index < pending.length; index += 1) {
    const node = pending[index];
    if (!isBoardGroupNode(node) && !isNodeContainer(node)) continue;
    node.getDescendants({ deep: true }).forEach((descendant) => {
      if (!g.isNode(descendant) || selectedNodes.has(descendant.id)) return;
      selectedNodes.set(descendant.id, descendant as Node);
      pending.push(descendant as Node);
    });
  }
  return selectedNodes;
}

/** Build a standalone board from selected nodes, converting crossing edges into reusable interfaces. */
function buildSelectionBoardGraphData(): GraphData | null {
  if (!graph) return null;
  const g = graph;
  const selectedNodes = collectExtractableSelectedNodes(g);
  if (!selectedNodes.size) return null;

  const nodeIds = new Set(selectedNodes.keys());
  const frozenLayouts = freezeExtractedNodeLayouts(selectedNodes);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  frozenLayouts.forEach(({ position, size }) => {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + size.width);
    maxY = Math.max(maxY, position.y + size.height);
  });
  const bounds = { minX, minY, maxX, maxY };

  const nodeData = frozenLayouts
    .slice()
    .sort((left, right) => left.depth - right.depth || left.order - right.order)
    .map(({ node, position, parentId }) => {
      const data = { id: node.id, ...node.toJSON() } as CellData;
      if (parentId) data.parent = parentId;
      else delete data.parent;
      data.x = position.x;
      data.y = position.y;
      data.position = {
        ...(data.position as Record<string, unknown> | undefined),
        x: position.x,
        y: position.y,
      };
      return data;
    });

  const edgeData: CellData[] = [];
  g.getEdges().forEach((edge) => {
    const sourceNode = edge.getSourceNode();
    const targetNode = edge.getTargetNode();
    if (!sourceNode || !targetNode) return;
    const sourceInside = nodeIds.has(sourceNode.id);
    const targetInside = nodeIds.has(targetNode.id);
    if (!sourceInside && !targetInside) return;

    const json = { id: edge.id, ...edge.toJSON() } as CellData;
    if (sourceInside && targetInside) {
      edgeData.push(json);
      return;
    }

    const direction: ExtractedBoardInterfaceDirection = sourceInside ? 'out' : 'in';
    const internalNode = sourceInside ? sourceNode : targetNode;
    const externalNode = sourceInside ? targetNode : sourceNode;
    const interfacePoint = computeExternalInterfacePoint(internalNode, externalNode, bounds);
    const dock = resolveBoardInterfaceDock(interfacePoint, bounds);
    const originalTerminal = direction === 'out' ? json.target : json.source;
    const interfaceData: ExtractedBoardInterfaceData = {
      direction,
      externalCellId: externalNode.id,
      externalLabel: getBoardNodeLabel(externalNode),
      originalTerminal,
      side: dock.side,
      ratio: dock.ratio,
      portId: `board-interface-${edge.id}`,
    };
    const existingData = json.data && typeof json.data === 'object' ? json.data : {};
    json.data = { ...existingData, boardInterface: interfaceData };
    if (direction === 'out') json.target = interfacePoint;
    else json.source = interfacePoint;
    json.vertices = [];
    const interfaceLabel = `接口：${interfaceData.externalLabel}`;
    json.labels = [
      ...((Array.isArray(json.labels) ? json.labels : []) as Array<Record<string, unknown>>),
      {
        attrs: { label: { text: interfaceLabel, fill: '#6d28d9', fontSize: 12 } },
        position: { distance: direction === 'out' ? 0.78 : 0.22 },
      },
    ];
    const attrs = json.attrs && typeof json.attrs === 'object' ? json.attrs : {};
    const line = (attrs as Record<string, any>).line ?? {};
    json.attrs = {
      ...attrs,
      line: { ...line, stroke: '#7c3aed', strokeDasharray: '7 4' },
    };
    edgeData.push(json);
  });

  // Normalize the extracted component near the new board's top-left while preserving layout.
  const offsetX = 120 - minX;
  const offsetY = 120 - minY;
  nodeData.forEach((node) => {
    const x = typeof node.x === 'number' ? node.x + offsetX : offsetX;
    const y = typeof node.y === 'number' ? node.y + offsetY : offsetY;
    node.x = x;
    node.y = y;
    node.position = { ...(node.position as Record<string, unknown> | undefined), x, y };
  });
  edgeData.forEach((edge) => {
    edge.source = offsetExtractedTerminal(edge.source, offsetX, offsetY) as CellData['source'];
    edge.target = offsetExtractedTerminal(edge.target, offsetX, offsetY) as CellData['target'];
    if (Array.isArray(edge.vertices)) {
      edge.vertices = edge.vertices.map((vertex) => ({
        ...vertex,
        x: typeof vertex.x === 'number' ? vertex.x + offsetX : vertex.x,
        y: typeof vertex.y === 'number' ? vertex.y + offsetY : vertex.y,
      }));
    }
  });

  const normalized = normalizeGraphData({
    cells: [...nodeData, ...edgeData],
    nodes: nodeData,
    edges: edgeData,
  } as unknown as GraphData);
  const expectedById = new Map(nodeData.map((node) => [node.id, getCellPosition(node)]));
  const lockPosition = (cell: CellData) => {
    const expected = expectedById.get(cell.id);
    if (!expected) return;
    cell.x = expected.x;
    cell.y = expected.y;
    cell.position = {
      ...(cell.position as Record<string, unknown> | undefined),
      x: expected.x,
      y: expected.y,
    };
  };
  normalized.nodes.forEach((node) => lockPosition(node as CellData));
  normalized.cells?.forEach((cell) => lockPosition(cell as CellData));
  return normalized;
}

/** Replace the extracted source selection with one navigable page-reference node. */
function replaceSelectionWithBoardReference(
  pageId: string,
  pageTitle: string,
  extractedData: GraphData,
): Node | null {
  if (!graph || !isEditable.value) return null;
  const g = graph;
  const selectedNodes = collectExtractableSelectedNodes(g);
  if (!selectedNodes.size) return null;
  const selectedIds = new Set(selectedNodes.keys());

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  selectedNodes.forEach((node) => {
    const box = node.getBBox();
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  });

  const boundaryEdges: Array<{
    edge: Edge;
    direction: ExtractedBoardInterfaceDirection;
  }> = [];
  const internalEdges: Edge[] = [];
  g.getEdges().forEach((edge) => {
    const sourceId = getCellIdFromTerminal(edge.getSource());
    const targetId = getCellIdFromTerminal(edge.getTarget());
    const sourceInside = selectedIds.has(sourceId);
    const targetInside = selectedIds.has(targetId);
    if (sourceInside && targetInside) internalEdges.push(edge);
    else if (sourceInside !== targetInside) {
      boundaryEdges.push({ edge, direction: sourceInside ? 'out' : 'in' });
    }
  });

  const refWidth = 240;
  const refHeight = 84;
  const refId = createId('board-page-ref');
  const interfaceSummary = extractedData.edges
    .map((edge) => {
      const boardInterface = edge.data?.boardInterface as ExtractedBoardInterfaceData | undefined;
      return {
        edgeId: edge.id,
        portId: boardInterface?.portId ?? `board-interface-${edge.id}`,
        direction: boardInterface?.direction,
        side: boardInterface?.side,
        ratio: boardInterface?.ratio,
        boardInterface,
      };
    })
    .filter((item) => item.boardInterface && typeof item.boardInterface === 'object');
  const interfacePorts = interfaceSummary.flatMap((item) => (
    item.side && typeof item.ratio === 'number'
      ? [{ portId: item.portId, side: item.side, ratio: item.ratio }]
      : []
  ));
  const interfacesByEdgeId = new Map(interfaceSummary.map((item) => [item.edgeId, item]));

  markBoardOperation('提取为画板页');
  g.startBatch('extract-selection-as-board-page');
  let referenceNode: Node | null = null;
  try {
    referenceNode = g.addNode({
      id: refId,
      shape: 'rect',
      x: minX + Math.max(0, (maxX - minX - refWidth) / 2),
      y: minY + Math.max(0, (maxY - minY - refHeight) / 2),
      width: refWidth,
      height: refHeight,
      ports: createBoardReferencePorts(interfacePorts),
      attrs: {
        body: {
          fill: '#f5f3ff',
          stroke: '#7c3aed',
          strokeWidth: 2,
          strokeDasharray: '7 4',
          rx: 14,
          ry: 14,
        },
        label: {
          text: `画板引用：${pageTitle}`,
          fill: '#5b21b6',
          fontSize: 13,
          fontWeight: 600,
          textWrap: { width: refWidth - 24, height: refHeight - 16, ellipsis: true },
        },
      },
      data: {
        refBlockId: pageId,
        refType: 'page',
        refKind: 'block-ref',
        boardReferenceDisplay: 'card',
        extractedBoardReference: true,
        extractedNodeCount: extractedData.nodes.length,
        extractedInterfaces: interfaceSummary,
      },
    });

    // Preserve the source graph's external connectivity by reconnecting every
    // crossing edge to the new reference node before the extracted nodes leave.
    boundaryEdges.forEach(({ edge, direction }) => {
      const boardInterface = interfacesByEdgeId.get(edge.id);
      const terminal = boardInterface?.portId
        ? { cell: refId, port: boardInterface.portId }
        : { cell: refId };
      if (direction === 'out') edge.setSource(terminal);
      else edge.setTarget(terminal);
    });

    // Detach selected nodes from any non-selected parent so that removing them
    // cannot leave stale child references on the surviving container.
    const survivingParents = new Set<Node>();
    selectedNodes.forEach((node) => {
      const parent = node.getParent();
      if (parent && g.isNode(parent) && !selectedIds.has(parent.id)) {
        parent.unembed(node);
        survivingParents.add(parent as Node);
      }
    });
    g.removeCells([...internalEdges, ...selectedNodes.values()]);
    survivingParents.forEach((parent) => {
      if (isBoardGroupNode(parent)) fitBoardGroupContainer(parent);
      else if (isNodeContainer(parent)) fitNodeContainer(parent);
    });
    dissolveDegradedBoardGroups();
    g.resetSelection([referenceNode]);
  } finally {
    g.stopBatch('extract-selection-as-board-page');
  }

  refreshSelectedCellState();
  updateNodeOverlays();
  emitGraphData();
  return referenceNode;
}

function getRefInsertPosition() {
  if (!graph) return getCanvasCenter();

  const currentGraph = graph;
  const selectedCells = currentGraph.getSelectedCells();
  const bounds = getSelectionBounds(selectedCells.filter((cell): cell is Node | Edge => currentGraph.isNode(cell) || currentGraph.isEdge(cell)));
  if (!bounds) return getCanvasCenter();

  return {
    x: bounds.maxX + 48,
    y: bounds.minY + Math.max(0, bounds.height / 2 - 32),
  };
}

function addMindmapChildNode() {
  if (!graph || !isEditable.value || !isMindmap.value) return;
  addMindmapChild(graph);
  refreshSelectedCellState();
  emitGraphData();
}

function addMindmapSiblingNode() {
  if (!graph || !isEditable.value || !isMindmap.value) return;
  addMindmapSibling(graph);
  refreshSelectedCellState();
  emitGraphData();
}

function relayoutMindmap() {
  if (!graph || !isMindmap.value) return;
  syncMindmapGraphState();
  scheduleSync();
}

function buildBoardNodeMetadata(preset: NodePreset, position: { x: number; y: number }): CellData {
  if (isTaskFlow.value) {
    if (preset === 'ellipse') {
      return createNodeMetadata('ellipse', {
        x: position.x,
        y: position.y,
        width: 136,
        height: 64,
        label: '开始',
        data: {
          preset: 'ellipse',
          taskRole: 'start',
          taskStatus: 'ready',
        },
      });
    }
    return createTaskNode({
      x: position.x,
      y: position.y,
    });
  }
  return createNodeMetadata(preset, {
    x: position.x,
    y: position.y,
  });
}

/**
 * Insert a board shape.
 * @param position top-left in graph space, or when `centerAt` the intended center of the node.
 */
function addNode(
  preset: NodePreset,
  position?: { x: number; y: number },
  options?: { centerAt?: boolean },
) {
  if (!graph || !isEditable.value) return;
  markBoardOperation(isMindmap.value ? '添加思维导图节点' : '添加节点');
  if (isMindmap.value) {
    addMindmapChildNode();
    return;
  }
  const draft = buildBoardNodeMetadata(preset, { x: 0, y: 0 });
  const width = typeof draft.width === 'number' ? draft.width : 160;
  const height = typeof draft.height === 'number' ? draft.height : 64;
  let topLeft = position ?? getCanvasCenter();
  if (position && options?.centerAt) {
    topLeft = {
      x: position.x - width / 2,
      y: position.y - height / 2,
    };
  }
  const node = graph.addNode(buildBoardNodeMetadata(preset, topLeft));
  graph.cleanSelection();
  graph.select(node);
  refreshSelectedCellState();
  scheduleSync();
  // 工具栏按钮点击会把焦点移出画布，而 X6 Keyboard 绑定在 graph 容器上，
  // 焦点丢失后 Ctrl+Z/Delete/方向键等快捷键无法触发。添加后把焦点还给画布。
  graph.container?.focus({ preventScroll: true });
}

function onShapeButtonClick(preset: NodePreset) {
  if (suppressShapeButtonClick) return;
  addNode(preset);
}

// --- 直线连线绘制模式（参照 Excalidraw） ---

const isStraightLineMode = ref(false);
let straightLinePreviewEdge: Edge | null = null;

/** 切换直线绘制模式。 */
function toggleStraightLineMode() {
  if (isStraightLineMode.value) {
    exitStraightLineMode();
  } else {
    enterStraightLineMode();
  }
}

function enterStraightLineMode() {
  if (!graph || isMindmap.value) return;
  isStraightLineMode.value = true;
  applyCanvasInteractionMode();
}

function exitStraightLineMode() {
  if (!isStraightLineMode.value) return;
  isStraightLineMode.value = false;
  cancelStraightLinePreview();
  applyCanvasInteractionMode();
}

function cancelStraightLinePreview() {
  if (straightLinePreviewEdge) {
    straightLinePreviewEdge.remove({ disconnect: true });
    straightLinePreviewEdge = null;
  }
}

/**
 * 根据画布坐标构造连线端子。
 * 命中节点 → 按比例绑定到节点（topLeft 锚点 + dx/dy）；未命中 → 自由点 {x, y}。
 */
function terminalAtPoint(
  x: number,
  y: number,
  excludeCellId?: string,
): { cell: string; anchor: { name: string; args: { dx: number; dy: number } }; connectionPoint: { name: string } } | { x: number; y: number } {
  if (!graph) return { x, y };
  const views = graph.renderer.findViewsInArea(
    { x: x - 1, y: y - 1, width: 2, height: 2 },
    { nodeOnly: true },
  );
  for (const view of views) {
    const node = view.cell;
    if (excludeCellId && node.id === excludeCellId) continue;
    if (isBoardGroupNodeData(node.getData() ?? {})) continue;
    const bbox = node.getBBox();
    if (x < bbox.x || x > bbox.x + bbox.width || y < bbox.y || y > bbox.y + bbox.height) continue;
    const width = bbox.width || 1;
    const height = bbox.height || 1;
    const dx = Math.max(0, Math.min(1, (x - bbox.x) / width));
    const dy = Math.max(0, Math.min(1, (y - bbox.y) / height));
    return {
      cell: node.id,
      anchor: { name: 'topLeft', args: { dx, dy } },
      connectionPoint: { name: 'anchor' },
    };
  }
  return { x, y };
}

/** 直线模式点击：第一次设起点并创建预览，第二次设终点并完成。 */
function handleStraightLineClick(x: number, y: number) {
  if (!graph) return;

  if (!straightLinePreviewEdge) {
    const startTerminal = terminalAtPoint(x, y);
    straightLinePreviewEdge = graph.createEdge(createEdgeMetadata({
      source: startTerminal,
      target: { x, y },
      // 直线工具默认生成「纯直线」：端点始终为自由点、不绑定节点/锚点、不响应节点移动。
      router: { name: LINE_ROUTER_NAME },
      attrs: {
        line: { strokeDasharray: '6 4', opacity: 0.6 },
      },
    }));
  } else {
    const endTerminal = terminalAtPoint(x, y);
    straightLinePreviewEdge.setTerminal('target', endTerminal);
    straightLinePreviewEdge.attr('line/strokeDasharray', '');
    straightLinePreviewEdge.attr('line/opacity', 1);
    // graph.createEdge 只创建游离的 Edge 对象，不会进入画布模型；
    // 这里把它真正加入模型，直线才会显示，并纳入历史记录（可 Ctrl+Z 撤销）。
    graph.addEdge(straightLinePreviewEdge);
    straightLinePreviewEdge = null;
    scheduleSync();
  }
}

/** 直线模式鼠标移动：实时更新预览边终点。 */
function handleStraightLineMouseMove(x: number, y: number) {
  if (!straightLinePreviewEdge) return;
  const terminal = terminalAtPoint(x, y);
  straightLinePreviewEdge.setTerminal('target', terminal, { ui: true });
}

function onShapeButtonDragStart(event: DragEvent, payload: ShapeDragPayload) {
  if (!isEditable.value || isMindmap.value) {
    event.preventDefault();
    return;
  }
  beginMaterialDrag(event);
  if (event.dataTransfer) {
    event.dataTransfer.setData(X6_SHAPE_MIME, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'copy';
  }
}

function onShapeButtonDrag(event: DragEvent) {
  trackMaterialDrag(event);
}

function onShapeButtonDragEnd() {
  suppressShapeButtonClick = true;
  endMaterialDrag();
  window.setTimeout(() => {
    suppressShapeButtonClick = false;
  }, 0);
}

function onUmlShapeButtonClick() {
  if (suppressShapeButtonClick) return;
  insertUmlClassPreset();
}

function canCreateTaskFlowEdge(sourceCell: Node, targetCell: Node) {
  if (!graph || !isTaskFlow.value) return true;
  if (sourceCell.id === targetCell.id) return false;

  const sourceRole = sourceCell.getData<Record<string, any>>()?.taskRole;
  const targetRole = targetCell.getData<Record<string, any>>()?.taskRole;
  if (!sourceRole || !targetRole) return false;
  if (sourceRole === 'finish' || targetRole === 'start') return false;

  const outgoing = graph.getOutgoingEdges(sourceCell) ?? [];
  const incoming = graph.getIncomingEdges(targetCell) ?? [];
  return outgoing.length === 0 && incoming.length === 0;
}

function syncTaskFlowEdgeState() {
  if (!graph || !isTaskFlow.value) return;
  graph.getEdges().forEach((edge) => {
    edge.setLabels([]);
    edge.attr({
      line: {
        stroke: '#c97a00',
        strokeWidth: 2.4,
        targetMarker: {
          name: 'block',
          width: 10,
          height: 8,
        },
      },
    });
  });
}

function applyMindmapGraphState() {
  if (!graph || !isMindmap.value || isApplyingMindmapCollapseState()) return;
  if (isApplyingMindmapDragPreview()) return;
  syncMindmapEdgeStyles(graph);
  applyMindmapCollapseState(
    graph,
    readMindmapDirection(props.graphData),
    mindmapRefTocContext,
  );
}

function syncMindmapGraphState() {
  if (!graph || !isMindmap.value || isApplyingExternalData) return;
  if (isApplyingMindmapDragPreview()) return;
  syncMindmapEdgeStyles(graph);
}

async function syncMindmapGraphStateWithOutlines() {
  await prefetchMindmapRefOutlines();
  const currentGraph = graph;
  if (currentGraph && isMindmap.value) {
    currentGraph.getNodes().forEach((node) => {
      if (!isMindmapRefBlockNode(node)) return;
      if (readMindmapChildrenCollapsed(node, true)) return;
      materializeRefBlockTocChildrenIfNeeded(currentGraph, node, mindmapRefTocContext);
    });
  }
  if (isApplyingExternalData) return;
  applyMindmapGraphState();
}

async function syncSelectedMindmapRefBlockTocFromSource() {
  const cell = selectedCell.value;
  if (!graph || !isEditable.value || !isMindmap.value || !cell || cell.kind !== 'node' || !cell.isRefBlock) return;
  const node = graph.getCellById(cell.id);
  if (!node || !graph.isNode(node) || !isMindmapRefBlockNode(node)) return;

  const data = node.getData<Record<string, any>>() ?? {};
  const refBlockId = typeof data.refBlockId === 'string' ? data.refBlockId : '';
  const refType: 'block' | 'page' = data.refType === 'page' ? 'page' : 'block';
  if (!refBlockId) return;

  if (refType === 'page') {
    await outlineCacheStore.ensurePageOutline(refBlockId, { force: true });
  } else {
    await outlineCacheStore.ensureBlockOutline(refBlockId, { force: true });
  }

  syncMindmapRefBlockTocFromSource(
    graph,
    node,
    mindmapRefTocContext,
  );
  applyMindmapGraphState();
  refreshSelectedCellState();
  updateMindmapCollapseOverlays();
  scheduleSync();
}

async function prefetchMindmapRefOutlines() {
  if (!graph || !isMindmap.value) return;
  const pageIds = new Set<string>();
  const blockIds = new Set<string>();
  graph.getNodes().forEach((node) => {
    const data = node.getData<Record<string, any>>() ?? {};
    if (data.refKind !== 'block-ref' && !data.refBlockId) return;
    const refBlockId = typeof data.refBlockId === 'string' ? data.refBlockId : '';
    if (!refBlockId) return;
    if (data.refType === 'page') pageIds.add(refBlockId);
    else blockIds.add(refBlockId);
  });
  if (pageIds.size === 0 && blockIds.size === 0) return;
  await outlineCacheStore.prefetchBatch([...pageIds], [...blockIds]);
}

function resolveDeletableCellsForDelete() {
  const g = graph;
  if (!g) return [];
  let cells = filterDeletableCells(g.getSelectedCells());
  if (!cells.length) return [];
  if (isMindmap.value) {
    const nodes = cells.filter((cell) => g.isNode(cell)) as Node[];
    cells = expandMindmapDeleteTargets(g, nodes);
  }
  return cells;
}

function deleteSelection() {
  if (!graph || !isEditable.value) return;
  const g = graph;
  // Deleting a group container means "ungroup": dissolve it and keep members.
  const groupContainers = g.getSelectedCells().filter(
    (cell) => g.isNode(cell) && isBoardGroupNode(cell as Node),
  ) as Node[];
  // Deleting a node container means "detach": unembed children and keep them.
  const nodeContainers = g.getSelectedCells().filter(
    (cell) => g.isNode(cell) && isNodeContainer(cell as Node),
  ) as Node[];
  const cells = resolveDeletableCellsForDelete().filter(
    (cell) => !groupContainers.includes(cell as Node) && !nodeContainers.includes(cell as Node),
  );
  if (!cells.length && !groupContainers.length && !nodeContainers.length) return;
  markBoardOperation('删除对象');

  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }

  g.batchUpdate(() => {
    if (groupContainers.length) {
      groupContainers.forEach((container) => dissolveBoardGroup(container));
    }
    if (nodeContainers.length) {
      nodeContainers.forEach((container) => {
        (container.getChildren() ?? []).forEach((child) => container.unembed(child));
        container.setData({ ...container.getData(), nodeContainer: false });
        restoreNormalLabelPosition(container);
      });
    }
    if (cells.length) {
      // Unembed deleted children from their container parent first, then refit.
      const refitParents = new Set<Node>();
      cells.forEach((cell) => {
        if (!g.isNode(cell)) return;
        const parent = findNodeContainerParent(cell as Node);
        if (parent) {
          parent.unembed(cell);
          refitParents.add(parent);
        }
      });
      g.removeCells(cells);
      refitParents.forEach((p) => {
        if ((p.getChildren() ?? []).length === 0) {
          p.setData({ ...p.getData(), nodeContainer: false });
        } else {
          fitNodeContainer(p);
        }
      });
    }
  });
  // Members deleted elsewhere may leave degraded groups (<2 members) behind.
  dissolveDegradedBoardGroups();
  g.cleanSelection();
  refreshSelectedCellState();

  if (isMindmap.value) {
    relayoutMindmapGraphAfterDelete(
      graph,
      readMindmapDirection(props.graphData),
    );
    updateMindmapCollapseOverlays();
    emitGraphData();
    return;
  }
  scheduleSync();
}

function duplicateSelection() {
  if (!graph || !isEditable.value) return;
  const cells = expandBoardGroupCells(graph.getSelectedCells());
  if (!cells.length) return;
  markBoardOperation('复制副本');

  const clones = Object.values(graph.cloneCells(cells));
  clones.forEach((cell) => {
    if (graph?.isNode(cell)) {
      cell.translate(32, 32);
    }
  });
  graph.addCell(clones);
  graph.resetSelection(clones);
  refreshSelectedCellState();
  scheduleSync();
}

function copySelection() {
  if (!graph) return;
  const cells = expandBoardGroupCells(graph.getSelectedCells());
  if (!cells.length) return;
  graph.copy(cells);
}

// --- Board node groups ---
// A group is a dashed-frame container node (data.boardGroup = true) whose
// members are embedded children. Clicking a member selects the outermost
// container; Alt+click bypasses the group and selects the member only.
// (Alt is used instead of Ctrl/Cmd because Ctrl/Cmd+click is the built-in
// additive multi-select modifier.)

let boardGroupDragState: { memberId: string; rootId: string; last: { x: number; y: number } } | null = null;
// Whether the outermost group container was selected at node:mousedown. Captured
// before X6's Selection plugin re-resolves selection on the click, so node:click
// can tell a "drill in to the already-selected group's member" click from a
// "first click on a member selects its group" click.
let boardGroupMousedownRootSelected = false;

const BOARD_GROUP_SHAPE = 'board-group';

// Bounding box of a container node at the start of a resize-handle drag
// (`node:resize`). During `node:resizing` we compare the current box against it
// to derive which edges the user is actually dragging, because the
// `node:resizing` event args do not expose the drag direction at runtime.
let containerResizeStartBox: { x: number; y: number; width: number; height: number } | null = null;

type BoardGroupBorderPreset = 'tight' | 'highlight';

interface BoardGroupBorderPresetDef {
  label: string;
  /** 容器的内缩边距（成员包围盒四周扩展量） */
  padding: number;
  body: Record<string, string | number>;
}

const BOARD_GROUP_BORDER_PRESETS: Record<BoardGroupBorderPreset, BoardGroupBorderPresetDef> = {
  // 默认：紧贴成员四方边界（transparent fill 保证容器空白区可点击选中）
  tight: {
    label: '紧贴边界',
    padding: 8,
    body: {
      fill: 'transparent',
      stroke: '#91a7ff',
      strokeWidth: 1,
      strokeDasharray: 'none',
      rx: 8,
      ry: 8,
    },
  },
  // 原有虚线边框样式
  highlight: {
    label: '高亮边框',
    padding: 16,
    body: {
      fill: 'rgba(22, 119, 255, 0.05)',
      stroke: '#91a7ff',
      strokeWidth: 1.5,
      strokeDasharray: '6 4',
      rx: 12,
      ry: 12,
    },
  },
};

function normalizeBoardGroupBorderPreset(value: unknown): BoardGroupBorderPreset {
  return value === 'highlight' ? 'highlight' : 'tight';
}

function getBoardGroupBorderPreset(node: Node): BoardGroupBorderPreset {
  return normalizeBoardGroupBorderPreset(node.getData<Record<string, any>>()?.boardGroupBorder);
}

/** Apply the preset's body attrs (fill/stroke/dash/radius) onto the container node. */
function applyBoardGroupBorderPreset(container: Node) {
  const preset = BOARD_GROUP_BORDER_PRESETS[getBoardGroupBorderPreset(container)];
  container.attr('body', preset.body);
}

/**
 * Recompute a group container's position/size so its frame hugs the union bbox
 * of its members (plus the preset padding). Called whenever a member moves or
 * resizes so the border follows the elements.
 */
function fitBoardGroupContainer(container: Node) {
  const g = graph;
  if (!g || !isBoardGroupNode(container)) return;
  const members = (container.getChildren() ?? []).filter(
    (cell): cell is Node => g.isNode(cell),
  );
  if (!members.length) return;

  const padding = BOARD_GROUP_BORDER_PRESETS[getBoardGroupBorderPreset(container)].padding;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  members.forEach((node) => {
    const box = node.getBBox();
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  });
  if (!Number.isFinite(minX)) return;

  const x = minX - padding;
  const y = minY - padding;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  g.batchUpdate(() => {
    container.setPosition(x, y);
    container.resize(width, height);
  });
}

/** After a member changes geometry, re-fit the board group that contains it. */
function refitBoardGroupForMember(node: Node) {
  const parent = node.getParent();
  if (parent && graph?.isNode(parent) && isBoardGroupNode(parent as Node)) {
    fitBoardGroupContainer(parent as Node);
  }
}

// X6 v3 does not apply instance-level `markup` passed to addNode, so the
// dashed container and its `data-board-group` marker must come from a
// registered shape instead.
let boardGroupShapeRegistered = false;
function ensureBoardGroupShape() {
  if (boardGroupShapeRegistered) return;
  boardGroupShapeRegistered = true;
  // overwrite=true: the module can be instantiated more than once per page
  Graph.registerNode(BOARD_GROUP_SHAPE, {
    markup: [
      {
        tagName: 'g',
        attrs: { 'data-board-group': 'true' },
        children: [
          { tagName: 'rect', selector: 'body' },
          { tagName: 'text', selector: 'label' },
        ],
      },
    ],
    attrs: {
      body: {
        refWidth: '100%',
        refHeight: '100%',
        fill: 'rgba(22, 119, 255, 0.05)',
        stroke: '#91a7ff',
        strokeWidth: 1.5,
        strokeDasharray: '6 4',
        rx: 12,
        ry: 12,
      },
      label: { text: '' },
    },
  }, true);
}

function isBoardGroupNode(node: Node): boolean {
  return node.getData<Record<string, any>>()?.boardGroup === true;
}

/** Walk up the parent chain to the outermost group ancestor; returns the node itself when not grouped. */
function findBoardGroupRoot(node: Node): Node {
  let current: Node = node;
  const visited = new Set<string>([node.id]);
  let parent = current.getParent();
  while (parent && graph?.isNode(parent)) {
    if (visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent as Node;
    parent = current.getParent();
  }
  return current;
}

/** Detach all members from the container and remove the container itself (members survive). */
function dissolveBoardGroup(container: Node) {
  // getChildren() returns null when the container is empty or was already
  // detached (e.g. nested groups selected together: dissolving a child group
  // removes it from this container's children store before we get here).
  const children = container.getChildren() ?? [];
  children.forEach((child) => {
    container.unembed(child);
  });
  container.remove();
}

/** Auto-dissolve groups that dropped below 2 members. */
function dissolveDegradedBoardGroups() {
  if (!graph) return;
  graph.getNodes().forEach((node) => {
    if (!isBoardGroupNode(node)) return;
    if (node.getChildCount() < 2) dissolveBoardGroup(node);
  });
}

/** Expand selected group containers into their descendants so copy/duplicate carries members along. */
function expandBoardGroupCells(cells: Cell[]): Cell[] {
  if (!graph) return cells;
  const expanded: Cell[] = [];
  const seen = new Set<string>();
  cells.forEach((cell) => {
    if (seen.has(cell.id)) return;
    seen.add(cell.id);
    expanded.push(cell);
    // Expand both group containers and node containers so copy/duplicate
    // carries children along.
    if (graph!.isNode(cell) && (isBoardGroupNode(cell as Node) || isNodeContainer(cell as Node))) {
      cell.getDescendants({ deep: true }).forEach((descendant) => {
        if (!seen.has(descendant.id)) {
          seen.add(descendant.id);
          expanded.push(descendant);
        }
      });
    }
  });
  return expanded;
}

/** Wrap ≥2 selected plain nodes into one group container. */
function groupSelection() {
  if (!graph || !isEditable.value || isMindmap.value) return;
  ensureBoardGroupShape();
  const g = graph;
  const members = g.getSelectedCells().filter(
    (cell) => g.isNode(cell) && !isBoardGroupNode(cell as Node),
  ) as Node[];
  if (members.length < 2) return;
  markBoardOperation('组合');

  const padding = BOARD_GROUP_BORDER_PRESETS.tight.padding;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  members.forEach((node) => {
    const box = node.getBBox();
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  });

  // Keep the container behind every existing node. Do NOT call toBack() right
  // after addNode: X6 v3 schedules the new view asynchronously and the
  // synchronous z-index change leaves the container view unrendered.
  let backZIndex = 0;
  g.getNodes().forEach((node) => {
    const z = node.getZIndex();
    if (typeof z === 'number' && z < backZIndex) backZIndex = z;
  });

  let container: Node | null = null;
  g.batchUpdate(() => {
    // Detach members from any previous group first (supports merging groups).
    members.forEach((node) => {
      const parent = node.getParent();
      if (parent && g.isNode(parent) && isBoardGroupNode(parent as Node)) {
        parent.unembed(node);
      }
    });
    container = g.addNode({
      id: createId('board-group'),
      shape: BOARD_GROUP_SHAPE,
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
      zIndex: backZIndex - 1,
      data: { boardGroup: true, boardGroupBorder: 'tight' },
    });
    applyBoardGroupBorderPreset(container!);
    members.forEach((node) => container!.embed(node));
    g.resetSelection([container!]);
  });

  refreshSelectedCellState();
  updateNodeOverlays();
  scheduleSync();
}

/** Dissolve the selected group containers, keeping their members. */
function ungroupSelection() {
  if (!graph || !isEditable.value) return;
  const g = graph;
  const containers = g.getSelectedCells().filter(
    (cell) => g.isNode(cell) && isBoardGroupNode(cell as Node),
  ) as Node[];
  if (!containers.length) return;
  markBoardOperation('取消组合');

  const members: Node[] = [];
  g.batchUpdate(() => {
    containers.forEach((container) => {
      (container.getChildren() ?? []).forEach((child) => {
        if (g.isNode(child)) members.push(child as Node);
      });
      dissolveBoardGroup(container);
    });
  });

  g.resetSelection(members);
  refreshSelectedCellState();
  scheduleSync();
}

// --- Node parent-child (子元素) ---
// Unlike groups (which create a dedicated container node), this embeds nodes
// as children of an existing node. The parent expands to visually contain its
// children, similar to the knowledge-point graph container nodes.

const NODE_CONTAINER_PADDING = 16;
// X6 refY uses absolute px outside the (0,1) range; the label floats this far
// above the container's top border so children never cover it.
const NODE_CONTAINER_LABEL_GAP = 16;
/** Suppress intermediate refits while an embedded subtree moves atomically. */
let nodeContainerLayoutMutationDepth = 0;

function isNodeContainer(node: Node): boolean {
  return (node.getData<Record<string, any>>()?.nodeContainer === true);
}

/** Returns the nearest non-group, non-mindmap ancestor that is a node container. */
function findNodeContainerParent(node: Node): Node | null {
  let parent = node.getParent();
  const visited = new Set<string>([node.id]);
  while (parent && graph?.isNode(parent)) {
    if (visited.has(parent.id)) break;
    visited.add(parent.id);
    if (isNodeContainer(parent as Node)) return parent as Node;
    parent = (parent as Node).getParent();
  }
  return null;
}

/** When a node becomes a container, move its label above the top border so it
 * is not obscured by child nodes. */
function positionContainerLabel(parent: Node) {
  const g = graph;
  if (!g || !isNodeContainer(parent)) return;

  // Get current label text; if empty there is nothing to reposition.
  const labelText = parent.attr('label/text') as string | undefined;
  if (!labelText || labelText.trim() === '') return;

  // X6 refY: values in (0,1) are proportions of the body, outside that range
  // are absolute px. Use -NODE_CONTAINER_LABEL_GAP so the label floats that far
  // above the body top border. textVerticalAnchor 'top' anchors the text's top
  // edge at the refY point, keeping the whole label (even multi-line) outside
  // the box where children render.
  parent.attr('label/refY', -NODE_CONTAINER_LABEL_GAP);
  parent.attr('label/textAnchor', 'middle');
  parent.attr('label/textVerticalAnchor', 'top');
  parent.attr('label/visibility', 'visible');
}

/** When a node is no longer a container, restore the label to center position. */
function restoreNormalLabelPosition(node: Node) {
  node.attr('label', {
    refX: 0.5,
    refY: 0.5,
    textAnchor: 'middle',
    textVerticalAnchor: 'middle',
  });
}

/** Reposition and resize a container node to exactly wrap its children (like group containers). */
function fitNodeContainer(parent: Node) {
  const g = graph;
  if (!g || !isNodeContainer(parent)) return;
  const children = (parent.getChildren() ?? []).filter(
    (cell): cell is Node => g.isNode(cell),
  );
  if (!children.length) return;

  const padding = NODE_CONTAINER_PADDING;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  children.forEach((child) => {
    const box = child.getBBox();
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  });
  if (!Number.isFinite(minX)) return;

  // Always recalculate position and size from the children's bounding box,
  // matching the group container behavior (no preservation of old pos/size).
  const x = minX - padding;
  const y = minY - padding;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;

  g.batchUpdate(() => {
    parent.setPosition(x, y);
    parent.resize(w, h);
    positionContainerLabel(parent);
  });
}

/**
 * Grow-only fit: unlike fitNodeContainer (which always snaps back to the exact
 * wrap bbox), this only expands the container frame when a child moves/resizes
 * beyond its current border, so the parent never shrinks back to the minimum
 * size just because a child was dragged inward.
 */
function growNodeContainer(parent: Node) {
  const g = graph;
  if (!g || !isNodeContainer(parent)) return;
  const children = (parent.getChildren() ?? []).filter(
    (cell): cell is Node => g.isNode(cell),
  );
  if (!children.length) return;

  const padding = NODE_CONTAINER_PADDING;
  const box = parent.getBBox();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  children.forEach((child) => {
    const cb = child.getBBox();
    minX = Math.min(minX, cb.x);
    minY = Math.min(minY, cb.y);
    maxX = Math.max(maxX, cb.x + cb.width);
    maxY = Math.max(maxY, cb.y + cb.height);
  });
  if (!Number.isFinite(minX)) return;

  // Only expand the current frame when a child now exceeds it.
  const x = Math.min(box.x, minX - padding);
  const y = Math.min(box.y, minY - padding);
  const right = Math.max(box.x + box.width, maxX + padding);
  const bottom = Math.max(box.y + box.height, maxY + padding);

  if (
    x === box.x
    && y === box.y
    && right === box.x + box.width
    && bottom === box.y + box.height
  ) {
    return; // still fully enclosed, nothing to do
  }

  g.batchUpdate(() => {
    parent.setPosition(x, y);
    parent.resize(right - x, bottom - y);
    positionContainerLabel(parent);
  });
}

/** After a child moves or resizes, grow its container parent only when needed. */
function refitNodeContainerForMember(node: Node) {
  if (nodeContainerLayoutMutationDepth > 0) return;
  const parent = findNodeContainerParent(node);
  if (parent) growNodeContainer(parent);
}

/** Grow outer containers after the complete nested subtree reaches its final position. */
function growNodeContainerAncestorChain(node: Node) {
  let current = findNodeContainerParent(node);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    growNodeContainer(current);
    current = findNodeContainerParent(current);
  }
}

// --- Parent-child container resize constraint ---
// The user may resize a container freely, but its border must never cut into a
// child: once the border would reach a child, the container stops shrinking
// there. Children are never scaled by the container's resize.
//
// The X6 `node:resizing` event does not expose the drag direction at runtime,
// so we derive the dragged edges geometrically: the edges whose coordinate
// differs between the resize-start box (captured on `node:resize`) and the
// current box. Only those dragged edges are clamped toward the child frame; the
// opposite (fixed) corner is preserved by passing the matching direction to
// `node.resize`.

/**
 * Clamp a container's frame so it always fully encloses its children (with the
 * container padding). Only the border(s) the user is dragging are clamped; the
 * opposite (fixed) corner keeps its place, so the adjacent side is never
 * stretched as a side effect.
 */
function clampContainerResizeToChildren(node: Node, startBox: { x: number; y: number; width: number; height: number }) {
  const g = graph;
  if (!g || !isNodeContainer(node)) return;
  const children = (node.getChildren() ?? []).filter(
    (cell): cell is Node => g.isNode(cell),
  );
  if (!children.length) return;

  const padding = NODE_CONTAINER_PADDING;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  children.forEach((child) => {
    const cb = child.getBBox();
    minX = Math.min(minX, cb.x);
    minY = Math.min(minY, cb.y);
    maxX = Math.max(maxX, cb.x + cb.width);
    maxY = Math.max(maxY, cb.y + cb.height);
  });
  if (!Number.isFinite(minX)) return;

  const box = node.getBBox();

  // Which edges is the user dragging? The fixed (opposite) edges must not move.
  // A small epsilon guards against sub-pixel/rounding drift of the fixed corner.
  const EPS = 0.5;
  const leftDragged = Math.abs(box.x - startBox.x) > EPS;
  const rightDragged = Math.abs(box.x + box.width - (startBox.x + startBox.width)) > EPS;
  const topDragged = Math.abs(box.y - startBox.y) > EPS;
  const bottomDragged = Math.abs(box.y + box.height - (startBox.y + startBox.height)) > EPS;

  let x = box.x;
  let y = box.y;
  let w = box.width;
  let h = box.height;

  if (leftDragged) {
    const newX = Math.min(box.x, minX - padding);
    if (newX !== x) {
      w += box.x - newX;
      x = newX;
    }
  }
  if (rightDragged) {
    const newRight = Math.max(box.x + box.width, maxX + padding);
    w = newRight - x;
  }
  if (topDragged) {
    const newY = Math.min(box.y, minY - padding);
    if (newY !== y) {
      h += box.y - newY;
      y = newY;
    }
  }
  if (bottomDragged) {
    const newBottom = Math.max(box.y + box.height, maxY + padding);
    h = newBottom - y;
  }

  if (x === box.x && y === box.y && w === box.width && h === box.height) {
    return; // nothing to clamp
  }

  // Map the dragged edges back to a ResizeDirection so `node.resize` keeps the
  // opposite (fixed) corner in place, matching how X6 itself interprets the
  // handle being dragged.
  const horizontal = leftDragged ? 'left' : rightDragged ? 'right' : '';
  const vertical = topDragged ? 'top' : bottomDragged ? 'bottom' : '';
  const direction: ResizeDirection = horizontal && vertical
    ? `${vertical}-${horizontal}` as ResizeDirection
    : (horizontal || vertical || 'top-right') as ResizeDirection;

  node.resize(w, h, { direction });
}

/**
 * Keep a newly-created container at its current canvas position. If the nodes
 * being attached are left of or above the parent's content origin, move the
 * whole incoming subtree into the parent as one unit, preserving the relative
 * layout between selected children.
 */
function placeIncomingChildrenInsideParent(parent: Node, children: Node[]) {
  if (!children.length) return;
  const parentBox = parent.getBBox();
  let minX = Infinity;
  let minY = Infinity;

  children.forEach((child) => {
    const box = child.getBBox({ deep: true });
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;

  const dx = Math.max(0, parentBox.x + NODE_CONTAINER_PADDING - minX);
  const dy = Math.max(0, parentBox.y + NODE_CONTAINER_PADDING - minY);
  if (dx === 0 && dy === 0) return;

  children.forEach((child) => child.translate(dx, dy));
}

/** Reject no-op nesting and both directions of an ancestor cycle. */
function canAttachNodeToParent(child: Node, parent: Node): boolean {
  if (child.id === parent.id || child.getParent()?.id === parent.id) return false;
  if (parent.getDescendants({ deep: true }).some((cell) => cell.id === child.id)) return false;
  return !child.getDescendants({ deep: true }).some((cell) => cell.id === parent.id);
}

/** Make the remaining selected nodes children of the first selected node. */
function makeChildOfParent() {
  if (!graph || !isEditable.value || isMindmap.value) return;
  const g = graph;
  const cells = g.getSelectedCells().filter(
    (cell) => g.isNode(cell) && !isBoardGroupNode(cell as Node),
  ) as Node[];
  if (cells.length < 2) return;

  // The last selected node becomes the parent; earlier selections become its children.
  const parent = cells[cells.length - 1];
  const children = cells.slice(0, -1);

  // Do not re-attach an existing descendant or make an ancestor its own child.
  const validChildren = children.filter((child) => canAttachNodeToParent(child, parent));
  if (!validChildren.length) return;
  markBoardOperation('设为子元素');

  // 使用 startBatch/stopBatch（而非 batchUpdate）确保即使内部抛异常也能关闭 batch，
  // 避免未关闭的 batch 阻止 History 插件记录 undo 命令。
  // resetSelection 移到 batch 外部，避免选择事件干扰 History 命令分组。
  g.startBatch('make-child-of-parent');
  nodeContainerLayoutMutationDepth += 1;
  try {
    // Detach children from any previous parent first.
    validChildren.forEach((child) => {
      const prev = child.getParent();
      if (prev && g.isNode(prev)) {
        prev.unembed(child);
        if (isNodeContainer(prev as Node)) fitNodeContainer(prev as Node);
      }
    });

    // Converting the selected parent into a container must not snap that parent
    // to a distant child's old bbox. Move the incoming subtree inside the
    // parent's content origin first, then grow the frame from its existing
    // top-left position.
    placeIncomingChildrenInsideParent(parent, validChildren);

    parent.setData({ ...parent.getData(), nodeContainer: true });
    // Raise z-index so the child subtree renders on top of the parent. When the
    // child is itself a container (nested parents), bump its whole subtree by
    // the same delta so inner children keep rendering above it.
    const parentZ = parent.getZIndex() ?? 0;
    validChildren.forEach((child) => {
      const childZ = child.getZIndex() ?? 0;
      if (childZ <= parentZ) {
        const delta = parentZ + 1 - childZ;
        child.setZIndex(childZ + delta);
        child.getDescendants({ deep: true }).forEach((descendant) => {
          if (g.isNode(descendant)) {
            descendant.setZIndex((descendant.getZIndex() ?? 0) + delta);
          }
        });
      }
      parent.embed(child);
    });
    positionContainerLabel(parent);
    growNodeContainer(parent);
  } finally {
    nodeContainerLayoutMutationDepth -= 1;
    g.stopBatch('make-child-of-parent');
  }

  growNodeContainerAncestorChain(parent);

  g.resetSelection([parent]);
  refreshSelectedCellState();
  updateNodeOverlays();
  scheduleSync();
}

/** Detach selected child nodes from their container parent, or dissolve a standalone container. */
function detachFromParent() {
  if (!graph || !isEditable.value) return;
  const g = graph;
  const cells = g.getSelectedCells();
  const detached: Node[] = [];
  markBoardOperation('取消子元素');

  g.startBatch('detach-from-parent');
  try {
    cells.forEach((cell) => {
      if (!g.isNode(cell)) return;
      const node = cell as Node;

      // If the node is a child of a container, detach it from that parent first.
      // This also applies when the node is itself a container (nested parents):
      // "取消子元素" detaches it from its parent while keeping its own
      // container status and children intact.
      const parent = findNodeContainerParent(node);
      if (parent) {
        parent.unembed(node);
        detached.push(node);
        if ((parent.getChildren() ?? []).length === 0) {
          parent.setData({ ...parent.getData(), nodeContainer: false });
          restoreNormalLabelPosition(parent);
        } else {
          fitNodeContainer(parent);
        }
        return;
      }

      // Not a child of any container: if a standalone container is selected,
      // dissolve it (detach all its children).
      if (isNodeContainer(node)) {
        const children = (node.getChildren() ?? []).filter(
          (c): c is Node => g.isNode(c),
        );
        children.forEach((child) => {
          node.unembed(child);
          detached.push(child);
        });
        node.setData({ ...node.getData(), nodeContainer: false });
        restoreNormalLabelPosition(node);
      }
    });
  } finally {
    g.stopBatch('detach-from-parent');
  }

  if (detached.length) g.resetSelection(detached);
  refreshSelectedCellState();
  updateNodeOverlays();
  scheduleSync();
}

function beginBoardGroupDrag(node: Node) {
  if (isMindmap.value) return;
  const root = findBoardGroupRoot(node);
  if (root === node || !isBoardGroupNode(root)) return;
  if (!graph || !graph.isSelected(root)) return;
  boardGroupDragState = { memberId: node.id, rootId: root.id, last: node.getPosition() };
}

/** While dragging a group member, move the rest of the group by the same delta. */
function updateBoardGroupDrag(node: Node, current: { x: number; y: number }) {
  if (!graph || !boardGroupDragState || node.id !== boardGroupDragState.memberId) return;
  const root = graph.getCellById(boardGroupDragState.rootId);
  if (root && graph.isNode(root)) {
    const dx = current.x - boardGroupDragState.last.x;
    const dy = current.y - boardGroupDragState.last.y;
    if (dx !== 0 || dy !== 0) {
      // The dragged member already moved via its own drag; exclude it.
      root.translate(dx, dy, { exclude: [node] });
    }
  }
  boardGroupDragState.last = { x: current.x, y: current.y };
}

function endBoardGroupDrag() {
  boardGroupDragState = null;
}

function pasteSelection() {
  if (!graph || !isEditable.value) return;
  markBoardOperation('粘贴');
  const pasted = graph.paste({ offset: { dx: 32, dy: 32 } });
  if (!pasted.length) {
    pendingOperationLabel = null;
    pendingOperationBefore = null;
    return;
  }

  referenceInterfaceOriginalTerminals.clear();
  graph.resetSelection(pasted);
  refreshSelectedCellState();
  scheduleSync();
}

// --- System clipboard paste (no selection): image / link / rich-text node ---

function isSingleHttpUrl(text: string): boolean {
  return /^https?:\/\/\S+$/.test(text);
}

/**
 * Whether this canvas instance should consume a document-level paste event:
 * editable board canvas, no inline editing, no selected cells, and this stage
 * is the most recently interacted canvas.
 */
function canHandleBoardSystemPaste(): boolean {
  return Boolean(
    graph
    && isEditable.value
    && !isMindmap.value
    && editingNodeId.value == null
    && !edgeInlineEditing.value
    && graph.getSelectedCells().length === 0
    && stageRef.value
    && getActiveX6Stage() === stageRef.value,
  );
}

function handleDocumentPaste(event: ClipboardEvent) {
  if (!canHandleBoardSystemPaste()) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target && target.closest('input, textarea, [contenteditable="true"]')) return;
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const imageFile = findClipboardImageFileOnly(clipboard);
  if (imageFile) {
    event.preventDefault();
    void pasteImageFileAsBoardNode(imageFile);
    return;
  }

  const text = clipboard.getData('text/plain').trim();
  if (!text) return;
  event.preventDefault();
  if (isSingleHttpUrl(text)) addPastedLinkNode(text);
  else addPastedRichTextNode(text);
}

/**
 * Document-level fallback for Ctrl/Cmd+C and Ctrl/Cmd+V. The graph's own
 * keyboard binding (Mousetrap) only fires when the graph container has focus;
 * when focus is elsewhere this routes the shortcut to the most recently
 * interacted canvas so copying/pasting selected cells still works.
 */
function handleDocumentKeydownForBoard(e: KeyboardEvent) {
  const modifier = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (!modifier || (key !== 'c' && key !== 'v')) return;

  // Only the most recently interacted canvas should consume the shortcut.
  if (!stageRef.value || getActiveX6Stage() !== stageRef.value) return;
  if (!graph || !isEditable.value) return;
  if (editingNodeId.value != null || edgeInlineEditing.value) return;

  const target = e.target instanceof Element ? e.target : null;
  // If the keydown originates inside the graph container, the graph's own
  // keyboard binding already handles it — don't double-handle.
  if (target && containerRef.value && containerRef.value.contains(target)) return;
  // Never override native copy/paste inside text fields.
  if (target && target.closest('input, textarea, [contenteditable="true"]')) return;

  e.preventDefault();
  if (key === 'c') {
    copySelection();
    return;
  }
  // key === 'v'
  if (!isMindmap.value && graph.getSelectedCells().length === 0 && graph.isClipboardEmpty()) {
    void readSystemClipboardIntoBoard();
    return;
  }
  pasteSelection();
}

/** Fallback for ctrl+v handled by the graph keyboard binding (no native paste event). */
async function readSystemClipboardIntoBoard() {
  if (!graph || !isEditable.value || isMindmap.value) return;
  if (editingNodeId.value != null || edgeInlineEditing.value) return;
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        await pasteImageFileAsBoardNode(
          new File([blob], `pasted-${Date.now()}`, { type: imageType }),
        );
        return;
      }
    }
    const text = (await navigator.clipboard.readText().catch(() => '')).trim();
    if (!text) return;
    if (isSingleHttpUrl(text)) addPastedLinkNode(text);
    else addPastedRichTextNode(text);
  } catch {
    // Clipboard read permission denied; ignore.
  }
}

function loadImageNaturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

async function pasteImageFileAsBoardNode(file: File) {
  if (!graph || !isEditable.value) return;
  try {
    const result = await uploadFile(file);
    if (!graph) return;
    const natural = await loadImageNaturalSize(result.url);
    const maxWidth = 480;
    let width = 320;
    let height = 200;
    if (natural.width > 0 && natural.height > 0) {
      const scale = Math.min(1, maxWidth / natural.width);
      width = Math.max(40, Math.round(natural.width * scale));
      height = Math.max(40, Math.round(natural.height * scale));
    }
    const center = getCanvasCenter();
    const node = graph.addNode({
      shape: 'image',
      x: center.x,
      y: center.y,
      width,
      height,
      attrs: { image: { xlinkHref: result.url, width, height } },
      data: { preset: 'image', imageUrl: result.url },
    });
    graph.cleanSelection();
    graph.select(node);
    refreshSelectedCellState();
    scheduleSync();
  } catch (err) {
    console.warn('[X6Component] 粘贴图片失败', err);
  }
}

function addPastedLinkNode(url: string) {
  if (!graph || !isEditable.value) return;
  ensureBoardLinkShapeRegistered();
  const center = getCanvasCenter();
  const node = graph.addNode({
    shape: BOARD_LINK_SHAPE,
    x: center.x,
    y: center.y,
    width: 320,
    height: 96,
    data: { preset: 'linkCard', linkUrl: url, linkDisplay: 'link' },
  });
  graph.cleanSelection();
  graph.select(node);
  refreshSelectedCellState();
  scheduleSync();
}

function addPastedRichTextNode(text: string) {
  if (!graph || !isEditable.value) return;
  const center = getCanvasCenter();
  const meta = createNodeMetadata('rect', {
    x: center.x,
    y: center.y,
    width: 320,
    height: 180,
    label: text,
    data: { textMode: 'rich', richContent: text },
  });
  const node = graph.addNode(meta);
  node.attr('label/visibility', 'hidden');
  graph.cleanSelection();
  graph.select(node);
  refreshSelectedCellState();
  updateNodeOverlays();
  scheduleSync();
}

/** Switch the display mode of the selected pasted-link node (文档链接 toolbar 移植). */
function updateSelectedLinkDisplay(mode: UrlDisplayMode) {
  if (!graph || !isEditable.value) return;
  const state = selectedCell.value;
  if (!state || state.kind !== 'node' || !state.linkUrl) return;
  const node = graph.getCellById(state.id) as Node | undefined;
  if (!node) return;
  node.setData({ linkDisplay: mode });
  refreshSelectedCellState();
  scheduleSync();
}

/** Extract selected cells as a reusable material and open the library panel. */
function extractSelectionAsMaterial() {
  if (!graph || !props.blockActionsEnabled) return;
  const g = graph;
  // Group containers cannot be extracted as material; ungroup first.
  if (g.getSelectedCells().some((cell) => g.isNode(cell) && isBoardGroupNode(cell as Node))) return;
  const rawData = buildMaterialGraphData();
  if (!rawData) return;
  const data = rawData as import('@/api/types').GraphData;
  const name = `素材 ${materialLibraryStore.items.length + 1}`;
  materialLibraryStore.addMaterial(name, data);
  inspectorTab.value = 'library';
}

async function extractSelectionAsBoardPage() {
  if (
    !graph
    || !props.blockActionsEnabled
    || extractingSelectionBoard.value
    || !workspaceStore.currentPageId
  ) return;
  const data = buildSelectionBoardGraphData();
  if (!data || !data.nodes.length) {
    ElMessage.warning('请至少选择一个画板节点');
    return;
  }

  const firstLabel = data.nodes
    .map((node) => extractNodeLabel(node as CellData).trim())
    .find(Boolean);
  const title = firstLabel
    ? `${firstLabel}${data.nodes.length > 1 ? ' 等组件' : ' 组件'}`
    : '画板组件';

  extractingSelectionBoard.value = true;
  try {
    const sourcePageId = workspaceStore.currentPageId;
    const page = await workspaceStore.createBoardPageFromSelection(
      sourcePageId,
      title,
      data,
      { select: false },
    );
    const reference = replaceSelectionWithBoardReference(page.id, title, data);
    if (!reference) {
      throw new Error('原画板选区已变化，无法创建画板引用');
    }

    // CanvasPage buffers graph changes for 500 ms. Keep the source page active
    // until that buffer has emitted so saveCurrentPage captures sourcePageId,
    // otherwise an unmount-time flush can accidentally target the new page.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 550));
    if (workspaceStore.currentPageId === sourcePageId) {
      await workspaceStore.selectPage(page.id);
    }
    ElMessage.success('已提取为独立画板页');
  } catch (error) {
    const message = error instanceof Error ? error.message : '提取失败';
    ElMessage.error(message);
  } finally {
    extractingSelectionBoard.value = false;
  }
}

/** Insert a saved material's graph data onto the canvas at the viewport center. */
function insertMaterial(graphData: GraphData) {
  insertMaterialAt(graphData, undefined);
}

/** Insert material's graph data at a specific graph-space position (or viewport center). */
function insertMaterialAt(graphData: GraphData, position?: { x: number; y: number }) {
  if (!graph || !isEditable.value) return;
  const now = Date.now();
  if (now - lastMaterialInsertTime < MATERIAL_INSERT_DEBOUNCE_MS) return;
  lastMaterialInsertTime = now;
  const center = position ?? getCanvasCenter();
  const dx = center.x;
  const dy = center.y;
  let minX = Infinity, minY = Infinity;
  for (const node of graphData.nodes ?? []) {
    const x = node.x ?? node.position?.x ?? 0;
    const y = node.y ?? node.position?.y ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  const offsetX = dx - (isFinite(minX) ? minX : 0);
  const offsetY = dy - (isFinite(minY) ? minY : 0);
  const idMap = new Map<string, string>();
  const addedNodes: Node[] = [];

  isApplyingExternalData = true;
  graph.batchUpdate(() => {
    for (const nodeData of graphData.nodes ?? []) {
      const newId = `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      idMap.set(nodeData.id, newId);
      const nx = (nodeData.x ?? 0) + offsetX;
      const ny = (nodeData.y ?? 0) + offsetY;
      addedNodes.push(graph!.addNode({
        ...(nodeData as CellData),
        id: newId,
        x: nx,
        y: ny,
        position: { x: nx, y: ny },
      } as CellData));
    }
    const remapTerminal = (term: any): any => {
      if (typeof term === 'string') return idMap.get(term) ?? term;
      if (term?.cell) return { ...term, cell: idMap.get(term.cell) ?? term.cell };
      if (typeof term?.x === 'number' && typeof term?.y === 'number') {
        return { ...term, x: term.x + offsetX, y: term.y + offsetY };
      }
      return term;
    };
    for (const edgeData of graphData.edges ?? []) {
      graph!.addEdge({
        ...edgeData,
        id: undefined,
        x: undefined, y: undefined, position: undefined,
        source: remapTerminal(edgeData.source),
        target: remapTerminal(edgeData.target),
        vertices: Array.isArray(edgeData.vertices)
          ? edgeData.vertices.map((vertex) => ({
              ...vertex,
              x: typeof vertex.x === 'number' ? vertex.x + offsetX : vertex.x,
              y: typeof vertex.y === 'number' ? vertex.y + offsetY : vertex.y,
            }))
          : edgeData.vertices,
      });
    }
    if (addedNodes.length) {
      graph!.resetSelection(addedNodes);
    }
    if (isMindmap.value) {
      syncMindmapGraphState();
    }
  });
  isApplyingExternalData = false;

  scheduleSync();
}

function onMaterialDragOver(e: DragEvent) {
  const types = e.dataTransfer?.types;
  if (!types) return;
  const accepts = types.includes(X6_MATERIAL_MIME) || types.includes(X6_SHAPE_MIME);
  if (!accepts) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

function onMaterialDrop(e: DragEvent) {
  if (!graph || !isEditable.value || isApplyingExternalData) return;
  const types = e.dataTransfer?.types;
  if (!types) return;

  if (types.includes(X6_SHAPE_MIME)) {
    const raw = e.dataTransfer?.getData(X6_SHAPE_MIME);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    if (!didMaterialDragMove()) {
      resetMaterialDrag();
      return;
    }
    const payload = parseShapeDragPayload(raw);
    if (!payload) {
      resetMaterialDrag();
      return;
    }
    const pos = graph.clientToLocal(e.clientX, e.clientY);
    if (payload.kind === 'uml-preset') {
      insertUmlClassPreset({ x: pos.x, y: pos.y });
    } else {
      addNode(payload.preset, { x: pos.x, y: pos.y }, { centerAt: true });
    }
    resetMaterialDrag();
    return;
  }

  if (!types.includes(X6_MATERIAL_MIME)) return;
  const raw = e.dataTransfer.getData(X6_MATERIAL_MIME);
  if (!raw) return;
  e.preventDefault();
  e.stopPropagation();
  if (!didMaterialDragMove()) {
    resetMaterialDrag();
    return;
  }
  try {
    const graphData: GraphData = JSON.parse(raw);
    const pos = graph.clientToLocal(e.clientX, e.clientY);
    insertMaterialAt(graphData, { x: pos.x, y: pos.y });
  } catch { /* ignore invalid data */ } finally {
    resetMaterialDrag();
  }
}

function requestInsertRefBlock() {
  if (!graph || !isEditable.value || !props.blockActionsEnabled) return;
  const position = getRefInsertPosition();
  emit('request-insert-ref', position);
}

function findPageInTree(nodes: PageItem[], pageId: string): PageItem | null {
  for (const node of nodes) {
    if (node.id === pageId) return node;
    const found = findPageInTree(node.children ?? [], pageId);
    if (found) return found;
  }
  return null;
}

function buildRefPreviewLabel(refId: string, refType: 'block' | 'page'): string {
  if (refType === 'page') {
    const workspaceStore = useWorkspaceStore();
    const page = findPageInTree(workspaceStore.pageTree, refId);
    return page?.title?.trim() || '页面引用';
  }

  const meta = useBlockRegistryStore().getMeta(refId);
  if (!meta) return '引用块';

  const block = meta.block;
  if (block.title?.trim()) return block.title.trim();
  if (block.type === 'x6') return block.title?.trim() || '画板';
  if (block.type === 'table') return block.title?.trim() || '表格';
  if (block.type === 'line') return block.title?.trim() || '时间轴';
  if (block.type === 'externalResource') {
    return block.externalResource?.snapshot?.excerptTitle
      || block.externalResource?.snapshot?.resourceTitle
      || block.title?.trim()
      || '外部资源';
  }
  if (block.type === 'richtext' || block.type === 'richText') {
    const plain = (block.content ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[#*`>\-_\[\]]/g, '')
      .trim();
    if (plain) return plain.length > 40 ? `${plain.slice(0, 40)}…` : plain;
  }
  return meta.pageTitle?.trim() || '引用块';
}

function buildRefSourceLabel(refId: string, refType: 'block' | 'page'): string {
  if (refType === 'page') {
    const workspaceStore = useWorkspaceStore();
    const page = findPageInTree(workspaceStore.pageTree, refId);
    return page?.title?.trim() || refId;
  }

  const meta = useBlockRegistryStore().getMeta(refId);
  const blockLabel = buildRefPreviewLabel(refId, 'block');
  if (meta?.pageTitle?.trim()) {
    return `${meta.pageTitle.trim()} · ${blockLabel}`;
  }
  return blockLabel;
}

function canNavigateRefBlockSource(cell: SelectedCellState | null): boolean {
  if (!cell || cell.kind !== 'node' || !cell.isRefBlock || !cell.refBlockId) return false;
  if (cell.refType === 'page') return true;
  return Boolean(useBlockRegistryStore().getMeta(cell.refBlockId)?.pageId);
}

async function navigateToRefBlockSource() {
  const cell = selectedCell.value;
  if (!canNavigateRefBlockSource(cell) || cell?.kind !== 'node') return;

  const workspaceStore = useWorkspaceStore();
  if (cell.refType === 'page') {
    await workspaceStore.selectPage(cell.refBlockId);
    return;
  }

  const pageId = useBlockRegistryStore().getMeta(cell.refBlockId)?.pageId;
  if (pageId) {
    await workspaceStore.selectPage(pageId);
  }
}

function canNavigateSourceLocator(cell: SelectedCellState | null): boolean {
  return Boolean(cell && cell.kind === 'node' && cell.sourceLocator);
}

function navigateToSourceLocator() {
  const cell = selectedCell.value;
  if (!canNavigateSourceLocator(cell) || cell?.kind !== 'node') return;
  emit('navigate-source-locator', {
    locator: cell.sourceLocator,
    label: cell.label,
    ...(cell.tocEntryId ? { tocEntryId: cell.tocEntryId } : {}),
  });
}

function previewSourceContent() {
  const cell = selectedCell.value;
  if (!canNavigateSourceLocator(cell) || cell?.kind !== 'node') return;
  emit('preview-source-content', {
    locator: cell.sourceLocator,
    label: cell.label,
    ...(cell.tocEntryId ? { tocEntryId: cell.tocEntryId } : {}),
  });
}

function insertRefBlock(
  refId: string,
  refType: 'block' | 'page',
  position?: InsertRefRequestPayload,
) {
  if (!graph || !isEditable.value || !props.blockActionsEnabled) return;

  const pos = position ?? getRefInsertPosition();
  const label = buildRefPreviewLabel(refId, refType);

  if (isMindmap.value) {
    const node = graph.addNode(createMindmapNode({
      x: pos.x,
      y: pos.y,
      label,
      mindRole: 'topic',
      data: {
        refBlockId: refId,
        refType,
        refKind: 'block-ref',
        childrenCollapsed: true,
        refTocCollapsed: {},
      },
    }));
    fitMindmapNodeToText(node);
    graph.cleanSelection();
    graph.select(node);
    void (async () => {
      if (refType === 'page') {
        await outlineCacheStore.ensurePageOutline(refId);
      } else {
        await outlineCacheStore.ensureBlockOutline(refId);
      }
      applyMindmapGraphState();
      refreshSelectedCellState();
    })();
    scheduleSync();
    return;
  }

  const node = graph.addNode({
    id: createId('ref-node'),
    shape: 'rect',
    x: pos.x,
    y: pos.y,
    width: 220,
    height: 72,
    ports: createNodePorts(),
    attrs: {
      body: {
        fill: '#f5f9ff',
        stroke: '#1677ff',
        strokeWidth: 1.6,
        rx: 14,
        ry: 14,
      },
      label: {
        text: label,
        fill: '#0958d9',
        fontSize: 13,
        fontWeight: 600,
      },
    },
    data: {
      refBlockId: refId,
      refType,
      refKind: 'block-ref',
    },
  });

  graph.cleanSelection();
  graph.select(node);
  refreshSelectedCellState();
  scheduleSync();
}

function syncFromSource() {
  emit('sync-from-source');
}

function syncToSource() {
  if (!graph) return;
  emit('sync-to-source', normalizeGraphData(serializeGraphData()));
}

function undo() {
  if (!graph || !canUndo.value) return;
  markBoardOperation('撤销');
  graph.undo();
  refreshSelectedCellState();
  scheduleSync();
}

function redo() {
  if (!graph || !canRedo.value) return;
  markBoardOperation('重做');
  graph.redo();
  refreshSelectedCellState();
  scheduleSync();
}

function selectBoardReferenceWrapper(nodeId: string) {
  if (!graph) return;
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return;
  graph.resetSelection([node]);
  // The editable preview overlay consumes the native `node:click`, so the
  // Transform plugin cannot create its standard resize handles automatically.
  // Reuse the same native widget explicitly after selecting the wrapper.
  if (isEditable.value) {
    graph.clearTransformWidgets();
    graph.createTransformWidget(node);
  }
  refreshSelectedCellState();
}

function startBoardReferenceDrag(nodeId: string) {
  if (!graph || !isEditable.value || boardReferenceDragNodeId) return;
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return;
  boardReferenceDragNodeId = nodeId;
  graph.resetSelection([node]);
  markBoardOperation('移动画板引用');
  startUserInteraction();
}

function moveBoardReference(nodeId: string, delta: { dx: number; dy: number }) {
  if (!graph || boardReferenceDragNodeId !== nodeId) return;
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return;
  const zoom = Math.max(0.01, graph.zoom());
  node.translate(delta.dx / zoom, delta.dy / zoom);
  updateNodeOverlays();
}

function finishBoardReferenceDrag(nodeId: string) {
  if (boardReferenceDragNodeId !== nodeId) return;
  boardReferenceDragNodeId = null;
  finishUserInteraction();
}

function startBoardInterfaceDrag(nodeId: string, portId: string) {
  if (!graph || !isEditable.value || boardInterfaceDrag) return;
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return;
  boardInterfaceDrag = { nodeId, portId };
  graph.resetSelection([node]);
  markBoardOperation('调整画板接口锚点');
  startUserInteraction();
}

function moveBoardInterface(
  nodeId: string,
  payload: { portId: string; side: BoardInterfaceSide; ratio: number },
) {
  if (
    !graph
    || boardInterfaceDrag?.nodeId !== nodeId
    || boardInterfaceDrag.portId !== payload.portId
  ) return;
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return;
  const data = node.getData<Record<string, unknown>>() ?? {};
  if (!Array.isArray(data.extractedInterfaces)) return;
  const ratio = Math.min(0.92, Math.max(0.08, payload.ratio));
  let matched = false;
  let matchedEdgeId = '';
  let matchedDirection: ExtractedBoardInterfaceDirection = 'out';
  const nextInterfaces = data.extractedInterfaces.map((rawItem) => {
    if (!rawItem || typeof rawItem !== 'object') return rawItem;
    const item = rawItem as Record<string, unknown>;
    if (item.portId !== payload.portId) return item;
    matched = true;
    matchedEdgeId = typeof item.edgeId === 'string' ? item.edgeId : '';
    matchedDirection = item.direction === 'in' ? 'in' : 'out';
    const boardInterface = item.boardInterface && typeof item.boardInterface === 'object'
      ? item.boardInterface as Record<string, unknown>
      : null;
    return {
      ...item,
      side: payload.side,
      ratio,
      ...(boardInterface
        ? { boardInterface: { ...boardInterface, side: payload.side, ratio } }
        : {}),
    };
  });
  if (!matched) return;

  node.setData({ ...data, extractedInterfaces: nextInterfaces });
  node.setPortProp(payload.portId, 'args', getBoardInterfacePortArgs({
    side: payload.side,
    ratio,
  }));
  // Position + size changes can make X6 fall back to a node-level terminal.
  // The extracted interface identity is edge-based, so restore its dedicated
  // port unconditionally instead of trusting the current rendered terminal.
  const interfaceEdge = matchedEdgeId ? graph.getCellById(matchedEdgeId) : null;
  if (interfaceEdge && graph.isEdge(interfaceEdge)) {
    if (matchedDirection === 'out') {
      interfaceEdge.setSource({ cell: nodeId });
      interfaceEdge.setSource({ cell: nodeId, port: payload.portId });
    } else {
      interfaceEdge.setTarget({ cell: nodeId });
      interfaceEdge.setTarget({ cell: nodeId, port: payload.portId });
    }
  }
  updateNodeOverlays();
  scheduleSync();
}

function finishBoardInterfaceDrag(nodeId: string, portId: string) {
  if (boardInterfaceDrag?.nodeId !== nodeId || boardInterfaceDrag.portId !== portId) return;
  boardInterfaceDrag = null;
  finishUserInteraction();
}

function updateSelectedBoardReferenceDisplay(mode: 'card' | 'content') {
  if (!graph || !isEditable.value) return;
  const state = selectedCell.value;
  if (
    !state
    || state.kind !== 'node'
    || !state.isRefBlock
    || state.refType !== 'page'
    || !state.canPreviewBoardReference
  ) return;
  const node = graph.getCellById(state.id);
  if (!node || !graph.isNode(node)) return;
  markBoardOperation('切换画板引用展示');
  const data = node.getData<Record<string, unknown>>() ?? {};
  node.setData({ ...data, boardReferenceDisplay: mode });
  if (mode === 'content') {
    const size = node.getSize();
    if (size.width < 420 || size.height < 280) {
      node.resize(Math.max(480, size.width), Math.max(320, size.height));
    }
    node.attr('label/visibility', 'hidden');
    node.attr('body/fill', '#ffffff');
  } else {
    node.attr('label/visibility', 'visible');
    node.attr('body/fill', '#f5f3ff');
  }
  refreshSelectedCellState();
  updateNodeOverlays();
  scheduleSync();
}

function requestRollback(entry: BoardOperationHistoryEntry) {
  rollbackConfirmId.value = entry.id;
  operationNotice.value = '';
}

function cancelRollback() {
  rollbackConfirmId.value = null;
}

async function rollbackBeforeOperation(entry: BoardOperationHistoryEntry) {
  if (!graph || !isEditable.value) return;

  const current = createOperationSnapshot(serializeGraphData());
  const target = entry.before;
  if (operationSnapshotKey(current) === operationSnapshotKey(target)) {
    rollbackConfirmId.value = null;
    operationNotice.value = '当前画板已经是该操作之前的状态。';
    return;
  }

  const rollbackEntry: BoardOperationHistoryEntry = {
    id: createId('board-operation'),
    label: `回退到「${entry.label}」之前`,
    createdAt: Date.now(),
    before: current,
  };
  const nextHistory = [rollbackEntry, ...operationHistory.value]
    .slice(0, BOARD_OPERATION_HISTORY_LIMIT);
  const targetData: GraphData = {
    ...snapshotToGraphData(target),
    operationHistory: nextHistory,
  };

  rollbackConfirmId.value = null;
  operationHistoryPage.value = 1;
  applyGraphData(targetData);

  // applyGraphData 在 nextTick 完成内部状态恢复；随后强制发出一次持久化更新。
  await nextTick();
  if (!graph) return;
  lastSerializedSnapshot = '';
  lastCommittedOperationSnapshot = operationSnapshotKey(target);
  const payload = emitGraphData();
  if (props.pageId && payload) {
    await workspaceStore.savePageGraphData(props.pageId, payload);
  }
  operationNotice.value = `已回退到「${entry.label}」之前；回退前状态也已保留。`;
  updateUndoRedoState();
}

function zoomIn() {
  if (!graph) return;
  graph.zoom(0.1);
  updateUndoRedoState();
}

function zoomOut() {
  if (!graph) return;
  graph.zoom(-0.1);
  updateUndoRedoState();
}

function resetZoom() {
  if (!graph) return;
  graph.zoomTo(1);
  graph.centerContent();
  updateUndoRedoState();
}

function fitGraph(options?: { padding?: number; maxScale?: number }) {
  if (!graph) return;
  if (graph.getCellCount() > 0) {
    graph.zoomToFit({
      padding: options?.padding ?? 24,
      maxScale: options?.maxScale ?? 1,
    });
    graph.centerContent();
  } else {
    graph.zoomTo(1);
  }
  updateUndoRedoState();
}

function toggleGrid() {
  if (!graph) return;
  gridVisible.value = !gridVisible.value;
  if (gridVisible.value) {
    graph.showGrid();
  } else {
    graph.hideGrid();
  }
}

function centerGraph() {
  if (!graph) return;
  graph.centerContent();
}

/** Switch the selected group container's border preset and re-fit the frame. */
function updateSelectedGroupBorderPreset(preset: BoardGroupBorderPreset) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'node' || !selectedCell.value.isGroup) return;
  const node = graph.getCellById(selectedCell.value.id);
  if (!node || !graph.isNode(node) || !isBoardGroupNode(node as Node)) return;
  const container = node as Node;
  container.updateData({
    ...(container.getData<Record<string, any>>() ?? {}),
    boardGroup: true,
    boardGroupBorder: normalizeBoardGroupBorderPreset(preset),
  });
  applyBoardGroupBorderPreset(container);
  fitBoardGroupContainer(container);
  refreshSelectedCellState();
  scheduleSync();
}

function updateSelectedNodeLabel(value: string) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'node') return;
  const node = graph.getCellById(selectedCell.value.id);
  if (!node || !graph.isNode(node)) return;
  const nodeData = node.getData<Record<string, any>>() ?? {};
  node.attr('label/text', value);
  if (nodeData.taskRole === 'task') {
    const description = typeof nodeData.taskDescription === 'string' ? nodeData.taskDescription : '连接上下游任务';
    node.updateData({
      ...nodeData,
      label: value,
      taskDescription: description,
    });
    node.attr('label/text', `${value}\n${description}`);
  }
  if (isMindmap.value && fitMindmapNodeToText(node)) {
    layoutMindmapGraph(graph, readMindmapDirection(props.graphData));
  }
  scheduleSync();
}

function updateSelectedNodeFill(value: string) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'node') return;
  const node = graph.getCellById(selectedCell.value.id);
  if (!node || !graph.isNode(node)) return;
  node.attr('body/fill', value);
  scheduleSync();
}

function updateSelectedNodeStroke(value: string) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'node') return;
  const node = graph.getCellById(selectedCell.value.id);
  if (!node || !graph.isNode(node)) return;
  node.attr('body/stroke', value);
  scheduleSync();
}

function updateSelectedNodeSize(key: 'width' | 'height', rawValue: string) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'node') return;
  const node = graph.getCellById(selectedCell.value.id);
  if (!node || !graph.isNode(node)) return;

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 40) return;

  const size = node.getSize();
  node.resize(key === 'width' ? value : size.width, key === 'height' ? value : size.height);
  if (isMindmap.value) {
    fitMindmapNodeToText(node);
  }
  scheduleSync();
}

/** 将选中节点转换为另一种样式（矩形/圆角矩形/椭圆/菱形），保留文字、颜色、尺寸、连线与 id */
function convertSelectedNodeStyle(preset: BoardNodeStylePreset) {
  if (!graph || !isEditable.value) return;
  const state = selectedCell.value;
  if (!state || state.kind !== 'node' || state.preset === preset) return;
  const oldNode = graph.getCellById(state.id);
  if (!oldNode || !graph.isNode(oldNode)) return;

  const position = oldNode.getPosition();
  const size = oldNode.getSize();
  const oldData = oldNode.getData<Record<string, any>>() ?? {};
  const edgeSnapshots = graph.getConnectedEdges(oldNode).map((edge) => edge.toJSON());

  const meta = createNodeMetadata(preset, {
    id: oldNode.id,
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    label: getNodeLabel(oldNode),
  });

  // 保留用户已调整过的外观，不回退到新样式的默认配色
  const bodyAttrs: Record<string, unknown> = {};
  const bodyFill = oldNode.attr('body/fill');
  if (typeof bodyFill === 'string') bodyAttrs.fill = bodyFill;
  const bodyStroke = oldNode.attr('body/stroke');
  if (typeof bodyStroke === 'string') bodyAttrs.stroke = bodyStroke;
  const bodyStrokeWidth = oldNode.attr('body/strokeWidth');
  if (typeof bodyStrokeWidth === 'number') bodyAttrs.strokeWidth = bodyStrokeWidth;
  const labelFill = oldNode.attr('label/fill');
  meta.attrs = mergeDeep(meta.attrs ?? {}, {
    body: bodyAttrs,
    ...(typeof labelFill === 'string' ? { label: { fill: labelFill } } : {}),
  });
  meta.data = { ...oldData, preset };
  meta.zIndex = oldNode.getZIndex();
  const oldPorts = oldNode.getPorts();
  if (oldPorts?.length) meta.ports = oldPorts;

  // X6 不支持修改既有节点的 shape，只能同 id 重建节点（连线从快照恢复）
  graph.batchUpdate(() => {
    graph!.removeCells([oldNode]);
    const newNode = graph!.addNode(meta);
    for (const edgeJson of edgeSnapshots) {
      graph!.addEdge(edgeJson);
    }
    graph!.resetSelection([newNode]);
  });
  refreshSelectedCellState();
  scheduleSync();
}

function updateSelectedEdgeLabel(value: string) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'edge') return;
  const edge = graph.getCellById(selectedCell.value.id);
  if (!edge || !graph.isEdge(edge)) return;
  setEdgeLabel(edge, value);
  scheduleSync();
}

function updateSelectedEdgeStroke(value: string) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'edge') return;
  const edge = graph.getCellById(selectedCell.value.id);
  if (!edge || !graph.isEdge(edge)) return;
  edge.attr('line/stroke', value);
  scheduleSync();
}

function updateSelectedEdgeRouter(value: string) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'edge') return;
  const edge = graph.getCellById(selectedCell.value.id);
  if (!edge || !graph.isEdge(edge)) return;
  edge.setRouter(value === 'manhattan' ? 'orth' : value, {});
  // 路由器切换后重新挂载箭头工具（直线→自由锚点 / 正交→吸附）。
  syncEdgeTools();
  scheduleSync();
}

function updateSelectedEdgeConnector(value: string) {
  if (!graph || !selectedCell.value || selectedCell.value.kind !== 'edge') return;
  const edge = graph.getCellById(selectedCell.value.id);
  if (!edge || !graph.isEdge(edge)) return;
  if (value === MINDMAP_CONNECTOR_NAME) {
    ensureMindmapConnectorRegistered();
    // Orth/manhattan route points fight the quadratic mindmap path — clear router.
    edge.removeRouter();
    edge.setConnector({ name: MINDMAP_CONNECTOR_NAME });
  } else {
    edge.setConnector(value);
  }
  selectedCell.value = {
    ...selectedCell.value,
    connector: value,
    router: value === MINDMAP_CONNECTOR_NAME
      ? 'normal'
      : selectedCell.value.router,
  };
  scheduleSync();
}

function bringSelectedToFront() {
  if (!graph || !selectedCell.value) return;
  const cell = graph.getCellById(selectedCell.value.id);
  if (!cell) return;
  cell.toFront();
  selectedCell.value = {
    ...selectedCell.value,
    zIndex: cell.getZIndex() ?? null,
  };
  scheduleSync();
}

function sendSelectedToBack() {
  if (!graph || !selectedCell.value) return;
  const cell = graph.getCellById(selectedCell.value.id);
  if (!cell) return;
  cell.toBack();
  selectedCell.value = {
    ...selectedCell.value,
    zIndex: cell.getZIndex() ?? null,
  };
  scheduleSync();
}

function updateSelectedZIndex(value: number) {
  if (!graph || !selectedCell.value || Number.isNaN(value)) return;
  const cell = graph.getCellById(selectedCell.value.id);
  if (!cell) return;
  cell.setZIndex(value);
  selectedCell.value = {
    ...selectedCell.value,
    zIndex: value,
  };
  scheduleSync();
}

function updateSelectedCellContentBinding(binding: CellContentBinding) {
  if (!graph || !selectedCell.value) return;
  const cell = graph.getCellById(selectedCell.value.id);
  if (!cell) return;
  cell.updateData(cellContentBindingToData(binding));
  selectedCell.value = {
    ...selectedCell.value,
    contentBinding: readCellContentBinding(cell.getData<Record<string, unknown>>() ?? {}),
  };
  scheduleSync();
}

function syncUmlClassNode(definition: UmlClassDefinition) {
  if (!graph) return;
  const nodeId = definition.nodeId;
  const existingNode = nodeId ? graph.getCellById(nodeId) : null;
  if (existingNode && graph.isNode(existingNode)) {
    existingNode.attr('label/text', formatUmlClassLabel(definition));
    existingNode.updateData({
      preset: 'umlClass',
      umlClassId: definition.id,
      umlDefinition: definition,
    });
    return;
  }

  const center = getCanvasCenter();
  const node = graph.addNode(createUmlClassNode(definition, {
    x: center.x,
    y: center.y,
    data: {
      umlClassId: definition.id,
      umlDefinition: definition,
    },
  }));
  definition.nodeId = node.id;
  graph.cleanSelection();
  graph.select(node);
}

function syncAllUmlClassNodes() {
  objectModelStore.classes.forEach(syncUmlClassNode);
  updateNodeOverlays();
  scheduleSync();
}

function insertUmlClassPreset(position?: { x: number; y: number }) {
  if (!isEditable.value || !graph) return;
  const anchor = position
    ? { x: position.x - 120, y: position.y - 86 }
    : getCanvasCenter();
  const userClass: UmlClassDefinition = {
    id: createId('uml-class'),
    name: 'User',
    attributes: ['id: string', 'name: string', 'email: string'],
    methods: ['login(): void', 'logout(): void'],
  };
  const orderClass: UmlClassDefinition = {
    id: createId('uml-class'),
    name: 'Order',
    attributes: ['id: string', 'createdAt: Date', 'status: OrderStatus'],
    methods: ['submit(): void', 'cancel(): void'],
  };
  const classNodes = [
    createUmlClassNode(userClass, { x: anchor.x, y: anchor.y, data: { umlClassId: userClass.id, umlDefinition: userClass } }),
    createUmlClassNode(orderClass, { x: anchor.x + 300, y: anchor.y, data: { umlClassId: orderClass.id, umlDefinition: orderClass } }),
  ];
  userClass.nodeId = classNodes[0].id;
  orderClass.nodeId = classNodes[1].id;
  const relation = createEdgeMetadata({
    id: createId('uml-edge'),
    source: { cell: userClass.nodeId, port: 'port-right' },
    target: { cell: orderClass.nodeId, port: 'port-left' },
    labels: [{ attrs: { label: { text: '1  creates  *', fill: '#31511e', fontSize: 12 } } }],
    attrs: {
      line: {
        stroke: '#31511e',
        strokeDasharray: '',
      },
    },
  });
  const userNode = graph.addNode(classNodes[0]);
  const orderNode = graph.addNode(classNodes[1]);
  if (userNode && orderNode) {
    graph.addEdge(relation);
  }
  objectModelStore.upsertClass(userClass);
  objectModelStore.upsertClass(orderClass);
  objectModelStore.upsertObject({
    name: 'currentUser',
    classId: userClass.id,
    propertyValues: {
      id: 'u-001',
      name: 'Alice',
      email: 'alice@example.com',
    },
  });
  graph.cleanSelection();
  graph.select([userNode, orderNode].filter(Boolean) as Node[]);
  refreshSelectedCellState();
  updateNodeOverlays();
  scheduleSync();
}

function editNodeLabel(node: Node) {
  if (!isEditable.value || !graph) return;
  emit('active');
  if (editingNodeId.value === node.id) return;
  // Pasted image / link-card nodes have no inline label to edit.
  if (isCustomPastedShape(node.shape)) return;
  // Group containers carry no text content.
  if (isBoardGroupNode(node)) return;

  const data = node.getData<Record<string, any>>() ?? {};
  if (data.textMode !== 'rich') {
    node.attr('label/visibility', 'hidden');
  }
  graph.disablePanning();
  graph.disableSelection();
  editingNodeId.value = node.id;
  updateNodeOverlays();
}

function tryHandleNodeInternalClick(node: Node) {
  if (!isEditable.value || editingNodeId.value != null) return;
  if (suppressNextNodeInternalClickId === node.id) {
    suppressNextNodeInternalClickId = null;
    return;
  }
  editNodeLabel(node);
}

function editEdgeLabel(edge: Edge) {
  if (!isEditable.value || !graph) return;

  edgeInlineEditId.value = edge.id;
  edgeInlineEditText.value = getEdgeLabel(edge);
  edgeInlineEditStyle.value = getEdgeOverlayStyle(edge);
  edgeInlineEditing.value = true;

  graph.disablePanning();
  graph.disableSelection();

  nextTick(() => {
    edgeInlineInputRef.value?.focus();
    edgeInlineInputRef.value?.select();
  });
}

function resizeGraph() {
  if (!graph || !stageRef.value) return;
  const width = hasExplicitSize.value ? effectiveWidth.value : (stageRef.value.clientWidth || effectiveWidth.value);
  const height = hasExplicitSize.value ? effectiveHeight.value : (stageRef.value.clientHeight || effectiveHeight.value);
  graph.resize(width, height);
  updateUndoRedoState();
  updateNodeOverlays();
}

/**
 * 方向键微调选中节点位置（画板模式）。
 * - 1px/步；Shift+方向键 10px/步。
 * - 复用拖拽的持久化路径：translate 触发 node:change:position → 组合边框收放 + scheduleSync。
 * - 文本/连线内联编辑中放行，让方向键作用于编辑器光标。
 * - 思维导图模式不支持（位置由布局决定）。
 * - 跳过「选中祖先的后代」节点，避免组合容器深平移与成员自身平移叠加导致双倍位移。
 */
function arrowNudge(dx: number, dy: number) {
  if (editingNodeId.value != null || edgeInlineEditing.value) return;
  if (!graph || !isEditable.value || isMindmap.value) return false;
  const selectedNodes = graph.getSelectedCells().filter(
    (cell): cell is Node => graph!.isNode(cell),
  );
  if (!selectedNodes.length) return false;
  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const topLevel = selectedNodes.filter((node) => {
    let parent = node.getParent();
    while (parent && graph!.isNode(parent)) {
      if (selectedIds.has(parent.id)) return false;
      parent = parent.getParent();
    }
    return true;
  });
  startUserInteraction();
  graph.batchUpdate(() => {
    topLevel.forEach((node) => node.translate(dx, dy));
  });
  finishUserInteraction();
  return false;
}

function bindKeyboardShortcuts() {
  if (!graph || !isEditable.value) return;
  if (isMindmap.value) {
    graph.bindKey('tab', () => {
      if (editingNodeId.value != null) return;
      addMindmapChildNode();
      return false;
    });
    graph.bindKey('enter', () => {
      if (editingNodeId.value != null) return;
      addMindmapSiblingNode();
      return false;
    });
  }

  graph.bindKey(['backspace', 'delete'], () => {
    deleteSelection();
    return false;
  });

  graph.bindKey(['ctrl+a', 'meta+a'], () => {
    if (!graph || editingNodeId.value != null || edgeInlineEditing.value) return;
    graph.resetSelection([...graph.getNodes(), ...graph.getEdges()]);
    return false;
  });

  graph.bindKey(['ctrl+c', 'meta+c'], () => {
    copySelection();
    return false;
  });

  graph.bindKey(['ctrl+v', 'meta+v'], () => {
    if (!graph) return;
    if (editingNodeId.value != null || edgeInlineEditing.value) {
      return;
    }
    // 无选中元素且内部剪贴板为空时，从系统剪贴板粘贴（图片/链接/富文本）
    if (!isMindmap.value && graph.getSelectedCells().length === 0 && graph.isClipboardEmpty()) {
      void readSystemClipboardIntoBoard();
      return false;
    }
    pasteSelection();
    return false;
  });

  graph.bindKey(['ctrl+d', 'meta+d'], () => {
    duplicateSelection();
    return false;
  });

  if (props.blockActionsEnabled) {
    graph.bindKey(['ctrl+shift+e', 'meta+shift+e'], () => {
      extractSelectionAsMaterial();
      return false;
    });
  }

  graph.bindKey(['ctrl+z', 'meta+z'], () => {
    undo();
    return false;
  });

  graph.bindKey(['ctrl+y', 'meta+y', 'ctrl+shift+z', 'meta+shift+z'], () => {
    redo();
    return false;
  });

  graph.bindKey('escape', () => {
    if (isStraightLineMode.value) {
      exitStraightLineMode();
      return false;
    }
    if (editingNodeId.value != null) {
      handleNodeOverlayCancel(editingNodeId.value);
    }
    graph?.cleanSelection();
    refreshSelectedCellState();
    return false;
  });

  // 方向键微调选中节点位置：1px/步，Shift+方向键 10px/步
  graph.bindKey('up', () => arrowNudge(0, -1));
  graph.bindKey('down', () => arrowNudge(0, 1));
  graph.bindKey('left', () => arrowNudge(-1, 0));
  graph.bindKey('right', () => arrowNudge(1, 0));
  graph.bindKey('shift+up', () => arrowNudge(0, -10));
  graph.bindKey('shift+down', () => arrowNudge(0, 10));
  graph.bindKey('shift+left', () => arrowNudge(-10, 0));
  graph.bindKey('shift+right', () => arrowNudge(10, 0));
}

/**
 * X6 embedded nodes are nested in the DOM, so one browser click can be
 * translated into node events for both the visible child and its ancestors.
 * Resolve the real hit target from the browser's painted stack and only let
 * the first (highest Z order) X6 node handle the interaction.
 */
function isTopmostNodeAtPointer(
  node: Node,
  e: { clientX: number; clientY: number },
): boolean {
  if (typeof document.elementsFromPoint !== 'function') return true;
  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  for (const element of elements) {
    const nodeElement = element.closest<HTMLElement>('.x6-node[data-cell-id]');
    if (!nodeElement || !stageRef.value?.contains(nodeElement)) continue;
    return nodeElement.dataset.cellId === node.id;
  }
  return true;
}

function bindGraphEvents() {
  if (!graph) return;

  graph.on('selection:changed', () => {
    reconcileSelectionHighlight();
    refreshSelectedCellState();
    syncEdgeTools();
    updateMindmapCollapseOverlays();
    openInspectorForNodeSelection();
  });

  graph.on('node:mousedown', ({ node, e }) => {
    // Prevent the DOM event from bubbling to parent node elements (e.g. when
    // a child is embedded in a container/group parent). Only the topmost node
    // — the one directly under the cursor — should respond to the click.
    e.stopPropagation();
    if (!isTopmostNodeAtPointer(node, e)) return;
    startUserInteraction();
    pendingNodeInternalClickId = null;
    boardGroupMousedownRootSelected = !isMindmap.value
      && !!graph
      && findBoardGroupRoot(node) !== node
      && isBoardGroupNode(findBoardGroupRoot(node))
      && graph.isSelected(findBoardGroupRoot(node));
    beginBoardGroupDrag(node);

    if (!isEditable.value) return;

    // If editing a different node, cancel that edit first
    if (editingNodeId.value != null && editingNodeId.value !== node.id) {
      handleNodeOverlayCancel(editingNodeId.value);
    }

    if (editingNodeId.value != null) {
      return;
    }

    if (
      isMindmap.value
      && getEffectiveCanvasInteractionMode() === 'select'
      && graph
    ) {
      const rootId = findMindmapRootId(graph);
      if (rootId && node.id !== rootId) {
        mindmapDragActiveNodeId = node.id;
        mindmapDragMoved = false;
        mindmapDragSessionStarted = false;
      }
    }

    if (isNodeSoleSelected(node)) {
      pendingNodeInternalClickId = node.id;
    }
  });

  graph.on('node:moving', ({ node }) => {
    if (
      !isMindmap.value
      || !isEditable.value
      || getEffectiveCanvasInteractionMode() !== 'select'
      || !graph
      || mindmapDragActiveNodeId !== node.id
    ) {
      return;
    }
    if (!mindmapDragSessionStarted) {
      beginMindmapNodeDrag(graph, node.id);
      mindmapDragSessionStarted = true;
    }
    mindmapDragMoved = true;
    const position = node.getPosition();
    const size = node.getSize();
    updateMindmapDragPreview(graph, node, {
      x: position.x + size.width / 2,
      y: position.y + size.height / 2,
    });
  });

  graph.on('node:mouseup', () => {
    endBoardGroupDrag();
    if (
      isMindmap.value
      && graph
      && mindmapDragActiveNodeId
      && !mindmapDragMoved
    ) {
      endMindmapNodeDrag(graph, readMindmapDirection(props.graphData), { layout: false });
      mindmapDragActiveNodeId = null;
      mindmapDragSessionStarted = false;
    }
    finishUserInteraction();
  });

  graph.on('node:change:position', ({ node }) => {
    if (isApplyingExternalData) return;
    updateBoardGroupDrag(node, node.getPosition());
    // Follow solo member moves so the group border hugs the members. Skipped
    // while dragging the whole group as a unit (container already translates).
    if (!boardGroupDragState) refitBoardGroupForMember(node);
    if (!boardGroupDragState) refitNodeContainerForMember(node);
  });

  graph.on('node:change:size', ({ node }) => {
    if (isApplyingExternalData) return;
    if (!boardGroupDragState) refitBoardGroupForMember(node);
    if (!boardGroupDragState) refitNodeContainerForMember(node);
  });

  graph.on('node:resizing', ({ node }) => {
    // Keep a resized container from shrinking into its children: the border
    // stops at the first child it would otherwise overlap. Only the edges the
    // user is actually dragging are clamped (derived from the resize-start
    // box), so the opposite fixed corner stays put and the adjacent side is
    // never stretched.
    if (containerResizeStartBox && isNodeContainer(node)) {
      clampContainerResizeToChildren(node, containerResizeStartBox);
    }
  });

  graph.on('node:moved', ({ node }) => {
    if (
      isMindmap.value
      && isEditable.value
      && getEffectiveCanvasInteractionMode() === 'select'
      && graph
      && mindmapDragActiveNodeId === node.id
    ) {
      const direction = readMindmapDirection(props.graphData);
      const excluded = new Set(collectMindmapDescendantIds(graph, node.id));
      const pointer = getLastMindmapDragPointer() ?? {
        x: node.getPosition().x + node.getSize().width / 2,
        y: node.getPosition().y + node.getSize().height / 2,
      };
      const target = findMindmapDropTarget(graph, pointer, node, excluded);
      mindmapDragActiveNodeId = null;
      mindmapDragMoved = false;
      mindmapDragSessionStarted = false;
      const result = commitMindmapDragDrop(graph, node, target, pointer);
      endMindmapNodeDrag(graph, direction, { layout: false });
      if (result !== 'unchanged') {
        updateMindmapCollapseOverlays();
        scheduleSync();
      }
      finishUserInteraction();
      return;
    }
    finishUserInteraction();
  });

  graph.on('node:resize', ({ node }) => {
    startUserInteraction();
    // Remember the box at the start of a handle drag so `node:resizing` can
    // derive which edges the user is dragging (the event args do not carry the
    // direction at runtime).
    if (isNodeContainer(node)) {
      const box = node.getBBox();
      containerResizeStartBox = { x: box.x, y: box.y, width: box.width, height: box.height };
    }
  });

  graph.on('node:resized', ({ node }) => {
    if (isMindmap.value && graph && graph.isNode(node)) {
      fitMindmapNodeToText(node);
    }
    containerResizeStartBox = null;
    finishUserInteraction();
  });

  graph.on('edge:mousedown', () => {
    startUserInteraction();
  });

  graph.on('edge:mouseup', () => {
    finishUserInteraction();
  });

  graph.on('edge:connected', () => {
    if (isMindmap.value && graph) {
      syncMindmapGraphState();
      scheduleSync();
    }
    syncTaskFlowEdgeState();
    finishUserInteraction();
  });

  graph.on('blank:mouseup', () => {
    finishUserInteraction();
    endBoardGroupDrag();
    pendingNodeInternalClickId = null;
  });

  graph.on('blank:click', ({ x, y }) => {
    if (isStraightLineMode.value) {
      handleStraightLineClick(x, y);
      return;
    }
    if (editingNodeId.value != null) {
      handleNodeOverlayCancel(editingNodeId.value);
    }
    pendingNodeInternalClickId = null;
  });

  graph.on('blank:mousemove', ({ x, y }) => {
    if (!isStraightLineMode.value) return;
    handleStraightLineMouseMove(x, y);
  });

  graph.on('node:mousemove', ({ x, y }) => {
    if (!isStraightLineMode.value) return;
    handleStraightLineMouseMove(x, y);
  });

  graph.on('node:mouseenter', ({ node }) => {
    if (!isMindmap.value) return;
    showMindmapCollapseForNode(node.id);
  });

  graph.on('node:mouseleave', () => {
    if (!isMindmap.value) return;
    scheduleHideMindmapCollapse();
  });

  graph.on('node:click', ({ node, e, x, y }) => {
    // Same as node:mousedown: prevent bubbling to embedded parent nodes.
    e.stopPropagation();
    if (!isTopmostNodeAtPointer(node, e)) return;
    if (isStraightLineMode.value) {
      handleStraightLineClick(x, y);
      return;
    }

    const shouldHandleInternalClick = pendingNodeInternalClickId === node.id;
    pendingNodeInternalClickId = null;

    if (shouldHandleInternalClick) {
      tryHandleNodeInternalClick(node);
    }

    // Grouped members select their outermost group container on click;
    // clicking a member of an already-selected group drills in to select the
    // member itself. Alt+click bypasses the group and selects the member directly.
    // Ctrl/⌘+click keeps its reserved multi-select meaning (member is toggled
    // by X6's Selection plugin), so we skip the group redirect entirely.
    // Node containers (子元素 parents) are real nodes, not groups: clicking a
    // child of a node container must select that child directly, never the parent.
    if (!isMindmap.value && graph && !e.ctrlKey && !e.metaKey) {
      const groupRoot = findBoardGroupRoot(node);
      if (groupRoot !== node && isBoardGroupNode(groupRoot)) {
        if (e.altKey) {
          // Keep the member (and any unrelated cells), but drop the group container.
          const others = graph
            .getSelectedCells()
            .filter((cell) => cell.id !== groupRoot.id && cell.id !== node.id);
          graph.resetSelection([...others, node]);
        } else if (boardGroupMousedownRootSelected) {
          // Group already selected → clicking a member drills in to select it alone.
          graph.resetSelection([node]);
        } else {
          graph.resetSelection([groupRoot]);
        }
        finalizeSelectionVisualState();
        return;
      }
    }

    // Runs after Transform plugin's node:click handler (registered earlier in initGraph).
    finalizeSelectionVisualState();
  });

  // 直线模式下点击已有连线也视为自由点
  graph.on('edge:click', ({ x, y }) => {
    if (isStraightLineMode.value) {
      handleStraightLineClick(x, y);
    }
  });

  graph.on('blank:dblclick', () => {
    if (inspectorTab.value === 'library') return;
    if (isMindmap.value) {
      addMindmapChildNode();
      return;
    }
    addNode(isTaskFlow.value ? 'round' : 'rect');
  });

  graph.on('node:dblclick', ({ node, e }) => {
    e.stopPropagation();
    if (!isTopmostNodeAtPointer(node, e)) return;
    tryHandleNodeInternalClick(node);
  });

  graph.on('edge:dblclick', ({ edge }) => {
    editEdgeLabel(edge);
  });

  // Bend anchors / arrowheads only while a single edge is selected.
  // Hover-mounted vertices tools steal the first click (black dots) and block selection.

  graph.on('history:change', () => {
    updateUndoRedoState();
  });

  graph.model.on('cell:added', () => scheduleSync());
  graph.model.on('cell:removed', () => scheduleSync());
  graph.model.on('node:change:position', () => scheduleSync());
  graph.model.on('node:change:size', () => scheduleSync());
  graph.model.on('cell:change:attrs', () => scheduleSync());
  graph.model.on('cell:change:labels', () => scheduleSync());
  graph.model.on('cell:change:source', () => scheduleSync());
  graph.model.on('cell:change:target', () => scheduleSync());
  graph.model.on('cell:change:vertices', () => scheduleSync());
  graph.model.on('cell:change:data', () => scheduleSync());
  graph.model.on('cell:added', ({ cell }) => {
    // Edges default to a high z-axis so lines render above nodes.
    // Edges loaded from JSON with an explicit zIndex (user-edited) are preserved.
    // Drag preview edge stays one level above.
    if (!graph?.isEdge(cell)) return;
    if (cell.id === MINDMAP_DRAG_PREVIEW_EDGE_ID) {
      cell.setZIndex(EDGE_Z_INDEX + 1);
    } else if (cell.getZIndex() == null) {
      cell.setZIndex(EDGE_Z_INDEX);
    }
  });
  graph.model.on('cell:added', syncTaskFlowEdgeState);
  graph.model.on('cell:removed', syncTaskFlowEdgeState);
  graph.model.on('cell:change:source', syncTaskFlowEdgeState);
  graph.model.on('cell:change:target', syncTaskFlowEdgeState);
  graph.model.on('cell:added', syncMindmapGraphState);
  graph.model.on('cell:removed', syncMindmapGraphState);

  // Update node overlays on graph transform / node changes
  graph.on('translate', () => {
    updateNodeOverlays();
    updateMindmapCollapseOverlays();
  });
  graph.on('scale', () => {
    updateNodeOverlays();
    updateMindmapCollapseOverlays();
  });
  graph.model.on('node:change:position', updateNodeOverlays);
  graph.model.on('node:change:size', updateNodeOverlays);
  graph.model.on('cell:change:data', updateNodeOverlays);
  graph.model.on('cell:added', updateNodeOverlays);
  graph.model.on('cell:removed', updateNodeOverlays);
}

function createMindmapConnectingEdge(): Edge {
  return graph!.createEdge(createEdgeMetadata({
    router: { name: 'normal' },
    connector: { name: 'smooth' },
    attrs: {
      line: {
        stroke: '#8c8c8c',
        strokeWidth: 2,
        targetMarker: { name: 'classic', size: 8 },
      },
    },
  })) as Edge;
}

function initGraph() {
  if (!containerRef.value || !stageRef.value) return;

  ensureMindmapConnectorRegistered();
  ensureOrthSmartRouterRegistered();

  // 重置直线模式状态（避免引用已销毁的旧 graph 上的 edge）
  isStraightLineMode.value = false;
  straightLinePreviewEdge = null;

  if (graph) {
    graph.dispose();
    graph = null;
  }

  graph = new Graph({
    container: containerRef.value,
    width: stageRef.value.clientWidth || props.width,
    height: stageRef.value.clientHeight || props.height,
    background: {
      color: '#fcfcfd',
    },
    grid: {
      size: 20,
      visible: true,
      type: 'doubleMesh',
      args: [
        { color: '#eef1f6', thickness: 1 },
        { color: '#d9dee8', thickness: 1, factor: 4 },
      ],
    },
    scaling: {
      min: 0.2,
      max: 3,
    },
    panning: {
      enabled: true,
      eventTypes: ['rightMouseDown'],
    },
    mousewheel: {
      // Kept as fallback when the wheel lands on the graph SVG itself.
      // Stage capture handler (handleStageCtrlWheel) covers overlays + dialog hosts.
      enabled: true,
      modifiers: ['ctrl', 'meta'],
      minScale: ZOOM_MIN,
      maxScale: ZOOM_MAX,
      factor: ZOOM_FACTOR,
    },
    connecting: {
      snap: isMindmap.value ? { radius: 40, anchor: 'center' } : { radius: 28 },
      allowBlank: false,
      allowLoop: false,
      allowNode: false,
      allowEdge: false,
      allowMulti: 'withPort',
      highlight: true,
      connectionPoint: 'boundary',
      anchor: 'center',
      router: isMindmap.value
        ? { name: 'normal' }
        : { name: ORTH_SMART_ROUTER_NAME },
      connector: isMindmap.value
        ? { name: 'smooth' }
        : { name: 'rounded' },
      createEdge: () => (
        isMindmap.value
          ? createMindmapConnectingEdge()
          : graph?.createEdge(createEdgeMetadata()) as Edge
      ),
      validateMagnet: ({ magnet }) => isEditable.value && magnet.getAttribute('port-group') != null,
      validateConnection: ({ edge, sourceCell, targetCell, sourceMagnet, targetMagnet }) => {
        if (!isEditable.value) return false;
        if (!sourceCell || !targetCell || !sourceMagnet || !targetMagnet) return false;
        if (graph?.isNode(sourceCell) && isBoardGroupNode(sourceCell)) return false;
        if (graph?.isNode(targetCell) && isBoardGroupNode(targetCell)) return false;
        if (sourceCell.id === targetCell.id && sourceMagnet === targetMagnet) return false;

        if (isMindmap.value) {
          if (!graph?.isNode(sourceCell) || !graph?.isNode(targetCell)) return false;
          return canConnectMindmapEdge(graph, sourceCell, targetCell, edge?.id);
        }

        if (graph?.isNode(sourceCell) && graph?.isNode(targetCell) && !canCreateTaskFlowEdge(sourceCell, targetCell)) return false;
        return true;
      },
    },
    interacting: (cellView) => {
      const cell = cellView.cell;
      const mindmapSelectDrag = isMindmap.value
        && isEditable.value
        && getEffectiveCanvasInteractionMode() === 'select'
        && graph?.isNode(cell)
        && cell.getData<Record<string, unknown>>()?.mindRole !== 'root';
      const defaultMovable = isEditable.value && !isMindmap.value;
      // Only the sole selected edge may add/move bend vertices — otherwise the
      // first click on an unselected edge creates a black anchor instead of selecting.
      const soleSelectedEdge = !!graph
        && graph.isEdge(cell)
        && graph.isSelected(cell)
        && graph.getSelectedCells().length === 1;
      const edgeVertexEditable = defaultMovable && soleSelectedEdge;
      return {
        nodeMovable: mindmapSelectDrag || defaultMovable,
        edgeMovable: defaultMovable,
        edgeLabelMovable: defaultMovable,
        magnetConnectable: isEditable.value,
        arrowheadMovable: edgeVertexEditable,
        vertexMovable: edgeVertexEditable,
        vertexAddable: edgeVertexEditable,
        vertexDeletable: edgeVertexEditable,
      };
    },
  });

  graph.use(
    new Selection({
      enabled: true,
      rubberband: true,
      multiple: true,
      movable: false,
      showEdgeSelectionBox: false,
      showNodeSelectionBox: false,
      pointerEvents: 'none',
    }),
  );
  graph.use(new Keyboard({ enabled: isEditable.value }));
  graph.use(new Clipboard({ enabled: true, useLocalStorage: false }));
  graph.use(new History({
    enabled: true,
    beforeAddCommand: (_event, args) => {
      const options = args && 'options' in args ? args.options as Record<string, unknown> | undefined : undefined;
      return options?.[MINDMAP_DRAG_PREVIEW_OPTION] === true ? false : undefined;
    },
  }));
  graph.use(new Snapline({ enabled: isEditable.value }));
  graph.use(
    new Transform({
      resizing: {
        enabled: isEditable.value,
        minWidth: 72,
        minHeight: 40,
        orthogonal: false,
        restrict: true,
      },
      rotating: false,
    }),
  );

  ensureBoardGroupShape();
  ensureSnappingArrowheadToolsRegistered();
  ensureFreeAnchorArrowheadToolsRegistered();
  ensurePlainArrowheadToolsRegistered();
  attachMindmapDirection(graph, props.graphData);
  bindKeyboardShortcuts();
  bindGraphEvents();
  applyGraphData(props.graphData, true);
  applyCanvasInteractionMode();
  updateUndoRedoState();

  // Dev/test hook: expose the live graph so E2E can assert model state
  // (embed parent/child, selection, etc.) that has no direct DOM signal.
  if (import.meta.env.DEV) {
    (window as any).__x6graph = graph;
  }
}

onMounted(() => {
  nextTick(() => {
    initGraph();
    bindStageCtrlWheel();
    bindStageWheelPan();
    bindSpacePanListeners();
    bindRightButtonPanListeners();

    if (stageRef.value) {
      resizeObserver = new ResizeObserver(() => {
        resizeGraph();
      });
      resizeObserver.observe(stageRef.value);
      // 标记最近交互的画板 stage，用于多实例下的系统粘贴路由
      stageRef.value.addEventListener('pointerdown', markStageActiveForBoardPaste);
      stageRef.value.addEventListener('focusin', markStageActiveForBoardPaste);
      // 同时屏蔽右键释放后可能产生的菜单与辅助点击默认行为。
      stageRef.value.addEventListener('contextmenu', preventStageContextMenu, true);
      stageRef.value.addEventListener('auxclick', preventStageRightButtonDefault, true);
    }
    document.addEventListener('paste', handleDocumentPaste);
    document.addEventListener('keydown', handleDocumentKeydownForBoard);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
  });
});

function markStageActiveForBoardPaste() {
  if (stageRef.value) {
    markActiveX6Stage(stageRef.value);
  }
}

/**
 * 屏蔽画板 stage 上的浏览器原生右键菜单：右键拖动平移（panning eventTypes
 * 含 rightMouseDown）时不再触发系统右键手势。画板交互不依赖原生 contextmenu。
 */
function preventStageContextMenu(e: MouseEvent) {
  e.preventDefault();
}

function preventStageRightButtonDefault(e: MouseEvent) {
  if (e.button === 2) {
    e.preventDefault();
  }
}

onBeforeUnmount(() => {
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
    // Flush the final graph mutation before a nested board reference or page
    // disappears; otherwise a quick navigation within the debounce window can
    // drop the last edit.
    emitGraphData();
  }
  clearMindmapCollapseHideTimer();
  unbindStageCtrlWheel();
  unbindStageWheelPan();
  unbindSpacePanListeners();
  unbindRightButtonPanListeners();
  document.removeEventListener('paste', handleDocumentPaste);
  document.removeEventListener('keydown', handleDocumentKeydownForBoard);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  if (stageRef.value) {
    stageRef.value.removeEventListener('pointerdown', markStageActiveForBoardPaste);
    stageRef.value.removeEventListener('focusin', markStageActiveForBoardPaste);
    stageRef.value.removeEventListener('contextmenu', preventStageContextMenu, true);
    stageRef.value.removeEventListener('auxclick', preventStageRightButtonDefault, true);
  }
  if (getActiveX6Stage() === stageRef.value) {
    markActiveX6Stage(document.body);
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (graph) {
    graph.dispose();
    graph = null;
  }
});

watch(
  () => getGraphSnapshot(props.graphData),
  () => {
    if (!graph) return;
    applyGraphData(props.graphData);
  },
);

watch(
  () => props.editable,
  () => {
    nextTick(() => initGraph());
  },
);

watch(
  () => props.toolbarEnabled,
  (enabled) => {
    toolbarVisible.value = enabled;
  },
);

watch(
  () => props.inspectorEnabled,
  (enabled) => {
    if (!enabled) {
      inspectorVisible.value = false;
      return;
    }
    if (props.inspectorDefaultVisible) {
      inspectorVisible.value = true;
    }
  },
);

watch(
  () => [props.width, props.height] as const,
  ([w, h]) => {
    if (!graph || !stageRef.value || w == null || h == null) return;
    graph.resize(w, h);
    if (props.autoFitOnResize && graph.getCellCount() > 0) {
      graph.zoomToFit({ padding: 18, maxScale: 1 });
      graph.centerContent();
    }
    updateUndoRedoState();
    updateNodeOverlays();
  },
);

function dockReferenceInterfaceTerminals(items: Array<{
  edgeId: string;
  direction: ExtractedBoardInterfaceDirection;
  clientX: number;
  clientY: number;
}>) {
  if (!graph || !items.length) return;
  const historyEnabled = graph.isHistoryEnabled();
  const previousApplyingExternalData = isApplyingExternalData;
  if (historyEnabled) graph.disableHistory();
  isApplyingExternalData = true;
  try {
    for (const item of items) {
      const edge = graph.getCellById(item.edgeId);
      if (!edge || !graph.isEdge(edge)) continue;
      if (!referenceInterfaceOriginalTerminals.has(item.edgeId)) {
        const terminal = item.direction === 'out' ? edge.getTarget() : edge.getSource();
        referenceInterfaceOriginalTerminals.set(item.edgeId, {
          direction: item.direction,
          terminal: JSON.parse(JSON.stringify(terminal)) as unknown,
        });
      }
      const local = graph.clientToLocal(item.clientX, item.clientY);
      const current = item.direction === 'out' ? edge.getTarget() : edge.getSource();
      if (
        typeof current.x === 'number'
        && typeof current.y === 'number'
        && Math.abs(current.x - local.x) < 0.1
        && Math.abs(current.y - local.y) < 0.1
      ) {
        continue;
      }
      if (item.direction === 'out') {
        edge.setTarget({ x: local.x, y: local.y });
      } else {
        edge.setSource({ x: local.x, y: local.y });
      }
    }
  } finally {
    isApplyingExternalData = previousApplyingExternalData;
    if (historyEnabled) graph.enableHistory();
  }
}

defineExpose({
  getMarkdownLinkAnchor,
  insertMarkdownLink,
  updateInsertedLinkDisplay,
  updateInsertedImageWidth,
  insertRefBlock,
  fitGraph,
  dockReferenceInterfaceTerminals,
});
</script>

<template>
  <div
    ref="rootRef"
    class="x6-editor"
    :class="{
      'x6-editor--fullscreen': isFullscreen,
      'x6-editor--sized': hasExplicitSize,
      'x6-editor--fill': isFillLayout,
      'x6-editor--node-editing': isFillLayout && isNodeEditing,
      'x6-editor--mindmap': isMindmap,
      'x6-editor--chrome-compact': !chromeBare,
      'x6-editor--chrome-bare': chromeBare,
      'x6-editor--readonly': !isEditable,
    }"
    :style="editorStyle"
    @mousedown.stop="emit('active')"
    @click.stop
    @dblclick.stop
  >
    <div v-if="toolbarEnabled && toolbarVisible" class="x6-toolbar">
      <div class="toolbar-group">
        <button type="button" class="tool-button tool-button--icon" title="切换工具栏" @click="toolbarVisible = false">
          ⊖
        </button>
      </div>

      <div class="toolbar-group toolbar-group--interaction" role="group" aria-label="画布交互模式">
        <button
          type="button"
          class="tool-button tool-button--icon tool-button--mode"
          :class="{ 'tool-button--active': canvasInteractionMode === 'select' }"
          title="选择"
          aria-label="选择模式"
          :aria-pressed="canvasInteractionMode === 'select'"
          @click="setCanvasInteractionMode('select')"
        >
          <svg class="tool-button__mode-icon tool-button__mode-icon--pointer" viewBox="0 0 24 24" aria-hidden="true">
            <path
              class="tool-button__pointer-shape"
              d="M4 2v16.2l4.35-3.8 2.72 6.1 1.93-.88-2.72-5.72H17L4 2Z"
            />
          </svg>
        </button>
        <button
          type="button"
          class="tool-button tool-button--icon tool-button--mode"
          :class="{ 'tool-button--active': canvasInteractionMode === 'pan' }"
          title="拖拽画布（按住空格）"
          aria-label="拖拽模式"
          :aria-pressed="canvasInteractionMode === 'pan'"
          @click="setCanvasInteractionMode('pan')"
        >
          <svg class="tool-button__mode-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M9 11V6.5a1.5 1.5 0 1 1 3 0V10h1V5.5a1.5 1.5 0 1 1 3 0V10h1V7a1.5 1.5 0 1 1 3 0v6.5c0 2.2-1.5 4.5-4 5.5-2.2.9-4.5.5-6-1.2l-2.5-3.8A1.5 1.5 0 0 1 8.4 12L9 11Z"
            />
          </svg>
        </button>
      </div>

      <div class="toolbar-group" v-if="isTaskFlow">
        <button
          type="button"
          class="tool-button tool-button--shape"
          :disabled="!isEditable"
          draggable="true"
          title="点击插入到画布中心，或拖到画布指定位置"
          @click="onShapeButtonClick('round')"
          @dragstart="onShapeButtonDragStart($event, { kind: 'preset', preset: 'round' })"
          @drag="onShapeButtonDrag"
          @dragend="onShapeButtonDragEnd"
        >
          <svg class="tool-button__icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="6" fill="#fff8e6" stroke="#d48806" stroke-width="1.2"/></svg>
          <span class="tool-button__label">新任务</span>
        </button>
        <button
          type="button"
          class="tool-button tool-button--shape"
          :disabled="!isEditable"
          draggable="true"
          title="点击插入到画布中心，或拖到画布指定位置"
          @click="onShapeButtonClick('ellipse')"
          @dragstart="onShapeButtonDragStart($event, { kind: 'preset', preset: 'ellipse' })"
          @drag="onShapeButtonDrag"
          @dragend="onShapeButtonDragEnd"
        >
          <svg class="tool-button__icon" viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="9" ry="8" fill="#e6f4ff" stroke="#1677ff" stroke-width="1.2"/></svg>
          <span class="tool-button__label">起止节点</span>
        </button>
      </div>
      <div class="toolbar-group" v-else-if="isMindmap">
        <button type="button" class="tool-button" :disabled="!isEditable" @click="addMindmapChildNode">
          子节点 (Tab)
        </button>
        <button type="button" class="tool-button" :disabled="!isEditable" @click="addMindmapSiblingNode">
          同级 (Enter)
        </button>
        <button type="button" class="tool-button" :disabled="!isEditable" @click="relayoutMindmap">
          自动布局
        </button>
      </div>
      <div class="toolbar-group" v-else>
        <button
          type="button"
          class="tool-button tool-button--shape"
          :disabled="!isEditable"
          draggable="true"
          title="点击插入到画布中心，或拖到画布指定位置"
          @click="onShapeButtonClick('rect')"
          @dragstart="onShapeButtonDragStart($event, { kind: 'preset', preset: 'rect' })"
          @drag="onShapeButtonDrag"
          @dragend="onShapeButtonDragEnd"
        >
          <svg class="tool-button__icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="#fff7e6" stroke="#d48806" stroke-width="1.2"/></svg>
          <span class="tool-button__label">矩形</span>
        </button>
        <button
          type="button"
          class="tool-button tool-button--shape"
          :disabled="!isEditable"
          draggable="true"
          title="点击插入到画布中心，或拖到画布指定位置"
          @click="onShapeButtonClick('round')"
          @dragstart="onShapeButtonDragStart($event, { kind: 'preset', preset: 'round' })"
          @drag="onShapeButtonDrag"
          @dragend="onShapeButtonDragEnd"
        >
          <svg class="tool-button__icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="5" fill="#f6ffed" stroke="#389e0d" stroke-width="1.2"/></svg>
          <span class="tool-button__label">圆角矩形</span>
        </button>
        <button
          type="button"
          class="tool-button tool-button--shape"
          :disabled="!isEditable"
          draggable="true"
          title="点击插入到画布中心，或拖到画布指定位置"
          @click="onShapeButtonClick('ellipse')"
          @dragstart="onShapeButtonDragStart($event, { kind: 'preset', preset: 'ellipse' })"
          @drag="onShapeButtonDrag"
          @dragend="onShapeButtonDragEnd"
        >
          <svg class="tool-button__icon" viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="9" ry="8" fill="#e6f4ff" stroke="#1677ff" stroke-width="1.2"/></svg>
          <span class="tool-button__label">圆形</span>
        </button>
        <button
          type="button"
          class="tool-button tool-button--shape"
          :disabled="!isEditable"
          draggable="true"
          title="点击插入到画布中心，或拖到画布指定位置"
          @click="onShapeButtonClick('diamond')"
          @dragstart="onShapeButtonDragStart($event, { kind: 'preset', preset: 'diamond' })"
          @drag="onShapeButtonDrag"
          @dragend="onShapeButtonDragEnd"
        >
          <svg class="tool-button__icon" viewBox="0 0 24 24"><polygon points="12,3 22,13 12,23 2,13" fill="#fff1f0" stroke="#cf1322" stroke-width="1.2"/></svg>
          <span class="tool-button__label">菱形</span>
        </button>
        <button
          type="button"
          class="tool-button tool-button--shape"
          :disabled="!isEditable"
          draggable="true"
          title="点击插入到画布中心，或拖到画布指定位置"
          @click="onUmlShapeButtonClick"
          @dragstart="onShapeButtonDragStart($event, { kind: 'uml-preset' })"
          @drag="onShapeButtonDrag"
          @dragend="onShapeButtonDragEnd"
        >
          <svg class="tool-button__icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1.5" fill="#fffbe6" stroke="#d4a017" stroke-width="1"/><line x1="3" y1="9" x2="21" y2="9" stroke="#d4a017" stroke-width="0.6"/><line x1="3" y1="15" x2="21" y2="15" stroke="#d4a017" stroke-width="0.6"/></svg>
          <span class="tool-button__label">UML 类图</span>
        </button>
        <button type="button" class="tool-button" :disabled="!isEditable || objectModelStore.classes.length === 0" @click="syncAllUmlClassNodes">
          同步对象模型
        </button>
      </div>
      <div class="toolbar-group" v-if="!isMindmap">
        <button
          type="button"
          class="tool-button tool-button--shape"
          :class="{ 'tool-button--active': isStraightLineMode }"
          :disabled="!isEditable"
          :title="isStraightLineMode ? '退出直线连线模式（Esc）' : '直线连线模式：点击设起点，移动预览，再点击设终点'"
          :aria-pressed="isStraightLineMode"
          @click="toggleStraightLineMode"
        >
          <svg class="tool-button__icon" viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" stroke="#52616b" stroke-width="2" stroke-linecap="round"/><circle cx="4" cy="20" r="2.5" fill="#fff" stroke="#52616b" stroke-width="1.5"/><circle cx="20" cy="4" r="2.5" fill="#fff" stroke="#52616b" stroke-width="1.5"/></svg>
          <span class="tool-button__label">直线连线</span>
        </button>
      </div>
      <div class="toolbar-group">
        <button type="button" class="tool-button" :disabled="selectedCellsCount === 0" @click="copySelection">
          复制
        </button>
        <button type="button" class="tool-button" :disabled="!isEditable || selectedCellsCount === 0" @click="duplicateSelection">
          复制副本
        </button>
        <button type="button" class="tool-button" :disabled="!isEditable" @click="pasteSelection">
          粘贴
        </button>
        <button type="button" class="tool-button tool-button--danger" :disabled="!isEditable || deletableSelectionCount === 0" @click="deleteSelection">
          删除
        </button>
      </div>

      <div class="toolbar-group">
        <button type="button" class="tool-button" :disabled="!canUndo" @click="undo">撤销</button>
        <button type="button" class="tool-button" :disabled="!canRedo" @click="redo">重做</button>
      </div>

      <div class="toolbar-group">
        <button type="button" class="tool-button" @click="zoomOut">缩小</button>
        <button type="button" class="tool-button" @click="zoomIn">放大</button>
        <button type="button" class="tool-button" @click="resetZoom">100%</button>
        <button type="button" class="tool-button" @click="() => fitGraph()">适配</button>
        <button type="button" class="tool-button" @click="centerGraph">居中</button>
        <button type="button" class="tool-button" @click="toggleGrid">
          {{ gridVisible ? '隐藏网格' : '显示网格' }}
        </button>
        <button
          type="button"
          class="tool-button"
          :title="isFullscreen ? '退出全屏' : '全屏画板'"
          @click="toggleFullscreen"
        >
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </button>
      </div>

      <div v-if="blockActionsEnabled" class="toolbar-group">
        <button type="button" class="tool-button" :disabled="selectedCellsCount === 0" @click="extractSelectionAsMaterial">
          提取为素材
        </button>
        <button
          type="button"
          class="tool-button"
          :disabled="selectedCellsCount === 0 || extractingSelectionBoard"
          title="把选中节点提取为同级独立画板页；跨出选区的连线保留为对外接口"
          @click="extractSelectionAsBoardPage"
        >
          {{ extractingSelectionBoard ? '提取中…' : '提取为画板页' }}
        </button>
        <button
          type="button"
          class="tool-button"
          :disabled="!isEditable || groupActionButtonMode === ''"
          :title="groupActionButtonMode === 'ungroup' ? '解散选中的组合（保留成员）' : '将选中的多个节点编为一组'"
          @click="groupActionButtonMode === 'ungroup' ? ungroupSelection() : groupSelection()"
        >
          {{ groupActionButtonMode === 'ungroup' ? '取消组合' : '组合' }}
        </button>
        <button
          v-if="!isMindmap"
          type="button"
          class="tool-button"
          :disabled="!isEditable || childActionButtonMode === ''"
          :title="childActionButtonMode === 'detach' ? '将选中的子元素从父节点分离' : '将先选中的节点设为后选中节点的子元素'"
          @click="childActionButtonMode === 'detach' ? detachFromParent() : makeChildOfParent()"
        >
          {{ childActionButtonMode === 'detach' ? '取消子元素' : '设为子元素' }}
        </button>
        <button type="button" class="tool-button" :disabled="!isEditable" @click="requestInsertRefBlock">
          插入引用块
        </button>
      </div>

      <div class="toolbar-group toolbar-group--summary">
        <span class="toolbar-summary">{{ selectionSummary }}</span>
        <span class="toolbar-summary">{{ zoomPercent }}%</span>
      </div>
    </div>

    <div class="x6-workspace" :class="{ 'x6-workspace--no-inspector': !inspectorEnabled || !inspectorVisible }">
      <div
        v-if="(toolbarEnabled && !toolbarVisible) || (inspectorEnabled && !inspectorVisible)"
        class="x6-restore-bar x6-restore-bar--floating"
      >
        <button v-if="toolbarEnabled && !toolbarVisible" type="button" class="x6-restore-button" title="显示工具栏" @click="toolbarVisible = true">
          ⊞ 工具栏
        </button>
        <button v-if="inspectorEnabled && !inspectorVisible" type="button" class="x6-restore-button" title="显示侧边栏" @click="inspectorVisible = true">
          ⊞ 侧边栏
        </button>
      </div>
      <div
        ref="stageRef"
        class="x6-stage"
        :class="{
          'x6-stage--library': inspectorTab === 'library',
          'x6-stage--node-editing': isFillLayout && isNodeEditing,
          'x6-stage--interaction-select': !spacePanActive && canvasInteractionMode === 'select',
          'x6-stage--interaction-pan': spacePanActive || canvasInteractionMode === 'pan',
          'x6-stage--straight-line-mode': isStraightLineMode,
        }"
        :style="stageStyle"
        @dragover.capture="onMaterialDragOver"
        @drop.capture="onMaterialDrop"
      >
        <div ref="containerRef" class="x6-canvas"></div>

        <div
          v-if="graphSourceRegion"
          class="x6-source-region"
          :class="`x6-source-region--${graphSourceRegion.kind}`"
          :style="graphSourceRegion.style"
        >
          <div class="x6-source-region__header">
            <span class="x6-source-region__label">{{ graphSourceRegion.label }}</span>
            <div v-if="hasGraphSourceActions" class="x6-source-region__actions">
              <button
                v-if="sourceLoadEnabled"
                type="button"
                class="x6-source-region__button"
                @click.stop="syncFromSource"
              >
                从源同步
              </button>
              <button
                v-if="sourceWriteBackEnabled"
                type="button"
                class="x6-source-region__button x6-source-region__button--primary"
                :disabled="!isEditable"
                @click.stop="syncToSource"
              >
                同步至源
              </button>
            </div>
          </div>
        </div>

        <!-- Mindmap expand/collapse hover buttons -->
        <button
          v-for="btn in mindmapCollapseButtons"
          :key="`collapse-${btn.nodeId}`"
          type="button"
          class="mindmap-collapse-btn"
          :class="{ 'mindmap-collapse-btn--expanded': !btn.collapsed }"
          :style="btn.style"
          :title="btn.collapsed ? '展开子节点' : '收起子节点'"
          :aria-label="btn.collapsed ? '展开子节点' : '收起子节点'"
          :disabled="mindmapCollapseLoadingNodeId === btn.nodeId"
          @mousedown.stop
          @click.stop="void onMindmapCollapseButtonClick(btn.nodeId)"
          @mouseenter="showMindmapCollapseForNode(btn.nodeId)"
          @mouseleave="scheduleHideMindmapCollapse"
        >
          {{ btn.collapsed ? '+' : '−' }}
        </button>

        <!-- Node overlays: plain text editing + rich text preview/editing -->
        <X6NodeOverlay
          v-for="overlay in nodeOverlays"
          :key="overlay.id"
          :ref="(el: unknown) => setNodeOverlayRef(el, overlay.id)"
          :node-id="overlay.id"
          :style-props="overlay.style"
          :text-mode="overlay.textMode"
          :label="overlay.label"
          :rich-content="overlay.richContent"
          :board-reference-page-id="overlay.boardReferencePageId"
          :board-reference-title="overlay.boardReferenceTitle"
          :board-reference-interfaces="overlay.boardReferenceInterfaces"
          :host-page-id="pageId"
          :is-editing="editingNodeId === overlay.id"
          :is-editable="isEditable"
          @commit-plain="(text: string) => handleNodeOverlayCommit(overlay.id, text)"
          @cancel="() => handleNodeOverlayCancel(overlay.id)"
          @rich-change="(md: string) => handleRichChange(overlay.id, md)"
          @select-reference="selectBoardReferenceWrapper(overlay.id)"
          @drag-reference-start="startBoardReferenceDrag(overlay.id)"
          @drag-reference-move="(delta: { dx: number; dy: number }) => moveBoardReference(overlay.id, delta)"
          @drag-reference-end="finishBoardReferenceDrag(overlay.id)"
          @drag-interface-start="startBoardInterfaceDrag(overlay.id, $event)"
          @drag-interface-move="moveBoardInterface(overlay.id, $event)"
          @drag-interface-end="finishBoardInterfaceDrag(overlay.id, $event)"
        />

        <!-- Edge inline text editor -->
        <div
          v-if="edgeInlineEditing"
          class="x6-inline-editor"
          :style="edgeInlineEditStyle"
          @mousedown.stop
          @click.stop
          @dblclick.stop
          @keydown.stop
        >
          <textarea
            ref="edgeInlineInputRef"
            v-model="edgeInlineEditText"
            class="x6-inline-editor__input"
            @keydown="handleEdgeEditKeydown"
            @blur="commitEdgeInlineEdit()"
          />
        </div>
      </div>

      <aside v-if="inspectorEnabled && inspectorVisible" class="x6-inspector">
        <!-- Tab navigation -->
        <div class="x6-inspector-tabs">
          <button
            type="button"
            class="x6-inspector-tab x6-inspector-tab--close"
            title="关闭侧边栏"
            @click="inspectorVisible = false"
          >
            ⊖
          </button>
          <button
            type="button"
            class="x6-inspector-tab"
            :class="{ active: inspectorTab === 'inspector' }"
            @click="inspectorTab = 'inspector'"
          >
            属性
          </button>
          <button
            v-if="blockActionsEnabled"
            type="button"
            class="x6-inspector-tab"
            :class="{ active: inspectorTab === 'library' }"
            @click="inspectorTab = 'library'"
          >
            素材库
          </button>
          <button
            type="button"
            class="x6-inspector-tab"
            :class="{ active: inspectorTab === 'operations' }"
            @click="inspectorTab = 'operations'"
          >
            操作
          </button>
        </div>

        <!-- Inspector panel content -->
        <div v-if="inspectorTab === 'inspector'" class="x6-inspector__body">
          <div v-if="isTaskFlow" class="inspector-card">
            <h4>任务顺序</h4>
            <p v-if="taskSequenceSummary.length === 0" class="inspector-empty">连接任务节点后会在这里显示执行顺序。</p>
            <ol v-else class="task-sequence-list">
              <li v-for="(taskLabel, index) in taskSequenceSummary" :key="`${taskLabel}-${index}`">
                {{ index + 1 }}. {{ taskLabel }}
              </li>
            </ol>
            <p class="inspector-empty">每个任务节点只允许一条前驱和一条后继连线，用于表达明确的先后顺序。</p>
          </div>

          <div class="inspector-card">
            <h4>属性面板</h4>

          <template v-if="selectedCellsCount === 0 && !selectedCell">
            <p class="inspector-empty">选中节点或连线后可在这里编辑文字、颜色和线路样式。</p>
            <ul class="inspector-tips">
              <li><code>Delete</code> 删除选中项</li>
              <li><code>Ctrl/Cmd + C</code> 复制</li>
              <li><code>Ctrl/Cmd + V</code> 粘贴</li>
              <li><code>Ctrl/Cmd + Z</code> 撤销</li>
            </ul>
          </template>

          <template v-else-if="selectedCellsCount > 1">
            <p class="inspector-empty">当前选中了 {{ selectedCellsCount }} 个对象，可直接拖拽整体移动或批量删除。<template v-if="!isMindmap">工具栏「组合」可将它们编为一组。</template></p>
          </template>

          <template v-else-if="selectedCell?.kind === 'node'">
            <p v-if="selectedCell.isGroup" class="inspector-empty">
              当前选中的是组合容器（含 {{ selectedCell.groupSize }} 个成员）。单击成员会优先选中整个组合；Ctrl/Cmd + 单击成员可单独选中；工具栏「取消组合」可解散。
            </p>
            <div v-if="!selectedCell.linkUrl && !selectedCell.imageUrl" class="inspector-section">
              <button
                type="button"
                class="inspector-section__toggle"
                :aria-expanded="inspectorNodeStyleOpen"
                @click="inspectorNodeStyleOpen = !inspectorNodeStyleOpen"
              >
                <svg
                  class="inspector-section__caret"
                  :class="{ 'inspector-section__caret--open': inspectorNodeStyleOpen }"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M9 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="inspector-section__title">样式</span>
              </button>

              <template v-if="inspectorNodeStyleOpen">
            <label v-if="!isMindmap && selectedCell.preset && !selectedCell.isRefBlock" class="field">
              <span>节点样式</span>
              <select
                :value="selectedCell.preset"
                :disabled="!isEditable"
                @change="convertSelectedNodeStyle(($event.target as HTMLSelectElement).value as BoardNodeStylePreset)"
              >
                <option value="rect">矩形</option>
                <option value="round">圆角矩形</option>
                <option value="ellipse">椭圆</option>
                <option value="diamond">菱形</option>
              </select>
            </label>

            <label v-if="selectedCell.isGroup" class="field">
              <span>组合边框</span>
              <select
                :value="selectedCell.boardGroupBorder"
                :disabled="!isEditable"
                @change="updateSelectedGroupBorderPreset(($event.target as HTMLSelectElement).value as BoardGroupBorderPreset)"
              >
                <option value="tight">紧贴边界</option>
                <option value="highlight">高亮边框</option>
              </select>
            </label>

            <div class="field-row">
              <label class="field">
                <span>填充色</span>
                <input
                  type="color"
                  :value="selectedCell.fill"
                  :disabled="!isEditable"
                  @input="updateSelectedNodeFill(($event.target as HTMLInputElement).value)"
                />
              </label>

              <label class="field">
                <span>边框色</span>
                <input
                  type="color"
                  :value="selectedCell.stroke"
                  :disabled="!isEditable"
                  @input="updateSelectedNodeStroke(($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>

            <div class="field-row">
              <label class="field">
                <span>宽度</span>
                <input
                  type="number"
                  min="40"
                  :value="selectedCell.width"
                  :disabled="!isEditable"
                  @change="updateSelectedNodeSize('width', ($event.target as HTMLInputElement).value)"
                />
              </label>

              <label class="field">
                <span>高度</span>
                <input
                  type="number"
                  min="40"
                  :value="selectedCell.height"
                  :disabled="!isEditable"
                  @change="updateSelectedNodeSize('height', ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>

            <p class="field-meta">形状类型: {{ selectedCell.shape }}</p>
              </template>
            </div>

            <div class="inspector-section">
              <button
                type="button"
                class="inspector-section__toggle"
                :aria-expanded="inspectorNodeContentOpen"
                @click="inspectorNodeContentOpen = !inspectorNodeContentOpen"
              >
                <svg
                  class="inspector-section__caret"
                  :class="{ 'inspector-section__caret--open': inspectorNodeContentOpen }"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M9 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="inspector-section__title">内容</span>
              </button>

              <template v-if="inspectorNodeContentOpen">
            <div v-if="selectedCell.isRefBlock" class="field">
              <span>源</span>
              <div class="inspector-source-row">
                <input
                  type="text"
                  class="inspector-source-row__input"
                  :value="selectedCell.refSourceLabel"
                  readonly
                  tabindex="-1"
                />
                <button
                  type="button"
                  class="inspector-source-row__jump"
                  title="点击跳转"
                  :disabled="!canNavigateRefBlockSource(selectedCell)"
                  @click="navigateToRefBlockSource"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M14 5h5v5M10 14L19 5M19 10v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <button
                v-if="isMindmap"
                type="button"
                class="tool-button"
                :disabled="!isEditable"
                @click="void syncSelectedMindmapRefBlockTocFromSource()"
              >
                从目录同步
              </button>
              <label v-if="selectedCell.canPreviewBoardReference" class="field inspector-reference-display">
                <span>画板引用展示</span>
                <select
                  :value="selectedCell.boardReferenceDisplay"
                  :disabled="!isEditable"
                  @change="updateSelectedBoardReferenceDisplay(($event.target as HTMLSelectElement).value as 'card' | 'content')"
                >
                  <option value="card">引用卡片</option>
                  <option value="content">内容预览（可编辑）</option>
                </select>
              </label>
            </div>

            <div v-else-if="selectedCell.sourceLocator" class="field">
              <span>定位（链接）</span>
              <div class="inspector-source-row">
                <input
                  type="text"
                  class="inspector-source-row__input"
                  :value="selectedCell.sourceLocator"
                  readonly
                  tabindex="-1"
                  title="定位系统 locator"
                />
                <button
                  type="button"
                  class="inspector-source-row__jump"
                  title="跳转到来源位置"
                  @click="navigateToSourceLocator"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M14 5h5v5M10 14L19 5M19 10v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                class="tool-button"
                title="在思维导图中打开窗口查看来源内容"
                @click="previewSourceContent"
              >
                查看内容
              </button>
            </div>

            <div v-if="selectedCell.linkUrl" class="field">
              <span>链接展示形式</span>
              <LinkPresentationModeBar
                :href="selectedCell.linkUrl"
                :current-mode="selectedCell.linkDisplay"
                :extra-modes="['image']"
                :disabled="!isEditable"
                @select-mode="updateSelectedLinkDisplay"
              />
            </div>

            <label
              v-if="!selectedCell.isRefBlock && !selectedCell.linkUrl && !selectedCell.imageUrl"
              class="field"
            >
              <span>文字模式</span>
              <select
                :value="selectedCell.textMode"
                :disabled="!isEditable"
                @change="toggleNodeTextMode(($event.target as HTMLSelectElement).value as 'plain' | 'rich')"
              >
                <option value="plain">纯文本</option>
                <option value="rich">富文本</option>
              </select>
            </label>

            <template
              v-if="!selectedCell.isRefBlock && !selectedCell.linkUrl && !selectedCell.imageUrl && selectedCell.textMode === 'plain'"
            >
              <label class="field">
                <span>文字</span>
                <input
                  type="text"
                  :value="selectedCell.label"
                  :disabled="!isEditable"
                  @input="updateSelectedNodeLabel(($event.target as HTMLInputElement).value)"
                />
              </label>
            </template>
            <template
              v-else-if="!selectedCell.isRefBlock && !selectedCell.linkUrl && !selectedCell.imageUrl"
            >
              <p class="inspector-empty" style="font-size:12px;">双击节点可直接编辑富文本</p>
            </template>

            <div v-if="!selectedCell.isRefBlock" class="field x6-cell-content-field">
              <span>内容绑定</span>
              <X6CellContentPanel
                :cell-id="selectedCell.id"
                cell-kind="node"
                :binding="selectedCell.contentBinding"
                :editable="isEditable"
                :pages="workspaceStore.pageTree"
                :current-page-id="workspaceStore.currentPageId"
                :cell-label="selectedCell.label"
                @update:binding="updateSelectedCellContentBinding"
              />
            </div>
              </template>
            </div>
          </template>

          <template v-else-if="selectedCell?.kind === 'edge'">
            <label class="field">
              <span>连线文字</span>
              <input
                type="text"
                :value="selectedCell.label"
                :disabled="!isEditable"
                @input="updateSelectedEdgeLabel(($event.target as HTMLInputElement).value)"
              />
            </label>

            <div class="field-row">
              <label class="field">
                <span>线条颜色</span>
                <input
                  type="color"
                  :value="selectedCell.stroke"
                  :disabled="!isEditable"
                  @input="updateSelectedEdgeStroke(($event.target as HTMLInputElement).value)"
                />
              </label>

              <label class="field">
                <span>路由</span>
                <select
                  :value="selectedCell.router"
                  :disabled="!isEditable"
                  @change="updateSelectedEdgeRouter(($event.target as HTMLSelectElement).value)"
                >
                  <option :value="ORTH_SMART_ROUTER_NAME">智能正交</option>
                  <option :value="STRAIGHT_ROUTER_NAME">直线（自由锚点）</option>
                  <option :value="LINE_ROUTER_NAME">纯直线</option>
                  <option value="normal">直线</option>
                  <option value="orth">正交</option>
                </select>
              </label>
            </div>

            <label class="field">
              <span>连接器</span>
              <select
                :value="selectedCell.connector"
                :disabled="!isEditable"
                @change="updateSelectedEdgeConnector(($event.target as HTMLSelectElement).value)"
              >
                <option value="normal">普通</option>
                <option value="rounded">圆角</option>
                <option value="smooth">平滑</option>
                <option :value="MINDMAP_CONNECTOR_NAME">思维导图</option>
              </select>
            </label>

            <div class="field x6-cell-content-field">
              <span>内容</span>
              <X6CellContentPanel
                :cell-id="selectedCell.id"
                cell-kind="edge"
                :binding="selectedCell.contentBinding"
                :editable="isEditable"
                :pages="workspaceStore.pageTree"
                :current-page-id="workspaceStore.currentPageId"
                :cell-label="selectedCell.label"
                @update:binding="updateSelectedCellContentBinding"
              />
            </div>
          </template>

          <!-- Z 轴层级：节点和连线均可编辑 -->
          <div v-if="selectedCell && !(selectedCell.kind === 'node' && selectedCell.isGroup)" class="inspector-section">
            <button
              type="button"
              class="inspector-section__toggle"
              :aria-expanded="inspectorZAxisOpen"
              @click="inspectorZAxisOpen = !inspectorZAxisOpen"
            >
              <svg
                class="inspector-section__caret"
                :class="{ 'inspector-section__caret--open': inspectorZAxisOpen }"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M9 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="inspector-section__title">层级</span>
            </button>

            <template v-if="inspectorZAxisOpen">
              <div class="field-row">
                <button
                  type="button"
                  class="tool-button"
                  :disabled="!isEditable"
                  title="置于最顶层"
                  @click="bringSelectedToFront"
                >
                  置顶
                </button>
                <button
                  type="button"
                  class="tool-button"
                  :disabled="!isEditable"
                  title="置于最底层"
                  @click="sendSelectedToBack"
                >
                  置底
                </button>
              </div>
              <label class="field">
                <span>Z 值</span>
                <input
                  type="number"
                  :value="selectedCell.zIndex ?? ''"
                  :disabled="!isEditable"
                  @change="updateSelectedZIndex(Number(($event.target as HTMLInputElement).value))"
                />
              </label>
            </template>
          </div>
        </div>
        </div>

        <!-- Operation manager: fixed sidebar region with an internally scrolling list. -->
        <div v-else-if="inspectorTab === 'operations'" class="x6-operation-manager">
          <header class="x6-operation-manager__header">
            <div>
              <h4>操作管理</h4>
              <p>
                保留最近 {{ BOARD_OPERATION_HISTORY_LIMIT }} 次已保存操作，每页显示
                {{ BOARD_OPERATION_HISTORY_PAGE_SIZE }} 条，可恢复到任一操作发生之前。
              </p>
            </div>
          </header>

          <p v-if="operationNotice" class="x6-operation-manager__notice">{{ operationNotice }}</p>

          <div v-if="operationHistory.length === 0" class="x6-operation-manager__empty">
            <strong>还没有可回退的操作</strong>
            <span>下一次编辑画板后，操作会自动记录并随画板保存。</span>
          </div>

          <ol v-else class="x6-operation-list">
            <li v-for="entry in pagedOperationHistory" :key="entry.id" class="x6-operation-item">
              <div class="x6-operation-item__summary">
                <strong>{{ entry.label }}</strong>
                <time :datetime="new Date(entry.createdAt).toISOString()">
                  {{ formatOperationTime(entry.createdAt) }}
                </time>
              </div>
              <template v-if="rollbackConfirmId === entry.id">
                <p class="x6-operation-item__confirm-text">
                  将恢复到该操作发生前；当前状态会自动保留为一条新的回退记录。
                </p>
                <div class="x6-operation-item__actions">
                  <button type="button" class="operation-button" @click="cancelRollback">取消</button>
                  <button
                    type="button"
                    class="operation-button operation-button--danger"
                    :disabled="!isEditable"
                    @click="rollbackBeforeOperation(entry)"
                  >
                    确认回退
                  </button>
                </div>
              </template>
              <button
                v-else
                type="button"
                class="operation-button operation-button--primary"
                :disabled="!isEditable"
                @click="requestRollback(entry)"
              >
                回退到此前
              </button>
            </li>
          </ol>

          <footer
            v-if="operationHistory.length > BOARD_OPERATION_HISTORY_PAGE_SIZE"
            class="x6-operation-manager__pagination"
          >
            <button
              type="button"
              class="operation-button"
              :disabled="operationHistoryPage <= 1"
              @click="operationHistoryPage -= 1"
            >
              上一页
            </button>
            <span>{{ operationHistoryPage }} / {{ operationHistoryPageCount }}</span>
            <button
              type="button"
              class="operation-button"
              :disabled="operationHistoryPage >= operationHistoryPageCount"
              @click="operationHistoryPage += 1"
            >
              下一页
            </button>
          </footer>
        </div>

        <!-- Library panel content -->
        <div v-else class="x6-inspector__body x6-inspector__body--library">
          <X6MaterialLibrary @insert="insertMaterial" @close="inspectorTab = 'inspector'" />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.x6-editor {
  position: relative;
  width: 100%;
  border: 1px solid #e3e7ef;
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(180deg, #fbfcfe 0%, #f4f7fb 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

/* 全屏状态：填满屏幕，去掉圆角和边框 */
.x6-editor--fullscreen {
  border: none;
  border-radius: 0;
  width: 100vw;
  height: 100vh;
}

.x6-editor--fill {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-bottom: none;
}

.x6-editor--fill .x6-workspace {
  flex: 1;
  min-height: 0;
}

.x6-editor--fill.x6-editor--node-editing {
  overflow: visible;
}

.x6-editor--fill .x6-stage--node-editing {
  overflow: visible;
}

.x6-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid #e3e7ef;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
}

.x6-editor--chrome-compact .x6-toolbar {
  gap: 4px;
  padding: 2px 6px;
}

.x6-editor--chrome-compact .toolbar-group {
  gap: 2px;
}

.x6-editor--chrome-compact .tool-button {
  padding: 2px 5px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
}

.x6-editor--chrome-compact .tool-button--icon {
  padding: 2px 3px;
  min-width: 0;
  font-size: 15px;
}

.x6-editor--chrome-compact .tool-button--shape {
  gap: 1px;
  padding: 2px 4px;
  min-width: 0;
  border-radius: 6px;
}

.x6-editor--chrome-compact .tool-button__icon {
  width: 26px;
  height: 26px;
}

.x6-editor--chrome-compact .tool-button__label {
  font-size: 11px;
}

.x6-editor--chrome-compact .tool-button--mode {
  min-width: 0;
  padding: 2px;
}

.x6-editor--chrome-compact .tool-button__mode-icon {
  width: 16px;
  height: 16px;
}

.x6-editor--chrome-compact .toolbar-group--interaction {
  padding: 1px;
  border-radius: 8px;
}

.x6-editor--chrome-compact .toolbar-summary {
  font-size: 12px;
  padding: 0 2px;
}

.x6-editor--mindmap .x6-workspace {
  grid-template-columns: minmax(0, 1fr) 200px;
}

.x6-editor--mindmap .x6-workspace--no-inspector {
  grid-template-columns: minmax(0, 1fr);
}

.x6-toolbar-restore {
  display: block;
  width: 100%;
  padding: 4px 14px;
  border: none;
  border-bottom: 1px solid #e3e7ef;
  background: rgba(255, 255, 255, 0.7);
  color: #6b7280;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.x6-toolbar-restore:hover {
  background: #f3f4f6;
  color: #374151;
}

.x6-restore-bar {
  display: flex;
  gap: 4px;
  padding: 4px 14px;
  border-bottom: 1px solid #e3e7ef;
  background: rgba(255, 255, 255, 0.7);
}

.x6-restore-bar--floating {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
}

.x6-restore-bar--floating .x6-restore-button {
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
}

.x6-restore-button {
  padding: 2px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
}

.x6-restore-button:hover {
  border-color: #a5b4fc;
  color: #4338ca;
}

.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.toolbar-group--summary {
  margin-left: auto;
}

.toolbar-summary {
  font-size: 12px;
  color: #5f6b7a;
  padding: 0 4px;
}

.tool-button {
  border: 1px solid #d2d8e2;
  background: #ffffff;
  color: #213547;
  border-radius: 10px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}

.tool-button--shape {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 10px 6px;
  min-width: 52px;
  border-radius: 8px;
  background: #fafbfd;
  cursor: grab;
}

.tool-button--shape:active:not(:disabled) {
  cursor: grabbing;
}

.tool-button--shape:hover:not(:disabled) {
  background: #eef2ff;
  border-color: #a5b4fc;
}

.tool-button--shape:disabled {
  background: #f9fafb;
}

.tool-button__icon {
  display: block;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.tool-button__label {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}

.tool-button--shape:disabled .tool-button__label {
  color: #b0b8c1;
}

.tool-button:hover:not(:disabled) {
  border-color: #8bb8ff;
  color: #0958d9;
  box-shadow: 0 6px 16px rgba(22, 119, 255, 0.12);
}

.tool-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tool-button--primary {
  background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
  color: #ffffff;
  border-color: transparent;
}

.tool-button--danger {
  color: #cf1322;
}

.tool-button--icon {
  padding: 7px 6px;
  min-width: 32px;
  text-align: center;
  font-size: 16px;
  line-height: 1;
  color: #9ca3af;
  border-color: transparent;
}
.tool-button--icon:hover:not(:disabled) {
  border-color: #e5e7eb;
  color: #374151;
  box-shadow: none;
}

.tool-button--active {
  background: #eef2ff;
  border-color: #a5b4fc;
  color: #4338ca;
}

.toolbar-group--interaction {
  gap: 4px;
  padding: 2px;
  border: 1px solid #e3e7ef;
  border-radius: 10px;
  background: #f8fafc;
}

.tool-button--mode {
  min-width: 34px;
  padding: 6px;
}

.tool-button__mode-icon {
  display: block;
  width: 18px;
  height: 18px;
}

.tool-button__mode-icon--pointer {
  transform: translate(-1px, -1px);
}

.tool-button__pointer-shape {
  fill: #fff;
  stroke: #374151;
  stroke-width: 1.15;
  stroke-linejoin: round;
}

.tool-button--active .tool-button__pointer-shape {
  stroke: #4338ca;
}

.x6-stage--interaction-select :deep(.x6-graph) {
  cursor: default;
}

.x6-stage--interaction-pan :deep(.x6-graph),
.x6-stage--interaction-pan :deep(.x6-node),
.x6-stage--interaction-pan :deep(.x6-edge) {
  cursor: grab !important;
}

.x6-stage--interaction-pan :deep(.x6-graph.x6-graph-panning) {
  cursor: grabbing !important;
}

.x6-stage--straight-line-mode :deep(.x6-graph),
.x6-stage--straight-line-mode :deep(.x6-node),
.x6-stage--straight-line-mode :deep(.x6-edge) {
  cursor: crosshair !important;
}

.x6-workspace {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  min-height: 560px;
}
.x6-workspace--no-inspector {
  grid-template-columns: minmax(0, 1fr);
}

.x6-editor--chrome-bare {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: none;
  background: transparent;
  overflow: hidden;
}

.x6-editor--chrome-bare .x6-workspace,
.x6-editor--chrome-bare .x6-workspace--no-inspector {
  flex: 1;
  min-height: 0;
  height: 100%;
  grid-template-columns: minmax(0, 1fr);
}

.x6-editor--chrome-bare .x6-stage {
  height: 100%;
  min-height: 0;
  border-right: none;
  border-bottom: none;
}

.x6-stage--library .x6-canvas {
  cursor: default;
}

.x6-stage {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-right: 1px solid #e3e7ef;
  background:
    radial-gradient(circle at top left, rgba(22, 119, 255, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.96));
}

.x6-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.x6-source-region {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  box-sizing: border-box;
  border: 2px dashed rgba(22, 119, 255, 0.78);
  border-radius: 16px;
  background: rgba(22, 119, 255, 0.05);
  box-shadow:
    0 0 0 4px rgba(22, 119, 255, 0.08),
    0 12px 28px rgba(15, 23, 42, 0.08);
}

.x6-source-region--selection-blueprint,
.x6-source-region--blueprint {
  border-color: rgba(114, 46, 209, 0.75);
  background: rgba(114, 46, 209, 0.05);
  box-shadow:
    0 0 0 4px rgba(114, 46, 209, 0.08),
    0 12px 28px rgba(15, 23, 42, 0.08);
}

.x6-source-region--task-flow {
  border-color: rgba(82, 196, 26, 0.78);
  background: rgba(82, 196, 26, 0.05);
  box-shadow:
    0 0 0 4px rgba(82, 196, 26, 0.08),
    0 12px 28px rgba(15, 23, 42, 0.08);
}

.x6-source-region--mindmap {
  border-color: rgba(22, 119, 255, 0.72);
  background: rgba(22, 119, 255, 0.05);
  box-shadow:
    0 0 0 4px rgba(22, 119, 255, 0.08),
    0 12px 28px rgba(15, 23, 42, 0.08);
}

.x6-source-region__header {
  position: absolute;
  top: 8px;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
}

.x6-source-region__label {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #ffffff;
  color: #0958d9;
  border: 1px solid rgba(22, 119, 255, 0.28);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.1);
  font-size: 12px;
  font-weight: 700;
}

.x6-source-region__actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.x6-source-region__button {
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid rgba(22, 119, 255, 0.26);
  border-radius: 999px;
  background: #ffffff;
  color: #0958d9;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.1);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.x6-source-region__button:hover:not(:disabled) {
  border-color: #1677ff;
  background: #f0f7ff;
}

.x6-source-region__button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.x6-source-region__button--primary {
  border-color: #1677ff;
  background: #1677ff;
  color: #ffffff;
}

.x6-source-region__button--primary:hover:not(:disabled) {
  background: #0958d9;
}

/* Inline text editor overlay */
.x6-inline-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.x6-inline-editor__input {
  width: 100%;
  height: 100%;
  border: 2px solid #1677ff;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.96);
  font-weight: 600;
  text-align: center;
  resize: none;
  outline: none;
  padding: 4px 8px;
  box-sizing: border-box;
  font-family: inherit;
  line-height: 1.4;
}

.x6-inline-editor > span {
  display: none;
}

.mindmap-collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #91caff;
  border-radius: 999px;
  background: #ffffff;
  color: #1677ff;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.18);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.mindmap-collapse-btn:hover:not(:disabled) {
  background: #e6f4ff;
  border-color: #1677ff;
  transform: scale(1.06);
}

.mindmap-collapse-btn--expanded {
  color: #389e0d;
  border-color: #b7eb8f;
  box-shadow: 0 2px 8px rgba(56, 158, 13, 0.16);
}

.mindmap-collapse-btn--expanded:hover:not(:disabled) {
  background: #f6ffed;
  border-color: #52c41a;
}

.mindmap-collapse-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.x6-inspector {
  display: flex;
  flex-direction: column;
  background: rgba(248, 250, 253, 0.92);
  overflow: hidden;
}

.x6-inspector-tabs {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  flex-shrink: 0;
}

.x6-inspector-tab {
  flex: 1;
  padding: 10px 8px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: color 0.15s, border-color 0.15s;
}

.x6-inspector-tab:hover {
  color: #374151;
}

.x6-inspector-tab.active {
  color: #4338ca;
  border-bottom-color: #4338ca;
}

.x6-inspector-tab--close {
  flex: 0 0 auto;
  padding: 10px 8px;
  font-size: 14px;
  color: #9ca3af;
}

.x6-inspector-tab--close:hover {
  color: #ef4444;
}

.x6-inspector__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.x6-inspector__body--library {
  padding: 0;
  gap: 0;
  overflow: hidden;
}

.x6-operation-manager {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 14px;
  gap: 12px;
}

.x6-operation-manager__header {
  flex-shrink: 0;
  padding: 14px;
  border: 1px solid #dfe5ef;
  border-radius: 12px;
  background: #fff;
}

.x6-operation-manager__header h4 {
  margin: 0 0 6px;
  color: #1f2d3d;
  font-size: 15px;
}

.x6-operation-manager__header p,
.x6-operation-manager__notice {
  margin: 0;
  color: #5f6b7a;
  font-size: 12px;
  line-height: 1.55;
}

.x6-operation-manager__notice {
  flex-shrink: 0;
  padding: 9px 10px;
  border: 1px solid #b7ebc6;
  border-radius: 9px;
  background: #f0fff4;
  color: #237a3b;
}

.x6-operation-manager__empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  border: 1px dashed #cfd7e6;
  border-radius: 12px;
  color: #667085;
  text-align: center;
  font-size: 13px;
}

.x6-operation-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0 2px 0 0;
  list-style: none;
}

.x6-operation-item {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
  border: 1px solid #e1e6ef;
  border-radius: 11px;
  background: #fff;
}

.x6-operation-item__summary {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.x6-operation-item__summary strong {
  overflow: hidden;
  color: #25324b;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.x6-operation-item__summary time {
  color: #8a94a6;
  font-size: 11px;
}

.x6-operation-item__confirm-text {
  margin: 0;
  color: #7a4c00;
  font-size: 12px;
  line-height: 1.5;
}

.x6-operation-item__actions,
.x6-operation-manager__pagination {
  display: flex;
  align-items: center;
  gap: 8px;
}

.x6-operation-item__actions .operation-button {
  flex: 1;
}

.operation-button {
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid #cfd6e4;
  border-radius: 7px;
  background: #fff;
  color: #4b5565;
  font-size: 12px;
  cursor: pointer;
}

.operation-button:hover:not(:disabled) {
  border-color: #818cf8;
  color: #4338ca;
}

.operation-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.operation-button--primary {
  border-color: #a5b4fc;
  background: #eef2ff;
  color: #4338ca;
}

.operation-button--danger {
  border-color: #f4a6a6;
  background: #fff1f0;
  color: #b42318;
}

.x6-operation-manager__pagination {
  flex-shrink: 0;
  justify-content: space-between;
  padding-top: 2px;
  color: #667085;
  font-size: 12px;
}

.inspector-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e3e7ef;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.inspector-card h4 {
  margin: 0;
  font-size: 15px;
  color: #1f2d3d;
}

.inspector-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.inspector-empty {
  margin: 0;
  color: #5f6b7a;
  line-height: 1.6;
  font-size: 13px;
}

.inspector-tips {
  margin: 0;
  padding-left: 18px;
  color: #5f6b7a;
  font-size: 12px;
  line-height: 1.7;
}

.task-sequence-list {
  margin: 0;
  padding-left: 18px;
  color: #213547;
  font-size: 13px;
  line-height: 1.7;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #5f6b7a;
}

.x6-cell-content-field {
  margin-top: 2px;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border: 1px solid #d2d8e2;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  color: #213547;
  background: #ffffff;
  box-sizing: border-box;
  font-family: inherit;
}

.field textarea {
  resize: vertical;
  line-height: 1.45;
}

.field input[type='color'] {
  min-height: 40px;
  padding: 4px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inspector-section + .inspector-section {
  padding-top: 12px;
  border-top: 1px dashed #e3e7ef;
}

.inspector-section__toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
}

.inspector-section__caret {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: #9ca3af;
  transition: transform 0.15s ease;
}

.inspector-section__caret--open {
  transform: rotate(90deg);
}

.inspector-section__title {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.inspector-section__toggle:hover .inspector-section__title {
  color: #374151;
}

.inspector-source-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.inspector-source-row__input {
  flex: 1;
  min-width: 0;
  border: 1px solid #d2d8e2;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  color: #213547;
  background: #f8fafc;
  box-sizing: border-box;
  font-family: inherit;
}

.inspector-source-row__jump {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  border: 1px solid #d2d8e2;
  border-radius: 10px;
  background: #ffffff;
  color: #1677ff;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.inspector-source-row__jump svg {
  width: 18px;
  height: 18px;
}

.inspector-source-row__jump:hover:not(:disabled) {
  background: #e6f4ff;
  border-color: #91caff;
}

.inspector-source-row__jump:disabled {
  color: #b8c0cc;
  cursor: not-allowed;
  background: #f5f7fa;
}

.field-meta {
  margin: 0;
  font-size: 12px;
  color: #7b8794;
}

.x6-canvas :deep(.x6-graph) {
  border-radius: 0;
}

.x6-canvas :deep(.x6-node.x6-node-selected rect),
.x6-canvas :deep(.x6-node.x6-node-selected ellipse),
.x6-canvas :deep(.x6-node.x6-node-selected polygon) {
  filter: drop-shadow(0 0 0.45rem rgba(22, 119, 255, 0.22));
  stroke-width: 2.4px !important;
}

/* Highlight only the visible stroke. Do not restyle the transparent wrap —
 * that shrinks the hit area and can make edges unselectable after label clear. */
.x6-canvas :deep(.x6-edge.x6-edge-selected .connection:not([stroke='transparent'])) {
  stroke-width: 3px !important;
  stroke: #1677ff !important;
}

.x6-canvas :deep(.x6-edge .connection[stroke='transparent']) {
  stroke: transparent !important;
  stroke-width: 12px !important;
  pointer-events: stroke !important;
}

.x6-canvas :deep(.x6-widget-selection-inner),
.x6-canvas :deep(.x6-widget-selection-box) {
  display: none !important;
}

.x6-editor :deep(.x6-widget-transform) {
  /* Keep the standard X6 resize handles above editable board previews. */
  z-index: 1100 !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.x6-canvas :deep(.x6-node [magnet='true']) {
  visibility: hidden;
  opacity: 0;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.x6-canvas :deep(.x6-node:hover [magnet='true']),
.x6-canvas :deep(.x6-node.x6-node-selected [magnet='true']) {
  visibility: visible;
  opacity: 1;
}

.x6-canvas :deep(.x6-node [magnet='true']:hover) {
  transform: scale(1.12);
}

/* Read-only preview: no connect magnets; avoid not-allowed cursor on non-movable nodes. */
.x6-editor--readonly .x6-canvas :deep(.x6-node [magnet='true']),
.x6-editor--readonly .x6-canvas :deep(.x6-node:hover [magnet='true']),
.x6-editor--readonly .x6-canvas :deep(.x6-node.x6-node-selected [magnet='true']) {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.x6-editor--readonly .x6-stage--interaction-select :deep(.x6-node),
.x6-editor--readonly .x6-stage--interaction-select :deep(.x6-edge) {
  cursor: default !important;
}

.x6-editor--sized {
  display: flex;
  flex-direction: column;
}

.x6-editor--sized .x6-workspace {
  flex: 1;
  min-height: 0;
}

.x6-editor--sized .x6-stage {
  height: 100%;
}

@media (max-width: 1100px) {
  .x6-workspace {
    grid-template-columns: 1fr;
  }

  .x6-stage {
    border-right: none;
    border-bottom: 1px solid #e3e7ef;
  }
}
</style>
