import { describe, expect, it } from 'vitest'
import {
  normalizeKnowledgePointTitleFromContent,
  stripKnowledgePointOrdinalPrefix,
} from './knowledgePointTitle'

describe('stripKnowledgePointOrdinalPrefix', () => {
  it('strips arabic outline prefixes', () => {
    expect(stripKnowledgePointOrdinalPrefix('1. 绪论')).toBe('绪论')
    expect(stripKnowledgePointOrdinalPrefix('1、数据结构')).toBe('数据结构')
    expect(stripKnowledgePointOrdinalPrefix('1.1 数组')).toBe('数组')
    expect(stripKnowledgePointOrdinalPrefix('1.1.2 稀疏矩阵')).toBe('稀疏矩阵')
    expect(stripKnowledgePointOrdinalPrefix('(1) 概念')).toBe('概念')
    expect(stripKnowledgePointOrdinalPrefix('（2）方法')).toBe('方法')
  })

  it('strips chinese and circled ordinals', () => {
    expect(stripKnowledgePointOrdinalPrefix('一、基础')).toBe('基础')
    expect(stripKnowledgePointOrdinalPrefix('（一）概述')).toBe('概述')
    expect(stripKnowledgePointOrdinalPrefix('第1章 导论')).toBe('导论')
    expect(stripKnowledgePointOrdinalPrefix('第一章 导论')).toBe('导论')
    expect(stripKnowledgePointOrdinalPrefix('① 准备')).toBe('准备')
  })

  it('keeps title when ordinal is the whole name', () => {
    expect(stripKnowledgePointOrdinalPrefix('第一章')).toBe('第一章')
    expect(stripKnowledgePointOrdinalPrefix('1.')).toBe('1.')
  })

  it('does not strip non-ordinal leading digits', () => {
    expect(stripKnowledgePointOrdinalPrefix('2024 年度总结')).toBe('2024 年度总结')
  })
})

describe('normalizeKnowledgePointTitleFromContent', () => {
  it('falls back when empty', () => {
    expect(normalizeKnowledgePointTitleFromContent('')).toBe('未命名知识点')
    expect(normalizeKnowledgePointTitleFromContent('   ')).toBe('未命名知识点')
  })

  it('returns stripped title', () => {
    expect(normalizeKnowledgePointTitleFromContent('2. 排序')).toBe('排序')
  })
})
