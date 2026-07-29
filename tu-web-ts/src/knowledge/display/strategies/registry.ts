import { RelationComposeDisplayStrategy } from './RelationComposeDisplayStrategy'
import type { KnowledgePointDocumentDisplayStrategy } from './types'

const strategies = new Map<string, KnowledgePointDocumentDisplayStrategy>()

function ensureDefaults() {
  if (strategies.size > 0) return
  const relationCompose = new RelationComposeDisplayStrategy()
  strategies.set(relationCompose.id, relationCompose)
}

/**
 * Strategy Registry: map strategyId → implementation.
 * Display type defs reference strategyId; custom types can register new strategies.
 */
export function registerKnowledgePointDisplayStrategy(
  strategy: KnowledgePointDocumentDisplayStrategy,
): void {
  ensureDefaults()
  strategies.set(strategy.id, strategy)
}

export function getKnowledgePointDisplayStrategy(
  strategyId: string,
): KnowledgePointDocumentDisplayStrategy {
  ensureDefaults()
  const found = strategies.get(strategyId) || strategies.get('relationCompose')
  if (!found) {
    throw new Error(`Knowledge point display strategy not found: ${strategyId}`)
  }
  return found
}

export function listKnowledgePointDisplayStrategyIds(): string[] {
  ensureDefaults()
  return [...strategies.keys()]
}
