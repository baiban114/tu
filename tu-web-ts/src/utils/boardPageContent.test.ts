import { describe, expect, it } from 'vitest'
import type { EmbeddedObject, PageContent } from '@/api/types'
import { isMindmapBlueprint } from '@/components/x6'
import {
  createMindmapPageContent,
  createPageContentFromEmbed,
  createX6BoardPageContent,
  inferPageTypeFromContent,
  normalizePageContentFromApi,
  normalizePageType,
  removeEmbedFromPageContent,
  resolvePrimaryEmbed,
} from '@/utils/boardPageContent'

describe('board page content', () => {
  it('initializes mindmap page content with primary embed', () => {
    const content = createMindmapPageContent('我的导图')
    expect(content.content).toBe('')
    expect(content.embeds).toHaveLength(1)
    expect(isMindmapBlueprint(content.embeds[0].graphData)).toBe(true)
    expect(content.metadata?.primaryEmbedId).toBe(content.embeds[0].id)
  })

  it('initializes x6board page content with primary embed', () => {
    const content = createX6BoardPageContent('流程图')
    expect(content.embeds).toHaveLength(1)
    expect(isMindmapBlueprint(content.embeds[0].graphData)).toBe(false)
    expect(content.metadata?.primaryEmbedId).toBe(content.embeds[0].id)
  })

  it('normalizes page types', () => {
    expect(normalizePageType()).toBe('document')
    expect(normalizePageType('mindmap')).toBe('mindmap')
    expect(normalizePageType('x6board')).toBe('x6board')
    expect(normalizePageType('unknown')).toBe('document')
  })

  it('creates page content from existing embed', () => {
    const embed: EmbeddedObject = {
      id: 'embed-1',
      type: 'x6',
      title: '已有导图',
      graphData: createMindmapPageContent('x').embeds[0].graphData,
    }
    const content = createPageContentFromEmbed(embed)
    expect(content.embeds[0].id).toBe('embed-1')
    expect(content.embeds[0].graphData).toBe(embed.graphData)
    expect(content.metadata?.primaryEmbedId).toBe('embed-1')
  })

  it('removes embed placeholder from document content', () => {
    const content = {
      content: '# Title\n\n<!--tu:embed id="e1" type="x6"-->\n\nTail',
      embeds: [{ id: 'e1', type: 'x6' as const, graphData: createX6BoardPageContent('b').embeds[0].graphData }],
      annotations: [],
      metadata: { primaryEmbedId: 'e1' },
    }
    const next = removeEmbedFromPageContent(content, 'e1')
    expect(next.embeds).toHaveLength(0)
    expect(next.content).not.toContain('tu:embed')
    expect(next.metadata?.primaryEmbedId).toBeUndefined()
  })

  it('resolves primary embed by page type', () => {
    const mindmap = createMindmapPageContent('m')
    const board = createX6BoardPageContent('b')
    expect(resolvePrimaryEmbed(mindmap, 'mindmap')?.id).toBe(mindmap.embeds[0].id)
    expect(resolvePrimaryEmbed(board, 'x6board')?.id).toBe(board.embeds[0].id)
    expect(resolvePrimaryEmbed(board, 'mindmap')).toBeNull()
  })

  it('infers canvas page type from primary embed content', () => {
    const mindmap = createMindmapPageContent('m')
    const board = createX6BoardPageContent('b')
    expect(inferPageTypeFromContent(mindmap)).toBe('mindmap')
    expect(inferPageTypeFromContent(board)).toBe('x6board')
    expect(inferPageTypeFromContent({ content: '# doc', embeds: [], annotations: [] })).toBeNull()
  })

  it('resolves mindmap primary embed when blueprintMeta was stripped by backend', () => {
    const strippedGraph = createMindmapPageContent('m').embeds[0].graphData!
    delete (strippedGraph as { blueprintMeta?: unknown }).blueprintMeta

    const content: PageContent = {
      content: '',
      embeds: [{
        id: 'mindmap-abc',
        type: 'x6',
        title: '未命名思维导图',
        graphData: strippedGraph,
      }],
      annotations: [],
      metadata: { primaryEmbedId: 'mindmap-abc' },
    }

    const normalized = normalizePageContentFromApi(content)
    expect(isMindmapBlueprint(normalized.embeds[0].graphData)).toBe(true)
    expect(resolvePrimaryEmbed(normalized, 'mindmap')?.id).toBe('mindmap-abc')
  })
})
