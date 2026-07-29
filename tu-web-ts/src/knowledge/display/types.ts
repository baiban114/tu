import type {
  KnowledgePoint,
  KnowledgePointAnchor,
  KnowledgeRelation,
} from '@/api/types'

/** Built-in / registered display type codes for document rendering. */
export type KnowledgePointDisplayTypeCode =
  | 'concept'
  | 'case'
  | 'prerequisite_chain'
  | 'source_linked'
  | (string & {})

export type KnowledgePointRelationSlotDirection = 'out' | 'in' | 'both'

/**
 * Config slot: pull related KnowledgePoints via semantic edges.
 * Most display types are compositions of these slots + optional anchors.
 */
export interface KnowledgePointRelationComposeSlot {
  /** Stable section key in the composed view model. */
  key: string
  title: string
  relationTypeKeys: string[]
  direction: KnowledgePointRelationSlotDirection
  /** Max related points to include (default unlimited). */
  limit?: number
}

/** Config slot: pull evidence anchors bound to the point. */
export interface KnowledgePointAnchorComposeSlot {
  key: string
  title: string
  /** Empty = all kinds. */
  anchorKinds?: string[]
  /** Prefer primary anchors first when true (default true). */
  primaryFirst?: boolean
  limit?: number
}

/**
 * Declarative compose recipe for a display type.
 * Strategies read this instead of hard-coding per-type data fetches.
 */
export interface KnowledgePointDisplayComposeConfig {
  includeSummary: boolean
  includeAliases?: boolean
  relationSlots: KnowledgePointRelationComposeSlot[]
  anchorSlots: KnowledgePointAnchorComposeSlot[]
}

export interface KnowledgePointDisplayTypeDef {
  code: KnowledgePointDisplayTypeCode
  name: string
  description?: string
  /**
   * Strategy id. Default `relationCompose` covers most types via {@link compose}.
   * Custom strategies register under other ids (Strategy + Registry).
   */
  strategyId: string
  compose: KnowledgePointDisplayComposeConfig
}

export interface KnowledgePointDocumentSectionPointRef {
  id: string
  title: string
  summary?: string | null
  relationTypeKey?: string
}

export interface KnowledgePointDocumentSectionAnchorRef {
  id: string
  kind: string
  locator: string
  label: string
  primary: boolean
  role: string
}

export type KnowledgePointDocumentSectionKind = 'text' | 'pointList' | 'anchorList'

export interface KnowledgePointDocumentSection {
  key: string
  title: string
  kind: KnowledgePointDocumentSectionKind
  body?: string
  points?: KnowledgePointDocumentSectionPointRef[]
  anchors?: KnowledgePointDocumentSectionAnchorRef[]
}

/** Result of composing a knowledge point for insertion/rendering in a document. */
export interface KnowledgePointDocumentViewModel {
  pointId: string
  displayTypeCode: KnowledgePointDisplayTypeCode
  title: string
  sections: KnowledgePointDocumentSection[]
  binding: {
    pointId: string
    displayTypeCode: KnowledgePointDisplayTypeCode
    title: string
  }
}

/**
 * Runtime dependencies injected into strategies (ports).
 * Keeps strategies free of concrete API modules for testability.
 */
export interface KnowledgePointDisplayDataPort {
  getPoint(pointId: string): Promise<KnowledgePoint>
  listRelationsByPoint(kbId: string, pointId: string): Promise<{
    outgoing: KnowledgeRelation[]
    incoming: KnowledgeRelation[]
  }>
  listAnchors(pointId: string): Promise<KnowledgePointAnchor[]>
  getPointTitle?(pointId: string): Promise<string | null>
}

export interface KnowledgePointDisplayContext {
  kbId: string
  pointId: string
  /** Optional override; otherwise resolved from point / defaults. */
  displayTypeCode?: KnowledgePointDisplayTypeCode
  data: KnowledgePointDisplayDataPort
}
