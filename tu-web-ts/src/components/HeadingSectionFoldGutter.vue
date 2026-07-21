<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef } from 'vue'
import type { CSSProperties } from 'vue'
import type { Editor } from '@tiptap/core'
import type { TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import { collectFlatTocEntries, collectFlatTocEntriesFromHeadingsOnly } from '@/utils/toc/collectFlatTocEntries'
import { isEntryCollapsed, iterTocFoldSections } from '@/utils/toc/tocSections'
import {
  clearEmbedChildSectionCollapses,
  findTocFoldAnchorElement,
  syncEmbedChildSectionCollapse,
  toggleTocEntryCollapse,
} from '@/utils/toc/tocSectionFoldActions'
import { getContentScrollGutterAnchor } from '@/utils/editorGutterLayout'
import { EDITOR_SECTION_HANDLE_KEY } from '@/editor/editorSectionHandleBridge'
import FoldChevronIcon from './FoldChevronIcon.vue'
import { getSectionFoldRevision } from '@/stores/sectionFoldSession'

interface FoldToggleLayout {
  entryId: string
  collapsed: boolean
  style: CSSProperties
}

const props = defineProps<{
  editor?: Editor | null
  wrapperEl?: HTMLElement | null
}>()

const emit = defineEmits<{
  'section-gutter-hover': [entryId: string]
  'section-gutter-leave': [event?: MouseEvent]
  'section-handle-pointer-enter': [entryId: string]
  'section-handle-pointer-leave': [event?: MouseEvent]
}>()

const tocCollectContext = inject<ComputedRef<TocCollectContext> | undefined>('tocCollectContext', undefined)
const sectionHandleBridge = inject(EDITOR_SECTION_HANDLE_KEY, null)

const toggles = ref<FoldToggleLayout[]>([])
const visibleEntryId = ref<string | null>(null)

const boundEditors = new WeakSet<Editor>()
const hoverCleanups: Array<() => void> = []

let rafId = 0
let hideVisibleTimer: ReturnType<typeof setTimeout> | null = null
let scrollContainer: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null

function clearHideVisibleTimer() {
  if (hideVisibleTimer) {
    clearTimeout(hideVisibleTimer)
    hideVisibleTimer = null
  }
}

function showToggleForEntry(entryId: string) {
  clearHideVisibleTimer()
  visibleEntryId.value = entryId
  emit('section-gutter-hover', entryId)
  sectionHandleBridge?.onSectionGutterHover(entryId)
}

function scheduleHideToggleForEntry(entryId: string, event?: MouseEvent) {
  clearHideVisibleTimer()
  // 0ms：与手柄触发条无缝衔接，不再用延迟跨空隙
  hideVisibleTimer = setTimeout(() => {
    hideVisibleTimer = null
    if (visibleEntryId.value === entryId) {
      visibleEntryId.value = null
    }
    emit('section-gutter-leave', event)
    sectionHandleBridge?.onSectionGutterLeave(event)
  }, 0)
}

function isToggleVisible(entryId: string): boolean {
  return visibleEntryId.value === entryId
}

function clearHoverListeners() {
  while (hoverCleanups.length > 0) {
    hoverCleanups.pop()?.()
  }
}

function onFoldButtonEnter(entryId: string) {
  showToggleForEntry(entryId)
  emit('section-handle-pointer-enter', entryId)
}

function onFoldButtonLeave(entryId: string, event: MouseEvent) {
  const rel = event.relatedTarget
  // 只有移到节操作手柄时保留高亮；移到正文等其它区域都清掉
  if (rel instanceof HTMLElement && rel.closest('.hover-handle__dot')) return
  emit('section-handle-pointer-leave', event)
  if (rel instanceof HTMLElement) {
    if (rel.closest('.hover-handle')) return
    if (rel.closest('.ProseMirror')) return
  }
  scheduleHideToggleForEntry(entryId, event)
}

function bindToggleHover(anchor: HTMLElement, entryId: string) {
  const onEnter = () => showToggleForEntry(entryId)
  const onLeave = (event: MouseEvent) => {
    const rel = event.relatedTarget
    if (rel instanceof HTMLElement) {
      if (rel.closest('.heading-section-fold-gutter__btn')) return
      if (rel.closest('.hover-handle')) return
    }
    scheduleHideToggleForEntry(entryId, event)
  }
  anchor.addEventListener('mouseenter', onEnter)
  anchor.addEventListener('mouseleave', onLeave as EventListener)
  hoverCleanups.push(() => {
    anchor.removeEventListener('mouseenter', onEnter)
    anchor.removeEventListener('mouseleave', onLeave as EventListener)
  })
}

function collectFlat(doc: import('@tiptap/pm/model').Node) {
  const ctx = tocCollectContext?.value
  if (ctx) return collectFlatTocEntries(doc, ctx)
  return collectFlatTocEntriesFromHeadingsOnly(doc)
}

function syncToggles() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    rafId = 0
    const ed = props.editor
    const wrapper = props.wrapperEl
    if (!ed || ed.isDestroyed || !wrapper) {
      toggles.value = []
      clearHoverListeners()
      return
    }

    const gutterAnchor = getContentScrollGutterAnchor(wrapper)
    if (!gutterAnchor) {
      toggles.value = []
      clearHoverListeners()
      return
    }

    clearHoverListeners()

    const doc = ed.state.doc
    const flat = collectFlat(doc)
    const sections = iterTocFoldSections(flat, doc)
    const next: FoldToggleLayout[] = []

    clearEmbedChildSectionCollapses(ed.view.dom)

    for (const section of sections) {
      const anchor = findTocFoldAnchorElement(ed, section.entry)
      if (!anchor) continue

      const collapsed = isEntryCollapsed(section.entry, doc)
      if (section.entry.sourceType === 'ref-child') {
        syncEmbedChildSectionCollapse(ed.view.dom, section.entry, collapsed)
      }

      const rect = anchor.getBoundingClientRect()
      next.push({
        entryId: section.entry.id,
        collapsed,
        style: {
          position: 'fixed',
          left: `${gutterAnchor.foldLeft}px`,
          top: `${rect.top + rect.height / 2}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 30,
        },
      })
      bindToggleHover(anchor, section.entry.id)
    }

    toggles.value = next
  })
}

function toggleFold(entryId: string) {
  const ed = props.editor
  if (!ed || ed.isDestroyed) return
  const flat = collectFlat(ed.state.doc)
  const entry = flat.find((item) => item.id === entryId)
  if (!entry) return
  toggleTocEntryCollapse(ed, entry)
}

function bindScrollContainer() {
  const ed = props.editor
  if (!ed || ed.isDestroyed) return
  scrollContainer = ed.view.dom.closest('.content-scroll') as HTMLElement | null
  scrollContainer?.addEventListener('scroll', syncToggles, { passive: true })
}

function unbindScrollContainer() {
  scrollContainer?.removeEventListener('scroll', syncToggles)
  scrollContainer = null
}

function bindEditor(ed: Editor) {
  if (boundEditors.has(ed)) return
  boundEditors.add(ed)
  ed.on('update', syncToggles)
  ed.on('selectionUpdate', syncToggles)
  ed.on('transaction', syncToggles)
  bindScrollContainer()
  syncToggles()
}

function unbindEditor(ed: Editor) {
  if (!boundEditors.has(ed)) return
  boundEditors.delete(ed)
  ed.off('update', syncToggles)
  ed.off('selectionUpdate', syncToggles)
  ed.off('transaction', syncToggles)
  unbindScrollContainer()
}

watch(
  () => props.editor,
  (ed, prev) => {
    if (prev && !prev.isDestroyed) unbindEditor(prev)
    if (ed && !ed.isDestroyed) nextTick(() => bindEditor(ed))
    else toggles.value = []
  },
  { immediate: true },
)

watch(
  () => props.wrapperEl,
  (wrapper) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (!wrapper) return
    resizeObserver = new ResizeObserver(() => syncToggles())
    resizeObserver.observe(wrapper)
    syncToggles()
  },
  { immediate: true },
)

watch(
  () => tocCollectContext?.value,
  () => syncToggles(),
  { deep: true },
)

watch(
  () => getSectionFoldRevision(),
  () => syncToggles(),
)

onMounted(() => {
  window.addEventListener('resize', syncToggles, { passive: true })
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  clearHideVisibleTimer()
  clearHoverListeners()
  window.removeEventListener('resize', syncToggles)
  resizeObserver?.disconnect()
  const ed = props.editor
  if (ed && !ed.isDestroyed) unbindEditor(ed)
  unbindScrollContainer()
})
</script>

<template>
  <button
    v-for="toggle in toggles"
    :key="`${toggle.entryId}-${toggle.collapsed ? 'c' : 'e'}`"
    type="button"
    class="tu-fold-bullet heading-section-fold-gutter__btn"
    :data-entry-id="toggle.entryId"
    :class="{ 'heading-section-fold-gutter__btn--visible': isToggleVisible(toggle.entryId) }"
    :style="toggle.style"
    :title="toggle.collapsed ? '展开本节' : '收起本节'"
    :aria-label="toggle.collapsed ? '展开本节' : '收起本节'"
    :tabindex="isToggleVisible(toggle.entryId) ? 0 : -1"
    @mousedown.prevent
    @mouseenter="onFoldButtonEnter(toggle.entryId)"
    @mouseleave="(event) => onFoldButtonLeave(toggle.entryId, event)"
    @click.stop="toggleFold(toggle.entryId)"
  >
    <FoldChevronIcon :collapsed="toggle.collapsed" :size="12" />
  </button>
</template>

<style scoped>
.heading-section-fold-gutter__btn {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.heading-section-fold-gutter__btn--visible {
  opacity: 1;
  pointer-events: auto;
}

.heading-section-fold-gutter__btn--visible:hover {
  background: rgba(22, 119, 255, 0.08);
  border-radius: 6px;
}
</style>
