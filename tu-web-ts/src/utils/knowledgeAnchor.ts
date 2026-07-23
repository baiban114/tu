import type { Router } from 'vue-router';
import type { KnowledgeAnchor, KnowledgeAnchorKind, KnowledgeRelation, TextAnnotation } from '@/api/types';
import { getAnnotationSelectionPayload } from '@/editor/annotationText';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { listKnowledgePointAnchors } from '@/api/knowledgePoint';
import { formatBlockLocator, formatPdfExcerptLocator } from '@/utils/pdfExcerpt';

export interface KnowledgeAnchorNavigateHandlers {
  router: Router;
  selectPage: (pageId: string) => Promise<void> | void;
  currentPageId?: string | null;
  scrollToAnnotation?: (pageId: string, annotationId: string) => void;
  scrollToHeading?: (pageId: string, headingBlockId: string) => void;
  scrollToSelection?: (pageId: string, from: number, to: number) => void;
  scrollToBlock?: (pageId: string, blockId: string, options?: { pdfPage?: number }) => void;
}

export function pageAnchor(pageId: string, title?: string): KnowledgeAnchor {
  return {
    kind: 'page',
    locator: `page:${pageId}`,
    snapshot: title ? { title } : undefined,
  };
}

export function headingAnchor(pageId: string, blockId: string, title?: string): KnowledgeAnchor {
  return {
    kind: 'heading',
    locator: `page:${pageId}:heading:${blockId}`,
    snapshot: { pageId, ...(title ? { title } : {}) },
  };
}

export function annotationAnchor(pageId: string, annotationId: string, title?: string): KnowledgeAnchor {
  return {
    kind: 'annotation',
    locator: `page:${pageId}:annotation:${annotationId}`,
    snapshot: title ? { title } : undefined,
  };
}

export function sectionAnchor(pageId: string, sectionKey: string, title?: string): KnowledgeAnchor {
  return {
    kind: 'section',
    locator: `page:${pageId}:section:${sectionKey}`,
    snapshot: title ? { title } : undefined,
  };
}

export function resourceItemAnchor(itemId: string, title?: string): KnowledgeAnchor {
  return {
    kind: 'resourceItem',
    locator: `resource:${itemId}`,
    snapshot: title ? { title } : undefined,
  };
}

export function resourceExcerptAnchor(itemId: string, excerptId: string, title?: string): KnowledgeAnchor {
  return {
    kind: 'resourceExcerpt',
    locator: `resource:${itemId}:excerpt:${excerptId}`,
    snapshot: title ? { title } : undefined,
  };
}

export function blockAnchor(pageId: string, blockId: string, title?: string): KnowledgeAnchor {
  return {
    kind: 'block',
    locator: formatBlockLocator(pageId, blockId),
    snapshot: title ? { title, blockId } : { blockId },
  };
}

export function pdfExcerptBlockAnchor(
  pageId: string,
  blockId: string,
  pdfPage?: number,
  title?: string,
): KnowledgeAnchor {
  const snapshot: Record<string, unknown> = { blockId, blockType: 'pdfExcerpt' };
  if (title) snapshot.title = title;
  if (pdfPage != null && Number.isFinite(pdfPage)) snapshot.pdfPage = pdfPage;
  return {
    kind: 'block',
    locator: formatPdfExcerptLocator(pageId, blockId, pdfPage),
    snapshot,
  };
}

export function buildAnnotationAnchorFromEditor(
  editor: Editor,
  pageId: string,
  annotationId: string,
): KnowledgeAnchor | null {
  const { from, to } = editor.state.selection;
  const payload = getAnnotationSelectionPayload(editor.state.doc, from, to);
  const title = payload.selectedText?.trim()
    || [payload.contextBefore, payload.contextAfter].filter(Boolean).join(' ').trim();
  return annotationAnchor(pageId, annotationId, title || undefined);
}

function findBlockInDoc(
  doc: ProseMirrorNode,
  blockId: string,
): { pos: number; node: ProseMirrorNode } | null {
  let match: { pos: number; node: ProseMirrorNode } | undefined
  doc.descendants((node, pos) => {
    if (node.isBlock && node.attrs?.blockId === blockId) {
      match = { pos, node }
      return false
    }
    return true
  })
  return match ?? null
}

export function buildBlockAnchor(
  editor: Editor,
  pageId: string,
  blockId: string,
): KnowledgeAnchor | null {
  const match = findBlockInDoc(editor.state.doc, blockId)
  if (!match) return null
  const { pos, node } = match
  const title = node.textContent.trim()
  if (node.type.name === 'heading') {
    return headingAnchor(pageId, blockId, title || undefined)
  }

  if (node.type.name === 'pdfExcerptBlock') {
    const fileName = String(node.attrs.fileName || 'PDF')
    const pdfPage = Number(node.attrs.startPage) || 1
    const label = title || fileName
    return pdfExcerptBlockAnchor(pageId, blockId, pdfPage, label || undefined)
  }

  if (node.type.spec.atom) {
    return blockAnchor(pageId, blockId, title || undefined)
  }

  const from = pos
  const to = pos + node.nodeSize
  const payload = getAnnotationSelectionPayload(editor.state.doc, from, to)
  const snapshotTitle = payload.selectedText?.trim() || title
  if (!snapshotTitle) return null

  return {
    kind: 'annotation',
    locator: `page:${pageId}:selection:${from}:${to}`,
    snapshot: { title: snapshotTitle, from, to, ephemeral: true },
  }
}

export function buildSelectionAnchor(
  editor: Editor,
  pageId: string,
): KnowledgeAnchor | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const payload = getAnnotationSelectionPayload(editor.state.doc, from, to);
  const title = payload.selectedText?.trim()
    || [payload.contextBefore, payload.contextAfter].filter(Boolean).join(' ').trim();
  if (!title) return null;
  const tempId = `selection:${from}:${to}`;
  return {
    kind: 'annotation',
    locator: `page:${pageId}:selection:${from}:${to}`,
    snapshot: { title, from, to, ephemeral: true },
  };
}

export function anchorLabel(anchor: KnowledgeAnchor): string {
  const snap = anchor.snapshot ?? {};
  const title = typeof snap.title === 'string' ? snap.title : '';
  if (title) return title;
  return parseLocator(anchor.locator).display;
}

export function parseLocator(locator: string): {
  kind: KnowledgeAnchorKind | 'resourceChapter' | 'unknown';
  pageId?: string;
  resourceItemId?: string;
  excerptId?: string;
  chapterId?: string;
  entityId?: string;
  blockId?: string;
  pdfPage?: number;
  from?: number;
  to?: number;
  display: string;
} {
  if (locator.startsWith('page:')) {
    const rest = locator.slice(5);
    const parts = rest.split(':');
    const pageId = parts[0];
    if (parts.length === 1) {
      return { kind: 'page', pageId, display: `页面 ${pageId}` };
    }
    const entityType = parts[1];
    if (entityType === 'block') {
      const blockId = parts[2];
      let pdfPage: number | undefined;
      if (parts[3] === 'pdfPage' && parts[4]) {
        const parsed = Number(parts[4]);
        if (Number.isFinite(parsed)) pdfPage = parsed;
      }
      const display = pdfPage != null ? `PDF 第 ${pdfPage} 页` : `块 ${blockId}`;
      return { kind: 'block', pageId, blockId, entityId: blockId, pdfPage, display };
    }
    const entityId = parts.slice(2).join(':');
    if (entityType === 'heading') return { kind: 'heading', pageId, entityId, display: `标题 ${entityId}` };
    if (entityType === 'annotation') return { kind: 'annotation', pageId, entityId, display: `标注 ${entityId}` };
    if (entityType === 'section') return { kind: 'section', pageId, entityId, display: `节 ${entityId}` };
    if (entityType === 'selection') {
      const from = Number(parts[2]);
      const to = Number(parts[3]);
      return { kind: 'annotation', pageId, display: '当前选区', from, to };
    }
    return { kind: 'unknown', pageId, display: locator };
  }
  if (locator.startsWith('resource:')) {
    const rest = locator.slice(9);
    const parts = rest.split(':');
    const itemId = parts[0];
    if (parts[1] === 'excerpt' && parts[2]) {
      return { kind: 'resourceExcerpt', resourceItemId: itemId, excerptId: parts[2], display: `节选 ${parts[2]}` };
    }
    if (parts[1] === 'chapter' && parts[2]) {
      return { kind: 'resourceChapter', resourceItemId: itemId, chapterId: parts[2], display: `章节 ${parts[2]}` };
    }
    return { kind: 'resourceItem', resourceItemId: itemId, display: `资源 ${itemId}` };
  }
  return { kind: 'unknown', display: locator };
}

export async function navigateKnowledgeAnchor(
  anchor: KnowledgeAnchor,
  handlers: KnowledgeAnchorNavigateHandlers,
): Promise<void> {
  const parsed = parseLocator(anchor.locator);
  if (parsed.kind === 'resourceItem' || parsed.kind === 'resourceExcerpt' || parsed.kind === 'resourceChapter') {
    await handlers.router.push({
      path: '/resources',
      query: {
        tab: 'items',
        itemId: parsed.resourceItemId,
        ...(parsed.excerptId ? { excerptId: parsed.excerptId } : {}),
        ...(parsed.chapterId ? { chapterId: parsed.chapterId } : {}),
      },
    });
    return;
  }

  if (!parsed.pageId) return;

  if (parsed.kind === 'page' || parsed.kind === 'heading' || parsed.kind === 'section') {
    if (handlers.currentPageId !== parsed.pageId) {
      await handlers.selectPage(parsed.pageId);
    }
    if (parsed.kind === 'heading' && parsed.entityId && handlers.scrollToHeading) {
      handlers.scrollToHeading(parsed.pageId, parsed.entityId);
    }
    return;
  }

  if (parsed.kind === 'block' && parsed.blockId) {
    if (handlers.currentPageId !== parsed.pageId) {
      await handlers.selectPage(parsed.pageId);
    }
    const snapshotPdfPage = anchor.snapshot?.pdfPage;
    const pdfPage = parsed.pdfPage
      ?? (typeof snapshotPdfPage === 'number' ? snapshotPdfPage : undefined);
    handlers.scrollToBlock?.(parsed.pageId, parsed.blockId, { pdfPage });
    return;
  }

  if (parsed.kind === 'annotation' && parsed.pageId) {
    if (handlers.currentPageId !== parsed.pageId) {
      await handlers.selectPage(parsed.pageId);
    }
    if (parsed.entityId?.startsWith('selection:') || (parsed.from != null && parsed.to != null)) {
      const from = parsed.from ?? Number(parsed.entityId?.split(':')[1]);
      const to = parsed.to ?? Number(parsed.entityId?.split(':')[2]);
      if (Number.isFinite(from) && Number.isFinite(to)) {
        handlers.scrollToSelection?.(parsed.pageId, from, to);
      }
      return;
    }
    if (parsed.entityId) {
      handlers.scrollToAnnotation?.(parsed.pageId, parsed.entityId);
    }
  }
}

export function annotationToAnchor(pageId: string, annotation: TextAnnotation): KnowledgeAnchor {
  const title = annotation.selectedText?.trim() || annotation.note?.trim();
  return annotationAnchor(pageId, annotation.id, title || undefined);
}

export async function navigateKnowledgePoint(
  pointId: string,
  handlers: KnowledgeAnchorNavigateHandlers,
): Promise<void> {
  const anchors = await listKnowledgePointAnchors(pointId);
  const primary = anchors.find((item) => item.primary) ?? anchors[0];
  if (!primary) return;
  await navigateKnowledgeAnchor(
    { kind: primary.kind, locator: primary.locator, snapshot: primary.snapshot },
    handlers,
  );
}

export function relationEndpointLabel(
  relation: KnowledgeRelation,
  direction: 'out' | 'in',
): string {
  const pointTitle = direction === 'out' ? relation.toPointTitle : relation.fromPointTitle;
  if (pointTitle) return pointTitle;
  const anchor = direction === 'out' ? relation.to : relation.from;
  if (anchor) return anchorLabel(anchor);
  return '未知知识点';
}
