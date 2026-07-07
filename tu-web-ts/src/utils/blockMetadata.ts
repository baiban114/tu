import type { Block, BlockMetadata, BlockTag } from '@/api/types';

const TAG_COLOR_PALETTE = [
  '#1677ff',
  '#13c2c2',
  '#52c41a',
  '#fa8c16',
  '#722ed1',
  '#eb2f96',
];

function createHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function normalizeTagLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

export function createTagId(label: string): string {
  const normalizedLabel = normalizeTagLabel(label).toLowerCase();
  return `tag-${createHash(normalizedLabel).slice(0, 8)}`;
}

export function createTagColor(label: string): string {
  const normalizedLabel = normalizeTagLabel(label);
  if (!normalizedLabel) return TAG_COLOR_PALETTE[0];

  let sum = 0;
  for (let index = 0; index < normalizedLabel.length; index += 1) {
    sum += normalizedLabel.charCodeAt(index);
  }

  return TAG_COLOR_PALETTE[sum % TAG_COLOR_PALETTE.length];
}

export function normalizeBlockTag(tag: Partial<BlockTag> | string): BlockTag | null {
  const label = typeof tag === 'string' ? tag : tag.label ?? '';
  const normalizedLabel = normalizeTagLabel(label);
  if (!normalizedLabel) return null;

  return {
    id: typeof tag === 'string' ? createTagId(normalizedLabel) : tag.id || createTagId(normalizedLabel),
    label: normalizedLabel,
    color: typeof tag === 'string' ? createTagColor(normalizedLabel) : tag.color || createTagColor(normalizedLabel),
  };
}

export function normalizeBlockTags(tags: Array<Partial<BlockTag> | string> | undefined | null): BlockTag[] {
  if (!Array.isArray(tags)) return [];

  const deduped = new Map<string, BlockTag>();
  tags.forEach((tag) => {
    const normalizedTag = normalizeBlockTag(tag);
    if (!normalizedTag) return;
    const dedupeKey = normalizeTagLabel(normalizedTag.label).toLowerCase();
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, normalizedTag);
    }
  });

  return Array.from(deduped.values());
}

export function getBlockMetadata(block: Block): BlockMetadata {
  return block.metadata ?? {};
}

export function getBlockTags(block: Block): BlockTag[] {
  return normalizeBlockTags(getBlockMetadata(block).tags);
}

export function setBlockTags(block: Block, tags: Array<Partial<BlockTag> | string>): Block {
  const normalizedTags = normalizeBlockTags(tags);
  const metadata: BlockMetadata = {
    ...getBlockMetadata(block),
    tags: normalizedTags,
  };

  return {
    ...block,
    metadata: metadata.tags?.length ? metadata : Object.keys(metadata).filter((key) => key !== 'tags').length ? metadata : undefined,
  };
}

export function collectBlockTags(blocks: Block[]): BlockTag[] {
  const deduped = new Map<string, BlockTag>();

  const visit = (items: Block[]) => {
    items.forEach((block) => {
      getBlockTags(block).forEach((tag) => {
        const dedupeKey = normalizeTagLabel(tag.label).toLowerCase();
        if (!deduped.has(dedupeKey)) {
          deduped.set(dedupeKey, tag);
        }
      });

      if (Array.isArray(block.children) && block.children.length > 0) {
        visit(block.children);
      }
    });
  };

  visit(blocks);
  return Array.from(deduped.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

export function blockHasTags(block: Block): boolean {
  return getBlockTags(block).length > 0;
}

export function collectTagsFromBlocksAndPage(
  blocks: Block[],
  pageTags: BlockTag[] | undefined | null,
): BlockTag[] {
  const blockTags = collectBlockTags(blocks);
  if (!pageTags?.length) return blockTags;
  const deduped = new Map<string, BlockTag>();
  for (const tag of pageTags) {
    const key = normalizeTagLabel(tag.label).toLowerCase();
    if (!deduped.has(key)) deduped.set(key, tag);
  }
  for (const tag of blockTags) {
    const key = normalizeTagLabel(tag.label).toLowerCase();
    if (!deduped.has(key)) deduped.set(key, tag);
  }
  return Array.from(deduped.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}
