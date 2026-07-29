import { getKnowledgePointDisplayTypeDef } from './displayTypeRegistry'
import { resolveKnowledgePointDisplayTypeCode } from './resolveDisplayType'
import { getKnowledgePointDisplayStrategy } from './strategies/registry'
import type {
  KnowledgePointDisplayContext,
  KnowledgePointDisplayDataPort,
  KnowledgePointDocumentViewModel,
} from './types'

export interface ComposeKnowledgePointDocumentInput {
  kbId: string
  pointId: string
  displayTypeCode?: string
  /** Required for unit tests / custom adapters; UI may use {@link composeKnowledgePointDocumentForKb}. */
  data: KnowledgePointDisplayDataPort
}

/**
 * Facade: resolve display type → strategy → compose document view model.
 * Call this when inserting/rendering a knowledge point “展示在文档”.
 */
export async function composeKnowledgePointDocument(
  input: ComposeKnowledgePointDocumentInput,
): Promise<KnowledgePointDocumentViewModel> {
  const point = await input.data.getPoint(input.pointId)
  const displayTypeCode = resolveKnowledgePointDisplayTypeCode(point, input.displayTypeCode)
  const typeDef = getKnowledgePointDisplayTypeDef(displayTypeCode)
  const strategy = getKnowledgePointDisplayStrategy(typeDef.strategyId)

  const ctx: KnowledgePointDisplayContext = {
    kbId: input.kbId,
    pointId: input.pointId,
    displayTypeCode,
    data: input.data,
  }
  return strategy.compose(ctx, typeDef)
}
