import type { Block, EmbeddedObject, HeadingSourceBinding, PageContent } from '@/api/types'
import type { JSONContent } from '@tiptap/core'
import {
  HEADING_SOURCE_COMMENT_RE,
  parseHeadingSourceComment,
  serializeHeadingSourceComment,
} from '@/utils/headingSource'
import {
  BLOCKQUOTE_EXCERPT_COMMENT_RE,
  createBlockquoteBlockId,
  parseBlockquoteExcerptComment,
  serializeBlockquoteExcerptComment,
} from '@/utils/blockquoteExcerpt'
import {
  HEADING_FOLD_COMMENT_RE,
  HEADING_ID_COMMENT_RE,
  parseHeadingFoldComment,
  parseHeadingIdComment,
  serializeHeadingFoldComment,
  serializeHeadingIdComment,
} from '@/utils/headingSection'
import {
  LINK_DISPLAY_COMMENT_RE,
  URL_EMBED_COMMENT_RE,
  parseLinkDisplayComment,
  parseUrlEmbedComment,
  serializeLinkDisplayComment,
  serializeUrlEmbedComment,
} from '@/utils/urlDisplay'
import {
  PDF_EXCERPT_COMMENT_RE,
  parsePdfExcerptComment,
  serializePdfExcerptComment,
} from '@/utils/pdfExcerpt'
import { normalizeCodeBlockText } from '@/editor/utils/codeBlockText'

// ─── Embed placeholder regex ───────────────────────────────────────────────
const EMBED_RE = /<!--tu:embed\s+id="([^"]+)"\s+type="([^"]+)"\s*-->/g

// ─── New public API ─────────────────────────────────────────────────────────

/**
 * Convert PageContent to a Tiptap/ProseMirror document.
 * - Markdown content is parsed into paragraph/heading/list/etc. nodes
 * - Embed placeholders (<!--tu:embed...-->) are replaced by the corresponding node view nodes
 */
export function pageContentToTipTap(pc: PageContent): JSONContent {
  const children: JSONContent[] = []
  const seenEmbedIds = new Set<string>()

  // Split content by embed placeholders
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset regex state
  EMBED_RE.lastIndex = 0

  while ((match = EMBED_RE.exec(pc.content)) !== null) {
    // Emit rich text before this placeholder
    const textBefore = pc.content.slice(lastIndex, match.index)
    if (textBefore.trim()) {
      children.push(...parseMarkdown(textBefore))
    }

    // Emit embed node
    const embedId = match[1]
    const embedType = match[2]
    const embed = pc.embeds.find((e) => e.id === embedId)
    if (!seenEmbedIds.has(embedId)) {
      const embedNode = embedToTipTapNode(embed, embedId, embedType)
      if (embedNode) {
        children.push(embedNode)
        seenEmbedIds.add(embedId)
      }
    }

    lastIndex = match.index + match[0].length
  }

  // Emit remaining text after last placeholder
  const textAfter = pc.content.slice(lastIndex)
  if (textAfter.trim()) {
    children.push(...parseMarkdown(textAfter))
  }

  // Ensure doc has at least one node
  if (children.length === 0) {
    children.push(createEmptyParagraph())
  }

  return { type: 'doc', content: children }
}

/**
 * Convert a Tiptap/ProseMirror document back to PageContent.
 * @deprecated 主路径已改为 JSON 真源；仅用于 v1 迁移与测试 roundtrip。
 */
export function tipTapToPageContent(doc: JSONContent): Pick<PageContent, 'content' | 'embeds'> {
  const embeds: EmbeddedObject[] = []
  const markdownParts: string[] = []
  const seenEmbedIds = new Set<string>()

  if (!doc.content) return { content: '', embeds: [] }

  for (const node of doc.content) {
    if (isEmbedNode(node)) {
      const embed = tipTapNodeToEmbed(node)
      if (embed && !seenEmbedIds.has(embed.id)) {
        embeds.push(embed)
        markdownParts.push(`<!--tu:embed id="${embed.id}" type="${embed.type}"-->`)
        seenEmbedIds.add(embed.id)
      }
    } else {
      markdownParts.push(nodeToMarkdown(node))
    }
  }

  return {
    content: markdownParts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    embeds,
  }
}

// ─── Backward-compatible wrappers (deprecated) ─────────────────────────────

/** @deprecated Use pageContentToTipTap instead */
export function blocksToTipTap(blocks: Block[]): JSONContent {
  const pageContent = legacyBlocksToPageContent(blocks)
  return pageContentToTipTap(pageContent)
}

/** @deprecated Use tipTapToPageContent instead */
export function tipTapToBlocks(json: JSONContent, _originalBlocks?: Block[]): Block[] {
  const { content, embeds } = tipTapToPageContent(json)
  return pageContentToLegacyBlocks(content, embeds)
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function createEmptyParagraph(): JSONContent {
  return { type: 'paragraph' }
}

function isEmbedNode(node: JSONContent): boolean {
  return ['x6Block', 'tableBlock', 'multiTableBlock', 'timelineBlock', 'refBlock', 'spacerBlock', 'externalResourceBlock'].includes(node.type || '')
}

function getHeadingLevel(embed: EmbeddedObject | undefined, nodeAttrs?: Record<string, unknown>): number {
  const fromAttrs = Number(nodeAttrs?.headingLevel ?? 0)
  if (fromAttrs > 0) return fromAttrs
  const ts = (embed?.metadata as { tocSettings?: { titleLevel?: number } } | undefined)?.tocSettings
    ?? (nodeAttrs?.metadata as { tocSettings?: { titleLevel?: number } } | undefined)?.tocSettings
  return ts?.titleLevel ?? 0
}

function embedMetadataFromNode(node: JSONContent): Record<string, unknown> | undefined {
  const metadata = { ...(node.attrs?.metadata || {}) } as Record<string, unknown>
  const headingLevel = getHeadingLevel(undefined, node.attrs)
  const prev = (metadata.tocSettings as Record<string, unknown>) || {}
  metadata.tocSettings = {
    ...prev,
    titleLevel: headingLevel,
    hideTitle: Boolean(prev.hideTitle),
  }
  return metadata
}

function embedToTipTapNode(embed: EmbeddedObject | undefined, embedId: string, embedType: string): JSONContent | null {
  if (embed) embedType = embed.type // use actual type from embed data

  switch (embedType) {
    case 'x6':
      return {
        type: 'x6Block',
        attrs: {
          blockId: embedId,
          title: embed?.title || '',
          headingLevel: getHeadingLevel(embed),
          width: embed?.width ?? null,
          height: embed?.height ?? null,
          graphData: embed?.graphData || { nodes: [], edges: [] },
          metadata: embed?.metadata || {},
        },
      }
    case 'table':
      return {
        type: 'tableBlock',
        attrs: {
          blockId: embedId,
          title: embed?.title || '',
          headingLevel: getHeadingLevel(embed),
          width: embed?.width ?? null,
          height: embed?.height ?? null,
          tableData: embed?.tableData || { headers: [], rows: [] },
          metadata: embed?.metadata || {},
        },
      }
    case 'multiTable':
      return {
        type: 'multiTableBlock',
        attrs: {
          blockId: embedId,
          title: embed?.title || '',
          headingLevel: getHeadingLevel(embed),
          width: embed?.width ?? null,
          height: embed?.height ?? null,
          multiTableData: embed?.multiTableData || { fields: [], records: [], views: [] },
          metadata: embed?.metadata || {},
        },
      }
    case 'timeline':
      return {
        type: 'timelineBlock',
        attrs: {
          blockId: embedId,
          title: embed?.title || '',
          headingLevel: getHeadingLevel(embed),
          width: embed?.width ?? null,
          height: embed?.height ?? null,
          timelineData: embed?.timelineData || [],
          metadata: embed?.metadata || {},
        },
      }
    case 'ref':
      return {
        type: 'refBlock',
        attrs: {
          blockId: embedId,
          title: embed?.title || '',
          headingLevel: getHeadingLevel(embed),
          refId: embed?.refId || '',
          refType: embed?.refType || 'block',
          width: embed?.width ?? null,
          height: embed?.height ?? null,
          metadata: embed?.metadata || {},
        },
      }
    case 'spacer':
      return {
        type: 'spacerBlock',
        attrs: {
          blockId: embedId,
          title: embed?.title || '',
          headingLevel: getHeadingLevel(embed),
          width: null,
          height: embed?.spacerHeight || 40,
          spacerHeight: embed?.spacerHeight || 40,
          metadata: embed?.metadata || {},
        },
      }
    case 'externalResource':
      return {
        type: 'externalResourceBlock',
        attrs: {
          blockId: embedId,
          title: embed?.title || '',
          headingLevel: getHeadingLevel(embed),
          width: embed?.width ?? null,
          height: embed?.height ?? null,
          externalResource: embed?.externalResource || {
            resourceItemId: '',
            resourceExcerptId: null,
            mode: 'resource',
            snapshot: { resourceTitle: '' },
          },
          metadata: embed?.metadata || {},
        },
      }
    default:
      return null
  }
}

function tipTapNodeToEmbed(node: JSONContent): EmbeddedObject | null {
  const blockId = node.attrs?.blockId
  if (!blockId) return null

  switch (node.type) {
    case 'x6Block':
      return {
        id: blockId,
        type: 'x6',
        title: node.attrs?.title || '',
        width: node.attrs?.width ?? undefined,
        height: node.attrs?.height ?? undefined,
        graphData: node.attrs?.graphData || { nodes: [], edges: [] },
        metadata: embedMetadataFromNode(node),
      }
    case 'timelineBlock':
      return {
        id: blockId,
        type: 'timeline',
        title: node.attrs?.title || '',
        width: node.attrs?.width ?? undefined,
        height: node.attrs?.height ?? undefined,
        timelineData: node.attrs?.timelineData || [],
        metadata: embedMetadataFromNode(node),
      }
    case 'refBlock':
      return {
        id: blockId,
        type: 'ref',
        title: node.attrs?.title || '',
        refId: node.attrs?.refId || '',
        refType: node.attrs?.refType || 'block',
        width: node.attrs?.width ?? undefined,
        height: node.attrs?.height ?? undefined,
        metadata: embedMetadataFromNode(node),
      }
    case 'tableBlock':
      return {
        id: blockId,
        type: 'table',
        title: node.attrs?.title || '',
        width: node.attrs?.width ?? undefined,
        height: node.attrs?.height ?? undefined,
        tableData: node.attrs?.tableData || { headers: [], rows: [] },
        metadata: embedMetadataFromNode(node),
      }
    case 'multiTableBlock':
      return {
        id: blockId,
        type: 'multiTable',
        title: node.attrs?.title || '',
        width: node.attrs?.width ?? undefined,
        height: node.attrs?.height ?? undefined,
        multiTableData: node.attrs?.multiTableData || { fields: [], records: [], views: [] },
        metadata: embedMetadataFromNode(node),
      }
    case 'spacerBlock':
      return {
        id: blockId,
        type: 'spacer',
        title: node.attrs?.title || '',
        spacerHeight: node.attrs?.height ?? node.attrs?.spacerHeight ?? 40,
        height: node.attrs?.height ?? node.attrs?.spacerHeight ?? 40,
        metadata: embedMetadataFromNode(node),
      }
    case 'externalResourceBlock':
      return {
        id: blockId,
        type: 'externalResource',
        title: node.attrs?.title || '',
        width: node.attrs?.width ?? undefined,
        height: node.attrs?.height ?? undefined,
        externalResource: node.attrs?.externalResource || {
          resourceItemId: '',
          resourceExcerptId: null,
          mode: 'resource',
          snapshot: { resourceTitle: '' },
        },
        metadata: embedMetadataFromNode(node),
      }
    default:
      return null
  }
}

// ─── Legacy conversion helpers (for backward-compat wrappers) ──────────────

function legacyBlocksToPageContent(blocks: Block[]): PageContent {
  const parts: string[] = []
  const embeds: EmbeddedObject[] = []
  const referencedEmbedIds = collectEmbedIdsFromBlocks(blocks)
  const seenEmbedIds = new Set<string>()

  for (const block of blocks) {
    if (block.type === 'richtext' || block.type === 'richText') {
      if (block.content) parts.push(block.content)
      continue
    }
    if (seenEmbedIds.has(block.id)) continue
    seenEmbedIds.add(block.id)

    const embed: EmbeddedObject = {
      id: block.id,
      type: block.type as EmbeddedObject['type'],
      title: block.title,
      graphData: block.graphData,
      tableData: block.tableData,
      multiTableData: block.multiTableData,
      timelineData: block.timelineData,
      refId: block.refId,
      refType: block.refType,
      externalResource: block.externalResource,
      spacerHeight: block.spacerHeight,
      width: block.width,
      height: block.height,
      metadata: block.metadata,
    }
    embeds.push(embed)
    if (!referencedEmbedIds.has(block.id)) {
      parts.push(`<!--tu:embed id="${block.id}" type="${block.type}"-->`)
    }
  }

  return {
    content: parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    embeds,
    annotations: [],
  }
}

function pageContentToLegacyBlocks(content: string, embeds: EmbeddedObject[]): Block[] {
  const blocks: Block[] = []
  const seenEmbedIds = new Set<string>()

  // Split content by embed placeholders
  let lastIndex = 0
  let match: RegExpExecArray | null
  EMBED_RE.lastIndex = 0

  while ((match = EMBED_RE.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index)
    if (textBefore.trim()) {
      blocks.push({
        id: `richtext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'richtext',
        content: textBefore.trim(),
      })
    }

    const embedId = match[1]
    const embed = embeds.find((e) => e.id === embedId)
    if (embed && !seenEmbedIds.has(embedId)) {
      blocks.push({
        id: embed.id,
        type: embed.type,
        title: embed.title,
        graphData: embed.graphData,
        tableData: embed.tableData,
        multiTableData: embed.multiTableData,
        timelineData: embed.timelineData,
        refId: embed.refId,
        refType: embed.refType,
        externalResource: embed.externalResource,
        spacerHeight: embed.spacerHeight,
        width: embed.width,
        height: embed.height,
        metadata: embed.metadata,
      })
      seenEmbedIds.add(embedId)
    }

    lastIndex = match.index + match[0].length
  }

  const textAfter = content.slice(lastIndex)
  if (textAfter.trim()) {
    blocks.push({
      id: `richtext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'richtext',
      content: textAfter.trim(),
    })
  }

  return blocks
}

function collectEmbedIdsFromBlocks(blocks: Block[]): Set<string> {
  const ids = new Set<string>()
  for (const block of blocks) {
    if (block.type !== 'richtext' && block.type !== 'richText') continue
    for (const id of collectEmbedIdsFromContent(block.content || '')) {
      ids.add(id)
    }
  }
  return ids
}

function collectEmbedIdsFromContent(content: string): Set<string> {
  const ids = new Set<string>()
  EMBED_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = EMBED_RE.exec(content)) !== null) {
    ids.add(match[1])
  }
  return ids
}

// ─── Markdown → ProseMirror nodes (adapted from old code, no longer needs blockId) ──

/** Match `![](url)` and legacy escaped form `\![\](url\)` from failed prior saves. */
function parseStandaloneImage(text: string): { alt: string; src: string } | null {
  const trimmed = text.trim()
  const normal = trimmed.match(/^!\[(.*?)\]\((.+?)\)$/)
  if (normal) return { alt: normal[1], src: normal[2] }

  if (trimmed.startsWith('\\![') && trimmed.endsWith('\\)')) {
    const afterBang = trimmed.slice(2)
    const closeBracket = afterBang.indexOf('\\](')
    if (closeBracket > 0 && afterBang.startsWith('[')) {
      const alt = afterBang.slice(1, closeBracket)
      const src = afterBang.slice(closeBracket + 3, -2)
      if (src) return { alt, src }
    }
  }

  return null
}

const CODE_BLOCK_PLACEHOLDER_RE = /^@@TU_CODEBLOCK_(\d+)@@$/

function extractFencedCodeBlocks(markdown: string): { markdown: string; blocks: JSONContent[] } {
  const blocks: JSONContent[] = []
  const lines = markdown.split('\n')
  const output: string[] = []
  let index = 0

  while (index < lines.length) {
    const openMatch = lines[index].match(/^```(.*)$/)
    if (openMatch) {
      const language = openMatch[1].trim()
      const bodyLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        bodyLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      const blockIndex = blocks.length
      blocks.push({
        type: 'codeBlock',
        attrs: language ? { language } : {},
        content: [{ type: 'text', text: normalizeCodeBlockText(bodyLines.join('\n')) }],
      })
      if (output.length > 0 && output[output.length - 1] !== '') output.push('')
      output.push(`@@TU_CODEBLOCK_${blockIndex}@@`)
      output.push('')
      continue
    }
    output.push(lines[index])
    index += 1
  }

  return { markdown: output.join('\n'), blocks }
}

function injectCodeBlockPlaceholders(nodes: JSONContent[], blocks: JSONContent[]): JSONContent[] {
  if (blocks.length === 0) return nodes
  return nodes.flatMap((node) => {
    if (node.type !== 'paragraph' || !node.content) return [node]
    const text = node.content
      .filter((child) => child.type === 'text' && typeof child.text === 'string')
      .map((child) => child.text)
      .join('')
      .trim()
    const match = text.match(CODE_BLOCK_PLACEHOLDER_RE)
    if (!match) return [node]
    const block = blocks[Number(match[1])]
    return block ? [block] : [node]
  })
}

function parseMarkdown(markdown: string): JSONContent[] {
  if (!markdown.trim()) return []

  const { markdown: withoutFences, blocks } = extractFencedCodeBlocks(markdown)
  return injectCodeBlockPlaceholders(parseMarkdownBlocks(withoutFences), blocks)
}

function createLineBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parseMarkdownBlocks(markdown: string): JSONContent[] {
  if (!markdown.trim()) return []

  const paragraphs = markdown.split('\n\n')
  const nodes: JSONContent[] = []

  for (const para of paragraphs) {
    if (!para.trim()) {
      nodes.push({ type: 'paragraph' })
      continue
    }

    const innerLines = para.split('\n')
    let currentLines: string[] = []
    let currentQuoteLines: string[] = []
    let pendingBlockquoteBlockId: string | undefined
    let pendingBlockquoteExcerpt: { blockId: string; binding: HeadingSourceBinding } | null = null

    const flushCurrentQuote = () => {
      if (currentQuoteLines.length === 0) return
      nodes.push({
        type: 'blockquote',
        attrs: {
          blockId: pendingBlockquoteBlockId || pendingBlockquoteExcerpt?.blockId || createLineBlockId(),
          ...(pendingBlockquoteExcerpt ? { excerptBinding: pendingBlockquoteExcerpt.binding } : {}),
        },
        content: [{
          type: 'paragraph',
          content: parseInlineMarkdown(currentQuoteLines.join('\n')),
        }],
      })
      currentQuoteLines = []
      pendingBlockquoteBlockId = undefined
      pendingBlockquoteExcerpt = null
    }

    let pendingHeadingBlockId: string | undefined
    let pendingHeadingSource: { blockId: string; binding: HeadingSourceBinding } | null = null
    let pendingSectionCollapsed = false
    let pendingLinkDisplayMode: 'link' | 'title' | null = null

    for (const line of innerLines) {
      const urlEmbedMatch = line.match(URL_EMBED_COMMENT_RE)
      if (urlEmbedMatch) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n'), pendingLinkDisplayMode),
          })
          currentLines = []
          pendingLinkDisplayMode = null
        }
        const parsedEmbed = parseUrlEmbedComment(urlEmbedMatch[1])
        if (parsedEmbed) {
          nodes.push({
            type: 'urlEmbedBlock',
            attrs: {
              blockId: parsedEmbed.blockId,
              url: parsedEmbed.url,
              height: parsedEmbed.height,
            },
          })
        }
        continue
      }

      const pdfExcerptMatch = line.match(PDF_EXCERPT_COMMENT_RE)
      if (pdfExcerptMatch) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n'), pendingLinkDisplayMode),
          })
          currentLines = []
          pendingLinkDisplayMode = null
        }
        const parsedPdf = parsePdfExcerptComment(pdfExcerptMatch[1])
        if (parsedPdf) {
          nodes.push({
            type: 'pdfExcerptBlock',
            attrs: {
              blockId: parsedPdf.blockId,
              fileId: parsedPdf.fileId,
              fileName: parsedPdf.fileName,
              viewMode: parsedPdf.viewMode,
              startPage: parsedPdf.startPage,
              endPage: parsedPdf.endPage,
              height: parsedPdf.height,
            },
          })
        }
        continue
      }

      const linkDisplayMatch = line.match(LINK_DISPLAY_COMMENT_RE)
      if (linkDisplayMatch) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n'), pendingLinkDisplayMode),
          })
          currentLines = []
        }
        pendingLinkDisplayMode = parseLinkDisplayComment(linkDisplayMatch[1])
        continue
      }

      const headingFoldMatch = line.match(HEADING_FOLD_COMMENT_RE)
      if (headingFoldMatch) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        const parsedFold = parseHeadingFoldComment(headingFoldMatch[1])
        if (parsedFold) {
          pendingHeadingBlockId = parsedFold.blockId
          pendingSectionCollapsed = parsedFold.sectionCollapsed
        }
        continue
      }

      const headingSourceMatch = line.match(HEADING_SOURCE_COMMENT_RE)
      if (headingSourceMatch) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        const parsedSource = parseHeadingSourceComment(headingSourceMatch[1])
        if (parsedSource) {
          pendingHeadingBlockId = pendingHeadingBlockId || parsedSource.blockId
          pendingHeadingSource = parsedSource
        }
        continue
      }

      const blockquoteExcerptMatch = line.match(BLOCKQUOTE_EXCERPT_COMMENT_RE)
      if (blockquoteExcerptMatch) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        const parsedExcerpt = parseBlockquoteExcerptComment(blockquoteExcerptMatch[1])
        if (parsedExcerpt) {
          pendingBlockquoteBlockId = parsedExcerpt.blockId
          pendingBlockquoteExcerpt = parsedExcerpt
        }
        continue
      }

      const headingIdMatch = line.match(HEADING_ID_COMMENT_RE)
      if (headingIdMatch) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        const parsedId = parseHeadingIdComment(headingIdMatch[1])
        if (parsedId) {
          pendingHeadingBlockId = pendingHeadingBlockId || parsedId.blockId
        }
        continue
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        const headingAttrs: Record<string, unknown> = { level: headingMatch[1].length }
        if (pendingHeadingBlockId) {
          headingAttrs.blockId = pendingHeadingBlockId
        }
        if (pendingSectionCollapsed) {
          headingAttrs.sectionCollapsed = true
        }
        if (pendingHeadingSource) {
          headingAttrs.sourceBinding = pendingHeadingSource.binding
        }
        pendingHeadingBlockId = undefined
        pendingHeadingSource = null
        pendingSectionCollapsed = false
        nodes.push({
          type: 'heading',
          attrs: headingAttrs,
          content: parseInlineMarkdown(headingMatch[2]),
        })
      } else if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        const checked = line.startsWith('- [x]')
        const text = line.replace(/^- \[[ x]\] /, '')
        if (!nodes.find((n) => n.type === 'taskList')) {
          nodes.push({ type: 'taskList' })
        }
        const taskList = nodes.find((n) => n.type === 'taskList')!
        ;(taskList.content = taskList.content || []).push({
          type: 'taskItem',
          attrs: { checked },
          content: [{ type: 'paragraph', content: parseInlineMarkdown(text) }],
        })
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        if (!nodes.find((n) => n.type === 'bulletList')) {
          nodes.push({ type: 'bulletList' })
        }
        const list = nodes.find((n) => n.type === 'bulletList')!
        ;(list.content = list.content || []).push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarkdown(line.replace(/^[-*] /, '')) }],
        })
      } else if (/^\d+\.\s/.test(line)) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        if (!nodes.find((n) => n.type === 'orderedList')) {
          nodes.push({ type: 'orderedList' })
        }
        const list = nodes.find((n) => n.type === 'orderedList')!
        ;(list.content = list.content || []).push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarkdown(line.replace(/^\d+\.\s/, '')) }],
        })
      } else if (/^>\s?/.test(line)) {
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        currentQuoteLines.push(line.replace(/^>\s?/, ''))
      } else if (line.startsWith('---')) {
        flushCurrentQuote()
        if (currentLines.length > 0) {
          nodes.push({
            type: 'paragraph',
            content: parseInlineMarkdown(currentLines.join('\n')),
          })
          currentLines = []
        }
        nodes.push({ type: 'horizontalRule' })
      } else {
        flushCurrentQuote()
        currentLines.push(line)
      }
    }

    flushCurrentQuote()

    if (currentLines.length > 0) {
      const text = currentLines.join('\n')
      const standaloneImg = parseStandaloneImage(text)
      if (standaloneImg) {
        nodes.push({ type: 'image', attrs: { src: standaloneImg.src, alt: standaloneImg.alt || '' } })
      } else {
        nodes.push({
          type: 'paragraph',
          content: text ? parseInlineMarkdown(text, pendingLinkDisplayMode) : [],
        })
        pendingLinkDisplayMode = null
      }
    }
  }

  return nodes.length > 0 ? nodes : [{ type: 'paragraph' }]
}

// ─── Inline markdown parsing (same as before, no changes needed) ───────────

export function parseInlineMarkdown(
  text: string,
  linkDisplayMode: 'link' | 'title' | null = null,
): JSONContent[] {
  const parts: JSONContent[] = []
  let remaining = text
  let appliedLinkDisplayMode = false

  while (remaining.length > 0) {
    const escapedCharMatch = remaining.match(/^\\([\\*`[\]()~_!#>\-+.])/)
    if (escapedCharMatch) {
      parts.push({ type: 'text', text: escapedCharMatch[1] })
      remaining = remaining.slice(escapedCharMatch[0].length)
      continue
    }

    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/)
    if (boldMatch) {
      parts.push({ type: 'text', text: boldMatch[1], marks: [{ type: 'bold' }] })
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    const italicMatch = remaining.match(/^\*(.+?)\*/)
    if (italicMatch) {
      parts.push({ type: 'text', text: italicMatch[1], marks: [{ type: 'italic' }] })
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    const codeMatch = remaining.match(/^`(.+?)`/)
    if (codeMatch) {
      parts.push({ type: 'text', text: codeMatch[1], marks: [{ type: 'code' }] })
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/)
    if (linkMatch) {
      const href = linkMatch[2]
      const title = (linkMatch[3] || linkMatch[4] || '').trim() || undefined
      const linkAttrs: Record<string, unknown> = { href }
      if (title) linkAttrs.title = title
      if (linkDisplayMode === 'title' && !appliedLinkDisplayMode) {
        linkAttrs.displayMode = 'title'
        appliedLinkDisplayMode = true
      }
      parts.push({
        type: 'text',
        text: linkMatch[1],
        marks: [{ type: 'link', attrs: linkAttrs }],
      })
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    const imgMatch = remaining.match(/^!\[(.*?)\]\((.+?)\)/)
    if (imgMatch) {
      parts.push({ type: 'image', attrs: { src: imgMatch[2], alt: imgMatch[1] } })
      remaining = remaining.slice(imgMatch[0].length)
      continue
    }

    if (remaining.startsWith('\n')) {
      parts.push({ type: 'hardBreak' })
      remaining = remaining.slice(1)
      continue
    }

    const nextSpecialIndex = remaining.search(/[\\*`[!\n]/)
    if (nextSpecialIndex > 0) {
      parts.push({ type: 'text', text: remaining.slice(0, nextSpecialIndex) })
      remaining = remaining.slice(nextSpecialIndex)
      continue
    }

    parts.push({ type: 'text', text: remaining[0] })
    remaining = remaining.slice(1)
  }

  return parts
}

// ─── ProseMirror nodes → Markdown (same structure as before) ──────────────

/** @deprecated internal helper kept for backward compat */
export function tipTapNodesToMarkdown(nodes: JSONContent[]): string {
  return nodes.map((node) => nodeToMarkdown(node)).join('\n\n')
}

function nodeToMarkdown(node: JSONContent): string {
  switch (node.type) {
    case 'heading': {
      const parts: string[] = []
      const blockId = node.attrs?.blockId as string | undefined
      const sectionCollapsed = Boolean(node.attrs?.sectionCollapsed)
      const sourceBinding = node.attrs?.sourceBinding as HeadingSourceBinding | null | undefined
      let wroteBlockIdComment = false
      if (blockId && sectionCollapsed) {
        parts.push(serializeHeadingFoldComment(blockId))
        wroteBlockIdComment = true
      }
      if (blockId && sourceBinding?.resourceItemId && sourceBinding.resourceExcerptId) {
        parts.push(serializeHeadingSourceComment(blockId, sourceBinding))
        wroteBlockIdComment = true
      }
      if (blockId && !wroteBlockIdComment) {
        parts.push(serializeHeadingIdComment(blockId))
      }
      parts.push('#'.repeat(node.attrs?.level || 1) + ' ' + contentToMarkdown(node.content || []))
      return parts.join('\n')
    }
    case 'paragraph': {
      const md = contentToMarkdown(node.content || [])
      const hasTitleLink = (node.content || []).some((item) => (
        item.type === 'text'
        && item.marks?.some((mark) => mark.type === 'link' && mark.attrs?.displayMode === 'title')
      ))
      if (hasTitleLink) {
        return `${serializeLinkDisplayComment('title')}\n${md}`
      }
      return md
    }
    case 'urlEmbedBlock': {
      const blockId = String(node.attrs?.blockId || '')
      const url = String(node.attrs?.url || '')
      const height = Number(node.attrs?.height) || 360
      if (!blockId || !url) return ''
      return serializeUrlEmbedComment(blockId, url, height)
    }
    case 'pdfExcerptBlock': {
      const blockId = String(node.attrs?.blockId || '')
      const fileId = String(node.attrs?.fileId || '')
      if (!blockId || !fileId) return ''
      return serializePdfExcerptComment({
        blockId,
        fileId,
        fileName: String(node.attrs?.fileName || ''),
        viewMode: String(node.attrs?.viewMode || 'excerpt') === 'full' ? 'full' : 'excerpt',
        startPage: Number(node.attrs?.startPage) || 1,
        endPage: Number(node.attrs?.endPage) || 1,
        height: Number(node.attrs?.height) || 480,
      })
    }
    case 'bulletList':
      return (node.content || []).map((item) => '- ' + contentToMarkdown(item.content || [])).join('\n')
    case 'orderedList':
      return (node.content || []).map((item, i) => (i + 1) + '. ' + contentToMarkdown(item.content || [])).join('\n')
    case 'blockquote': {
      const parts: string[] = []
      const blockId = node.attrs?.blockId as string | undefined
      const excerptBinding = node.attrs?.excerptBinding as HeadingSourceBinding | null | undefined
      if (blockId && excerptBinding?.resourceItemId && excerptBinding.resourceExcerptId) {
        parts.push(serializeBlockquoteExcerptComment(blockId, excerptBinding))
      }
      const quoteMd = (node.content || [])
        .map((c) => contentToMarkdown(c.content || [])
          .split('\n')
          .map((line) => '> ' + line)
          .join('\n'))
        .join('\n')
      parts.push(quoteMd)
      return parts.join('\n')
    }
    case 'horizontalRule':
      return '---'
    case 'codeBlock': {
      const language = String(node.attrs?.language || '').trim()
      const text = (node.content || [])
        .filter((item) => item.type === 'text')
        .map((item) => item.text || '')
        .join('')
      const fence = language ? `\`\`\`${language}` : '```'
      return `${fence}\n${text}\n\`\`\``
    }
    case 'image':
      return '![' + (node.attrs?.alt || '') + '](' + (node.attrs?.src || '') + ')'
    case 'taskList':
      return (node.content || []).map((item) => (item.attrs?.checked ? '- [x] ' : '- [ ] ') + contentToMarkdown(item.content || [])).join('\n')
    default:
      return contentToMarkdown(node.content || [])
  }
}

function contentToMarkdown(content: JSONContent[]): string {
  return content.map((c) => {
    if (c.type === 'text') {
      let text = escapeMarkdownText(c.text || '')
      if (c.marks) {
        for (const mark of c.marks) {
          if (mark.type === 'bold') text = '**' + text + '**'
          else if (mark.type === 'italic') text = '*' + text + '*'
          else if (mark.type === 'code') text = '`' + text + '`'
          else if (mark.type === 'link') {
            const href = mark.attrs?.href || ''
            const title = typeof mark.attrs?.title === 'string' ? mark.attrs.title.trim() : ''
            text = title
              ? '[' + text + '](' + href + ' "' + title.replace(/"/g, '\\"') + '")'
              : '[' + text + '](' + href + ')'
          }
          else if (mark.type === 'underline') text = '<u>' + text + '</u>'
          else if (mark.type === 'strike') text = '~~' + text + '~~'
        }
      }
      return text
    }
    if (c.type === 'hardBreak') return '\n'
    if (c.type === 'image') return '![' + (c.attrs?.alt || '') + '](' + (c.attrs?.src || '') + ')'
    if (c.type === 'paragraph') return contentToMarkdown(c.content || [])
    return ''
  }).join('')
}

function escapeMarkdownText(text: string): string {
  if (parseStandaloneImage(text)) return text.trim()
  return text.replace(/(^|[^\\])([*`[\]()~_!#>])/g, '$1\\$2')
}
