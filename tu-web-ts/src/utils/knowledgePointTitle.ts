/**
 * Knowledge point titles derived from marked content should not carry outline ordinals;
 * semantic order is defined by point placement (parentId / sortOrder).
 */

const LEADING_ORDINAL =
  /^(?:(?:\d+(?:\.\d+)+\s+)|(?:\d+(?:\.\d+)*)\s*[.．、)\]）］]\s*|[（(]\s*\d+\s*[）)]\s*|[一二三四五六七八九十百千零〇两]+\s*[、．.]\s*|[（(]\s*[一二三四五六七八九十百千零〇两]+\s*[）)]\s*|第[一二三四五六七八九十百千零〇两\d]+\s*[章节条款部分篇回]\s*|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*)+/u

/** Strip leading outline ordinals (1. / 一、 / 第1章 / ① …). Keeps original if strip would empty. */
export function stripKnowledgePointOrdinalPrefix(raw: string): string {
  let text = raw.trim()
  if (!text) return text
  let guard = 0
  while (guard < 8) {
    guard += 1
    const next = text.replace(LEADING_ORDINAL, '').trim()
    if (!next || next === text) break
    text = next
  }
  return text
}

/** Preprocess content text into a knowledge-point title. */
export function normalizeKnowledgePointTitleFromContent(
  raw: string | null | undefined,
  fallback = '未命名知识点',
): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return fallback
  const stripped = stripKnowledgePointOrdinalPrefix(trimmed)
  return stripped || fallback
}
