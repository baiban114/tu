export type UrlDisplayMode = 'link' | 'iframe' | 'title' | 'pdf'

export const URL_EMBED_DEFAULT_HEIGHT = 360
export const URL_EMBED_MIN_HEIGHT = 120
export const URL_EMBED_MAX_HEIGHT = 2000

export const URL_EMBED_COMMENT_RE = /<!--tu:url-embed\s+([^>]+)-->/
export const LINK_DISPLAY_COMMENT_RE = /<!--tu:link-display\s+([^>]+)-->/

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;')
}

function parseAttrString(attrsStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([\w-]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(attrsStr)) !== null) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

export function createUrlEmbedBlockId(): string {
  return `ue-${crypto.randomUUID().replace(/-/g, '')}`
}

export function parseUrlEmbedComment(attrsStr: string): { blockId: string; url: string; height: number } | null {
  const attrs = parseAttrString(attrsStr)
  const blockId = attrs.id
  const url = attrs.url
  if (!blockId || !url) return null
  const height = Number(attrs.height) || URL_EMBED_DEFAULT_HEIGHT
  return { blockId, url, height: Number.isFinite(height) && height > 0 ? height : URL_EMBED_DEFAULT_HEIGHT }
}

export function serializeUrlEmbedComment(blockId: string, url: string, height: number): string {
  return `<!--tu:url-embed id="${escapeAttr(blockId)}" url="${escapeAttr(url)}" height="${height}"-->`
}

export function parseLinkDisplayComment(attrsStr: string): 'link' | 'title' | null {
  const attrs = parseAttrString(attrsStr)
  if (attrs.mode === 'title') return 'title'
  return null
}

export function serializeLinkDisplayComment(mode: 'title'): string {
  return `<!--tu:link-display mode="${mode}"-->`
}

export function fallbackPageTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}
