import { InputRule, PasteRule } from '@tiptap/core'
import Link, { isAllowedUri } from '@tiptap/extension-link'

/** `[label](href)` or `[label](href "title")` / `[label](href 'title')` */
export const MARKDOWN_LINK_SYNTAX_RE =
  /\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g

export const MARKDOWN_LINK_INPUT_RE =
  /(?:^|\s)\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)$/

export function parseMarkdownLinkSyntaxMatch(match: RegExpMatchArray): {
  label: string
  href: string
  title: string | null
} | null {
  const label = match[1]?.trim() ?? ''
  const href = match[2]?.trim() ?? ''
  const title = (match[3] || match[4] || '').trim() || null
  if (!label || !href) return null
  return { label, href, title }
}

export const TuLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      displayMode: {
        default: 'link',
        parseHTML: (element) => element.getAttribute('data-display-mode') || 'link',
        renderHTML: (attributes) => {
          if (!attributes.displayMode || attributes.displayMode === 'link') {
            return {}
          }
          return { 'data-display-mode': attributes.displayMode }
        },
      },
    }
  },

  addInputRules() {
    return [
      ...(this.parent?.() || []),
      new InputRule({
        find: MARKDOWN_LINK_INPUT_RE,
        handler: ({ state, range, match }) => {
          const parsed = parseMarkdownLinkSyntaxMatch(match)
          if (!parsed) return null
          if (
            !this.options.isAllowedUri(parsed.href, {
              defaultValidate: (url) => !!isAllowedUri(url, this.options.protocols),
              protocols: this.options.protocols,
              defaultProtocol: this.options.defaultProtocol,
            })
          ) {
            return null
          }

          const { tr } = state
          const full = match[0]
          const leadingWsLen = full.length - full.trimStart().length
          const from = range.from + leadingWsLen
          const to = range.to

          tr.insertText(parsed.label, from, to)
          tr.addMark(
            from,
            from + parsed.label.length,
            this.type.create({
              href: parsed.href,
              title: parsed.title,
            }),
          )
          tr.setMeta('preventAutolink', true)
          tr.removeStoredMark(this.type)
        },
      }),
    ]
  },

  addPasteRules() {
    return [
      ...(this.parent?.() || []),
      new PasteRule({
        find: MARKDOWN_LINK_SYNTAX_RE,
        handler: ({ state, range, match }) => {
          const parsed = parseMarkdownLinkSyntaxMatch(match)
          if (!parsed) return null
          if (
            !this.options.isAllowedUri(parsed.href, {
              defaultValidate: (url) => !!isAllowedUri(url, this.options.protocols),
              protocols: this.options.protocols,
              defaultProtocol: this.options.defaultProtocol,
            })
          ) {
            return null
          }

          const { tr } = state
          const from = range.from
          const to = range.to
          tr.insertText(parsed.label, from, to)
          tr.addMark(
            from,
            from + parsed.label.length,
            this.type.create({
              href: parsed.href,
              title: parsed.title,
            }),
          )
          tr.setMeta('preventAutolink', true)
        },
      }),
    ]
  },
})
