import { defineStore } from 'pinia';
import {
  batchOutlines,
  getBlockOutline,
  getPageOutline,
  patchContentTreeNodeHours,
  type BlockOutlineResponse,
  type ContentTreeNode,
  type PageOutlineResponse,
} from '@/api/outline';

export const useOutlineCacheStore = defineStore('outlineCache', {
  state: () => ({
    pages: new Map<string, PageOutlineResponse>(),
    blocks: new Map<string, BlockOutlineResponse>(),
    inflightLoads: new Map<string, Promise<ContentTreeNode[]>>(),
  }),

  actions: {
    getPageNodes(pageId: string): ContentTreeNode[] | undefined {
      return this.pages.get(pageId)?.nodes;
    },

    getBlockNodes(blockId: string): ContentTreeNode[] | undefined {
      return this.blocks.get(blockId)?.nodes;
    },

    async ensurePageOutline(pageId: string, options?: { force?: boolean }): Promise<ContentTreeNode[]> {
      const force = options?.force ?? false;
      const key = `page:${pageId}`;

      if (!force) {
        const existing = this.pages.get(pageId);
        if (existing) return existing.nodes;
        const inflight = this.inflightLoads.get(key);
        if (inflight) return inflight;
      } else {
        this.pages.delete(pageId);
        this.inflightLoads.delete(key);
      }

      const loadPromise = (async () => {
        const response = await getPageOutline(pageId);
        this.pages.set(pageId, response);
        return response.nodes;
      })();

      this.inflightLoads.set(key, loadPromise);
      try {
        return await loadPromise;
      } finally {
        if (this.inflightLoads.get(key) === loadPromise) {
          this.inflightLoads.delete(key);
        }
      }
    },

    async ensureBlockOutline(blockId: string, options?: { force?: boolean }): Promise<ContentTreeNode[]> {
      const force = options?.force ?? false;
      const key = `block:${blockId}`;

      if (!force) {
        const existing = this.blocks.get(blockId);
        if (existing) return existing.nodes;
        const inflight = this.inflightLoads.get(key);
        if (inflight) return inflight;
      } else {
        this.blocks.delete(blockId);
        this.inflightLoads.delete(key);
      }

      const loadPromise = (async () => {
        const response = await getBlockOutline(blockId);
        this.blocks.set(blockId, response);
        return response.nodes;
      })();

      this.inflightLoads.set(key, loadPromise);
      try {
        return await loadPromise;
      } finally {
        if (this.inflightLoads.get(key) === loadPromise) {
          this.inflightLoads.delete(key);
        }
      }
    },

    async prefetchBatch(pageIds: string[], blockIds: string[]): Promise<void> {
      const missingPageIds = pageIds.filter((id) => id && !this.pages.has(id));
      const missingBlockIds = blockIds.filter((id) => id && !this.blocks.has(id));
      if (missingPageIds.length === 0 && missingBlockIds.length === 0) return;

      const response = await batchOutlines({
        pageIds: missingPageIds,
        blockIds: missingBlockIds,
      });
      response.pages.forEach((page) => this.pages.set(page.pageId, page));
      response.blocks.forEach((block) => this.blocks.set(block.blockId, block));
    },

    async updateEstimatedHours(nodeId: string, estimatedHours: number | null): Promise<ContentTreeNode> {
      const updated = await patchContentTreeNodeHours(nodeId, estimatedHours);
      for (const [pageId, page] of this.pages.entries()) {
        const index = page.nodes.findIndex((node) => node.id === nodeId);
        if (index >= 0) {
          const nodes = [...page.nodes];
          nodes[index] = updated;
          this.pages.set(pageId, { ...page, nodes });
        }
      }
      for (const [blockId, block] of this.blocks.entries()) {
        const index = block.nodes.findIndex((node) => node.id === nodeId);
        if (index >= 0) {
          const nodes = [...block.nodes];
          nodes[index] = updated;
          this.blocks.set(blockId, { ...block, nodes });
        }
      }
      return updated;
    },
  },
});
