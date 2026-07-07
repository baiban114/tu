import { Extension, type CommandProps } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Block } from '@/api/types'

export interface BlockActionsStorage {
  blocks: Block[]
  onBlockAction: (action: string, blockId: string) => void
  getBlockPosition: (blockId: string) => number | null
  getBlockById: (blockId: string) => Block | null
  createBlock: (type: string) => Block | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockActions: {
      insertBlockAfter: (block: Block, afterBlockId: string) => ReturnType
      insertBlockBefore: (block: Block, beforeBlockId: string) => ReturnType
      deleteBlock: (blockId: string) => ReturnType
      insertExternalBlockAfterPos: (block: Block, pos: number) => ReturnType
      insertExternalBlockAtSelection: (block: Block) => ReturnType
    }
  }
}

export const BlockActions = Extension.create({
  name: 'blockActions',

  addStorage(): BlockActionsStorage {
    return {
      blocks: [],
      onBlockAction: () => {},
      getBlockPosition: () => null,
      getBlockById: () => null,
      createBlock: () => null,
    }
  },

  addCommands() {
    return {
      insertBlockAfter: (block: Block, afterBlockId: string) => ({ tr, dispatch }: CommandProps) => {
        const pos = afterBlockId ? findNodePositionByBlockId(tr.doc, afterBlockId) : findLastTopLevelNodePosition(tr.doc)
        if (pos === null) return false

        const tipTapNode = blockToTipTapNode(block, this.editor)
        const insertPos = getTopLevelInsertPosAfter(tr.doc, pos)
        if (!tipTapNode || insertPos === null) return false

        if (dispatch) {
          tr.insert(insertPos, tipTapNode)
          tr.scrollIntoView()
        }
        return true
      },

      insertBlockBefore: (block: Block, beforeBlockId: string) => ({ tr, dispatch }: CommandProps) => {
        const pos = findNodePositionByBlockId(tr.doc, beforeBlockId)
        const tipTapNode = blockToTipTapNode(block, this.editor)
        if (pos === null || !tipTapNode) return false

        if (dispatch) {
          tr.insert(pos, tipTapNode)
          tr.scrollIntoView()
        }
        return true
      },

      deleteBlock: (blockId: string) => ({ tr, dispatch }: CommandProps) => {
        const pos = findNodePositionByBlockId(tr.doc, blockId)
        if (pos === null) return false

        const node = tr.doc.nodeAt(pos)
        if (!node) return false

        if (dispatch) {
          tr.delete(pos, pos + node.nodeSize)
          tr.scrollIntoView()
        }
        return true
      },

      insertExternalBlockAfterPos: (block: Block, pos: number) => ({ tr, dispatch }: CommandProps) => {
        const tipTapNode = blockToTipTapNode(block, this.editor)
        const insertPos = getTopLevelInsertPosAfter(tr.doc, pos)
        if (!tipTapNode || insertPos === null) return false

        if (dispatch) {
          tr.insert(insertPos, tipTapNode)
          tr.scrollIntoView()
        }
        return true
      },

      insertExternalBlockAtSelection: (block: Block) => ({ tr, dispatch }: CommandProps) => {
        const tipTapNode = blockToTipTapNode(block, this.editor)
        const insertPos = getTopLevelInsertPosAfter(tr.doc, tr.selection.from)
        if (!tipTapNode || insertPos === null) return false

        if (dispatch) {
          tr.insert(insertPos, tipTapNode)
          tr.scrollIntoView()
        }
        return true
      },
    }
  },
})

export function blockToTipTapNode(block: Block, editor: any) {
  const schema = editor.schema
  const attrs = { blockId: block.id, title: block.title || '' }

  switch (block.type) {
    case 'richtext':
    case 'richText':
      return schema.nodes.paragraph.create(attrs, block.content ? schema.text(block.content) : undefined)

    case 'x6':
      return schema.nodes.x6Block.create({
        ...attrs,
        graphData: block.graphData || { nodes: [], edges: [] },
        metadata: block.metadata || {},
      })

    case 'line':
      return schema.nodes.timelineBlock.create({
        ...attrs,
        timelineData: block.timelineData || [],
      })

    case 'ref':
      return schema.nodes.refBlock.create({
        ...attrs,
        refId: block.refId || '',
        refType: block.refType || 'block',
      })

    case 'externalResource':
      return schema.nodes.externalResourceBlock.create({
        ...attrs,
        width: block.width ?? null,
        height: block.height ?? null,
        externalResource: block.externalResource || {
          resourceItemId: '',
          resourceExcerptId: null,
          mode: 'resource',
          snapshot: { resourceTitle: '' },
        },
        metadata: block.metadata || {},
      })

    case 'spacer':
      return schema.nodes.spacerBlock.create({
        ...attrs,
        spacerHeight: block.spacerHeight || 40,
      })

    case 'table':
      return schema.nodes.tableBlock.create({
        ...attrs,
        width: block.width ?? null,
        height: block.height ?? null,
        tableData: block.tableData || { headers: [], rows: [] },
      })

    case 'multiTable':
      return schema.nodes.multiTableBlock.create({
        ...attrs,
        width: block.width ?? null,
        height: block.height ?? null,
        multiTableData: block.multiTableData || { fields: [], records: [], views: [] },
        metadata: block.metadata || {},
      })

    default:
      return schema.nodes.paragraph.create(attrs)
  }
}

function findNodePositionByBlockId(doc: ProseMirrorNode, blockId: string): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.attrs?.blockId === blockId) {
      found = pos
      return false
    }
    return true
  })
  return found
}

function findLastTopLevelNodePosition(doc: ProseMirrorNode): number | null {
  if (!doc.childCount) return null
  let pos = 0
  for (let index = 0; index < doc.childCount - 1; index += 1) {
    pos += doc.child(index).nodeSize
  }
  return pos
}

function getTopLevelInsertPosAfter(doc: ProseMirrorNode, pos: number): number | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const resolved = doc.resolve(clamped)
  if (resolved.depth < 1) {
    const node = resolved.nodeAfter
    return node ? resolved.pos + node.nodeSize : doc.content.size
  }
  return resolved.after(1)
}
