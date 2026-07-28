import { describe, expect, it } from 'vitest'
import { buildResourceMetaPathParts, formatResourceMetaPath } from './resourceMetaPath'

describe('buildResourceMetaPathParts', () => {
  it('builds 类型 > 归类 > 实体 > 章节 > 定位 > 节选', () => {
    expect(buildResourceMetaPathParts({
      resourceTypeName: '图书',
      workTitle: '系列A',
      resourceTitle: '示例之书',
      chapterTitle: '第1章',
      excerptLocator: 'page:18',
      excerptTitle: '关于笔记',
    })).toEqual([
      '图书',
      '系列A',
      '示例之书',
      '第1章',
      '第 18 页',
      '关于笔记',
    ])
  })

  it('falls back to resourceTitle when workTitle missing', () => {
    expect(buildResourceMetaPathParts({
      resourceTitle: '示例之书',
      excerptTitle: '节选 A',
    })).toEqual(['示例之书', '节选 A'])
  })

  it('does not duplicate resourceTitle when equal to workTitle', () => {
    expect(buildResourceMetaPathParts({
      workTitle: '同名',
      resourceTitle: '同名',
      excerptLocator: 'page:1',
    })).toEqual(['同名', '第 1 页'])
  })

  it('formats joined path', () => {
    expect(formatResourceMetaPath({
      resourceTypeName: '图书',
      resourceTitle: '书',
    })).toBe('图书 > 书')
  })
})
