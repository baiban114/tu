<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import X6NodeOverlay from './X6NodeOverlay.vue';
import X6MaterialLibrary from './X6MaterialLibrary.vue';
import { useMaterialLibraryStore } from '@/stores/materialLibrary';
import { useBlockRegistryStore } from '@/stores/blockRegistry';
import { useObjectModelStore } from '@/stores/objectModel';
import { useOutlineCacheStore } from '@/stores/outlineCache';
import { useWorkspaceStore } from '@/stores/workspace';
import type { GraphData } from '@/api/types';
import type { PageItem } from '@/api/page';
import type { UmlClassDefinition, UmlModel } from '@/stores/objectModel';
import { didMaterialDragMove, resetMaterialDrag } from '@/components/x6/materialDrag';
import {
  Clipboard,
  type Edge,
  Graph,
  History,
  Keyboard,
  type Node,
  Selection,
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
  relayoutMindmapGraphAfterDelete,
  getLastMindmapDragPointer,
  updateMindmapDragPreview,
  collectMindmapDescendantIds,
  ensureMindmapConnectorRegistered,
  MINDMAP_DRAG_PREVIEW_EDGE_ID,
  MINDMAP_DRAG_PREVIEW_OPTION,
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
}

type SelectedCellState =
  | {
      kind: 'node';
      id: string;
      shape: string;
      label: string;
      fill: string;
      stroke: string;
      width: number;
      height: number;
      textMode: 'plain' | 'rich';
      richContent: string;
      isRefBlock: boolean;
      refBlockId: string;
      refType: 'block' | 'page';
      refSourceLabel: string;
    }
  | {
      kind: 'edge';
      id: string;
      label: string;
      stroke: string;
      router: string;
      connector: string;
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
}>();

const stageRef = ref<HTMLDivElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const nodeOverlayRefs = ref<Record<string, {
  getMarkdownLinkAnchor?: () => { top: number; left: number } | undefined;
  insertMarkdownLink?: (label: string, url: string, display?: 'link' | 'image') => boolean;
  updateInsertedLinkDisplay?: (display: 'link' | 'image') => boolean;
  updateInsertedImageWidth?: (widthPercent: number) => boolean;
}>>({});

const canUndo = ref(false);
const canRedo = ref(false);
const gridVisible = ref(true);
const zoomPercent = ref(100);
const selectedCellsCount = ref(0);
const deletableSelectionCount = ref(0);
const selectedCell = ref<SelectedCellState | null>(null);
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
const toolbarVisible = ref(true);
const inspectorVisible = ref(true);
type CanvasInteractionMode = 'select' | 'pan';
const canvasInteractionMode = ref<CanvasInteractionMode>('select');
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
let pendingNodeInternalClickId: string | null = null;
let suppressNextNodeInternalClickId: string | null = null;
let lastMaterialInsertTime = 0;
const MATERIAL_INSERT_DEBOUNCE_MS = 300;

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
    const base = createEdgeMetadata(edge, {
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
    return {
      ...base,
      ...edge,
      router: { name: 'normal' },
      connector: { name: 'smooth' },
      attrs: mergeDeep(base.attrs, edge.attrs ?? {}),
    };
  }

  const base = createEdgeMetadata(edge);
  const router = edge.router;
  const routerName = typeof router === 'string' ? router : router?.name;
  return {
    ...base,
    ...edge,
    router: routerName === 'manhattan' ? { name: 'orth' } : (router ?? base.router),
    attrs: mergeDeep(base.attrs, edge.attrs ?? {}),
  };
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
  return JSON.stringify(normalizeGraphData(data));
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
  emit('graph-data-change', payload);
}

function updateUndoRedoState() {
  if (!graph) return;
  canUndo.value = graph.canUndo();
  canRedo.value = graph.canRedo();
  zoomPercent.value = Math.round(graph.zoom() * 100);
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

function setEdgeLabel(edge: Edge, text: string) {
  if (!text.trim()) {
    edge.setLabels([]);
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
  nodeOverlays.value = graph.getNodes().map(node => {
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
  if (!graph || !isEditable.value) return;
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
  if (!graph || !isMindmap.value || !isEditable.value) return;
  toggleMindmapNodeCollapse(
    graph,
    node,
    readMindmapDirection(props.graphData),
    mindmapRefTocContext,
  );
  scheduleSync();
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

  if (canvasInteractionMode.value === 'pan') {
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
      selectedCell.value = {
        kind: 'node',
        id: cell.id,
        shape: cell.shape,
        label: getNodeLabel(cell),
        fill: (cell.attr('body/fill') as string) || '#ffffff',
        stroke: (cell.attr('body/stroke') as string) || '#1677ff',
        width: size.width,
        height: size.height,
        textMode: nodeData.textMode ?? 'plain',
        richContent: nodeData.richContent ?? '',
        isRefBlock,
        refBlockId,
        refType,
        refSourceLabel: isRefBlock && refBlockId ? buildRefSourceLabel(refBlockId, refType) : '',
      };
    } else if (graph.isEdge(cell)) {
      const router = cell.getRouter();
      const connector = cell.getConnector();
      selectedCell.value = {
        kind: 'edge',
        id: cell.id,
        label: getEdgeLabel(cell),
        stroke: (cell.attr('line/stroke') as string) || '#52616b',
        router: typeof router === 'string' ? router : (router?.name ?? 'orth'),
        connector: typeof connector === 'string' ? connector : (connector?.name ?? 'rounded'),
      };
    }
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
function finalizeSelectionVisualState() {
  if (!graph) return;
  reconcileSelectionHighlight();
  const cells = graph.getSelectedCells();
  if (cells.length !== 1 || !graph.isNode(cells[0])) {
    graph.clearTransformWidgets();
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
  const incomingUml = (data as Record<string, any> | undefined)?.uml;
  if (incomingUml) {
    objectModelStore.replaceModel(incomingUml);
  }
  const snapshot = JSON.stringify(normalized);
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
  graph.fromJSON({ cells: normalized.cells ?? [] });
  graph.cleanSelection();
  syncTaskFlowEdgeState();
  if (isMindmap.value) {
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
        emit('graph-data-change', laidOut);
      }
    }
  });
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

function addNode(preset: NodePreset, position?: { x: number; y: number }) {
  if (!graph || !isEditable.value) return;
  if (isMindmap.value) {
    addMindmapChildNode();
    return;
  }
  const center = position ?? getCanvasCenter();
  const node = graph.addNode(
    isTaskFlow.value
      ? createTaskNode({
        x: center.x,
        y: center.y,
      })
      : createNodeMetadata(preset, {
        x: center.x,
        y: center.y,
      }),
  );
  graph.cleanSelection();
  graph.select(node);
  refreshSelectedCellState();
  scheduleSync();
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
  const cells = resolveDeletableCellsForDelete();
  if (!cells.length) return;

  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }

  graph.removeCells(cells);
  graph.cleanSelection();
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
  const cells = graph.getSelectedCells();
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
  const cells = graph.getSelectedCells();
  if (!cells.length) return;
  graph.copy(cells);
}

function pasteSelection() {
  if (!graph || !isEditable.value) return;
  const pasted = graph.paste({ offset: { dx: 32, dy: 32 } });
  if (!pasted.length) return;
  graph.resetSelection(pasted);
  refreshSelectedCellState();
  scheduleSync();
}

/** Extract selected cells as a reusable material and open the library panel. */
function extractSelectionAsMaterial() {
  if (!graph || !props.blockActionsEnabled) return;
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
  if (e.dataTransfer?.types.includes('application/x6-material')) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
}

function onMaterialDrop(e: DragEvent) {
  if (!graph || !isEditable.value || isApplyingExternalData) return;
  if (!e.dataTransfer?.types.includes('application/x6-material')) return;
  const raw = e.dataTransfer.getData('application/x6-material');
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

function clearCanvas() {
  if (!graph || !isEditable.value) return;
  if (!window.confirm('确认清空当前图形吗？')) return;
  graph.clearCells();
  graph.cleanSelection();
  refreshSelectedCellState();
  scheduleSync();
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

function fitGraph() {
  if (!graph) return;
  if (graph.getCellCount() > 0) {
    graph.zoomToFit({ padding: 24, maxScale: 1 });
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
  edge.setConnector(value);
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

function insertUmlClassPreset() {
  if (!isEditable.value) return;
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
    createUmlClassNode(userClass, { x: 160, y: 120, data: { umlClassId: userClass.id, umlDefinition: userClass } }),
    createUmlClassNode(orderClass, { x: 460, y: 120, data: { umlClassId: orderClass.id, umlDefinition: orderClass } }),
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
  const userNode = graph?.addNode(classNodes[0]);
  const orderNode = graph?.addNode(classNodes[1]);
  if (userNode && orderNode) {
    graph?.addEdge(relation);
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
  scheduleSync();
}

function editNodeLabel(node: Node) {
  if (!isEditable.value || !graph) return;
  emit('active');
  if (editingNodeId.value === node.id) return;

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
    updateMindmapCollapseOverlays();
  });

  graph.on('node:mousedown', ({ node }) => {
    startUserInteraction();
    pendingNodeInternalClickId = null;

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
      && canvasInteractionMode.value === 'select'
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
      || canvasInteractionMode.value !== 'select'
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

  graph.on('node:moved', ({ node }) => {
    if (
      isMindmap.value
      && isEditable.value
      && canvasInteractionMode.value === 'select'
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

  graph.on('node:resized', () => {
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

  graph.on('node:click', ({ node }) => {
    const shouldHandleInternalClick = pendingNodeInternalClickId === node.id;
    pendingNodeInternalClickId = null;

    if (shouldHandleInternalClick) {
      tryHandleNodeInternalClick(node);
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

  graph.on('edge:mouseenter', ({ view }) => {
    view.addTools({
      items: [
        { name: 'vertices' },
        { name: 'source-arrowhead' },
        { name: 'target-arrowhead' },
        { name: 'button-remove', args: { distance: -30 } },
      ],
    });
  });

  graph.on('edge:mouseleave', ({ view }) => {
    view.removeTools();
  });

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
      enabled: true,
      modifiers: ['ctrl', 'meta'],
      minScale: 0.2,
      maxScale: 3,
      factor: 1.1,
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
        && canvasInteractionMode.value === 'select'
        && graph?.isNode(cell)
        && cell.getData<Record<string, unknown>>()?.mindRole !== 'root';
      const defaultMovable = isEditable.value && !isMindmap.value;
      return {
        nodeMovable: mindmapSelectDrag || defaultMovable,
        edgeMovable: defaultMovable,
        edgeLabelMovable: defaultMovable,
        magnetConnectable: isEditable.value,
        arrowheadMovable: defaultMovable,
        vertexMovable: defaultMovable,
        vertexAddable: defaultMovable,
        vertexDeletable: defaultMovable,
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

    if (stageRef.value) {
      resizeObserver = new ResizeObserver(() => {
        resizeGraph();
      });
      resizeObserver.observe(stageRef.value);
    }
  });
});

onBeforeUnmount(() => {
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
  }
  clearMindmapCollapseHideTimer();
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
});
</script>

<template>
  <div
    class="x6-editor"
    :class="{
      'x6-editor--sized': hasExplicitSize,
      'x6-editor--fill': isFillLayout,
      'x6-editor--node-editing': isFillLayout && isNodeEditing,
    }"
    :style="editorStyle"
    @mousedown.stop="emit('active')"
    @click.stop
    @dblclick.stop
  >
    <div v-if="toolbarVisible" class="x6-toolbar">
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
          title="拖拽画布"
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
        <button type="button" class="tool-button tool-button--shape" :disabled="!isEditable" @click="addNode('round')">
          <svg class="tool-button__icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="6" fill="#fff8e6" stroke="#d48806" stroke-width="1.2"/></svg>
          <span class="tool-button__label">新任务</span>
        </button>
        <button type="button" class="tool-button tool-button--shape" :disabled="!isEditable" @click="addNode('ellipse')">
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
        <button type="button" class="tool-button tool-button--shape" :disabled="!isEditable" @click="addNode('rect')">
          <svg class="tool-button__icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="#fff7e6" stroke="#d48806" stroke-width="1.2"/></svg>
          <span class="tool-button__label">矩形</span>
        </button>
        <button type="button" class="tool-button tool-button--shape" :disabled="!isEditable" @click="addNode('round')">
          <svg class="tool-button__icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="5" fill="#f6ffed" stroke="#389e0d" stroke-width="1.2"/></svg>
          <span class="tool-button__label">圆角矩形</span>
        </button>
        <button type="button" class="tool-button tool-button--shape" :disabled="!isEditable" @click="addNode('ellipse')">
          <svg class="tool-button__icon" viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="9" ry="8" fill="#e6f4ff" stroke="#1677ff" stroke-width="1.2"/></svg>
          <span class="tool-button__label">圆形</span>
        </button>
        <button type="button" class="tool-button tool-button--shape" :disabled="!isEditable" @click="addNode('diamond')">
          <svg class="tool-button__icon" viewBox="0 0 24 24"><polygon points="12,3 22,13 12,23 2,13" fill="#fff1f0" stroke="#cf1322" stroke-width="1.2"/></svg>
          <span class="tool-button__label">菱形</span>
        </button>
        <button type="button" class="tool-button tool-button--shape" :disabled="!isEditable" @click="insertUmlClassPreset">
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
        <button type="button" class="tool-button" @click="fitGraph">适配</button>
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
          :class="{ 'tool-button--active': inspectorTab === 'library' }"
          @click="inspectorTab = inspectorTab === 'library' ? 'inspector' : 'library'"
        >
          素材库
        </button>
        <button type="button" class="tool-button" :disabled="!isEditable" @click="requestInsertRefBlock">
          插入引用块
        </button>
      </div>

      <div class="toolbar-group toolbar-group--summary">
        <span class="toolbar-summary">{{ selectionSummary }}</span>
        <span class="toolbar-summary">{{ zoomPercent }}%</span>
        <button type="button" class="tool-button tool-button--danger" :disabled="!isEditable" @click="clearCanvas">
          清空
        </button>
      </div>
    </div>
    <div v-if="!toolbarVisible || !inspectorVisible" class="x6-restore-bar">
      <button v-if="!toolbarVisible" type="button" class="x6-restore-button" title="显示工具栏" @click="toolbarVisible = true">
        ⊞ 工具栏
      </button>
      <button v-if="!inspectorVisible" type="button" class="x6-restore-button" title="显示侧边栏" @click="inspectorVisible = true">
        ⊞ 侧边栏
      </button>
    </div>

    <div class="x6-workspace" :class="{ 'x6-workspace--no-inspector': !inspectorVisible }">
      <div
        ref="stageRef"
        class="x6-stage"
        :class="{
          'x6-stage--library': inspectorTab === 'library',
          'x6-stage--node-editing': isFillLayout && isNodeEditing,
          'x6-stage--interaction-select': canvasInteractionMode === 'select',
          'x6-stage--interaction-pan': canvasInteractionMode === 'pan',
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
          :disabled="!isEditable || mindmapCollapseLoadingNodeId === btn.nodeId"
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

        <div class="x6-stage-hint">
          <template v-if="inspectorTab === 'library' && blockActionsEnabled">
            <span>点击素材卡片：插入到视口中心</span>
            <span>拖拽右侧把手：插入到画板指定位置</span>
          </template>
          <span v-else-if="blockActionsEnabled">选中后可直接提取为素材</span>
          <template v-if="isMindmap">
            <span>Tab 添加子节点 · Enter 添加同级</span>
            <span>悬浮节点显示展开/收起按钮（避开连接桩）</span>
            <span>双击节点编辑文字（支持富文本）</span>
            <span>Delete 删除选中分支（含子节点）· 中心主题不可删除</span>
          </template>
          <template v-else>
            <span>双击空白处快速新建节点</span>
            <span>拖拽节点四周锚点创建连线</span>
            <span>双击节点或连线直接改文字</span>
          </template>
        </div>
      </div>

      <aside v-if="inspectorVisible" class="x6-inspector">
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

          <div v-if="isMindmap" class="inspector-card">
            <h4>思维导图</h4>
            <p class="inspector-empty">树形结构由工具栏或快捷键维护，连线会自动布局为从左到右的分支。</p>
            <ul class="inspector-tips">
              <li><code>Tab</code> 为选中节点添加子分支</li>
              <li><code>Enter</code> 添加同级分支</li>
              <li>节点支持切换富文本模式并插入素材</li>
            </ul>
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
            <p class="inspector-empty">当前选中了 {{ selectedCellsCount }} 个对象，可直接拖拽整体移动或批量删除。</p>
          </template>

          <template v-else-if="selectedCell?.kind === 'node'">
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

            <label v-if="!selectedCell.isRefBlock" class="field">
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

            <template v-if="!selectedCell.isRefBlock && selectedCell.textMode === 'plain'">
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
            <template v-else-if="!selectedCell.isRefBlock">
              <p class="inspector-empty" style="font-size:12px;">双击节点可直接编辑富文本</p>
            </template>

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
              </select>
            </label>
          </template>
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  min-height: 560px;
}
.x6-workspace--no-inspector {
  grid-template-columns: minmax(0, 1fr);
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

.x6-stage-hint {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  max-width: calc(100% - 32px);
  pointer-events: none;
}

.x6-stage-hint span {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(210, 216, 226, 0.9);
  color: #5f6b7a;
  font-size: 12px;
  box-shadow: 0 6px 14px rgba(31, 45, 61, 0.08);
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

.x6-canvas :deep(.x6-edge.x6-edge-selected .connection) {
  stroke-width: 3px !important;
  stroke: #1677ff !important;
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
