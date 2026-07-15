import type {
  KnowledgeGraphDirection,
  KnowledgeGraphMode,
  KnowledgeGraphResponse,
  KnowledgePoint,
} from '@/api/types';
import { request } from './http';
import { isMockDataSource } from '@/dev/dataSource';
import { getKnowledgeGraphMock } from '@/mock/knowledgeGraph';

export interface GetKnowledgeGraphParams {
  mode?: KnowledgeGraphMode;
  centerPointId?: string;
  depth?: number;
  direction?: KnowledgeGraphDirection;
  relationTypeKeys?: string[];
  maxNodes?: number;
}

export async function getKnowledgeGraph(
  kbId: string,
  params: GetKnowledgeGraphParams = {},
): Promise<KnowledgeGraphResponse> {
  if (isMockDataSource()) {
    return getKnowledgeGraphMock(kbId, params);
  }
  const query = new URLSearchParams();
  if (params.mode) query.set('mode', params.mode);
  if (params.centerPointId) query.set('centerPointId', params.centerPointId);
  if (params.depth != null) query.set('depth', String(params.depth));
  if (params.direction) query.set('direction', params.direction);
  if (params.relationTypeKeys?.length) query.set('relationTypeKeys', params.relationTypeKeys.join(','));
  if (params.maxNodes != null) query.set('maxNodes', String(params.maxNodes));
  return request<KnowledgeGraphResponse>(`/api/kbs/${kbId}/knowledge-graph?${query.toString()}`);
}

export function flattenKnowledgePoints(tree: KnowledgePoint[]): KnowledgePoint[] {
  const result: KnowledgePoint[] = [];
  const walk = (nodes: KnowledgePoint[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);
  return result;
}
