<script setup lang="ts">
import { computed, inject, onMounted, provide, ref, unref, watch, type Ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'
import ReferencedBlockRenderer from '@/components/ReferencedBlockRenderer.vue'
import ExternalResourceExcerptMeta from '@/components/ExternalResourceExcerptMeta.vue'
import TuEditor from '@/components/TuEditor.vue'
import X6Component from '@/components/X6Component.vue'
import TableBlock from '@/components/TableBlock.vue'
import { getPageContent } from '@/api/page'
import type { Block, PageContent } from '@/api/types'
import { tipTapToBlocks } from '@/editor/converters'
import { isV2PageContent, resolvePageDocument } from '@/editor/pageDocument'
import { useBlockRegistryStore } from '@/stores/blockRegistry'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  applyRefContentHeadingShift,
  clampHeadingLevel,
  findParentHeadingLevel,
} from '@/utils/toc/headings'
import { REF_GUTTER_DELEGATE_KEY, REF_GUTTER_HOST_KEY, type RefGutterHostContext } from '@/editor/refGutterBridge'
import { useRefGutterForwarding, type ExposedTuEditor } from '@/composables/useRefGutterForwarding'

interface CompoundBadge {
  annotationId: string
  color: string
}

const props = defineProps(nodeViewProps)

const compoundAnnotationBadges = inject<Record<string, CompoundBadge[]> | Ref<Record<string, CompoundBadge[]>>>('compoundAnnotationBadges', {})
const onCompoundBadgeClick = inject<((blockId: string, annotationId: string, event: MouseEvent) => void)>('onCompoundBadgeClick', () => {})

const blockId = computed(() => props.node.attrs.blockId || '')
const compoundBadges = computed(() => unref(compoundAnnotationBadges)[blockId.value] || [])

const handleBadgeClick = (bid: string, annotationId: string, event: MouseEvent) => {
  onCompoundBadgeClick(bid, annotationId, event)
}

const registryStore = useBlockRegistryStore()
const workspaceStore = useWorkspaceStore()
const pageBlocks = ref<Block[]>([])
const loading = ref(false)
const error = ref('')

const refId = computed(() => String(props.node.attrs.refId ?? ''))
const refType = computed<'block' | 'page'>(() => props.node.attrs.refType === 'page' ? 'page' : 'block')
const referencedBlock = computed(() => refType.value === 'block' ? registryStore.getBlock(refId.value) : undefined)

/** Compute effective heading offset and apply it to the given blocks. */
function withShiftedHeadings(blocks: Block[]): Block[] {
  const parentLevel = referencedContentParentLevel.value
  return applyRefContentHeadingShift(blocks, parentLevel)
}

const shiftedPageBlocks = computed(() => withShiftedHeadings(pageBlocks.value))
const shiftedReferencedBlock = computed(() => {
  const block = referencedBlock.value
  if (!block) return undefined
  return withShiftedHeadings([block])[0]
})

/** Find the nearest preceding heading level in the editor doc. */
const parentHeadingLevel = computed(() => {
  const editor = props.editor
  if (!editor) return 0
  const pos = typeof props.getPos === 'function' ? props.getPos() : null
  if (pos == null) return 0
  return findParentHeadingLevel(editor.state.doc, pos)
})

const pageTitle = computed(() => {
  const find = (items: Array<{ id: string; title: string; children?: any[] }>): string | null => {
    for (const item of items) {
      if (item.id === refId.value) return item.title
      const nested = item.children?.length ? find(item.children) : null
      if (nested) return nested
    }
    return null
  }
  return find(workspaceStore.pageTree) ?? '未知页面'
})

const tocSettings = computed(() => (props.node.attrs.metadata as any)?.tocSettings ?? null)
const headingLevel = computed(() => {
  if (tocSettings.value?.hideTitle) return 0
  const explicitLevel = Number(props.node.attrs.headingLevel || tocSettings.value?.titleLevel || 0)
  if (explicitLevel > 0) return clampHeadingLevel(explicitLevel)
  return clampHeadingLevel(parentHeadingLevel.value + 1)
})
const headingText = computed(() => {
  if (tocSettings.value?.hideTitle) return ''
  if (props.node.attrs.title) return props.node.attrs.title
  if (refType.value === 'page') return pageTitle.value
  return registryStore.getMeta(refId.value)?.pageTitle ?? '引用'
})
const referencedContentParentLevel = computed(() => {
  return headingLevel.value > 0 ? headingLevel.value : parentHeadingLevel.value
})

const refGutterHost = computed<RefGutterHostContext>(() => ({
  hostBlockId: blockId.value,
  refId: refId.value,
  refType: refType.value,
  contentParentLevel: referencedContentParentLevel.value,
}))

provide(REF_GUTTER_HOST_KEY, refGutterHost)

const {
  forwardLineAnnotate: forwardLineAnnotateDefault,
  forwardMarkExcerpt: forwardMarkExcerptDefault,
  forwardSetBasis: forwardSetBasisDefault,
  forwardCreateKnowledgeRelation: forwardCreateKnowledgeRelationDefault,
} = useRefGutterForwarding()

const refGutterDelegate = inject(REF_GUTTER_DELEGATE_KEY, null)

const nestedEditorsByBlockId = ref<Record<string, ExposedTuEditor>>({})

const setNestedEditorRef = (pageBlockId: string, el: unknown) => {
  if (el && typeof el === 'object' && 'editor' in el) {
    nestedEditorsByBlockId.value[pageBlockId] = el as ExposedTuEditor
    return
  }
  delete nestedEditorsByBlockId.value[pageBlockId]
}

const forwardRefGutterAction = (
  pageBlockId: string,
  innerBlockId: string,
  action: 'annotate' | 'mark-excerpt' | 'set-basis' | 'knowledge-relation',
) => {
  const innerEditor = unref(nestedEditorsByBlockId.value[pageBlockId]?.editor) ?? null
  const host = refGutterHost.value
  if (!innerEditor || !host || !refGutterDelegate) {
    if (action === 'annotate') forwardLineAnnotateDefault(innerBlockId)
    else if (action === 'mark-excerpt') forwardMarkExcerptDefault(innerBlockId)
    else if (action === 'set-basis') forwardSetBasisDefault(innerBlockId)
    else forwardCreateKnowledgeRelationDefault(innerBlockId)
    return
  }

  switch (action) {
    case 'annotate':
      refGutterDelegate.onLineAnnotate(host, innerBlockId, innerEditor)
      break
    case 'mark-excerpt':
      refGutterDelegate.onMarkExcerpt(host, innerBlockId, innerEditor)
      break
    case 'set-basis':
      refGutterDelegate.onSetBasis(host, innerBlockId, innerEditor)
      break
    case 'knowledge-relation':
      refGutterDelegate.onCreateKnowledgeRelation(host, innerBlockId, innerEditor)
      break
  }
}

const isRichTextBlock = (block: Block): boolean => block.type === 'richtext' || block.type === 'richText'

const getExternalResourceExcerptBlocks = (block: Block): Block[] | null => {
  const excerptText = block.externalResource?.snapshot?.excerptText?.trim()
  if (block.type !== 'externalResource' || !excerptText) return null
  return [{ id: block.id, type: 'richtext', content: excerptText }]
}

const renderFallbackText = (block: Block): string => {
  if (block.type === 'x6') return block.title?.trim() || '画板'
  if (block.type === 'table') return block.title?.trim() || '表格'
  if (block.type === 'line') return block.title?.trim() || '时间轴'
  if (block.type === 'externalResource') {
    return block.externalResource?.snapshot?.excerptTitle
      || block.externalResource?.snapshot?.resourceTitle
      || block.title?.trim()
      || '外部资源'
  }
  if (block.type === 'container') return block.title?.trim() || '组合单元'
  return block.content ?? ''
}

const loadPageReference = async () => {
  if (refType.value !== 'page' || !refId.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const pc: PageContent = await getPageContent(refId.value)
    pageBlocks.value = resolveRefPageBlocks(pc)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '页面内容加载失败'
  } finally {
    loading.value = false
  }
}

function resolveRefPageBlocks(pc: PageContent): Block[] {
  if (isV2PageContent(pc)) {
    return tipTapToBlocks(resolvePageDocument(pc), [])
  }
  registryStore.registerPageContent(pc, refId.value, pageTitle.value)
  return pageContentToLegacyBlocks(pc)
}

function pageContentToLegacyBlocks(pc: PageContent): Block[] {
  const blocks = registryStore.getPageBlocks(refId.value)
  if (blocks.length > 0) return blocks

  const blocksFallback: Block[] = []
  if (pc.content.trim()) {
    blocksFallback.push({
      id: `ref-content-${refId.value}`,
      type: 'richtext',
      content: pc.content,
    })
  }
  for (const embed of pc.embeds) {
    blocksFallback.push({
      id: embed.id,
      type: embed.type,
      title: embed.title,
      graphData: embed.graphData,
      tableData: embed.tableData,
      timelineData: embed.timelineData,
      refId: embed.refId,
      refType: embed.refType,
      externalResource: embed.externalResource,
      spacerHeight: embed.spacerHeight,
      width: embed.width,
      height: embed.height,
      metadata: embed.metadata,
    })
  }
  return blocksFallback
}

const openReferencedPage = async () => {
  if (refType.value === 'page' && refId.value) {
    await workspaceStore.selectPage(refId.value)
  }
}

const onResize = (width: number | null, _height: number | null) => {
  props.updateAttributes({ width })
}

watch([refId, refType], () => {
  pageBlocks.value = []
  error.value = ''
  void loadPageReference()
})

onMounted(() => {
  void loadPageReference()
})
</script>

<template>
  <node-view-wrapper class="ref-block-view">
    <ResizableBlockWrapper
      :selected="selected"
      :resizable-axes="{ width: true, height: false }"
      :min-width="200"
      block-type-label="引用"
      :block-id="blockId"
      block-type="ref"
      :compound-badges="compoundBadges"
      :heading-level="headingLevel"
      :heading-text="headingText"
      @resize="onResize"
      @compound-badge-click="handleBadgeClick"
    >
    <div v-if="refType === 'page'" class="ref-page-card">
      <div v-if="loading" class="ref-page-card__status">正在加载页面内容...</div>
      <div v-else-if="error" class="ref-page-card__status ref-page-card__status--error">{{ error }}</div>
      <div v-else class="ref-page-content">
        <div v-if="shiftedPageBlocks.length === 0" class="ref-page-card__status">空页面</div>
        <template v-for="block in shiftedPageBlocks" :key="block.id">
          <TuEditor
            v-if="isRichTextBlock(block) && (block.content || '').trim()"
            :ref="(el) => setNestedEditorRef(block.id, el)"
            :blocks="[block]"
            :editable="false"
            :paragraph-gutter-actions="true"
            class="ref-page-content__block"
            @line-annotate="(innerBlockId) => forwardRefGutterAction(block.id, innerBlockId, 'annotate')"
            @mark-block-excerpt="(innerBlockId) => forwardRefGutterAction(block.id, innerBlockId, 'mark-excerpt')"
            @set-block-basis="(innerBlockId) => forwardRefGutterAction(block.id, innerBlockId, 'set-basis')"
            @line-create-knowledge-relation="(innerBlockId) => forwardRefGutterAction(block.id, innerBlockId, 'knowledge-relation')"
          />
          <X6Component
            v-else-if="block.type === 'x6'"
            :graphData="block.graphData"
            :editable="false"
            :block-actions-enabled="false"
            class="ref-page-content__block ref-page-content__board"
          />
          <TableBlock
            v-else-if="block.type === 'table'"
            :data="block.tableData"
            :editable="false"
            class="ref-page-content__block"
          />
          <ReferencedBlockRenderer
            v-else-if="block.type === 'container'"
            :block="block"
            :editable="false"
            class="ref-page-content__block"
          />
          <ExternalResourceExcerptMeta
            v-else-if="block.type === 'externalResource' && block.externalResource"
            :external-resource="block.externalResource"
            :body-block-id="block.id"
            show-body
            compact
            :paragraph-gutter-actions="true"
            class="ref-page-content__block"
            @line-annotate="(innerBlockId) => forwardRefGutterAction(block.id, innerBlockId, 'annotate')"
            @mark-block-excerpt="(innerBlockId) => forwardRefGutterAction(block.id, innerBlockId, 'mark-excerpt')"
            @set-block-basis="(innerBlockId) => forwardRefGutterAction(block.id, innerBlockId, 'set-basis')"
            @line-create-knowledge-relation="(innerBlockId) => forwardRefGutterAction(block.id, innerBlockId, 'knowledge-relation')"
          />
          <div v-else-if="block.type !== 'ref'" class="ref-page-content__fallback">
            {{ renderFallbackText(block) }}
          </div>
        </template>
      </div>
    </div>

    <div v-else class="ref-block-card">
      <div class="ref-block-card__badge">
        引用自：{{ registryStore.getMeta(refId)?.pageTitle ?? '未知页面' }}
      </div>
      <ReferencedBlockRenderer
        :block="shiftedReferencedBlock"
        :editable="editor.isEditable"
        class="ref-block-card__content"
      />
    </div>
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

<style scoped>
.ref-page-card,
.ref-block-card {
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #f8fbff;
}

.ref-page-card__header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid #d6e4ff;
  background: #eef6ff;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
}

.ref-page-card__label {
  flex: 0 0 auto;
  color: #1677ff;
  font-size: 12px;
  font-weight: 700;
}

.ref-page-card__title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
}

.ref-page-card__status {
  padding: 12px;
  color: #6b7280;
  font-size: 13px;
}

.ref-page-card__status--error {
  color: #cf1322;
}

.ref-page-content {
  display: flex;
  flex-direction: column;
}

.ref-page-content__block,
.ref-page-content__fallback {
  border-radius: 6px;
  background: #ffffff;
}

.ref-page-content__board {
  min-height: 400px;
}

.ref-page-content__fallback {
  padding: 10px 12px;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.ref-block-card {
  padding: 10px 12px;
}

.ref-block-card__badge {
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
}

.ref-block-card__content {
  min-width: 0;
}

/* Remove TuEditor inner padding inside ref content */
.ref-page-content :deep(.tu-editor-content) {
  padding: 0 !important;
}
</style>
