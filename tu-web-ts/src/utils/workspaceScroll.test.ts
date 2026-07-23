/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearWorkspaceScrollTop,
  loadWorkspaceScrollTop,
  saveWorkspaceScrollTop,
} from '@/utils/workspaceScroll'

describe('workspaceScroll', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves and loads scrollTop by viewKey', () => {
    expect(loadWorkspaceScrollTop('page-1')).toBe(0)
    saveWorkspaceScrollTop('page-1', 420)
    expect(loadWorkspaceScrollTop('page-1')).toBe(420)
    expect(loadWorkspaceScrollTop('page-2')).toBe(0)
  })

  it('clears entry when scrollTop is 0', () => {
    saveWorkspaceScrollTop('page-1', 100)
    clearWorkspaceScrollTop('page-1')
    expect(loadWorkspaceScrollTop('page-1')).toBe(0)
  })
})
