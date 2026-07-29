import type { KnowledgePoint, KnowledgePointAnchor, KnowledgeRelation } from '@/api/types'
import { resolveKnowledgePointDisplayTypeCode } from '../resolveDisplayType'
import type {
  KnowledgePointAnchorComposeSlot,
  KnowledgePointDisplayContext,
  KnowledgePointDisplayTypeDef,
  KnowledgePointDocumentSection,
  KnowledgePointDocumentSectionAnchorRef,
  KnowledgePointDocumentSectionPointRef,
  KnowledgePointDocumentViewModel,
  KnowledgePointRelationComposeSlot,
} from '../types'
import type { KnowledgePointDocumentDisplayStrategy } from './types'

function anchorLabel(anchor: KnowledgePointAnchor): string {
  const snap = anchor.snapshot || {}
  const title = typeof snap.title === 'string' ? snap.title.trim()
    : typeof snap.resourceTitle === 'string' ? snap.resourceTitle.trim()
      : typeof snap.excerptTitle === 'string' ? snap.excerptTitle.trim()
        : ''
  return title || anchor.locator
}

function relationMatchesSlot(
  relation: KnowledgeRelation,
  slot: KnowledgePointRelationComposeSlot,
): boolean {
  return slot.relationTypeKeys.includes(relation.relationTypeKey)
}

/**
 * Config-driven composition strategy (Template Method + Strategy).
 * Most KP display types share this strategy and only differ by {@link KnowledgePointDisplayTypeDef.compose}.
 */
export class RelationComposeDisplayStrategy implements KnowledgePointDocumentDisplayStrategy {
  readonly id = 'relationCompose'

  async compose(
    ctx: KnowledgePointDisplayContext,
    typeDef: KnowledgePointDisplayTypeDef,
  ): Promise<KnowledgePointDocumentViewModel> {
    const point = await ctx.data.getPoint(ctx.pointId)
    const displayTypeCode = resolveKnowledgePointDisplayTypeCode(point, ctx.displayTypeCode || typeDef.code)
    const sections: KnowledgePointDocumentSection[] = []

    if (typeDef.compose.includeSummary && point.summary?.trim()) {
      sections.push({
        key: 'summary',
        title: '摘要',
        kind: 'text',
        body: point.summary.trim(),
      })
    }

    if (typeDef.compose.includeAliases && point.aliases?.length) {
      sections.push({
        key: 'aliases',
        title: '别名',
        kind: 'text',
        body: point.aliases.map((a) => a.trim()).filter(Boolean).join('、'),
      })
    }

    const needsRelations = typeDef.compose.relationSlots.length > 0
    const relations = needsRelations
      ? await ctx.data.listRelationsByPoint(ctx.kbId, point.id)
      : { outgoing: [] as KnowledgeRelation[], incoming: [] as KnowledgeRelation[] }

    for (const slot of typeDef.compose.relationSlots) {
      const section = await this.composeRelationSlot(ctx, point, slot, relations)
      if (section.points && section.points.length > 0) sections.push(section)
    }

    const needsAnchors = typeDef.compose.anchorSlots.length > 0
    const anchors = needsAnchors ? await ctx.data.listAnchors(point.id) : []
    for (const slot of typeDef.compose.anchorSlots) {
      const section = this.composeAnchorSlot(slot, anchors)
      if (section.anchors && section.anchors.length > 0) sections.push(section)
    }

    return {
      pointId: point.id,
      displayTypeCode,
      title: point.title,
      sections,
      binding: {
        pointId: point.id,
        displayTypeCode,
        title: point.title,
      },
    }
  }

  private async composeRelationSlot(
    ctx: KnowledgePointDisplayContext,
    self: KnowledgePoint,
    slot: KnowledgePointRelationComposeSlot,
    bag: { outgoing: KnowledgeRelation[]; incoming: KnowledgeRelation[] },
  ): Promise<KnowledgePointDocumentSection> {
    const candidates: Array<{ relation: KnowledgeRelation; otherId: string }> = []

    if (slot.direction === 'out' || slot.direction === 'both') {
      for (const relation of bag.outgoing) {
        if (!relationMatchesSlot(relation, slot)) continue
        if (relation.toPointId && relation.toPointId !== self.id) {
          candidates.push({ relation, otherId: relation.toPointId })
        }
      }
    }
    if (slot.direction === 'in' || slot.direction === 'both') {
      for (const relation of bag.incoming) {
        if (!relationMatchesSlot(relation, slot)) continue
        if (relation.fromPointId && relation.fromPointId !== self.id) {
          candidates.push({ relation, otherId: relation.fromPointId })
        }
      }
    }

    const seen = new Set<string>()
    const points: KnowledgePointDocumentSectionPointRef[] = []
    for (const entry of candidates) {
      if (seen.has(entry.otherId)) continue
      seen.add(entry.otherId)
      let title = entry.otherId
      let summary: string | null | undefined
      try {
        const other = await ctx.data.getPoint(entry.otherId)
        title = other.title
        summary = other.summary
      } catch {
        const fallback = await ctx.data.getPointTitle?.(entry.otherId)
        if (fallback) title = fallback
      }
      points.push({
        id: entry.otherId,
        title,
        summary,
        relationTypeKey: entry.relation.relationTypeKey,
      })
      if (slot.limit != null && points.length >= slot.limit) break
    }

    return {
      key: slot.key,
      title: slot.title,
      kind: 'pointList',
      points,
    }
  }

  private composeAnchorSlot(
    slot: KnowledgePointAnchorComposeSlot,
    anchors: KnowledgePointAnchor[],
  ): KnowledgePointDocumentSection {
    let list = [...anchors]
    if (slot.anchorKinds?.length) {
      const allow = new Set(slot.anchorKinds)
      list = list.filter((a) => allow.has(a.kind))
    }
    if (slot.primaryFirst !== false) {
      list.sort((a, b) => Number(b.primary) - Number(a.primary))
    }
    if (slot.limit != null) list = list.slice(0, slot.limit)

    const refs: KnowledgePointDocumentSectionAnchorRef[] = list.map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      locator: anchor.locator,
      label: anchorLabel(anchor),
      primary: anchor.primary,
      role: anchor.role,
    }))

    return {
      key: slot.key,
      title: slot.title,
      kind: 'anchorList',
      anchors: refs,
    }
  }
}
