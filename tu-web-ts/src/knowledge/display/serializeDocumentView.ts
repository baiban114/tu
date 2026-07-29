import type { JSONContent } from '@tiptap/core'
import type { KnowledgePointDocumentViewModel } from './types'

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;')
}

/**
 * Persistence marker for a composed KP display binding in page markdown/comments.
 * Mirrors heading-source / blockquote-excerpt comment style.
 */
export function serializeKnowledgePointDisplayComment(
  vm: Pick<KnowledgePointDocumentViewModel, 'binding'>,
): string {
  const { pointId, displayTypeCode, title } = vm.binding
  return `<!--tu:knowledge-point-display point="${escapeAttr(pointId)}" type="${escapeAttr(displayTypeCode)}" title="${escapeAttr(title)}"-->`
}

export const KNOWLEDGE_POINT_DISPLAY_COMMENT_RE =
  /<!--tu:knowledge-point-display\s+([^>]+)-->/

export function parseKnowledgePointDisplayComment(attrsStr: string): {
  pointId: string
  displayTypeCode: string
  title: string
} | null {
  const attrs: Record<string, string> = {}
  const re = /([\w-]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(attrsStr)) !== null) {
    attrs[match[1]] = match[2]
  }
  const pointId = attrs.point?.trim()
  if (!pointId) return null
  return {
    pointId,
    displayTypeCode: attrs.type?.trim() || 'concept',
    title: attrs.title?.trim() || '',
  }
}

/** Flatten composed view into markdown suitable for a richtext block. */
export function knowledgePointDocumentToMarkdown(vm: KnowledgePointDocumentViewModel): string {
  const lines: string[] = []
  lines.push(serializeKnowledgePointDisplayComment(vm))
  lines.push(`## ${vm.title}`)
  for (const section of vm.sections) {
    lines.push('')
    lines.push(`### ${section.title}`)
    if (section.kind === 'text' && section.body) {
      lines.push(section.body)
    } else if (section.kind === 'pointList' && section.points?.length) {
      for (const p of section.points) {
        const extra = p.summary?.trim() ? ` — ${p.summary.trim()}` : ''
        lines.push(`- ${p.title}${extra}`)
      }
    } else if (section.kind === 'anchorList' && section.anchors?.length) {
      for (const a of section.anchors) {
        lines.push(`- ${a.label} (\`${a.locator}\`)`)
      }
    }
  }
  return `${lines.join('\n')}\n`
}

/** TipTap doc JSON for inserting the composed view into the editor. */
export function knowledgePointDocumentToTipTapDoc(vm: KnowledgePointDocumentViewModel): JSONContent {
  const content: JSONContent[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: vm.title }],
    },
  ]

  for (const section of vm.sections) {
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: section.title }],
    })
    if (section.kind === 'text' && section.body) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: section.body }],
      })
    } else if (section.kind === 'pointList' && section.points?.length) {
      content.push({
        type: 'bulletList',
        content: section.points.map((p) => ({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: p.summary?.trim() ? `${p.title} — ${p.summary.trim()}` : p.title,
            }],
          }],
        })),
      })
    } else if (section.kind === 'anchorList' && section.anchors?.length) {
      content.push({
        type: 'bulletList',
        content: section.anchors.map((a) => ({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: `${a.label} (${a.locator})` }],
          }],
        })),
      })
    }
  }

  return { type: 'doc', content }
}
