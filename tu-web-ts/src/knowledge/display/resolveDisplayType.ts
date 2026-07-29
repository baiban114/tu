import type { KnowledgePoint } from '@/api/types'
import { DEFAULT_KNOWLEDGE_POINT_DISPLAY_TYPE } from './displayTypeRegistry'
import type { KnowledgePointDisplayTypeCode } from './types'

/**
 * Resolve which document-display recipe applies to a knowledge point.
 * Prefer explicit `displayTypeCode` when present; otherwise default to concept.
 * (Backend metadata_json.displayTypeCode can be mapped here once exposed.)
 */
export function resolveKnowledgePointDisplayTypeCode(
  point: Pick<KnowledgePoint, 'id' | 'title'> & { displayTypeCode?: string | null },
  override?: string | null,
): KnowledgePointDisplayTypeCode {
  const fromOverride = override?.trim()
  if (fromOverride) return fromOverride
  const fromPoint = point.displayTypeCode?.trim()
  if (fromPoint) return fromPoint
  return DEFAULT_KNOWLEDGE_POINT_DISPLAY_TYPE
}
