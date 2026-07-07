import type {
  BlockOutlineResponse,
  ContentTreeNode,
  OutlineBatchRequest,
  OutlineBatchResponse,
  PageOutlineResponse,
} from '@/api/outline';
import type { Block, PageContent } from '@/api/types';
import {
  buildHeadingTree,
  extractRichTextHeadingsFromBlocks,
  type FlatTocEntry,
  type TocTreeItem,
} from '@/utils/toc/headings';
import { withTotalEstimatedHours } from '@/utils/tree/hours';

function stableNodeId(scopeId: string, sourceBlockId: string, level: number, title: string): string {
  const payload = `${scopeId}\0${sourceBlockId}\0${level}\0${title.trim().toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
  }
  return `ctn-${Math.abs(hash).toString(36)}`;
}

function blockPreviewLabel(block: Block): string {
  if (block.title?.trim()) return block.title.trim();
  if (block.type === 'x6') return '画板';
  if (block.type === 'table') return '表格';
  if (block.type === 'line') return '时间轴';
  if (block.type === 'externalResource') {
    return block.externalResource?.snapshot?.excerptTitle
      || block.externalResource?.snapshot?.resourceTitle
      || '外部资源';
  }
  if (block.type === 'richtext' || block.type === 'richText') {
    const plain = (block.content ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[#*`>\-_\[\]]/g, '')
      .trim();
    if (plain) return plain.length > 40 ? `${plain.slice(0, 40)}…` : plain;
  }
  return block.type;
}

function previewText(block: Block): string | null {
  if (block.type === 'richtext' || block.type === 'richText') {
    const plain = (block.content ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[#*`>\-_\[\]]/g, '')
      .trim();
    if (!plain) return null;
    return plain.length > 200 ? `${plain.slice(0, 200)}…` : plain;
  }
  const label = blockPreviewLabel(block);
  return label === block.type ? null : label;
}

function flattenBlocks(blocks: Block[]): Block[] {
  const result: Block[] = [];
  const walk = (list: Block[]) => {
    list.forEach((block) => {
      result.push(block);
      if (block.children) walk(block.children);
    });
  };
  walk(blocks);
  return result;
}

function buildOutlineFlat(pageId: string, blocks: Block[]): FlatTocEntry[] {
  const headings = extractRichTextHeadingsFromBlocks(blocks);
  if (headings.length === 0) {
    return blocks.map((block, index) => ({
      id: stableNodeId(pageId, block.id, 2, blockPreviewLabel(block)),
      blockId: block.id,
      level: 2,
      text: blockPreviewLabel(block),
      pos: 0,
      sortIndex: index + 1,
      sourceType: 'ref-doc-block' as const,
    }));
  }

  const flat: FlatTocEntry[] = [];
  const stack: Array<{ nodeId: string; level: number }> = [];
  headings.forEach((heading, index) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }
    const nodeId = stableNodeId(pageId, heading.blockId, heading.level, heading.text);
    flat.push({
      id: nodeId,
      blockId: heading.blockId,
      level: heading.level,
      text: heading.text,
      pos: 0,
      sortIndex: index + 1,
      sourceType: 'ref-child',
      contentTreeNodeId: nodeId,
    });
    stack.push({ nodeId, level: heading.level });
  });
  return flat;
}

function flatToTreeNodes(
  pageId: string,
  blocks: Block[],
  flat: FlatTocEntry[],
  hoursByNodeId: Record<string, number | null | undefined>,
): ContentTreeNode[] {
  const tree = buildHeadingTree(flat.filter((entry) => entry.sourceType === 'ref-child'));
  const blockById = new Map(flattenBlocks(blocks).map((block) => [block.id, block]));
  const nodes: ContentTreeNode[] = [];

  const walk = (items: TocTreeItem[], parentId: string | null, sortStart: number) => {
    items.forEach((item, index) => {
      const block = blockById.get(item.blockId);
      const nodeId = item.id;
      nodes.push({
        id: nodeId,
        scopeType: 'page',
        scopeId: pageId,
        parentId,
        title: item.text,
        sortOrder: sortStart + index,
        estimatedHours: hoursByNodeId[nodeId] ?? null,
        totalEstimatedHours: null,
        sourceBlockId: item.blockId,
        level: item.level,
        sourceType: item.sourceType,
        previewText: block ? previewText(block) : null,
        blockType: block?.type ?? null,
      });
      if (item.children?.length) {
        walk(item.children, nodeId, 0);
      }
    });
  };

  walk(tree, null, 0);

  flat
    .filter((entry) => entry.sourceType === 'ref-doc-block')
    .forEach((entry, index) => {
      const block = blockById.get(entry.blockId);
      nodes.push({
        id: entry.id,
        scopeType: 'page',
        scopeId: pageId,
        parentId: null,
        title: entry.text,
        sortOrder: nodes.length + index,
        estimatedHours: hoursByNodeId[entry.id] ?? null,
        totalEstimatedHours: null,
        sourceBlockId: entry.blockId,
        level: entry.level,
        sourceType: entry.sourceType,
        previewText: block ? previewText(block) : null,
        blockType: block?.type ?? null,
      });
    });

  return withTotalEstimatedHours(nodes).map((node) => ({
    ...node,
    totalEstimatedHours: node.totalEstimatedHours,
  }));
}

export function buildMockPageOutline(
  pageId: string,
  kbId: string,
  pageTitle: string,
  blocks: Block[],
  hoursByNodeId: Record<string, number | null | undefined>,
): PageOutlineResponse {
  const flat = buildOutlineFlat(pageId, blocks);
  const nodes = flatToTreeNodes(pageId, blocks, flat, hoursByNodeId);
  return { pageId, kbId, pageTitle, nodes };
}

export function buildMockBlockOutline(
  blockId: string,
  pageId: string,
  blocks: Block[],
  hoursByNodeId: Record<string, number | null | undefined>,
): BlockOutlineResponse {
  const target = flattenBlocks(blocks).find((block) => block.id === blockId);
  if (!target) {
    return { blockId, pageId, nodes: [] };
  }
  const flat = buildOutlineFlat(pageId, [target]);
  return {
    blockId,
    pageId,
    nodes: flatToTreeNodes(pageId, [target], flat, hoursByNodeId),
  };
}

export function buildMockBatchResponse(
  request: OutlineBatchRequest,
  resolvePage: (pageId: string) => PageOutlineResponse | null,
  resolveBlock: (blockId: string) => BlockOutlineResponse | null,
): OutlineBatchResponse {
  const pages = (request.pageIds ?? [])
    .map((pageId) => resolvePage(pageId))
    .filter((item): item is PageOutlineResponse => item != null);
  const blocks = (request.blockIds ?? [])
    .map((blockId) => resolveBlock(blockId))
    .filter((item): item is BlockOutlineResponse => item != null);
  return { pages, blocks };
}

export function pageContentToBlocks(pc: PageContent): Block[] {
  const blocks: Block[] = [];
  const embedById = new Map((pc.embeds ?? []).map((embed) => [embed.id, embed]));

  const pushBlockFromEmbed = (embed: NonNullable<PageContent['embeds']>[number]) => {
    blocks.push({
      id: embed.id,
      type: embed.type as Block['type'],
      title: embed.title,
      graphData: embed.graphData,
      tableData: embed.tableData,
      multiTableData: embed.multiTableData,
      timelineData: embed.timelineData,
      refId: embed.refId,
      refType: embed.refType,
      externalResource: embed.externalResource,
      spacerHeight: embed.spacerHeight,
      metadata: embed.metadata,
    });
  };

  const content = pc.content ?? '';
  const embedPattern = /<!--tu:embed id="([^"]+)" type="([^"]+)"-->/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = embedPattern.exec(content)) !== null) {
    const markdown = content.slice(lastIndex, match.index).trim();
    if (markdown) {
      blocks.push({
        id: `rt-${match.index}`,
        type: 'richtext',
        content: markdown,
      });
    }
    const embed = embedById.get(match[1]);
    if (embed) pushBlockFromEmbed(embed);
    lastIndex = match.index + match[0].length;
  }
  const tail = content.slice(lastIndex).trim();
  if (tail) {
    blocks.push({
      id: `rt-tail-${lastIndex}`,
      type: 'richtext',
      content: tail,
    });
  }
  if (blocks.length === 0 && pc.embeds?.length) {
    pc.embeds.forEach(pushBlockFromEmbed);
  }
  return blocks;
}
