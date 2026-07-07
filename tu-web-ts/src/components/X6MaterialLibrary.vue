<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useMaterialLibraryStore, type MaterialItem } from '@/stores/materialLibrary';
import type { GraphData } from '@/api/types';
import { Graph, Export } from '@antv/x6';
import { beginMaterialDrag, endMaterialDrag, trackMaterialDrag } from '@/components/x6/materialDrag';

const emit = defineEmits<{
  (e: 'insert', graphData: GraphData): void;
  (e: 'close'): void;
}>();

const store = useMaterialLibraryStore();
const renamingId = ref<string | null>(null);
const renameText = ref('');
const thumbnailMap = ref<Record<string, string>>({});
let suppressClickInsert = false;
let isMounted = true;

const THUMBNAIL_SIZE = { width: 160, height: 100 };

/** Generate an SVG preview string from graphData using an off-screen X6 graph. */
async function generateSvgPreview(data: GraphData): Promise<string> {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  document.body.appendChild(container);
  const preview = new Graph({
    container,
    width: THUMBNAIL_SIZE.width,
    height: THUMBNAIL_SIZE.height,
    grid: false,
    background: { color: '#fafafa' },
    interacting: false,
    connecting: { allowBlank: false },
  });
  preview.use(new Export());
  try {
    const allRaw = data.cells ?? [...(data.nodes ?? []), ...(data.edges ?? [])];
    const cells = allRaw.map((raw) => {
      if (raw.shape && raw.shape !== 'edge') return { ...raw };
      if (raw.source || raw.target) return { ...raw };
      return { ...raw, shape: 'rect' };
    });
    preview.fromJSON({ cells: cells.length ? cells : [] });
    if (preview.getCellCount() > 0) {
      preview.zoomToFit({ padding: 12, maxScale: 1 });
    }
    const svg = await preview.toSVGAsync({ preserveDimensions: true });
    return svg;
  } catch {
    return '';
  } finally {
    preview.dispose();
    document.body.removeChild(container);
  }
}

async function generateThumbnail(item: MaterialItem) {
  if (thumbnailMap.value[item.id]) return;
  const svg = await generateSvgPreview(item.graphData);
  if (!isMounted) return;
  if (svg) {
    thumbnailMap.value[item.id] = svg;
  }
}

function getThumbnail(item: MaterialItem): string {
  return thumbnailMap.value[item.id] ?? '';
}

// Kick off async thumbnail generation for all items
store.items.forEach(generateThumbnail);

// Watch for new items added later
watch(() => store.items.length, () => {
  store.items.forEach((item) => {
    if (!thumbnailMap.value[item.id]) {
      generateThumbnail(item);
    }
  });
});

function handleInsert(item: MaterialItem) {
  if (suppressClickInsert) return;
  emit('insert', item.graphData);
}

function handleDragStart(e: DragEvent, item: MaterialItem) {
  beginMaterialDrag(e);
  if (e.dataTransfer) {
    e.dataTransfer.setData('application/x6-material', JSON.stringify(item.graphData));
    e.dataTransfer.effectAllowed = 'copy';
  }
}

function handleDrag(e: DragEvent) {
  trackMaterialDrag(e);
}

function handleDragEnd() {
  suppressClickInsert = true;
  endMaterialDrag();
  window.setTimeout(() => {
    suppressClickInsert = false;
  }, 0);
}

function handleDelete(id: string) {
  delete thumbnailMap.value[id];
  store.removeMaterial(id);
}

function startRename(item: MaterialItem) {
  renamingId.value = item.id;
  renameText.value = item.name;
}

function commitRename(id: string) {
  const text = renameText.value.trim();
  if (text) {
    store.renameMaterial(id, text);
  }
  renamingId.value = null;
  renameText.value = '';
}

function cancelRename() {
  renamingId.value = null;
  renameText.value = '';
}

function onRenameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitRename(renamingId.value!);
  } else if (e.key === 'Escape') {
    cancelRename();
  }
}

onBeforeUnmount(() => {
  isMounted = false;
});
</script>

<template>
  <div class="material-library" @mousedown.stop @click.stop>
    <div class="material-library__header">
      <span class="material-library__title">素材库</span>
      <button
        type="button"
        class="material-library__close"
        @click="emit('close')"
        aria-label="关闭素材库"
      >
        ✕
      </button>
    </div>

    <div class="material-library__body">
      <p v-if="store.items.length === 0" class="material-library__empty">
        暂无素材。选中画板中的节点后，点击工具栏「提取为素材」即可保存。
      </p>

      <div v-for="item in store.items" :key="item.id" class="material-card">
        <div class="material-card__preview-wrap">
          <button
            type="button"
            class="material-card__preview"
            :title="`点击插入「${item.name}」到画板中心`"
            @mousedown.stop
            @click.stop="handleInsert(item)"
          >
            <div
              v-if="getThumbnail(item)"
              class="material-card__svg"
              v-html="getThumbnail(item)"
            />
            <div v-else class="material-card__placeholder">
              {{ item.graphData.nodes?.length ?? 0 }} 节点{{ item.graphData.edges?.length ? `, ${item.graphData.edges.length} 连线` : '' }}
            </div>
          </button>
          <button
            type="button"
            class="material-card__drag-handle"
            title="拖拽到画板指定位置"
            draggable="true"
            aria-label="拖拽插入"
            @mousedown.stop
            @click.stop
            @dragstart="handleDragStart($event, item)"
            @drag="handleDrag"
            @dragend="handleDragEnd"
          >
            ⠿
          </button>
        </div>

        <div class="material-card__meta">
          <input
            v-if="renamingId === item.id"
            ref="renameInput"
            v-model="renameText"
            class="material-card__rename-input"
            @keydown="onRenameKeydown"
            @blur="commitRename(item.id)"
          />
          <button
            v-else
            type="button"
            class="material-card__name"
            @click="startRename(item)"
          >
            {{ item.name }}
          </button>
          <button
            type="button"
            class="material-card__delete"
            :title="`删除「${item.name}」`"
            @click="handleDelete(item.id)"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.material-library {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
  overflow: hidden;
}

.material-library__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  flex-shrink: 0;
}

.material-library__title {
  flex: 1;
  font-size: 12px;
  font-weight: 700;
  color: #1f2937;
}

.material-library__close {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
}

.material-library__close:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.material-library__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.material-library__empty {
  padding: 24px 12px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
  line-height: 1.6;
}

.material-card {
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.material-card:hover {
  border-color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.1);
}

.material-card__preview-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
}

.material-card__preview {
  display: block;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: #fafafa;
  cursor: pointer;
  overflow: hidden;
}

.material-card__preview:hover {
  background: #f0f4ff;
}

.material-card__drag-handle {
  flex: 0 0 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-left: 1px solid #e5e7eb;
  background: #f3f4f6;
  color: #6b7280;
  cursor: grab;
  font-size: 14px;
  line-height: 1;
}

.material-card__drag-handle:hover {
  background: #e8eeff;
  color: #1677ff;
}

.material-card__drag-handle:active {
  cursor: grabbing;
}

.material-card__svg {
  width: 100%;
  height: auto;
  aspect-ratio: 160 / 90;
  overflow: hidden;
}

.material-card__svg :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.material-card__placeholder {
  width: 100%;
  aspect-ratio: 160 / 90;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 12px;
  background: #f9fafb;
}

.material-card__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid #f3f4f6;
}

.material-card__name {
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #374151;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-card__name:hover {
  background: #f3f4f6;
}

.material-card__rename-input {
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  border: 1px solid #1677ff;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}

.material-card__delete {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.5;
}

.material-card__delete:hover {
  opacity: 1;
  background: #fef2f2;
}
</style>
