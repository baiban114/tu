import type { EmbeddedObject, GraphData, PageContent, PageType } from '@/api/types'
import {
  createMindmapStarterGraphData,
  createStarterGraphData,
  ensureMindmapBlueprintMeta,
  isMindmapBlueprint,
  looksLikeMindmapGraph,
} from '@/components/x6'

const EMBED_PLACEHOLDER_RE = /<!--tu:embed\s+id="([^"]+)"\s+type="([^"]+)"\s*-->/g

export function createBoardEmbedId(prefix: 'mindmap' | 'x6board'): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`
}

export function normalizePageType(pageType?: string): PageType {
  if (pageType === 'mindmap' || pageType === 'x6board') return pageType
  return 'document'
}

export function inferPageTypeFromEmbed(embed: EmbeddedObject): 'mindmap' | 'x6board' {
  if (isMindmapBlueprint(embed.graphData)) return 'mindmap'
  if (embed.id.startsWith('mindmap-')) return 'mindmap'
  if (embed.id.startsWith('x6board-')) return 'x6board'
  return 'x6board'
}

function isMindmapEmbedCandidate(embed: EmbeddedObject): boolean {
  if (embed.type !== 'x6') return false
  return isMindmapBlueprint(embed.graphData)
    || looksLikeMindmapGraph(embed.graphData)
    || embed.id.startsWith('mindmap-')
}

function normalizeCanvasEmbed(embed: EmbeddedObject, pageType: PageType): EmbeddedObject {
  if (pageType !== 'mindmap' || embed.type !== 'x6' || !embed.graphData) return embed
  return {
    ...embed,
    graphData: ensureMindmapBlueprintMeta(embed.graphData),
  }
}

/** Normalize API-loaded content: restore stripped mindmap blueprint metadata on embeds. */
export function normalizePageContentFromApi(content: PageContent): PageContent {
  const embeds = (content.embeds ?? []).map((embed) => {
    if (!isMindmapEmbedCandidate(embed) || !embed.graphData) return embed
    return {
      ...embed,
      graphData: ensureMindmapBlueprintMeta(embed.graphData),
    }
  })
  return {
    ...content,
    embeds,
    content: content.content ?? '',
    annotations: content.annotations ?? [],
    metadata: content.metadata,
  }
}

/** Infer canvas page type from stored PageContent when tree item lacks pageType. */
export function inferPageTypeFromContent(content: PageContent | null | undefined): PageType | null {
  if (!content) return null

  const primaryId = content.metadata?.primaryEmbedId
  if (typeof primaryId === 'string') {
    const embed = content.embeds.find((item) => item.id === primaryId)
    if (embed?.type === 'x6') {
      return inferPageTypeFromEmbed(embed)
    }
  }

  if (!content.content.trim() && content.embeds.length === 1 && content.embeds[0].type === 'x6') {
    return inferPageTypeFromEmbed(content.embeds[0])
  }

  return null
}

export function createMindmapPageContent(
  title: string,
  embedId?: string,
  graphData?: GraphData,
): PageContent {
  const id = embedId ?? createBoardEmbedId('mindmap')
  return {
    content: '',
    embeds: [
      {
        id,
        type: 'x6',
        title,
        graphData: graphData ?? createMindmapStarterGraphData(),
      },
    ],
    annotations: [],
    metadata: { primaryEmbedId: id },
  }
}

export function createX6BoardPageContent(
  title: string,
  embedId?: string,
  graphData?: GraphData,
): PageContent {
  const id = embedId ?? createBoardEmbedId('x6board')
  return {
    content: '',
    embeds: [
      {
        id,
        type: 'x6',
        title,
        graphData: graphData ?? createStarterGraphData(),
      },
    ],
    annotations: [],
    metadata: { primaryEmbedId: id },
  }
}

export function createPageContentFromEmbed(embed: EmbeddedObject): PageContent {
  const title = embed.title ?? (isMindmapBlueprint(embed.graphData) ? '未命名思维导图' : '未命名画板')
  if (isMindmapBlueprint(embed.graphData)) {
    return createMindmapPageContent(title, embed.id, embed.graphData)
  }
  return createX6BoardPageContent(title, embed.id, embed.graphData)
}

export function resolvePrimaryEmbed(
  content: PageContent,
  pageType: PageType,
): EmbeddedObject | null {
  const primaryId = content.metadata?.primaryEmbedId
  const byPrimary = typeof primaryId === 'string'
    ? content.embeds.find((embed) => embed.id === primaryId)
    : undefined

  if (byPrimary?.type === 'x6') {
    if (pageType === 'mindmap' && isMindmapEmbedCandidate(byPrimary)) {
      return normalizeCanvasEmbed(byPrimary, pageType)
    }
    if (pageType === 'x6board') {
      return byPrimary
    }
  }

  if (pageType === 'mindmap') {
    const embed = content.embeds.find(isMindmapEmbedCandidate)
    return embed ? normalizeCanvasEmbed(embed, pageType) : null
  }

  if (pageType === 'x6board') {
    const embed = content.embeds.find(
      (item) => item.type === 'x6' && !isMindmapEmbedCandidate(item),
    ) ?? content.embeds.find((item) => item.type === 'x6')
    return embed ?? null
  }

  return null
}

export function removeEmbedFromPageContent(content: PageContent, embedId: string): PageContent {
  const placeholderRe = new RegExp(
    `\\n?\\s*<!--tu:embed\\s+id="${embedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+type="[^"]+"\\s*-->\\n?`,
    'g',
  )
  const nextContent = content.content.replace(placeholderRe, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const nextEmbeds = content.embeds.filter((embed) => embed.id !== embedId)
  const nextMetadata = { ...content.metadata }
  if (nextMetadata.primaryEmbedId === embedId) {
    delete nextMetadata.primaryEmbedId
  }
  return {
    ...content,
    content: nextContent,
    embeds: nextEmbeds,
    metadata: nextMetadata,
  }
}

export function defaultTitleForPageType(pageType?: PageType): string {
  if (pageType === 'mindmap') return '未命名思维导图'
  if (pageType === 'x6board') return '未命名画板'
  return '新页面'
}

export function createInitialPageContent(pageType: PageType, title: string): PageContent | null {
  if (pageType === 'mindmap') return createMindmapPageContent(title)
  if (pageType === 'x6board') return createX6BoardPageContent(title)
  return null
}

/** @deprecated use createBoardEmbedId('mindmap') */
export const createMindmapEmbedId = () => createBoardEmbedId('mindmap')
