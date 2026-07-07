import { describe, expect, it } from 'vitest';
import {
  anchorLabel,
  annotationAnchor,
  blockAnchor,
  pageAnchor,
  parseLocator,
  pdfExcerptBlockAnchor,
  resourceExcerptAnchor,
  sectionAnchor,
} from './knowledgeAnchor';

describe('knowledgeAnchor', () => {
  it('builds page locator', () => {
    expect(pageAnchor('p1', 'Hello').locator).toBe('page:p1');
    expect(pageAnchor('p1', 'Hello').snapshot?.title).toBe('Hello');
  });

  it('parses resource excerpt locator', () => {
    const parsed = parseLocator('resource:item1:excerpt:ex1');
    expect(parsed.kind).toBe('resourceExcerpt');
    expect(parsed.resourceItemId).toBe('item1');
    expect(parsed.excerptId).toBe('ex1');
  });

  it('uses snapshot title for label', () => {
    expect(anchorLabel(annotationAnchor('p1', 'a1', '选中文本'))).toBe('选中文本');
  });

  it('builds excerpt anchor', () => {
    expect(resourceExcerptAnchor('i1', 'e1').locator).toBe('resource:i1:excerpt:e1');
  });

  it('parses selection locator', () => {
    const parsed = parseLocator('page:p1:selection:12:34');
    expect(parsed.kind).toBe('annotation');
    expect(parsed.pageId).toBe('p1');
    expect(parsed.from).toBe(12);
    expect(parsed.to).toBe(34);
  });

  it('builds section anchor with section key', () => {
    expect(sectionAnchor('p1', 'local:blk', '节标题').locator).toBe('page:p1:section:local:blk');
  });

  it('builds block and pdf excerpt locators', () => {
    expect(blockAnchor('p1', 'pe-abc', 'PDF').locator).toBe('page:p1:block:pe-abc');
    expect(pdfExcerptBlockAnchor('p1', 'pe-abc', 5, 'book.pdf').locator).toBe(
      'page:p1:block:pe-abc:pdfPage:5',
    );
  });

  it('parses block locator with pdf page', () => {
    const parsed = parseLocator('page:p1:block:pe-abc:pdfPage:12');
    expect(parsed.kind).toBe('block');
    expect(parsed.pageId).toBe('p1');
    expect(parsed.blockId).toBe('pe-abc');
    expect(parsed.pdfPage).toBe(12);
  });
});
