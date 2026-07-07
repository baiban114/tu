/** Parse iframe HTML snippets into urlEmbedBlock attrs. */

function decodeHtmlEntitiesBasic(text: string): string {
  if (!text.includes('&lt;') && !text.includes('&gt;') && !text.includes('&amp;')) {
    return text
  }
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea')
    el.innerHTML = text
    return el.value
  }
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Resolve http(s) URL from iframe src that may be a raw link or anchor markup. */
export function normalizeEmbedUrl(raw: string): string | null {
  let candidate = raw.trim()
  if (!candidate) return null
  if (/^https?:\/\//i.test(candidate)) return candidate

  for (let i = 0; i < 2; i++) {
    const anchorMatch = candidate.match(
      /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/i,
    )
    if (anchorMatch) {
      const href = (anchorMatch[1] ?? anchorMatch[2] ?? anchorMatch[3] ?? '').trim()
      if (/^https?:\/\//i.test(href)) return href
    }
    const decoded = decodeHtmlEntitiesBasic(candidate)
    if (decoded === candidate) break
    candidate = decoded
  }

  return null
}

function findIframeOpenTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return i
  }
  return -1
}

function extractAttrValue(attrs: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|([^\\s>]+))`,
    'i',
  )
  const match = attrs.match(re)
  if (!match) return null
  return (match[1] ?? match[2] ?? match[3] ?? '').trim()
}

function matchIframeSnippetAt(html: string, fromIndex = 0): { start: number; end: number; html: string } | null {
  const localStart = html.slice(fromIndex).search(/<iframe\b/i)
  if (localStart < 0) return null

  const start = fromIndex + localStart
  const openEnd = findIframeOpenTagEnd(html, start + '<iframe'.length)
  if (openEnd < 0) return null

  const openTag = html.slice(start, openEnd + 1)
  if (/\/>\s*$/.test(openTag)) {
    return { start, end: openEnd + 1, html: openTag }
  }

  const closeMatch = html.slice(openEnd + 1).match(/^\s*<\/iframe\s*>/i)
  if (!closeMatch) {
    return { start, end: openEnd + 1, html: openTag }
  }
  const end = openEnd + 1 + closeMatch[0].length
  return { start, end, html: html.slice(start, end) }
}

function getIframeOpenTag(snippetHtml: string): string {
  const end = findIframeOpenTagEnd(snippetHtml, '<iframe'.length)
  if (end < 0) return snippetHtml
  return snippetHtml.slice(0, end + 1)
}

function extractIframeAttrs(openTag: string): string {
  return openTag.replace(/^<iframe\b/i, '').replace(/\/>\s*$|>\s*$/i, '').trim()
}

export function parseIframeSnippet(html: string): { url: string; height: number } | null {
  const snippet = matchIframeSnippetAt(html)
  if (!snippet) return null

  const attrs = extractIframeAttrs(getIframeOpenTag(snippet.html))
  const rawUrl = extractAttrValue(attrs, 'src')
  const url = rawUrl ? normalizeEmbedUrl(rawUrl) : null
  if (!url) return null

  const rawHeight = extractAttrValue(attrs, 'height')
  const parsedHeight = rawHeight ? parseInt(rawHeight, 10) : 360
  return {
    url,
    height: Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 360,
  }
}

export function findIframeSnippetsInText(text: string): Array<{ start: number; end: number; html: string }> {
  const results: Array<{ start: number; end: number; html: string }> = []
  let cursor = 0
  while (cursor < text.length) {
    const snippet = matchIframeSnippetAt(text, cursor)
    if (!snippet) break
    results.push(snippet)
    cursor = snippet.end
  }
  return results
}

function iframeOpenTagHasCorruptedSrc(snippetHtml: string): boolean {
  const raw = extractAttrValue(extractIframeAttrs(getIframeOpenTag(snippetHtml)), 'src')
  if (!raw) return false
  if (/^https?:\/\//i.test(raw)) return false
  return /<a\b/i.test(raw) || /&lt;a\b/i.test(raw)
}

/** Fix iframe src when copy/paste serializes urlEmbedBlock url as anchor HTML inside src. */
export function repairIframeSrcInHtml(html: string): string {
  const snippets = findIframeSnippetsInText(html)
  if (snippets.length === 0) return html

  let output = html
  for (const snippet of [...snippets].reverse()) {
    const parsed = parseIframeSnippet(snippet.html)
    if (!parsed) continue

    const openTag = getIframeOpenTag(snippet.html)
    const attrs = extractIframeAttrs(openTag)
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i)
    if (!srcMatch) continue

    const rawSrc = extractAttrValue(attrs, 'src')
    if (!rawSrc || rawSrc === parsed.url) continue

    const quote = srcMatch[0].includes("'") ? "'" : '"'
    const newOpen = openTag.replace(
      /\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
      `src=${quote}${parsed.url}${quote}`,
    )
    const closeSuffix = snippet.html.slice(openTag.length)
    const repaired = newOpen + closeSuffix
    output = output.slice(0, snippet.start) + repaired + output.slice(snippet.end)
  }
  return output
}

export function clipboardHtmlHasCorruptedIframeSrc(html: string): boolean {
  return findIframeSnippetsInText(html).some((snippet) => iframeOpenTagHasCorruptedSrc(snippet.html))
}