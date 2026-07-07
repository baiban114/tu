import { describe, expect, it } from 'vitest'
import { createMindmapPageContent, normalizePageType } from '@/utils/mindmapPageContent'
import { isMindmapBlueprint } from '@/components/x6'

describe('mindmap page content', () => {
  it('initializes mindmap page content with primary embed', () => {
    const content = createMindmapPageContent('我的导图')
    expect(content.content).toBe('')
    expect(content.embeds).toHaveLength(1)
    expect(content.embeds[0].type).toBe('x6')
    expect(content.embeds[0].title).toBe('我的导图')
    expect(isMindmapBlueprint(content.embeds[0].graphData)).toBe(true)
    expect(content.metadata?.primaryEmbedId).toBe(content.embeds[0].id)
  })

  it('defaults unknown page types to document', () => {
    expect(normalizePageType()).toBe('document')
    expect(normalizePageType('document')).toBe('document')
    expect(normalizePageType('mindmap')).toBe('mindmap')
    expect(normalizePageType('x6board')).toBe('x6board')
  })
})
