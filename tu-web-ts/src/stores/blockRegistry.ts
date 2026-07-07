import { reactive } from 'vue';
import { defineStore } from 'pinia';
import {
  listAllBlocks,
  updateBlock as updateBlockApi,
  updateBlockContent,
  updateBlockGraphData,
  type BlockWithMeta,
} from '@/api/page';
import type { Block, PageContent, EmbeddedObject } from '@/api/types';

const EMBED_RE = /<!--tu:embed\s+id="([^"]+)"\s+type="([^"]+)"\s*-->/g;

function pageContentToBlocks(pc: PageContent): Block[] {
  const blocks: Block[] = [];
  const embedById = new Map((pc.embeds || []).map((embed) => [embed.id, embed]));
  const usedEmbedIds = new Set<string>();

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  EMBED_RE.lastIndex = 0;

  while ((match = EMBED_RE.exec(pc.content || '')) !== null) {
    const textBefore = pc.content.slice(lastIndex, match.index);
    if (textBefore.trim()) {
      blocks.push({
        id: `page-content-${blocks.length}`,
        type: 'richtext',
        content: textBefore.trim(),
        metadata: { annotations: pc.annotations || [] },
      });
    }

    const embed = embedById.get(match[1]);
    if (embed && !usedEmbedIds.has(embed.id)) {
      blocks.push(embedToBlock(embed));
      usedEmbedIds.add(embed.id);
    }

    lastIndex = match.index + match[0].length;
  }

  const textAfter = (pc.content || '').slice(lastIndex);
  if (textAfter.trim()) {
    blocks.push({
      id: `page-content-${blocks.length}`,
      type: 'richtext',
      content: textAfter.trim(),
      metadata: { annotations: pc.annotations || [] },
    });
  }

  for (const embed of pc.embeds || []) {
    if (!usedEmbedIds.has(embed.id)) {
      blocks.push(embedToBlock(embed));
      usedEmbedIds.add(embed.id);
    }
  }

  return blocks;
}

function embedToBlock(embed: EmbeddedObject): Block {
  return {
    id: embed.id,
    type: embed.type,
    title: embed.title,
    graphData: embed.graphData,
    tableData: embed.tableData,
    multiTableData: embed.multiTableData,
    timelineData: embed.timelineData,
    refId: embed.refId,
    refType: embed.refType,
    externalResource: embed.externalResource,
    spacerHeight: embed.spacerHeight,
    width: embed.width,
    height: embed.height,
    metadata: embed.metadata,
  };
}

export const useBlockRegistryStore = defineStore('blockRegistry', () => {
  const registry = reactive(new Map<string, BlockWithMeta>());
  /** Track full block lists per pageId for TOC and other use-cases */
  const pageBlocks = reactive(new Map<string, Block[]>());

  async function loadAll() {
    const items = await listAllBlocks();
    registry.clear();
    pageBlocks.clear();
    for (const item of items) {
      registry.set(item.block.id, { ...item, block: { ...item.block } });
    }
  }

  /** @deprecated Use registerPageContent instead */
  function registerBlocks(blocks: Block[], pageId: string, pageTitle: string) {
    for (const block of blocks) {
      if (block.type === 'ref' || block.type === 'spacer') continue;
      registry.set(block.id, { block: { ...block }, pageId, pageTitle });
    }
    pageBlocks.set(pageId, blocks);
  }

  function registerPageContent(pc: PageContent, pageId: string, pageTitle: string) {
    const blocks = pageContentToBlocks(pc);
    pageBlocks.set(pageId, blocks);

    for (const embed of pc.embeds || []) {
      if (embed.type === 'ref' || embed.type === 'spacer') continue;
      const block = embedToBlock(embed);
      registry.set(embed.id, { block, pageId, pageTitle });
    }
  }

  function getBlock(id: string): Block | undefined {
    return registry.get(id)?.block;
  }

  function getPageBlocks(pageId: string): Block[] {
    return pageBlocks.get(pageId) ?? [];
  }

  function getMeta(id: string): BlockWithMeta | undefined {
    return registry.get(id);
  }

  async function updateContent(blockId: string, content: string) {
    const entry = registry.get(blockId);
    if (!entry) return;
    registry.set(blockId, { ...entry, block: { ...entry.block, content } });
    await updateBlockContent(entry.pageId, blockId, content);
  }

  async function updateGraphData(blockId: string, graphData: Block['graphData']) {
    const entry = registry.get(blockId);
    if (!entry) return;
    registry.set(blockId, { ...entry, block: { ...entry.block, graphData } });
    await updateBlockGraphData(entry.pageId, blockId, graphData);
  }

  async function updateBlock(blockId: string, patchOrBlock: Partial<Block>) {
    const entry = registry.get(blockId);
    if (!entry) return;
    const nextBlock = { ...entry.block, ...patchOrBlock, id: blockId };
    registry.set(blockId, { ...entry, block: nextBlock });
    await updateBlockApi(entry.pageId, blockId, nextBlock);
  }

  function getAllBlocks(): BlockWithMeta[] {
    return Array.from(registry.values());
  }

  function clear() {
    registry.clear();
    pageBlocks.clear();
  }

  return {
    registry,
    loadAll,
    registerBlocks,
    registerPageContent,
    getBlock,
    getPageBlocks,
    getMeta,
    updateBlock,
    updateContent,
    updateGraphData,
    getAllBlocks,
    clear,
  };
});
