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
import X6NodeOverlay from './X6NodeOverlay.vue';
import X6CellContentPanel from './X6CellContentPanel.vue';
import X6MaterialLibrary from './X6MaterialLibrary.vue';
import LinkPresentationModeBar from './LinkPresentationModeBar.vue';
import { useMaterialLibraryStore } from '@/stores/materialLibrary';
import { useBlockRegistryStore } from '@/stores/blockRegistry';
import { useObjectModelStore } from '@/stores/objectModel';
import { useOutlineCacheStore } from '@/stores/outlineCache';
import { useWorkspaceStore } from '@/stores/workspace';
import type { GraphData } from '@/api/types';
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
  ensureSnappingArrowheadToolsRegistered,
  snapFreeEdgeTerminals,
  type NodePreset,
} from '@/components/x6';

const BLUEPRINT_ANCHOR = { x: 480, y: 280 } as const;

interface Props {
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
/** 组合按钮状态：'' 禁用 / 'group' 可组合 / 'ungroup' 可取消组合 */
const groupActionButtonMode = ref<'' | 'group' | 'ungroup'>('');
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
const inspectorTab = ref<'inspector' | 'library'>('inspector');
const inspectorNodeStyleOpen = ref(false);
const inspectorNodeContentOpen = ref(true);
const inspectorZAxisOpen = ref(true);
const toolbarVisible = ref(props.toolbarEnabled);
const inspectorVisible = ref(props.inspectorEnabled && props.inspectorDefaultVisible);
type CanvasInteractionMode = 'select' | 'pan';
const canvasInteractionMode = ref<CanvasInteractionMode>('select');
/** Hold Space to temporarily pan (grab cursor), without changing toolbar mode. */
const spacePanActive = ref(false);
let stagePointerInside = false;
let mindmapDragActiveNodeId: string | null = null;
let mindmapDragMoved = false;
let mindmapDragSessionStarted = false;

// Node overlay state — unified for plain and rich text editing
const editingNodeId = ref<string | null>(null);
const nodeOverlays = ref<Array<{
  id: string;
  style: Record<string, string>; 
  textMode: 'plain' | 'rich';
  label: string;
  richContent: string;
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
  return createEdgeMetadata(edge, {
    router: routerName === 'manhattan' ? { name: 'orth' } : (router ?? { name: 'orth' }),
  });
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
  return {
    ...data,
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

function serializeGraphData(): GraphData {
  if (!graph) {
    return { cells: [], nodes: [], edges: [], uml: objectModelStore.model };
  }

  const nodes = graph.getNodes().map((node) => node.toJSON() as CellData);
  const edges = graph.getEdges()
    .filter((edge) => edge.id !== MINDMAP_DRAG_PREVIEW_EDGE_ID)
    .map((edge) => edge.toJSON() as CellData);
  const blueprintMeta = props.graphData?.blueprintMeta ?? undefined;
  return {
    cells: (graph.toJSON().cells as CellData[]).filter(
      (cell) => cell.id !== MINDMAP_DRAG_PREVIEW_EDGE_ID,
    ),
    nodes,
    edges,
    ...(blueprintMeta ? { blueprintMeta } : {}),
    uml: objectModelStore.model as Record<string, unknown>,
  } as GraphData;
}

function emitGraphData() {
  if (!graph || isApplyingExternalData) return;
  const payload = normalizeGraphData(serializeGraphData());
  const snapshot = JSON.stringify(payload);
  if (snapshot === lastSerializedSnapshot) return;
  lastSerializedSnapshot = snapshot;
  lastStructuralSnapshot = JSON.stringify(stripVolatileCellContent(payload));
  emit('graph-data-change', payload);
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

  // Refresh the group action button: containers selected → ungroup,
  // otherwise ≥2 plain nodes → group.
  if (!isMindmap.value) {
    const g = graph;
    const hasGroupContainer = !!g && cells.some((cell) => g.isNode(cell) && isBoardGroupNode(cell as Node));
    const plainNodeCount = g ? cells.filter((cell) => g.isNode(cell) && !isBoardGroupNode(cell as Node)).length : 0;
    groupActionButtonMode.value = hasGroupContainer ? 'ungroup' : plainNodeCount >= 2 ? 'group' : '';
  } else {
    groupActionButtonMode.value = '';
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
    const items: Array<{ name: string; args?: Record<string, unknown> }> = [
      { name: 'vertices' },
      // 画板使用吸附箭头：拖拽端点吸附到节点边界，避免产生悬空自由点端点。
      { name: isMindmap.value ? 'source-arrowhead' : BOARD_SOURCE_ARROWHEAD_TOOL },
      { name: isMindmap.value ? 'target-arrowhead' : BOARD_TARGET_ARROWHEAD_TOOL },
    ];
    // Mindmap: delete via selection + Delete/toolbar, not an on-edge remove button.
    if (!isMindmap.value) {
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
    if (isMindmap.value) {
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
}

function onShapeButtonClick(preset: NodePreset) {
  if (suppressShapeButtonClick) return;
  addNode(preset);
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
  // Deleting a group container means “ungroup”: dissolve it and keep members.
  const groupContainers = g.getSelectedCells().filter(
    (cell) => g.isNode(cell) && isBoardGroupNode(cell as Node),
  ) as Node[];
  const cells = resolveDeletableCellsForDelete().filter((cell) => !groupContainers.includes(cell as Node));
  if (!cells.length && !groupContainers.length) return;

  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }

  if (groupContainers.length) {
    g.batchUpdate(() => {
      groupContainers.forEach((container) => dissolveBoardGroup(container));
    });
  }
  if (cells.length) {
    g.removeCells(cells);
  }
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
    if (graph!.isNode(cell) && isBoardGroupNode(cell as Node)) {
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

function beginBoardGroupDrag(node: Node) {
  if (isMindmap.value) return;
  const root = findBoardGroupRoot(node);
  if (root === node) return;
  // Only treat the drag as a group-level operation when the group container is
  // itself selected. When a member is selected alone (e.g. Alt+click), dragging
  // moves just that member — its relative position inside the group changes.
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
  const pasted = graph.paste({ offset: { dx: 32, dy: 32 } });
  if (!pasted.length) return;
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
      return term;
    };
    for (const edgeData of graphData.edges ?? []) {
      graph!.addEdge({
        ...edgeData,
        id: undefined,
        x: undefined, y: undefined, position: undefined,
        source: remapTerminal(edgeData.source),
        target: remapTerminal(edgeData.target),
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
  graph.undo();
  refreshSelectedCellState();
  scheduleSync();
}

function redo() {
  if (!graph || !canRedo.value) return;
  graph.redo();
  refreshSelectedCellState();
  scheduleSync();
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
    if (editingNodeId.value != null) {
      handleNodeOverlayCancel(editingNodeId.value);
    }
    graph?.cleanSelection();
    refreshSelectedCellState();
    return false;
  });
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

  graph.on('node:mousedown', ({ node }) => {
    startUserInteraction();
    pendingNodeInternalClickId = null;
    boardGroupMousedownRootSelected = !isMindmap.value
      && !!graph
      && findBoardGroupRoot(node) !== node
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
    updateBoardGroupDrag(node, node.getPosition());
    // Follow solo member moves so the group border hugs the members. Skipped
    // while dragging the whole group as a unit (container already translates).
    if (!boardGroupDragState) refitBoardGroupForMember(node);
  });

  graph.on('node:change:size', ({ node }) => {
    if (!boardGroupDragState) refitBoardGroupForMember(node);
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

  graph.on('node:resize', () => {
    startUserInteraction();
  });

  graph.on('node:resized', ({ node }) => {
    if (isMindmap.value && graph && graph.isNode(node)) {
      fitMindmapNodeToText(node);
    }
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

  graph.on('blank:click', () => {
    if (editingNodeId.value != null) {
      handleNodeOverlayCancel(editingNodeId.value);
    }
    pendingNodeInternalClickId = null;
  });

  graph.on('node:mouseenter', ({ node }) => {
    if (!isMindmap.value) return;
    showMindmapCollapseForNode(node.id);
  });

  graph.on('node:mouseleave', () => {
    if (!isMindmap.value) return;
    scheduleHideMindmapCollapse();
  });

  graph.on('node:click', ({ node, e }) => {
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
    if (!isMindmap.value && graph && !e.ctrlKey && !e.metaKey) {
      const groupRoot = findBoardGroupRoot(node);
      if (groupRoot !== node) {
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

  graph.on('blank:dblclick', () => {
    if (inspectorTab.value === 'library') return;
    if (isMindmap.value) {
      addMindmapChildNode();
      return;
    }
    addNode(isTaskFlow.value ? 'round' : 'rect');
  });

  graph.on('node:dblclick', ({ node }) => {
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
        : { name: 'orth' },
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
  attachMindmapDirection(graph, props.graphData);
  bindKeyboardShortcuts();
  bindGraphEvents();
  applyGraphData(props.graphData, true);
  applyCanvasInteractionMode();
  updateUndoRedoState();
}

onMounted(() => {
  nextTick(() => {
    initGraph();
    bindStageCtrlWheel();
    bindSpacePanListeners();

    if (stageRef.value) {
      resizeObserver = new ResizeObserver(() => {
        resizeGraph();
      });
      resizeObserver.observe(stageRef.value);
      // 标记最近交互的画板 stage，用于多实例下的系统粘贴路由
      stageRef.value.addEventListener('pointerdown', markStageActiveForBoardPaste);
      stageRef.value.addEventListener('focusin', markStageActiveForBoardPaste);
    }
    document.addEventListener('paste', handleDocumentPaste);
    document.addEventListener('keydown', handleDocumentKeydownForBoard);
  });
});

function markStageActiveForBoardPaste() {
  if (stageRef.value) {
    markActiveX6Stage(stageRef.value);
  }
}

onBeforeUnmount(() => {
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
  }
  clearMindmapCollapseHideTimer();
  unbindStageCtrlWheel();
  unbindSpacePanListeners();
  document.removeEventListener('paste', handleDocumentPaste);
  document.removeEventListener('keydown', handleDocumentKeydownForBoard);
  if (stageRef.value) {
    stageRef.value.removeEventListener('pointerdown', markStageActiveForBoardPaste);
    stageRef.value.removeEventListener('focusin', markStageActiveForBoardPaste);
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
    updateUndoRedoState();
    updateNodeOverlays();
  },
);

defineExpose({
  getMarkdownLinkAnchor,
  insertMarkdownLink,
  updateInsertedLinkDisplay,
  updateInsertedImageWidth,
  insertRefBlock,
  fitGraph,
});
</script>

<template>
  <div
    class="x6-editor"
    :class="{
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
      </div>

      <div v-if="blockActionsEnabled" class="toolbar-group">
        <button type="button" class="tool-button" :disabled="selectedCellsCount === 0" @click="extractSelectionAsMaterial">
          提取为素材
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
          :ref="(el) => setNodeOverlayRef(el, overlay.id)"
          :node-id="overlay.id"
          :style-props="overlay.style"
          :text-mode="overlay.textMode"
          :label="overlay.label"
          :rich-content="overlay.richContent"
          :is-editing="editingNodeId === overlay.id"
          :is-editable="isEditable"
          @commit-plain="(text: string) => handleNodeOverlayCommit(overlay.id, text)"
          @cancel="() => handleNodeOverlayCancel(overlay.id)"
          @rich-change="(md: string) => handleRichChange(overlay.id, md)"
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

.x6-canvas :deep(.x6-widget-transform) {
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
