import { describe, expect, it } from 'vitest';
import type { ContentTreeNode } from '@/api/outline';
import type { PageItem } from '@/api/types';
import {
  contentOutlineToTreeNodes,
  isOutlineTreeNode,
  mergeDocumentOutlinesIntoPageTree,
  outlineNodeTreeId,
  type PageTreeDisplayItem,
} from './outline';

describe('outline tree adapter', () => {
  it('builds nested outline tree from flat nodes', () => {
    const nodes: ContentTreeNode[] = [
      {
        id: 'h1',
        scopeType: 'page',
        scopeId: 'p1',
        parentId: null,
        title: '第一章',
        sortOrder: 0,
        estimatedHours: null,
        totalEstimatedHours: null,
        level: 1,
      },
      {
        id: 'h2',
        scopeType: 'page',
        scopeId: 'p1',
        parentId: 'h1',
        title: '第一节',
        sortOrder: 1,
        estimatedHours: null,
        totalEstimatedHours: null,
        level: 2,
      },
    ];

    const tree = contentOutlineToTreeNodes('p1', nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(outlineNodeTreeId('p1', 'h1'));
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children?.[0].label).toBe('第一节');
  });

  it('merges outline children under document pages', () => {
    const pages: PageItem[] = [{
      id: 'p1',
      kbId: 'kb1',
      parentId: null,
      title: '文档',
      order: 0,
      pageType: 'document',
    }];

    const merged = mergeDocumentOutlinesIntoPageTree(pages, {
      isOutlineExpanded: () => true,
      getOutlineNodes: () => [{
        id: 'h1',
        scopeType: 'page',
        scopeId: 'p1',
        parentId: null,
        title: '标题',
        sortOrder: 0,
        estimatedHours: null,
        totalEstimatedHours: null,
        level: 1,
      }],
    });

    expect(merged[0].children).toHaveLength(1);
    expect(isOutlineTreeNode(merged[0].children?.[0])).toBe(true);
    expect(merged[0].children?.[0].title).toBe('标题');
  });

  it('adds placeholder when outline not loaded', () => {
    const pages: PageItem[] = [{
      id: 'p1',
      kbId: 'kb1',
      parentId: null,
      title: '文档',
      order: 0,
      pageType: 'document',
    }];

    const merged = mergeDocumentOutlinesIntoPageTree(pages, {
      isOutlineExpanded: () => true,
      getOutlineNodes: () => undefined,
    });

    expect(merged[0].children).toHaveLength(1);
    expect((merged[0].children?.[0] as PageTreeDisplayItem).nodeKind).toBe('outline-placeholder');
  });
});
