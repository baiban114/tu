import type { GraphData } from '@/api/types';
import { createId } from './cellUtils';
import {
  createEdgeMetadata,
  createMindmapEdgeMetadata,
  createMindmapNode,
  createNodeMetadata,
  createTaskNode,
} from './graphCells';
import { layoutMindmapGraphData } from './mindmap';

export const TASK_FLOW_KIND = 'task-flow' as const;
export const MINDMAP_KIND = 'mindmap' as const;

export type GraphBlueprintKind = typeof TASK_FLOW_KIND | typeof MINDMAP_KIND | string;

export function readBlueprintKind(data?: GraphData | null): GraphBlueprintKind | null {
  const kind = data?.blueprintMeta?.kind;
  return typeof kind === 'string' && kind.trim() ? kind : null;
}

export function isTaskFlowBlueprint(data?: GraphData | null): boolean {
  return readBlueprintKind(data) === TASK_FLOW_KIND;
}

export function isMindmapBlueprint(data?: GraphData | null): boolean {
  if (readBlueprintKind(data) === MINDMAP_KIND) return true;
  return looksLikeMindmapGraph(data);
}

function collectGraphCells(data?: GraphData | null): unknown[] {
  if (!data) return [];
  if (Array.isArray(data.cells) && data.cells.length > 0) return data.cells;
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  return [...nodes, ...edges];
}

/** Detect mindmap graphs saved without blueprintMeta (e.g. backend round-trip). */
export function looksLikeMindmapGraph(data?: GraphData | null): boolean {
  const mindRoles = new Set(['root', 'topic', 'branch', 'free']);
  return collectGraphCells(data).some((cell) => {
    if (!cell || typeof cell !== 'object') return false;
    const record = cell as Record<string, unknown>;
    const nodeData = record.data as Record<string, unknown> | undefined;
    const role = nodeData?.mindRole ?? record.mindRole;
    return typeof role === 'string' && mindRoles.has(role);
  });
}

/** Restore blueprintMeta when graph structure is mindmap but metadata was stripped. */
export function ensureMindmapBlueprintMeta(data: GraphData): GraphData {
  if (readBlueprintKind(data) === MINDMAP_KIND) return data;
  if (!looksLikeMindmapGraph(data)) return data;
  return {
    ...data,
    blueprintMeta: {
      ...(data.blueprintMeta ?? {}),
      kind: MINDMAP_KIND,
      direction: data.blueprintMeta?.direction ?? 'LR',
      anchor: data.blueprintMeta?.anchor ?? { x: 200, y: 220 },
    },
  };
}

export function getBlueprintRegionLabel(kind: string): string {
  if (kind === 'knowledge-base-pages') return '知识库路线图';
  if (kind === 'selection-blueprint') return '蓝图';
  if (kind === 'knowledge-roadmap') return '知识库路线图';
  if (kind === 'blueprint') return '蓝图';
  if (kind === TASK_FLOW_KIND) return '任务流';
  if (kind === MINDMAP_KIND) return '思维导图';
  return kind;
}

export function createStarterGraphData(): GraphData {
  const startNode = createNodeMetadata('ellipse', {
    id: 'x6-start-node',
    x: 100,
    y: 160,
    label: '开始',
  });

  const processNode = createNodeMetadata('round', {
    id: 'x6-process-node',
    x: 340,
    y: 150,
    label: '编辑流程',
  });

  const decisionNode = createNodeMetadata('diamond', {
    id: 'x6-decision-node',
    x: 610,
    y: 148,
    label: '需要分支?',
  });

  const finishNode = createNodeMetadata('ellipse', {
    id: 'x6-finish-node',
    x: 870,
    y: 160,
    label: '完成',
  });

  const edges = [
    createEdgeMetadata({
      id: 'x6-edge-1',
      source: { cell: startNode.id, port: 'port-right' },
      target: { cell: processNode.id, port: 'port-left' },
    }),
    createEdgeMetadata({
      id: 'x6-edge-2',
      source: { cell: processNode.id, port: 'port-right' },
      target: { cell: decisionNode.id, port: 'port-left' },
    }),
    createEdgeMetadata({
      id: 'x6-edge-3',
      source: { cell: decisionNode.id, port: 'port-right' },
      target: { cell: finishNode.id, port: 'port-left' },
    }),
  ];

  const cells = [startNode, processNode, decisionNode, finishNode, ...edges];
  return {
    cells,
    nodes: [startNode, processNode, decisionNode, finishNode],
    edges,
  } as GraphData;
}

export function createTaskFlowStarterGraphData(): GraphData {
  const startNode = createNodeMetadata('ellipse', {
    id: 'task-flow-start-node',
    x: 100,
    y: 170,
    width: 136,
    height: 64,
    label: '开始',
    data: {
      preset: 'ellipse',
      taskRole: 'start',
      taskStatus: 'ready',
    },
  });

  const taskNode = createTaskNode({
    id: 'task-flow-task-node',
    x: 360,
    y: 156,
    label: '核心任务',
    data: {
      taskDescription: '双击后编辑任务内容',
    },
  });

  const finishNode = createNodeMetadata('ellipse', {
    id: 'task-flow-finish-node',
    x: 660,
    y: 170,
    width: 136,
    height: 64,
    label: '完成',
    data: {
      preset: 'ellipse',
      taskRole: 'finish',
      taskStatus: 'ready',
    },
  });

  const edges = [
    createEdgeMetadata({
      id: 'task-flow-edge-1',
      source: { cell: startNode.id, port: 'port-right' },
      target: { cell: taskNode.id, port: 'port-left' },
    }),
    createEdgeMetadata({
      id: 'task-flow-edge-2',
      source: { cell: taskNode.id, port: 'port-right' },
      target: { cell: finishNode.id, port: 'port-left' },
    }),
  ];

  return {
    cells: [startNode, taskNode, finishNode, ...edges],
    nodes: [startNode, taskNode, finishNode],
    edges,
    blueprintMeta: {
      anchor: { x: 480, y: 240 },
      kind: TASK_FLOW_KIND,
    },
  } as GraphData;
}

export function createMindmapStarterGraphData(): GraphData {
  const root = createMindmapNode({
    id: createId('mindmap-root'),
    x: 80,
    y: 200,
    label: '中心主题',
    mindRole: 'root',
  });

  const branchA = createMindmapNode({
    id: createId('mindmap-topic'),
    label: '分支 1',
    mindRole: 'topic',
  });

  const branchB = createMindmapNode({
    id: createId('mindmap-topic'),
    label: '分支 2',
    mindRole: 'topic',
  });

  const edges = [
    createMindmapEdgeMetadata(root.id!, branchA.id!),
    createMindmapEdgeMetadata(root.id!, branchB.id!),
  ];

  const nodes = [root, branchA, branchB];

  return layoutMindmapGraphData({
    cells: [...nodes, ...edges],
    nodes,
    edges,
    blueprintMeta: {
      anchor: { x: 200, y: 220 },
      kind: MINDMAP_KIND,
      direction: 'LR',
    },
  } as GraphData);
}

export function resolveBlueprintStarter(data?: GraphData | null): GraphData {
  if (data == null) {
    return createStarterGraphData();
  }

  const kind = readBlueprintKind(data);
  const hasContent = Boolean(
    Array.isArray(data.cells) && data.cells.length > 0
    || data.nodes?.length
    || data.edges?.length,
  );

  if (kind === TASK_FLOW_KIND && !hasContent) {
    return createTaskFlowStarterGraphData();
  }

  if (kind === MINDMAP_KIND && !hasContent) {
    return createMindmapStarterGraphData();
  }

  return data;
}
