import type {
  KnowledgePointDisplayContext,
  KnowledgePointDisplayTypeDef,
  KnowledgePointDocumentViewModel,
} from '../types'

/**
 * Strategy: one algorithm family for turning a KP + type config into a document view.
 * New display behaviours = new strategy implementations registered by id.
 */
export interface KnowledgePointDocumentDisplayStrategy {
  readonly id: string
  compose(
    ctx: KnowledgePointDisplayContext,
    typeDef: KnowledgePointDisplayTypeDef,
  ): Promise<KnowledgePointDocumentViewModel>
}
