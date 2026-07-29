import { composeKnowledgePointDocument } from './composeKnowledgePointDocument'
import { createKnowledgePointDisplayDataPortForKb } from './defaultDataPort'
import type { KnowledgePointDocumentViewModel } from './types'

/**
 * Convenience entry for UI: warm the kb point tree into a data port, then compose.
 */
export async function composeKnowledgePointDocumentForKb(input: {
  kbId: string
  pointId: string
  displayTypeCode?: string
}): Promise<KnowledgePointDocumentViewModel> {
  const data = await createKnowledgePointDisplayDataPortForKb(input.kbId)
  return composeKnowledgePointDocument({ ...input, data })
}
