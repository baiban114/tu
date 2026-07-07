import type { BlockMetadata, GraphData, PageItem } from '@/api/types';
import {
  createKnowledgeRoadmapGraphData,
  parseKnowledgeRoadmapGraphData,
  type RoadmapGraphParseResult,
} from '@/utils/roadmapGraph';

export type GraphSourceKind = 'selection-blueprint' | 'knowledge-base-pages';
export type GraphSyncMode = 'detached' | 'read-only-source' | 'bidirectional';

export interface GraphSourceMetadata extends BlockMetadata {
  graphMode: 'source-loaded';
  sourceKind: GraphSourceKind;
  sourceId?: string | null;
  syncMode: GraphSyncMode;
  sourceType?: string;
  sourceKbId?: string | null;
}

export interface GraphSourceCapabilities {
  loadFromSource: boolean;
  writeBackToSource: boolean;
  createBlockFromSource: boolean;
}

export interface GraphSourceAdapter<TSource = unknown, TParsed = unknown> {
  kind: GraphSourceKind;
  capabilities: GraphSourceCapabilities;
  createGraphFromSource(source: TSource): GraphData;
  parseGraphToSourcePatch?: (graphData: GraphData) => TParsed;
}

const adapters: Record<GraphSourceKind, GraphSourceAdapter<any, any>> = {
  'selection-blueprint': {
    kind: 'selection-blueprint',
    capabilities: {
      loadFromSource: false,
      writeBackToSource: false,
      createBlockFromSource: true,
    },
    createGraphFromSource(source: GraphData) {
      return source;
    },
  },
  'knowledge-base-pages': {
    kind: 'knowledge-base-pages',
    capabilities: {
      loadFromSource: true,
      writeBackToSource: true,
      createBlockFromSource: true,
    },
    createGraphFromSource(source: PageItem[]) {
      return createKnowledgeRoadmapGraphData(source);
    },
    parseGraphToSourcePatch(graphData: GraphData): RoadmapGraphParseResult {
      return parseKnowledgeRoadmapGraphData(graphData);
    },
  },
};

export function getGraphSourceAdapter(kind: GraphSourceKind): GraphSourceAdapter {
  return adapters[kind];
}

export function createGraphFromSource<TSource>(kind: GraphSourceKind, source: TSource): GraphData {
  return getGraphSourceAdapter(kind).createGraphFromSource(source);
}

export function parseGraphToSourcePatch(kind: GraphSourceKind, graphData: GraphData): RoadmapGraphParseResult {
  const parser = getGraphSourceAdapter(kind).parseGraphToSourcePatch;
  if (!parser) {
    throw new Error('Current graph source does not support writing back to source.');
  }
  return parser(graphData) as RoadmapGraphParseResult;
}

export function getGraphSourceCapabilities(kind: GraphSourceKind): GraphSourceCapabilities {
  return getGraphSourceAdapter(kind).capabilities;
}

export function createGraphSourceMetadata(
  kind: GraphSourceKind,
  options: {
    sourceId?: string | null;
    syncMode?: GraphSyncMode;
  } = {},
): GraphSourceMetadata {
  const defaultSyncMode: GraphSyncMode = kind === 'knowledge-base-pages' ? 'bidirectional' : 'detached';
  return {
    graphMode: 'source-loaded',
    sourceKind: kind,
    sourceId: options.sourceId ?? null,
    syncMode: options.syncMode ?? defaultSyncMode,
    sourceType: kind === 'knowledge-base-pages' ? 'knowledge-roadmap' : kind,
    sourceKbId: kind === 'knowledge-base-pages' ? options.sourceId ?? null : undefined,
  };
}

export function readGraphSourceKind(metadata: BlockMetadata | undefined): GraphSourceKind | null {
  const sourceKind = metadata?.sourceKind;
  if (sourceKind === 'selection-blueprint' || sourceKind === 'knowledge-base-pages') {
    return sourceKind;
  }
  if (metadata?.sourceType === 'knowledge-roadmap') {
    return 'knowledge-base-pages';
  }
  return null;
}

export function canLoadGraphFromSource(metadata: BlockMetadata | undefined): boolean {
  const kind = readGraphSourceKind(metadata);
  return Boolean(kind && getGraphSourceCapabilities(kind).loadFromSource);
}

export function canWriteGraphToSource(metadata: BlockMetadata | undefined): boolean {
  const kind = readGraphSourceKind(metadata);
  const syncMode = metadata?.syncMode;
  return Boolean(kind && syncMode === 'bidirectional' && getGraphSourceCapabilities(kind).writeBackToSource);
}
