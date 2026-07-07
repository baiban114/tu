import { describe, expect, it } from 'vitest'
import { clampPage, paginateSlice } from './clientPagination'

describe('paginateSlice', () => {
  it('returns first page by default', () => {
    const result = paginateSlice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 0, 10)
    expect(result.items).toHaveLength(10)
    expect(result.total).toBe(11)
    expect(result.page).toBe(0)
  })

  it('returns second page slice', () => {
    const result = paginateSlice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 1, 10)
    expect(result.items).toEqual([11])
  })
})

describe('clampPage', () => {
  it('clamps page when total shrinks', () => {
    expect(clampPage(3, 5, 10)).toBe(0)
    expect(clampPage(1, 25, 10)).toBe(1)
    expect(clampPage(5, 25, 10)).toBe(2)
  })
})
