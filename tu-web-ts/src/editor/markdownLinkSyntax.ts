export interface MarkdownLinkMatch {
  /** Complete `[label](href)` source. */
  source: string
  label: string
  href: string
  title: string | null
  index: number
  /**
   * Capture-compatible groups:
   * 1 label, 2 href, 3 double-quoted title, 4 single-quoted title.
   */
  groups: [string, string, string, string, string | undefined]
}

const COMMENT_HREF_RE = /^<([^>\s]*)>/

export function unescapeMarkdownText(value: string): string {
  return value.replace(/\\([\\*`[\]()~_!#>+\-.])/g, '$1')
}

function skipEscaped(text: string, index: number): number {
  return index < text.length - 1 ? index + 2 : index + 1
}

function skipCodeSpan(text: string, index: number): number | null {
  const run = text.slice(index).match(/^`+/)?.[0]
  if (!run) return null
  const close = text.indexOf(run, index + run.length)
  return close >= 0 ? close + run.length : null
}

function findClosingBracket(text: string, open: number): number {
  let depth = 0
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index = skipEscaped(text, index) - 1
      continue
    }
    if (text[index] === '`') {
      const next = skipCodeSpan(text, index)
      if (next != null) {
        index = next - 1
        continue
      }
    }
    if (text[index] === '[') depth += 1
    if (text[index] === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function parseHrefAndTitle(
  text: string,
  open: number,
  close: number,
): { href: string; title: string | null; group3: string; group4: string | undefined } | null {
  while (open < close && /\s/.test(text[open] || '')) open += 1
  while (close > open && /\s/.test(text[close - 1] || '')) close -= 1
  if (open >= close) return null

  let href = ''
  let cursor = open
  const angle = text.slice(open, close).match(COMMENT_HREF_RE)
  if (angle) {
    href = angle[1]
    cursor = open + angle[0].length
  } else {
    while (cursor < close) {
      if (text[cursor] === '\\') {
        cursor = skipEscaped(text, cursor)
        continue
      }
      if (/\s/.test(text[cursor])) break
      cursor += 1
    }
    href = text.slice(open, cursor)
  }

  if (!href) return null
  while (cursor < close && /\s/.test(text[cursor])) cursor += 1
  if (cursor === close) {
    return { href: unescapeMarkdownText(href), title: null, group3: '', group4: undefined }
  }

  const quote = text[cursor]
  if (quote !== '"' && quote !== "'") return null
  cursor += 1
  let title = ''
  while (cursor < close) {
    if (text[cursor] === '\\' && cursor < close - 1) {
      title += text[cursor + 1]
      cursor += 2
      continue
    }
    if (text[cursor] === quote) {
      cursor += 1
      break
    }
    title += text[cursor]
    cursor += 1
  }
  if (text[cursor - 1] !== quote) return null
  while (cursor < close && /\s/.test(text[cursor])) cursor += 1
  if (cursor !== close) return null

  return {
    href: unescapeMarkdownText(href),
    title: title.trim() || null,
    group3: quote === '"' ? (title.trim() || '') : '',
    group4: quote === "'" ? (title.trim() || '') : undefined,
  }
}

/**
 * Scan Markdown inline links whose label may contain balanced brackets.
 * At a given index, `allowTrailingText` mirrors an end-anchored input rule.
 */
export function scanMarkdownLink(
  text: string,
  start = 0,
  allowTrailingText = true,
): MarkdownLinkMatch | null {
  let open = text.indexOf('[', start)
  while (open >= 0) {
    if (open > 0 && text[open - 1] === '\\') {
      open = text.indexOf('[', open + 1)
      continue
    }
    if (open > 0 && text[open - 1] === '!') {
      open = text.indexOf('[', open + 1)
      continue
    }

    const labelEnd = findClosingBracket(text, open)
    if (labelEnd > open && text[labelEnd + 1] === '(') {
      let depth = 1
      let hrefEnd = -1
      for (let index = labelEnd + 2; index < text.length; index += 1) {
        if (text[index] === '\\') {
          index = skipEscaped(text, index) - 1
          continue
        }
        if (text[index] === '(') depth += 1
        if (text[index] === ')') {
          depth -= 1
          if (depth === 0) {
            hrefEnd = index
            break
          }
        }
      }

      if (hrefEnd >= 0) {
        const parts = parseHrefAndTitle(text, labelEnd + 2, hrefEnd)
        const source = text.slice(open, hrefEnd + 1)
        const complete = Boolean(parts && (allowTrailingText || hrefEnd === text.length - 1))
        if (parts && complete) {
          const label = unescapeMarkdownText(text.slice(open + 1, labelEnd).trim())
          return {
            source,
            label,
            href: parts.href,
            title: parts.title,
            index: open,
            groups: [
              source,
              label,
              parts.href,
              parts.group3,
              parts.group4,
            ],
          }
        }
      }
    }
    open = text.indexOf('[', open + 1)
  }
  return null
}

export function findMarkdownLink(text: string): MarkdownLinkMatch | null {
  return scanMarkdownLink(text)
}

export function findMarkdownLinkEndingAt(input: string): MarkdownLinkMatch | null {
  return scanMarkdownLink(input, 0, false)
}

export function findMarkdownLinks(text: string): MarkdownLinkMatch[] {
  const matches: MarkdownLinkMatch[] = []
  let offset = 0
  while (offset < text.length) {
    const match = scanMarkdownLink(text, offset)
    if (!match) break
    matches.push(match)
    offset = match.index + match.source.length
  }
  return matches
}

export function findMarkdownLinkContaining(text: string, position: number): MarkdownLinkMatch | null {
  const candidate = Math.max(0, position - 1)
  return findMarkdownLinks(text).find((match) => (
    candidate >= match.index && candidate < match.index + match.source.length
  )) ?? null
}

export function findMarkdownLinkLabelEnd(text: string): number {
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1
      continue
    }
    if (text[index] === '`') {
      const next = skipCodeSpan(text, index)
      if (next != null) {
        index = next - 1
        continue
      }
    }
    if (text[index] === '[') depth += 1
    if (text[index] === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}
