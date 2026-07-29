export type {
  KnowledgePointAnchorComposeSlot,
  KnowledgePointDisplayComposeConfig,
  KnowledgePointDisplayContext,
  KnowledgePointDisplayDataPort,
  KnowledgePointDisplayTypeCode,
  KnowledgePointDisplayTypeDef,
  KnowledgePointDocumentSection,
  KnowledgePointDocumentSectionAnchorRef,
  KnowledgePointDocumentSectionKind,
  KnowledgePointDocumentSectionPointRef,
  KnowledgePointDocumentViewModel,
  KnowledgePointRelationComposeSlot,
  KnowledgePointRelationSlotDirection,
} from './types'

export {
  BUILTIN_KNOWLEDGE_POINT_DISPLAY_TYPES,
  DEFAULT_KNOWLEDGE_POINT_DISPLAY_TYPE,
  getKnowledgePointDisplayTypeDef,
  listKnowledgePointDisplayTypeDefs,
  registerKnowledgePointDisplayTypeDef,
} from './displayTypeRegistry'

export { resolveKnowledgePointDisplayTypeCode } from './resolveDisplayType'
export { composeKnowledgePointDocument } from './composeKnowledgePointDocument'
export type { ComposeKnowledgePointDocumentInput } from './composeKnowledgePointDocument'
export { composeKnowledgePointDocumentForKb } from './composeKnowledgePointDocumentForKb'

export {
  createDefaultKnowledgePointDisplayDataPort,
  createKnowledgePointDisplayDataPortForKb,
} from './defaultDataPort'

export {
  getKnowledgePointDisplayStrategy,
  listKnowledgePointDisplayStrategyIds,
  registerKnowledgePointDisplayStrategy,
} from './strategies/registry'
export type { KnowledgePointDocumentDisplayStrategy } from './strategies/types'
export { RelationComposeDisplayStrategy } from './strategies/RelationComposeDisplayStrategy'

export {
  KNOWLEDGE_POINT_DISPLAY_COMMENT_RE,
  knowledgePointDocumentToMarkdown,
  knowledgePointDocumentToTipTapDoc,
  parseKnowledgePointDisplayComment,
  serializeKnowledgePointDisplayComment,
} from './serializeDocumentView'
