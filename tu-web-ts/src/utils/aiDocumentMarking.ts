import type { JSONContent } from '@tiptap/core'
import type {
  DocumentMarkingSuggestion,
  HeadingSourceBinding,
  KnowledgeAnchor,
  PageContent,
  TextAnnotation,
} from '@/api/types'
import { createHeadingBlockId } from '@/utils/headingSource'
import { annotationAnchor, headingAnchor, resourceExcerptAnchor } from '@/utils/knowledgeAnchor'
import { createKnowledgeRelation } from '@/api/knowledgeRelation'
import { createResourceExcerpt, getResourceItem } from '@/api/externalResource'
import type { Editor } from '@tiptap/core'

export interface ApplyAiMarkingContext {
  pageId: string
  kbId: string
  editor: Editor
  getAnnotations: () => TextAnnotation[]
  setAnnotations: (annotations: TextAnnotation[]) => void
  applyHeadingBindingByBlockId: (blockId: string, binding: HeadingSourceBinding) => boolean
}

function parseHeadingBlockId(locator: string, pageId: string): string | null {
  const prefix = `page:${pageId}:heading:`
  if (!locator.startsWith(prefix)) return null
  const blockId = locator.slice(prefix.length).split(':')[0]
  return blockId || null
}

export function clearAiMarkersFromDocument(editor: Editor, annotations: TextAnnotation[]): {
  annotations: TextAnnotation[]
  changed: boolean
} {
  let changed = false
  const doc = editor.state.doc
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true
    const binding = node.attrs.sourceBinding as HeadingSourceBinding | null
    if (binding?.markerSource !== 'ai') return true
    editor.chain().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        sourceBinding: null,
      })
      return true
    }).run()
    changed = true
    return true
  })
  const filtered = annotations.filter((ann) => !(ann.kind === 'basis' && ann.markerSource === 'ai'))
  if (filtered.length !== annotations.length) changed = true
  return { annotations: filtered, changed }
}

export async function applyAiMarkingSuggestions(
  suggestions: DocumentMarkingSuggestion[],
  ctx: ApplyAiMarkingContext,
): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = []
  let applied = 0
  const now = Date.now()

  for (const suggestion of suggestions) {
    try {
      if (suggestion.action === 'bindSource') {
        const blockId = parseHeadingBlockId(suggestion.locator, ctx.pageId)
        if (!blockId || !suggestion.resourceItemId || !suggestion.resourceExcerptId) {
          errors.push(`${suggestion.id}: 无效的标题来源建议`)
          continue
        }
        let snapshot: HeadingSourceBinding['snapshot'] = {
          resourceTitle: '',
          excerptTitle: suggestion.excerptTitle || undefined,
        }
        try {
          const item = await getResourceItem(suggestion.resourceItemId)
          snapshot = {
            resourceTitle: item.title,
            resourceTypeName: item.typeName,
            excerptTitle: suggestion.excerptTitle || undefined,
          }
        } catch {
          // use minimal snapshot
        }
        const binding: HeadingSourceBinding = {
          resourceItemId: suggestion.resourceItemId,
          resourceExcerptId: suggestion.resourceExcerptId,
          snapshot,
          markerSource: 'ai',
        }
        if (ctx.applyHeadingBindingByBlockId(blockId, binding)) {
          applied += 1
        } else {
          errors.push(`${suggestion.id}: 未找到标题块 ${blockId}`)
        }
        continue
      }

      if (suggestion.action === 'setBasis') {
        if (!suggestion.resourceItemId) {
          errors.push(`${suggestion.id}: 缺少资源`)
          continue
        }
        const annId = suggestion.locator.match(/:annotation:([^:]+)$/)?.[1] || `ann-ai-${crypto.randomUUID().replace(/-/g, '')}`
        let snapshot: HeadingSourceBinding['snapshot'] = { resourceTitle: '' }
        try {
          const item = await getResourceItem(suggestion.resourceItemId)
          snapshot = { resourceTitle: item.title, resourceTypeName: item.typeName }
        } catch {
          // ignore
        }
        const annotation: TextAnnotation = {
          id: annId,
          selectedText: suggestion.excerptText || suggestion.reason || 'AI 依据',
          contextBefore: '',
          contextAfter: '',
          note: suggestion.reason || '',
          color: '#e6f4ff',
          createdAt: now,
          updatedAt: now,
          kind: 'basis',
          markerSource: 'ai',
          basisBinding: {
            resourceItemId: suggestion.resourceItemId,
            resourceExcerptId: suggestion.resourceExcerptId ?? null,
            snapshot,
            markerSource: 'ai',
          },
        }
        ctx.setAnnotations([...ctx.getAnnotations(), annotation])
        applied += 1
        continue
      }

      if (suggestion.action === 'markExcerpt') {
        if (!suggestion.resourceItemId || !suggestion.excerptText?.trim()) {
          errors.push(`${suggestion.id}: 缺少节选内容`)
          continue
        }
        const excerpt = await createResourceExcerpt(suggestion.resourceItemId, {
          title: suggestion.excerptTitle || suggestion.excerptText.slice(0, 80),
          excerptText: suggestion.excerptText,
          sortOrder: 0,
          note: suggestion.reason || undefined,
          metadata: { markerSource: 'ai', aiRunId: suggestion.id },
        })
        applied += 1
        void excerpt
        continue
      }

      if (suggestion.action === 'createRelation') {
        if (!suggestion.toPointId || !suggestion.relationTypeKey) {
          errors.push(`${suggestion.id}: 缺少关系目标`)
          continue
        }
        const from = buildAnchorFromLocator(suggestion.locator, ctx.pageId)
        if (!from) {
          errors.push(`${suggestion.id}: 无效 locator`)
          continue
        }
        await createKnowledgeRelation(ctx.kbId, {
          relationTypeKey: suggestion.relationTypeKey,
          toPointId: suggestion.toPointId,
          from,
          note: suggestion.reason || undefined,
          sourceProvenance: 'ai',
        })
        applied += 1
      }
    } catch (err) {
      errors.push(`${suggestion.id}: ${err instanceof Error ? err.message : '应用失败'}`)
    }
  }

  return { applied, errors }
}

function buildAnchorFromLocator(locator: string, pageId: string): KnowledgeAnchor | null {
  if (locator.includes(':heading:')) {
    const blockId = parseHeadingBlockId(locator, pageId)
    if (!blockId) return null
    return headingAnchor(pageId, blockId)
  }
  if (locator.includes(':annotation:')) {
    const annId = locator.match(/:annotation:([^:]+)$/)?.[1]
    if (!annId) return null
    return annotationAnchor(pageId, annId)
  }
  if (locator.includes(':block:')) {
    const blockId = locator.match(/:block:([^:]+)/)?.[1]
    if (!blockId) return null
    return { kind: 'block', locator, snapshot: { blockId } }
  }
  if (locator.startsWith('resource:') && locator.includes(':excerpt:')) {
    const match = locator.match(/^resource:([^:]+):excerpt:([^:]+)$/)
    if (!match) return null
    return resourceExcerptAnchor(match[1], match[2])
  }
  return { kind: 'page', locator, snapshot: undefined }
}

export function stripAiMarkingMetadata(content: PageContent): PageContent {
  return content
}
