import { InputRule, PasteRule, mergeAttributes } from '@tiptap/core'
import Link, { isAllowedUri } from '@tiptap/extension-link'
import { resourceHrefPageLimitText } from '@/editor/linkLabelSuggestQuery'
import { createLinkIrSourcePlugin } from './linkIrSource'

/** `[label](href)` or `[label](href "title")` / `[label](href 'title')` */
export const MARKDOWN_LINK_SYNTAX_RE =
  /\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g

/**
 * Triggered when the closing `)` is typed. No leading-space requirement so
 * CJK runs like `你好[文字](url)` still convert (CommonMark allows mid-line links).
 */
export const MARKDOWN_LINK_INPUT_RE =
  /\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)$/

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

  renderHTML({ HTMLAttributes }) {
    const href = String(HTMLAttributes.href || '')
    const pageLimit = resourceHrefPageLimitText(href)
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, pageLimit
        ? { 'data-page-limit': pageLimit }
        : {}),
      0,
    ]
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

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      createLinkIrSourcePlugin({
        getLinkType: () => this.type,
        isAllowedHref: (href) => !!this.options.isAllowedUri(href, {
          defaultValidate: (url) => !!isAllowedUri(url, this.options.protocols),
          protocols: this.options.protocols,
          defaultProtocol: this.options.defaultProtocol,
        }),
      }),
    ]
  },
})
