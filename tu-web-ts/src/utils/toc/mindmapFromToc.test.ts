import { describe, expect, it } from 'vitest'
import { flattenTocTreeForMindmap } from '@/utils/toc/mindmapFromTocTree'
import type { TocTreeItem } from '@/utils/toc/headings'

function toc(partial: Partial<TocTreeItem> & Pick<TocTreeItem, 'id' | 'text'>): TocTreeItem {
  return {
    blockId: partial.blockId ?? partial.id,
    level: partial.level ?? 1,
    pos: partial.pos ?? 0,
    sourceType: partial.sourceType ?? 'local',
    ...partial,
  }
}

describe('flattenTocTreeForMindmap', () => {
  it('flattens nested TOC with page title as root', () => {
    let seq = 0
    const rows = flattenTocTreeForMindmap(
      '示例文档',
      [
        toc({
          id: 'h1',
          text: '第一章',
          children: [
            toc({ id: 'h2', text: '1.1 小节', level: 2 }),
          ],
        }),
        toc({ id: 'h3', text: '第二章' }),
      ],
      (prefix) => `${prefix}-${++seq}`,
    )

    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ text: '示例文档', parentId: null })
    expect(rows[1]).toMatchObject({ text: '第一章', parentId: rows[0].id })
    expect(rows[2]).toMatchObject({ text: '1.1 小节', parentId: rows[1].id })
    expect(rows[3]).toMatchObject({ text: '第二章', parentId: rows[0].id })
  })

  it('uses fallback root title when empty', () => {
    const rows = flattenTocTreeForMindmap('  ', [], (prefix) => `${prefix}-1`)
    expect(rows).toEqual([
      {
        id: 'mindmap-root-1',
        parentId: null,
        text: '文档',
        tocEntryId: '',
        blockId: '',
        sourceType: 'local',
      },
    ])
  })
})
