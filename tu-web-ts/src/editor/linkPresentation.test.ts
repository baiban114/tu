import { describe, expect, it } from 'vitest'
import {
  availableLinkPresentationModes,
  canRestoreInlineLinkFromHref,
  disabledLinkPresentationModes,
  linkPresentationModeLabel,
} from '@/editor/linkPresentation'

describe('linkPresentation', () => {
  it('offers iframe/title for http links', () => {
    expect(availableLinkPresentationModes('https://example.com', 'link')).toEqual([
      'link',
      'iframe',
      'title',
    ])
  })

  it('offers pdf for resource locators', () => {
    expect(availableLinkPresentationModes('resource:ri-1', 'link')).toEqual([
      'link',
      'pdf',
    ])
  })

  it('keeps pdf mode available while already in pdf presentation', () => {
    expect(availableLinkPresentationModes('resource:ri-1', 'pdf')).toEqual([
      'link',
      'pdf',
    ])
    expect(availableLinkPresentationModes('file:abc', 'pdf')).toEqual([
      'link',
      'pdf',
    ])
  })

  it('disables link restore only when href is not recoverable', () => {
    expect(canRestoreInlineLinkFromHref('resource:ri-1')).toBe(true)
    expect(disabledLinkPresentationModes('resource:ri-1', 'pdf')).toEqual([])
    expect(disabledLinkPresentationModes('file:x', 'pdf')).toEqual(['link', 'iframe', 'title'])
  })

  it('labels modes', () => {
    expect(linkPresentationModeLabel('pdf')).toBe('PDF')
    expect(linkPresentationModeLabel('link')).toBe('链接')
  })
})
