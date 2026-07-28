import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'

/** Fields used to build the resource locator hierarchy path (`a > b > c`). */
export interface ResourceMetaPathFields {
  resourceTypeName?: string | null
  workTitle?: string | null
  resourceTitle?: string | null
  chapterTitle?: string | null
  excerptLocator?: string | null
  excerptTitle?: string | null
}

/**
 * Canonical resource hierarchy for meta bars and click popovers.
 * Order: 类型 > 归类 > 实体(若与归类不同) > 章节 > 定位 > 节选标题
 *
 * Role badges（来源 / 资源节选 / 依据）are not included — callers prepend separately.
 */
export function buildResourceMetaPathParts(fields: ResourceMetaPathFields): string[] {
  const parts: string[] = []

  const typeName = fields.resourceTypeName?.trim() || ''
  if (typeName && typeName !== '外部资源') {
    parts.push(typeName)
  }

  const workTitle = fields.workTitle?.trim() || ''
  const resourceTitle = fields.resourceTitle?.trim() || ''
  if (workTitle) {
    parts.push(workTitle)
    if (resourceTitle && resourceTitle !== workTitle) {
      parts.push(resourceTitle)
    }
  } else if (resourceTitle) {
    parts.push(resourceTitle)
  }

  const chapterTitle = fields.chapterTitle?.trim() || ''
  if (chapterTitle) {
    parts.push(chapterTitle)
  }

  const locatorRaw = fields.excerptLocator?.trim() || ''
  if (locatorRaw) {
    const locator = resourcePositionDisplay(locatorRaw).trim()
    if (locator) parts.push(locator)
  }

  const excerptTitle = fields.excerptTitle?.trim() || ''
  if (excerptTitle) {
    const last = parts[parts.length - 1]
    if (excerptTitle !== last && excerptTitle !== workTitle) {
      parts.push(excerptTitle)
    }
  }

  return parts
}

export function formatResourceMetaPath(fields: ResourceMetaPathFields): string {
  return buildResourceMetaPathParts(fields).join(' > ')
}
