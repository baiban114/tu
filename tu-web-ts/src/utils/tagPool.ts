import type { Block, BlockTag } from '@/api/types'
import { listAllBlocks } from '@/api/page'
import { isMockDataSource } from '@/dev/dataSource'
import { collectKbTagsMock } from '@/mock/store'
import { collectBlockTags, collectTagsFromBlocksAndPage } from '@/utils/blockMetadata'
import { mergeTagPools } from '@/utils/pageMetadata'

export function collectAvailableTags(
  blocks: Block[],
  pageTags: BlockTag[],
  extraPools: BlockTag[][] = [],
  sectionTags: BlockTag[] = [],
): BlockTag[] {
  const current = collectTagsFromBlocksAndPage(blocks, pageTags)
  return mergeTagPools(current, sectionTags, ...extraPools)
}

export async function fetchKbTagPool(kbId: string | null | undefined): Promise<BlockTag[]> {
  if (!kbId) return []

  if (isMockDataSource()) {
    return collectKbTagsMock(kbId)
  }

  const items = await listAllBlocks()
  const blocks = items.map((item) => item.block)
  return collectBlockTags(blocks)
}
