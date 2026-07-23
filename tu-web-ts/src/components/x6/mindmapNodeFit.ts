import type { Node } from '@antv/x6'

/** Horizontal padding reserved around mindmap label text. */
export const MINDMAP_LABEL_PAD_X = 28
/** Vertical padding reserved around mindmap label text. */
export const MINDMAP_LABEL_PAD_Y = 20
export const MINDMAP_NODE_MIN_WIDTH = 80
export const MINDMAP_NODE_MAX_WIDTH = 480

type MeasureFn = (text: string) => number

function createMeasure(fontWeight: string | number, fontSize: number, fontFamily: string): MeasureFn {
  if (typeof document === 'undefined') {
    // SSR / unit tests without canvas: approximate CJK as full-width.
    return (text: string) => {
      let w = 0
      for (const ch of text) {
        w += /[\u1100-\uD7AF\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)
          ? fontSize
          : fontSize * 0.55
      }
      return w
    }
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return (text: string) => text.length * fontSize * 0.6
  }
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  return (text: string) => ctx.measureText(text).width
}

/**
 * Wrap plain text to fit `maxWidth`. Preserves explicit newlines.
 * Breaks by character so CJK wraps cleanly.
 */
export function wrapPlainTextLines(
  text: string,
  maxWidth: number,
  measure: MeasureFn,
): string[] {
  const width = Math.max(1, maxWidth)
  const paragraphs = String(text).split('\n')
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let current = ''
    for (const ch of paragraph) {
      const next = current + ch
      if (current && measure(next) > width) {
        lines.push(current)
        current = ch
      } else {
        current = next
      }
    }
    if (current) lines.push(current)
  }

  return lines.length ? lines : ['']
}

/**
 * Smallest content width such that wrapped line count <= maxLines.
 */
export function findMinContentWidthForMaxLines(
  text: string,
  maxLines: number,
  measure: MeasureFn,
  minWidth = 20,
  maxWidth = MINDMAP_NODE_MAX_WIDTH,
): number {
  const limit = Math.max(1, maxLines)
  const singleLine = Math.ceil(measure(String(text).replace(/\n/g, ' ')))
  if (wrapPlainTextLines(text, minWidth, measure).length <= limit) {
    return minWidth
  }

  let lo = minWidth
  let hi = Math.max(minWidth, Math.min(maxWidth, singleLine + 2))
  // Ensure hi is wide enough
  while (wrapPlainTextLines(text, hi, measure).length > limit && hi < maxWidth) {
    hi = Math.min(maxWidth, Math.ceil(hi * 1.5))
  }

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (wrapPlainTextLines(text, mid, measure).length <= limit) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

function readLabelFont(node: Node): {
  fontSize: number
  fontWeight: string | number
  fontFamily: string
  lineHeight: number
} {
  const fontSize = Number(node.attr('label/fontSize') ?? 14) || 14
  const fontWeight = (node.attr('label/fontWeight') as string | number | undefined) ?? 600
  const fontFamily = String(
    node.attr('label/fontFamily')
      ?? 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
  )
  const explicitLineHeight = Number(node.attr('label/lineHeight'))
  const lineHeight = Number.isFinite(explicitLineHeight) && explicitLineHeight > 0
    ? explicitLineHeight
    : fontSize * 1.35
  return { fontSize, fontWeight, fontFamily, lineHeight }
}

function applyMindmapLabelTextWrap(node: Node, contentWidth: number, contentHeight: number) {
  node.attr('label/textWrap', {
    width: Math.max(1, contentWidth),
    height: Math.max(1, contentHeight),
    ellipsis: false,
  })
}

/**
 * Fit mindmap node label inside the shape:
 * 1. If current height allows wrapping at current width → enable wrap, keep size.
 * 2. Otherwise widen the node so wrapped text fits within the current height.
 *
 * @returns whether node width changed
 */
export function fitMindmapNodeToText(node: Node): boolean {
  const data = (node.getData<Record<string, unknown>>() ?? {}) as Record<string, unknown>
  if (data.textMode === 'rich') {
    return false
  }

  const text = String(node.attr('label/text') ?? '')
  const size = node.getSize()
  const { fontSize, fontWeight, fontFamily, lineHeight } = readLabelFont(node)
  const measure = createMeasure(fontWeight, fontSize, fontFamily)

  const contentHeight = Math.max(lineHeight, size.height - MINDMAP_LABEL_PAD_Y)
  const contentWidth = Math.max(20, size.width - MINDMAP_LABEL_PAD_X)

  if (!text.trim()) {
    applyMindmapLabelTextWrap(node, contentWidth, contentHeight)
    return false
  }

  const linesAtCurrent = wrapPlainTextLines(text, contentWidth, measure)
  const heightNeeded = linesAtCurrent.length * lineHeight

  let nextWidth = size.width
  if (heightNeeded > contentHeight + 0.5) {
    const maxLines = Math.max(1, Math.floor(contentHeight / lineHeight))
    const neededContentWidth = findMinContentWidthForMaxLines(
      text,
      maxLines,
      measure,
      20,
      MINDMAP_NODE_MAX_WIDTH - MINDMAP_LABEL_PAD_X,
    )
    nextWidth = Math.min(
      MINDMAP_NODE_MAX_WIDTH,
      Math.max(MINDMAP_NODE_MIN_WIDTH, neededContentWidth + MINDMAP_LABEL_PAD_X),
    )
  }

  const sizeChanged = Math.abs(nextWidth - size.width) > 0.5
  if (sizeChanged) {
    const centerX = node.getPosition().x + size.width / 2
    node.resize(nextWidth, size.height)
    node.setPosition(centerX - nextWidth / 2, node.getPosition().y)
  }

  applyMindmapLabelTextWrap(
    node,
    Math.max(20, nextWidth - MINDMAP_LABEL_PAD_X),
    contentHeight,
  )
  return sizeChanged
}

/** Apply fit to all plain-text nodes. Returns true if any size changed. */
export function fitAllMindmapNodesToText(nodes: Node[]): boolean {
  let changed = false
  for (const node of nodes) {
    if (fitMindmapNodeToText(node)) changed = true
  }
  return changed
}
