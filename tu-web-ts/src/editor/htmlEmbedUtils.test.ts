import { describe, expect, it } from 'vitest'
import {
  clipboardHtmlHasCorruptedIframeSrc,
  findIframeSnippetsInText,
  normalizeEmbedUrl,
  parseIframeSnippet,
  repairIframeSrcInHtml,
} from './htmlEmbedUtils'

describe('normalizeEmbedUrl', () => {
  it('extracts href from anchor markup in iframe src', () => {
    const anchor = '<a target="_blank" rel="noopener noreferrer nofollow" href="https://cn.dubbo.apache.org/zh-cn/blog/2023/01/30/dubbo3/">https://cn.dubbo.apache.org/zh-cn/blog/2023/01/30/dubbo3/</a>'
    expect(normalizeEmbedUrl(anchor)).toBe('https://cn.dubbo.apache.org/zh-cn/blog/2023/01/30/dubbo3/')
  })
})

describe('parseIframeSnippet', () => {
  it('extracts src and height from iframe tag', () => {
    expect(parseIframeSnippet("<iframe src='https://example.com' height='480'></iframe>")).toEqual({
      url: 'https://example.com',
      height: 480,
    })
  })

  it('normalizes anchor markup inside iframe src', () => {
    const anchor = '<a href="https://example.com/path">https://example.com/path</a>'
    expect(parseIframeSnippet(`<iframe src='${anchor}'></iframe>`)).toEqual({
      url: 'https://example.com/path',
      height: 360,
    })
  })

  it('returns null when src is empty', () => {
    expect(parseIframeSnippet("<iframe src=''></iframe>")).toBeNull()
    expect(parseIframeSnippet('<iframe></iframe>')).toBeNull()
  })
})

describe('repairIframeSrcInHtml', () => {
  it('repairs corrupted iframe src in pasted html', () => {
    const anchor = '<a href="https://example.com">https://example.com</a>'
    const input = `<p><iframe src='${anchor}'></iframe></p>`
    const output = repairIframeSrcInHtml(input)
    expect(output).toContain(`src='https://example.com'`)
    expect(parseIframeSnippet(output)?.url).toBe('https://example.com')
  })
})

describe('clipboardHtmlHasCorruptedIframeSrc', () => {
  it('detects anchor inside iframe src', () => {
    expect(clipboardHtmlHasCorruptedIframeSrc("<iframe src='<a href=\"https://x.com\">x</a>'></iframe>")).toBe(true)
    expect(clipboardHtmlHasCorruptedIframeSrc("<iframe src='https://x.com'></iframe>")).toBe(false)
  })
})

describe('findIframeSnippetsInText', () => {
  it('finds iframe snippet in paragraph text', () => {
    const text = '<iframe src="https://a.com"></iframe>'
    expect(findIframeSnippetsInText(text)).toEqual([
      { start: 0, end: text.length, html: text },
    ])
  })
})
