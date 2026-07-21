<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElButton, ElInput, ElMessage, ElMessageBox, ElScrollbar, ElTree } from 'element-plus';
import type { KnowledgePoint } from '@/api/types';
import { useViewportClampedFixedPanel } from '@/utils/viewportPanel';
import {
  createKnowledgePoint,
  deleteKnowledgePoint,
  mergeKnowledgePoints,
  updateKnowledgePoint,
} from '@/api/knowledgePoint';
import { openKnowledgePointPicker } from '@/utils/knowledgePointPicker';
import {
  canDropOnNode,
  collectSubtreePointIds,
  computeTreeDropTarget,
  flattenKnowledgePoints,
  moveToRootEnd,
  normalizeDropType,
  promoteToSiblingAfterParent,
  toMovableNode,
  type TreeDropTarget,
  type TreeDropType,
} from '@/utils/tree/drag';

const DEFAULT_POINT_TITLE = '未命名知识点';

const props = withDefaults(defineProps<{
  kbId: string;
  tree: KnowledgePoint[];
  selectedId?: string | null;
  selectedIds?: string[];
  loading?: boolean;
  mode?: 'manage' | 'pick';
  draggable?: boolean;
  filterKeyword?: string;
  showToolbar?: boolean;
  toolbarHint?: string;
  disabledPointIds?: string[];
  onRefresh?: () => Promise<void>;
}>(), {
  selectedId: null,
  selectedIds: () => [],
  loading: false,
  mode: 'manage',
  draggable: undefined,
  filterKeyword: '',
  showToolbar: true,
  toolbarHint: '',
  disabledPointIds: () => [],
});

const emit = defineEmits<{
  select: [point: KnowledgePoint];
  updated: [];
  'update:selectedId': [id: string | null];
  'update:selectedIds': [ids: string[]];
}>();

function captureExpandedNodeIds(): string[] {
  const nodesMap = treeRef.value?.store?.nodesMap;
  if (!nodesMap) return [...expandedNodeIds.value];
  const fromTree = Object.keys(nodesMap).filter((key) => Boolean(nodesMap[key]?.expanded));
  return fromTree.length ? fromTree : [...expandedNodeIds.value];
}

function rememberExpandedNode(nodeId: string) {
  if (!nodeId) return;
  expandedNodeIds.value = new Set([...expandedNodeIds.value, nodeId]);
}

function forgetExpandedNode(nodeId: string) {
  if (!nodeId) return;
  const next = new Set(expandedNodeIds.value);
  next.delete(nodeId);
  expandedNodeIds.value = next;
}

function onNodeExpand(data: KnowledgePoint) {
  rememberExpandedNode(data.id);
}

function onNodeCollapse(data: KnowledgePoint) {
  forgetExpandedNode(data.id);
}

async function restoreExpandedNodeIds(nodeIds?: string[]) {
  const targets = nodeIds ?? [...expandedNodeIds.value];
  if (!targets.length || !treeRef.value) return;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await nextTick();
    let restored = 0;
    for (const nodeId of targets) {
      const node = treeRef.value.getNode(nodeId);
      if (node && !node.isLeaf) {
        node.expand();
        rememberExpandedNode(nodeId);
        restored += 1;
      }
    }
    if (restored > 0) return;
  }
}

async function notifyUpdated() {
  const expandedSnapshot = captureExpandedNodeIds();
  expandedNodeIds.value = new Set(expandedSnapshot);
  await props.onRefresh?.();
  emit('updated');
}

const treeRef = ref<InstanceType<typeof ElTree> | null>(null);
const localTree = ref<KnowledgePoint[]>([]);
const expandedNodeIds = ref(new Set<string>());
const renamingPointId = ref<string | null>(null);
const renameValue = ref('');
const renameInputRef = ref<InstanceType<typeof ElInput> | null>(null);
const creatingPoint = ref(false);
const movingPoint = ref(false);
const treeDropHandled = ref(false);
const dragPromoteTarget = ref<{ draggingId: string; parentId: string } | null>(null);
const contextMenu = ref({ visible: false, x: 0, y: 0, node: null as KnowledgePoint | null });

const contextMenuSourcePoint = computed(() =>
  contextMenu.value.visible ? { x: contextMenu.value.x, y: contextMenu.value.y } : null,
);
const { panelRef: contextMenuRef, position: contextMenuPosition } = useViewportClampedFixedPanel({
  visible: computed(() => contextMenu.value.visible),
  getSourcePoint: () => contextMenuSourcePoint.value,
});

const treeProps = { label: 'title', children: 'children' };
const isDraggable = computed(() => props.draggable ?? props.mode === 'manage');
const disabledPointIdSet = computed(() => new Set(props.disabledPointIds));
const selectedIdSet = computed(() => {
  const ids = props.selectedIds ?? [];
  if (ids.length) return new Set(ids);
  return props.selectedId ? new Set([props.selectedId]) : new Set<string>();
});

function isPointDisabled(pointId: string) {
  return disabledPointIdSet.value.has(pointId);
}

function findPointById(pointId: string): KnowledgePoint | null {
  return flattenKnowledgePoints(localTree.value).find((item) => item.id === pointId) ?? null;
}

function applySelection(ids: string[], focusId?: string | null) {
  const unique = [...new Set(ids)];
  const primary = focusId && unique.includes(focusId)
    ? focusId
    : unique[unique.length - 1] ?? null;
  emit('update:selectedIds', unique);
  emit('update:selectedId', primary);
  if (primary) {
    const point = findPointById(primary);
    if (point) emit('select', point);
  }
}

function nodeClass(data: KnowledgePoint) {
  return {
    'is-multi-selected': selectedIdSet.value.has(data.id),
  };
}

watch(
  () => props.tree,
  async (next) => {
    localTree.value = next;
    await restoreExpandedNodeIds();
  },
  { immediate: true, deep: true },
);

function filterNode(value: string, data: any) {
  if (!value) return true;
  const point = data as KnowledgePoint;
  const q = value.trim().toLowerCase();
  const haystack = `${point.title} ${(point.aliases ?? []).join(' ')}`.toLowerCase();
  return haystack.includes(q);
}

watch(
  () => props.filterKeyword,
  (keyword) => {
    treeRef.value?.filter(keyword);
  },
);

watch(
  () => props.selectedId,
  async (selectedId) => {
    if (!selectedId) return;
    await nextTick();
    treeRef.value?.setCurrentKey(selectedId);
  },
  { immediate: true },
);

function expandTreeNode(nodeId: string) {
  rememberExpandedNode(nodeId);
  treeRef.value?.getNode(nodeId)?.expand();
}

function onNodeClick(data: KnowledgePoint, _node: unknown, _component: unknown, event: Event) {
  if (props.mode === 'pick' && isPointDisabled(data.id)) return;
  const mouseEvent = event as MouseEvent;
  const additive = props.mode === 'manage' && Boolean(mouseEvent.ctrlKey || mouseEvent.metaKey);
  if (!additive) {
    applySelection([data.id], data.id);
    return;
  }

  const current = new Set(selectedIdSet.value);
  if (current.has(data.id)) current.delete(data.id);
  else current.add(data.id);
  const ids = [...current];
  const focusId = current.has(data.id) ? data.id : ids[ids.length - 1] ?? null;
  applySelection(ids, focusId);
}

function flatMovableNodes() {
  return flattenKnowledgePoints(localTree.value).map((node) => toMovableNode(node));
}

function resolveDropNodes(draggingNode: any, dropNode: any) {
  const draggingData = draggingNode.data as KnowledgePoint;
  const dropData = dropNode.data as KnowledgePoint;
  const draggingParentId = draggingNode.parent?.data?.id ?? draggingData.parentId ?? null;
  const dropParentId = dropNode.parent?.data?.id ?? dropData.parentId ?? null;
  return {
    dragging: toMovableNode(draggingData, draggingParentId),
    drop: toMovableNode(dropData, dropParentId),
  };
}

async function createPoint(parentId: string | null) {
  if (creatingPoint.value) return;
  creatingPoint.value = true;
  try {
    const created = await createKnowledgePoint(props.kbId, {
      title: DEFAULT_POINT_TITLE,
      parentId,
    });
    await notifyUpdated();
    await nextTick();
    if (parentId) expandTreeNode(parentId);
    treeRef.value?.setCurrentKey(created.id);
    applySelection([created.id], created.id);
    if (props.mode === 'manage') {
      onStartRename(created);
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建知识点失败');
  } finally {
    creatingPoint.value = false;
  }
}

function onCreateRootPoint() {
  void createPoint(null);
}

function onCreateChildPoint() {
  const node = contextMenu.value.node;
  if (!node) return;
  closeContextMenu();
  void createPoint(node.id);
}

function onStartRename(node?: KnowledgePoint | null) {
  const target = node ?? (props.selectedId
    ? flattenKnowledgePoints(localTree.value).find((item) => item.id === props.selectedId) ?? null
    : null);
  if (!target) return;
  closeContextMenu();
  renamingPointId.value = target.id;
  renameValue.value = target.title;
  void nextTick(() => {
    renameInputRef.value?.focus();
  });
}

function cancelRename() {
  renamingPointId.value = null;
  renameValue.value = '';
}

async function onFinishRename(node: KnowledgePoint) {
  const title = renameValue.value.trim();
  const pointId = renamingPointId.value;
  cancelRename();
  if (!pointId || pointId !== node.id || !title || title === node.title) return;
  try {
    const updated = await updateKnowledgePoint(node.id, { title });
    await notifyUpdated();
    emit('select', updated);
    emit('update:selectedId', updated.id);
    emit('update:selectedIds', [updated.id]);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重命名失败');
  }
}

async function onDeletePoint() {
  const node = contextMenu.value.node;
  if (!node) return;
  closeContextMenu();
  try {
    await deleteKnowledgePoint(node.id);
    await notifyUpdated();
    const nextIds = (props.selectedIds ?? []).filter((id) => id !== node.id);
    if (props.selectedId === node.id) {
      const primary = nextIds[nextIds.length - 1] ?? null;
      emit('update:selectedIds', nextIds);
      emit('update:selectedId', primary);
      if (!primary) return;
      const point = findPointById(primary);
      if (point) emit('select', point);
      return;
    }
    emit('update:selectedIds', nextIds);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

async function onMergePoint() {
  const source = contextMenu.value.node;
  if (!source) return;
  closeContextMenu();
  const disabledPointIds = collectSubtreePointIds(localTree.value, source.id);
  const target = await openKnowledgePointPicker({
    kbId: props.kbId,
    title: '合并到知识点',
    confirmText: '确认合并',
    hint: '选择要保留的目标知识点；源知识点及其子节点将并入目标',
    allowManage: false,
    disabledPointIds,
  });
  if (!target) return;
  try {
    await ElMessageBox.confirm(
      `将「${source.title}」合并进「${target.title}」。源知识点会被删除，其子节点、证据、别名与关联将迁移到目标。`,
      '确认合并知识点',
      { type: 'warning', confirmButtonText: '确认合并', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    const merged = await mergeKnowledgePoints(source.id, target.id);
    await notifyUpdated();
    applySelection([merged.id], merged.id);
    ElMessage.success(`已将「${source.title}」合并到「${target.title}」`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '合并失败');
  }
}

function onRenameFromContextMenu() {
  onStartRename(contextMenu.value.node);
}

function onPointTreeContextMenu(event: Event, data: unknown) {
  (event as MouseEvent).preventDefault();
  const e = event as MouseEvent;
  const raw = data as KnowledgePoint;
  const node = flattenKnowledgePoints(localTree.value).find((item) => item.id === raw.id) ?? raw;
  applySelection([node.id], node.id);
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, node };
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

function closeContextMenuOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu();
}

watch(
  () => contextMenu.value.visible,
  (visible) => {
    if (visible) {
      document.addEventListener('click', closeContextMenu);
      document.addEventListener('keydown', closeContextMenuOnEscape);
    } else {
      document.removeEventListener('click', closeContextMenu);
      document.removeEventListener('keydown', closeContextMenuOnEscape);
    }
  },
);

function cleanupDocumentDragListener() {
  document.removeEventListener('dragend', onDocumentDragEnd);
}

onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenu);
  document.removeEventListener('keydown', closeContextMenuOnEscape);
  cleanupDocumentDragListener();
});

function allowDrag(node: any) {
  const data = node.data as KnowledgePoint;
  if (renamingPointId.value === data.id) return false;
  return true;
}

function allowDrop(draggingNode: any, dropNode: any, dropType: TreeDropType) {
  return canDropOnNode(draggingNode.data.id, dropNode.data.id, dropType, flatMovableNodes());
}

async function reparentTo(pointId: string, target: TreeDropTarget) {
  if (movingPoint.value) return;
  movingPoint.value = true;
  try {
    await updateKnowledgePoint(pointId, {
      parentId: target.parentId,
      sortOrder: target.sortOrder,
    });
    await notifyUpdated();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '移动失败');
  } finally {
    movingPoint.value = false;
  }
}

function onNodeDragStart() {
  treeDropHandled.value = false;
  dragPromoteTarget.value = null;
  cleanupDocumentDragListener();
  document.addEventListener('dragend', onDocumentDragEnd);
}

function onNodeDragOver(draggingNode: any, dropNode: any) {
  const { dragging, drop } = resolveDropNodes(draggingNode, dropNode);
  if (dragging.parentId === drop.id) {
    dragPromoteTarget.value = { draggingId: dragging.id, parentId: drop.id };
    return;
  }
  if (dragPromoteTarget.value?.draggingId === dragging.id) {
    dragPromoteTarget.value = null;
  }
}

async function onNodeDrop(
  draggingNode: any,
  dropNode: any,
  dropType: TreeDropType,
) {
  treeDropHandled.value = true;
  dragPromoteTarget.value = null;
  cleanupDocumentDragListener();
  const { dragging, drop } = resolveDropNodes(draggingNode, dropNode);
  const target = computeTreeDropTarget(dragging, drop, normalizeDropType(dropType), flatMovableNodes());
  await reparentTo(dragging.id, target);
}

function onDocumentDragEnd() {
  cleanupDocumentDragListener();
  window.setTimeout(() => {
    if (treeDropHandled.value) {
      treeDropHandled.value = false;
      dragPromoteTarget.value = null;
      return;
    }
    const pending = dragPromoteTarget.value;
    dragPromoteTarget.value = null;
    if (!pending || movingPoint.value) return;

    const flat = flattenKnowledgePoints(localTree.value);
    const dragging = flat.find((item) => item.id === pending.draggingId);
    const parent = flat.find((item) => item.id === pending.parentId);
    if (!dragging || !parent) return;
    if ((dragging.parentId ?? null) !== parent.id) return;

    const target = promoteToSiblingAfterParent(
      toMovableNode(dragging),
      toMovableNode(parent),
      flat.map((item) => toMovableNode(item)),
    );
    void reparentTo(dragging.id, target);
  }, 0);
}

async function onPromoteToSibling() {
  const node = contextMenu.value.node;
  if (!node?.parentId) return;
  closeContextMenu();
  const flat = flattenKnowledgePoints(localTree.value);
  const parent = flat.find((item) => item.id === node.parentId);
  if (!parent) return;
  const target = promoteToSiblingAfterParent(
    toMovableNode(node),
    toMovableNode(parent),
    flat.map((item) => toMovableNode(item)),
  );
  await reparentTo(node.id, target);
}

async function onMoveToRoot() {
  const node = contextMenu.value.node;
  if (!node?.parentId) return;
  closeContextMenu();
  const flat = flattenKnowledgePoints(localTree.value);
  const target = moveToRootEnd(toMovableNode(node), flat.map((item) => toMovableNode(item)));
  await reparentTo(node.id, target);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'F2') return;
  if (renamingPointId.value) return;
  if (event.target instanceof HTMLElement) {
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
  }
  if (!props.selectedId) return;
  event.preventDefault();
  const point = flattenKnowledgePoints(localTree.value).find((item) => item.id === props.selectedId);
  if (point) onStartRename(point);
}

defineExpose({
  startRename: onStartRename,
  setCurrentKey: (id: string) => treeRef.value?.setCurrentKey(id),
  expandNode: expandTreeNode,
  clearSelection: () => {
    emit('update:selectedIds', []);
    emit('update:selectedId', null);
  },
});
</script>

<template>
  <div class="kpt" @keydown="handleKeydown">
    <div v-if="showToolbar" class="kpt-toolbar">
      <span v-if="toolbarHint" class="kpt-toolbar__hint">{{ toolbarHint }}</span>
      <span v-else-if="mode === 'manage'" class="kpt-toolbar__hint">拖拽调整层级与顺序；Ctrl+点击多选</span>
      <ElButton
        link
        size="small"
        title="新建顶层知识点"
        :loading="creatingPoint"
        :disabled="creatingPoint"
        @click="onCreateRootPoint"
      >
        +
      </ElButton>
    </div>
    <div v-loading="loading" class="kpt-tree-scroll-host">
      <ElScrollbar class="kpt-tree-scroll">
        <ElTree
          v-if="localTree.length > 0"
          ref="treeRef"
          :data="localTree"
          node-key="id"
          :props="treeProps"
          highlight-current
          :draggable="isDraggable"
          :allow-drag="allowDrag"
          :allow-drop="allowDrop"
          :filter-node-method="filterNode"
          :node-class="nodeClass"
          :current-node-key="selectedId ?? undefined"
          class="kpt-tree"
          @node-click="onNodeClick"
          @node-expand="onNodeExpand"
          @node-collapse="onNodeCollapse"
          @node-contextmenu="onPointTreeContextMenu"
          @node-drag-start="onNodeDragStart"
          @node-drag-over="onNodeDragOver"
          @node-drop="onNodeDrop"
        >
          <template #default="{ node, data }">
            <span class="kpt-tree-node">
            <span
              v-if="renamingPointId === data.id"
              class="kpt-tree-rename-wrap"
              @mousedown.stop
              @click.stop
              @dragstart.stop.prevent
            >
              <ElInput
                ref="renameInputRef"
                v-model="renameValue"
                size="small"
                class="kpt-tree-rename-input"
                @blur="onFinishRename(data)"
                @keyup.enter="onFinishRename(data)"
                @keyup.esc="cancelRename"
              />
            </span>
              <span
                v-else
                class="kpt-tree-node__label"
                :class="{
                  'kpt-tree-node__label--disabled': isPointDisabled(data.id),
                  'kpt-tree-node__label--selected': selectedIdSet.has(data.id),
                }"
              >{{ node.label }}</span>
            </span>
          </template>
        </ElTree>
        <div v-else class="kpt-empty">暂无知识点</div>
      </ElScrollbar>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu.visible && contextMenu.node"
        ref="contextMenuRef"
        class="kpt-context-menu"
        :style="{ left: `${contextMenuPosition.left}px`, top: `${contextMenuPosition.top}px` }"
        @mousedown.stop
        @click.stop
      >
        <button type="button" class="kpt-context-menu__item" @click="onCreateChildPoint">
          添加子知识点
        </button>
        <button
          v-if="contextMenu.node?.parentId"
          type="button"
          class="kpt-context-menu__item"
          @click="onPromoteToSibling"
        >
          提升为同级节点
        </button>
        <button
          v-if="contextMenu.node?.parentId"
          type="button"
          class="kpt-context-menu__item"
          @click="onMoveToRoot"
        >
          移到顶层
        </button>
        <button type="button" class="kpt-context-menu__item" @click="onRenameFromContextMenu">
          重命名
        </button>
        <button
          v-if="mode === 'manage'"
          type="button"
          class="kpt-context-menu__item"
          @click="onMergePoint"
        >
          合并到…
        </button>
        <button
          v-if="mode === 'manage'"
          type="button"
          class="kpt-context-menu__item kpt-context-menu__item--danger"
          @click="onDeletePoint"
        >
          删除
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.kpt {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.kpt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.kpt-toolbar__hint {
  font-size: 12px;
  color: #8c8c8c;
}

.kpt-tree-scroll-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.kpt-tree-scroll {
  flex: 1;
  padding: 0 4px 8px;
}

.kpt-tree {
  background: transparent;
}

.kpt-tree :deep(.el-tree-node__content) {
  height: 32px;
  border-radius: 6px;
  padding-right: 4px;
}

.kpt-tree :deep(.el-tree-node__content:hover) {
  background: #ebebeb;
}

.kpt-tree :deep(.el-tree-node.is-current > .el-tree-node__content),
.kpt-tree :deep(.el-tree-node.is-multi-selected > .el-tree-node__content) {
  background: #e6f4ff;
  color: #1677ff;
}

.kpt-tree-node {
  display: flex;
  align-items: center;
  flex: 1;
  overflow: hidden;
  gap: 4px;
  min-width: 0;
}

.kpt-tree-node__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpt-tree-node__label--disabled {
  color: #bfbfbf;
  cursor: not-allowed;
}

.kpt-tree-rename-wrap {
  display: flex;
  flex: 1;
  min-width: 0;
}

.kpt-tree-rename-input {
  width: 100%;
}

.kpt-tree-rename-input :deep(.el-input__inner) {
  user-select: text;
}

.kpt-empty {
  padding: 16px;
  text-align: center;
  color: #8c8c8c;
  font-size: 13px;
}
</style>

<style>
.kpt-context-menu {
  position: fixed;
  z-index: 4000;
  min-width: 140px;
  padding: 4px 0;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.kpt-context-menu__item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}

.kpt-context-menu__item:hover {
  background: #f5f5f5;
}

.kpt-context-menu__item--danger {
  color: #cf1322;
}
</style>
