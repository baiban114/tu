import { syncBlocks, syncBlock } from '@/api/blockSync';
import type { BlockSyncPayload } from '@/api/blockSync';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
type StatusChangeCallback = (status: SyncStatus, error?: string | null) => void;

export class BlockSyncManager {
  private blocks: BlockSyncPayload[] = [];
  private pageId: string | null = null;
  private syncStatus: SyncStatus = 'idle';
  private syncError: string | null = null;
  private debounceTimer: number | null = null;
  private debounceDelay = 500;
  private statusChangeCallback: StatusChangeCallback | null = null;

  constructor(initialBlocks: BlockSyncPayload[] = []) {
    this.blocks = initialBlocks;
  }

  onStatusChange(callback: StatusChangeCallback): void {
    this.statusChangeCallback = callback;
  }

  getStatus(): SyncStatus {
    return this.syncStatus;
  }

  getError(): string | null {
    return this.syncError;
  }

  setPageId(pageId: string | null): void {
    this.pageId = pageId;
  }

  private setStatus(status: SyncStatus, error: string | null = null): void {
    this.syncStatus = status;
    this.syncError = error;
    this.statusChangeCallback?.(status, error);
  }

  updateBlocks(blocks: BlockSyncPayload[]): void {
    this.blocks = blocks;
    this.debounceSync();
  }

  private debounceSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(async () => {
      await this.sync();
    }, this.debounceDelay);
  }

  async sync(): Promise<void> {
    if (this.syncStatus === 'syncing') {
      return;
    }

    if (!this.pageId) {
      this.setStatus('idle');
      return;
    }

    this.setStatus('syncing');

    try {
      await syncBlocks(this.pageId, this.blocks);
      this.setStatus('synced');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '同步失败';
      console.error('同步块失败', error);
      this.setStatus('error', msg);
    }
  }

  async syncSingleBlock(block: BlockSyncPayload): Promise<void> {
    if (!this.pageId) {
      this.setStatus('idle');
      return;
    }

    this.setStatus('syncing');

    try {
      await syncBlock(this.pageId, block);
      this.setStatus('synced');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '同步失败';
      console.error('同步单个块失败', error);
      this.setStatus('error', msg);
    }
  }

  async forceSync(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.sync();
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export const blockSyncManager = new BlockSyncManager();

