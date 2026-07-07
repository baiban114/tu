import { describe, expect, it } from 'vitest'
import { decodeHtmlEntitiesForPaste, resolveClipboardHtmlSource } from './extensions/HtmlInlineRender'

describe('resolveClipboardHtmlSource', () => {
  it('uses plain text when clipboard html only has escaped tags', () => {
    const html = '<p>&lt;b&gt;访问&lt;/b&gt;</p>'
    const plain = '<b>访问</b>'
    expect(resolveClipboardHtmlSource(html, plain)).toBe('<p><b>访问</b></p>')
  })

  it('decodes entities in html', () => {
    expect(decodeHtmlEntitiesForPaste('&lt;b&gt;hi&lt;/b&gt;')).toBe('<b>hi</b>')
  })
})
