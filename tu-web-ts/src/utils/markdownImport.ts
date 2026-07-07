import type { Block, EmbeddedObject, PageContent } from '@/api/types';
import { blockHasTags } from '@/utils/blockMetadata';

const CUSTOM_BLOCK_FENCE = 'tu-block';
const EMBED_RE = /<!--tu:embed\s+id="([^"]+)"\s+type="([^"]+)"\s*-->/g;

function sanitizeLineEndings(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function createHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function createBlockId(sourceKey: string, chunk: string, index: number): string {
  return `md-${sourceKey}-${index}-${createHash(chunk).slice(0, 8)}`;
}

function normalizeChunk(chunk: string): string {
  return chunk.trim().replace(/\n{3,}/g, '\n\n');
}

function stripTransientBlockFields(block: Block): Block {
  const { blockHeight, source, sourceChunkIndex, ...rest } = block;
  const normalizedChildren = Array.isArray(rest.children)
    ? rest.children.map((child) => stripTransientBlockFields(child))
    : rest.children;

  return {
    ...rest,
    ...(normalizedChildren ? { children: normalizedChildren } : {}),
  };
}

function parseCustomBlockChunk(chunk: string, sourceKey: string, index: number): Block | null {
  const match = chunk.match(/^```tu-block\s*\n([\s\S]*?)\n```$/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as Block;
    return {
      ...parsed,
      id: typeof parsed.id === 'string' && parsed.id.trim()
        ? parsed.id
        : createBlockId(sourceKey, chunk, index),
      type: parsed.type === 'richText' ? 'richtext' : parsed.type,
    };
  } catch {
    return null;
  }
}

function splitMarkdownIntoChunks(markdown: string): string[] {
  const normalized = sanitizeLineEndings(markdown);
  const lines = normalized.split('\n');
  const chunks: string[] = [];
  let buffer: string[] = [];
  let inCodeFence = false;

  const flush = () => {
    if (buffer.length === 0) return;
    const chunk = normalizeChunk(buffer.join('\n'));
    if (chunk) {
      chunks.push(chunk);
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCodeFence && buffer.length > 0) {
        flush();
      }
      buffer.push(line);
      inCodeFence = !inCodeFence;
      if (!inCodeFence) {
        flush();
      }
      continue;
    }

    if (inCodeFence) {
      buffer.push(line);
      continue;
    }

    if (!trimmed) {
      flush();
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed) && buffer.length > 0) {
      flush();
    }

    buffer.push(line);
  }

  flush();
  return chunks;
}

export function deriveMarkdownPageTitle(fileName: string): string {
  const title = fileName.replace(/\.(md|markdown)$/i, '').trim();
  return title || 'Imported Markdown';
}

function serializeRichTextBlock(block: Block): string {
  if (blockHasTags(block)) {
    return serializeStructuredBlock({
      ...block,
      type: 'richtext',
    });
  }

  return sanitizeLineEndings(String(block.content ?? '')).trim();
}

function serializeStructuredBlock(block: Block): string {
  const normalizedBlock = stripTransientBlockFields(block);
  return [
    `\`\`\`${CUSTOM_BLOCK_FENCE}`,
    JSON.stringify(normalizedBlock, null, 2),
    '```',
  ].join('\n');
}

/** @deprecated Use serializePageContentToMarkdown instead */
export function serializeBlocksToMarkdown(blocks: Block[]): string {
  const chunks = blocks
    .map((block) => {
      const normalizedType = block.type === 'richText' ? 'richtext' : block.type;
      if (normalizedType === 'spacer') return '';
      if (normalizedType === 'richtext') {
        return serializeRichTextBlock(block);
      }
      return serializeStructuredBlock({
        ...block,
        type: normalizedType,
      });
    })
    .filter((chunk) => chunk.trim().length > 0);

  return chunks.join('\n\n');
}

/** @deprecated Use parseMarkdownToPageContent instead */
export function parseMarkdownToBlocks(markdown: string, sourceKey = Date.now().toString(36)): Block[] {
  const chunks = splitMarkdownIntoChunks(markdown);
  if (chunks.length === 0) {
    return [
      {
        id: createBlockId(sourceKey, 'empty', 0),
        type: 'richtext',
        content: '',
      },
    ];
  }

  return chunks.map((chunk, index) => {
    const customBlock = parseCustomBlockChunk(chunk, sourceKey, index);
    if (customBlock) {
      return customBlock;
    }

    return {
      id: createBlockId(sourceKey, chunk, index),
      type: 'richtext',
      content: chunk,
      source: 'markdown-import',
      sourceChunkIndex: index,
    };
  });
}

// ─── New Public API ─────────────────────────────────────────────────────────

/**
 * Parse a plain markdown string into PageContent.
 * Handles both old-style ```tu-block fences and new-style <!--tu:embed--> placeholders.
 */
export function parseMarkdownToPageContent(markdown: string): PageContent {
  const normalized = sanitizeLineEndings(markdown)
  const embeds: EmbeddedObject[] = []
  let embedCount = 0

  // Replace old-style ```tu-block fences with <!--tu:embed--> placeholders
  const converted = normalized.replace(
    /```tu-block\s*\n([\s\S]*?)\n```/g,
    (_match, jsonStr: string) => {
      try {
        const block = JSON.parse(jsonStr) as Block
        const id = block.id || `embed-${Date.now()}-${embedCount++}`
        embeds.push({
          id,
          type: block.type as EmbeddedObject['type'],
          title: block.title,
          graphData: block.graphData,
          tableData: block.tableData,
          multiTableData: block.multiTableData,
          timelineData: block.timelineData,
          refId: block.refId,
          refType: block.refType,
          externalResource: block.externalResource,
          spacerHeight: block.spacerHeight,
          width: block.width,
          height: block.height,
          metadata: block.metadata,
        })
        return `<!--tu:embed id="${id}" type="${block.type}"-->`
      } catch {
        return _match
      }
    },
  )

  // Collect annotations (currently none from markdown import)
  return {
    content: converted.trim(),
    embeds,
    annotations: [],
  }
}

/**
 * Serialize PageContent to a plain markdown string.
 * Embed objects become <!--tu:embed--> placeholders in the markdown.
 */
export function serializePageContentToMarkdown(pc: PageContent): string {
  if (!pc.embeds.length) return pc.content

  // Replace embed placeholders with their actual content for clean export.
  // If the embed has no rich text representation, keep the placeholder.
  let result = pc.content

  for (const embed of pc.embeds) {
    const placeholder = `<!--tu:embed id="${embed.id}" type="${embed.type}"-->`
    // Keep placeholder in the markdown — it will be resolved by the editor
  }

  return result
}
