import type { UmlClassDefinition } from '@/stores/objectModel';
import { createId, mergeDeep, type CellData } from './cellUtils';
import { MINDMAP_CONNECTOR_NAME } from './mindmapConnector';
import { createMindmapPorts, createNodePorts, getMindmapEdgePorts } from './ports';

export type NodePreset = 'rect' | 'round' | 'ellipse' | 'diamond' | 'umlClass';

export function createEdgeMetadata(edge: Partial<CellData> = {}, overrides?: Partial<CellData>): CellData {
  return {
    shape: 'edge',
    router: { name: 'orth' },
    connector: { name: 'rounded' },
    attrs: mergeDeep(
      {
        line: {
          stroke: '#52616b',
          strokeWidth: 2,
          targetMarker: {
            name: 'block',
            width: 10,
            height: 8,
          },
        },
      },
      edge.attrs ?? {},
    ),
    zIndex: 0,
    ...edge,
    ...overrides,
  };
}

export function createMindmapEdgeMetadata(
  sourceId: string,
  targetId: string,
  edgeId?: string,
  branchSide: 'left' | 'right' = 'right',
): CellData {
  const ports = getMindmapEdgePorts(branchSide);
  return createEdgeMetadata(
    {
      id: edgeId ?? createId('mindmap-edge'),
      source: { cell: sourceId, port: ports.sourcePort },
      target: { cell: targetId, port: ports.targetPort },
    },
    {
      connector: { name: MINDMAP_CONNECTOR_NAME },
      attrs: {
        line: {
          stroke: '#A2B1C3',
          strokeWidth: 2,
          targetMarker: '',
        },
      },
    },
  );
}

export function formatUmlClassLabel(definition: UmlClassDefinition): string {
  const attributes = definition.attributes.length ? definition.attributes.join('\n') : ' ';
  const methods = definition.methods.length ? definition.methods.join('\n') : ' ';
  return `${definition.name}\n────────────\n${attributes}\n────────────\n${methods}`;
}

export function createUmlClassNode(definition: UmlClassDefinition, options: Partial<CellData> = {}): CellData {
  return {
    id: options.id ?? definition.nodeId ?? createId('uml-class-node'),
    shape: 'rect',
    x: options.x ?? 160,
    y: options.y ?? 120,
    width: options.width ?? 240,
    height: options.height ?? 172,
    ports: options.ports ?? createNodePorts(),
    attrs: mergeDeep(
      {
        body: {
          fill: '#fffdf7',
          stroke: '#31511e',
          strokeWidth: 1.8,
          rx: 2,
          ry: 2,
        },
        label: {
          text: formatUmlClassLabel(definition),
          fill: '#1f2d1f',
          fontSize: 13,
          fontFamily: 'Consolas, Menlo, monospace',
          textVerticalAnchor: 'middle',
          textAnchor: 'middle',
          lineHeight: 18,
        },
      },
      options.attrs ?? {},
    ),
    data: {
      preset: 'umlClass',
      umlClassId: definition.id,
      ...(options.data ?? {}),
    },
    ...options,
  };
}

export function createNodeMetadata(preset: NodePreset, options: Partial<CellData> = {}): CellData {
  if (preset === 'umlClass') {
    const definition: UmlClassDefinition = options.data?.umlDefinition ?? {
      id: options.data?.umlClassId ?? createId('uml-class'),
      name: options.label ?? 'Class',
      attributes: [],
      methods: [],
      nodeId: options.id,
    };
    return createUmlClassNode(definition, options);
  }

  const labels: Record<Exclude<NodePreset, 'umlClass'>, string> = {
    rect: '处理步骤',
    round: '子流程',
    ellipse: '开始 / 结束',
    diamond: '判断',
  };

  const fills: Record<Exclude<NodePreset, 'umlClass'>, string> = {
    rect: '#fff7e6',
    round: '#f6ffed',
    ellipse: '#e6f4ff',
    diamond: '#fff1f0',
  };

  const strokes: Record<Exclude<NodePreset, 'umlClass'>, string> = {
    rect: '#d48806',
    round: '#389e0d',
    ellipse: '#1677ff',
    diamond: '#cf1322',
  };

  const textColors: Record<Exclude<NodePreset, 'umlClass'>, string> = {
    rect: '#593103',
    round: '#135200',
    ellipse: '#003a8c',
    diamond: '#820014',
  };

  const shape = preset === 'diamond' ? 'polygon' : preset === 'ellipse' ? 'ellipse' : 'rect';
  const defaultWidth = preset === 'ellipse' ? 140 : preset === 'diamond' ? 140 : 160;
  const defaultHeight = preset === 'diamond' ? 88 : 64;
  const baseBody: Record<string, any> = {
    fill: fills[preset],
    stroke: strokes[preset],
    strokeWidth: 1.6,
  };

  if (preset === 'round') {
    baseBody.rx = 16;
    baseBody.ry = 16;
  }

  if (preset === 'diamond') {
    baseBody.refPoints = '0,10 10,0 20,10 10,20';
  }

  return {
    id: options.id ?? createId(`x6-${preset}`),
    shape,
    x: options.x ?? 120,
    y: options.y ?? 120,
    width: options.width ?? defaultWidth,
    height: options.height ?? defaultHeight,
    ports: options.ports ?? createNodePorts(),
    attrs: mergeDeep(
      {
        body: baseBody,
        label: {
          text: options.label ?? labels[preset],
          fill: textColors[preset],
          fontSize: 14,
          fontWeight: 600,
        },
      },
      options.attrs ?? {},
    ),
    data: {
      preset,
      ...(options.data ?? {}),
    },
    ...options,
  };
}

export function createTaskNode(options: Partial<CellData> = {}): CellData {
  const label = typeof options.label === 'string' && options.label.trim() ? options.label.trim() : '新任务';
  const description = typeof options.data?.taskDescription === 'string' && options.data.taskDescription.trim()
    ? options.data.taskDescription.trim()
    : '连接上下游任务';

  return createNodeMetadata('round', {
    width: 196,
    height: 86,
    label,
    attrs: mergeDeep(
      {
        body: {
          fill: '#fff8e6',
          stroke: '#d48806',
          strokeWidth: 1.8,
          rx: 18,
          ry: 18,
        },
        label: {
          text: `${label}\n${description}`,
          fill: '#6b3f00',
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 18,
        },
      },
      options.attrs ?? {},
    ),
    data: {
      preset: 'round',
      textMode: 'plain',
      taskRole: 'task',
      taskStatus: 'todo',
      taskDescription: description,
      ...(options.data ?? {}),
    },
    ...options,
  });
}

export type MindmapNodeRole = 'root' | 'topic' | 'free';

export function createMindmapNode(options: Partial<CellData> & { mindRole?: MindmapNodeRole } = {}): CellData {
  const mindRole = options.mindRole ?? 'topic';
  const isRoot = mindRole === 'root';
  const label = typeof options.label === 'string' && options.label.trim()
    ? options.label.trim()
    : (isRoot ? '中心主题' : '分支主题');

  return createNodeMetadata('round', {
    width: isRoot ? 180 : 156,
    height: isRoot ? 56 : 48,
    label,
    ports: createMindmapPorts(),
    attrs: mergeDeep(
      {
        body: {
          fill: isRoot ? '#e6f4ff' : '#f6ffed',
          stroke: isRoot ? '#1677ff' : '#52c41a',
          strokeWidth: isRoot ? 2 : 1.6,
          rx: isRoot ? 20 : 14,
          ry: isRoot ? 20 : 14,
        },
        label: {
          text: label,
          fill: isRoot ? '#003a8c' : '#135200',
          fontSize: isRoot ? 15 : 14,
          fontWeight: isRoot ? 700 : 600,
          // Relative wrap box: node size minus padding (see mindmapNodeFit).
          textWrap: {
            width: -28,
            height: -20,
            ellipsis: false,
          },
        },
      },
      options.attrs ?? {},
    ),
    data: {
      preset: 'round',
      textMode: 'plain',
      mindRole,
      mindBranchSide: isRoot ? undefined : 'right',
      ...(options.data ?? {}),
      ...(isRoot ? { deleteProtected: true } : {}),
    },
    ...options,
  });
}
