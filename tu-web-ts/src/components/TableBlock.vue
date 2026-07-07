<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { TableBlockData } from '@/api/types';
import TableCellRichEditor from './TableCellRichEditor.vue';
import {
  PlainTableColumnController,
  closedTableContextMenu,
} from './tableCore';
import { useViewportClampedFixedPanel } from '@/utils/viewportPanel';
import type { Editor } from '@tiptap/core';

type BorderDirection = 'top' | 'bottom' | 'left' | 'right';

interface ActiveCell {
  row: number;
  column: number;
}

interface HoverBorder {
  row: number | null;
  column: number | null;
  direction: BorderDirection;
}

interface ResizeState {
  kind: 'column' | 'row';
  index: number;
  startClientX: number;
  startClientY: number;
  startSize: number;
}

const MIN_COLUMN_WIDTH = 80;
const MIN_ROW_HEIGHT = 38;
const DEFAULT_COLUMN_WIDTH = 160;
const DEFAULT_ROW_HEIGHT = 38;

const props = withDefaults(defineProps<{
  data?: TableBlockData;
  editable?: boolean;
}>(), {
  editable: true,
});

const emit = defineEmits<{
  (e: 'change', data: TableBlockData): void;
  (e: 'active'): void;
}>();

const activeCell = ref<ActiveCell | null>(null);
const hoveredRow = ref<number | null>(null);
const hoveredColumn = ref<number | null>(null);
const selectedRow = ref<number | null>(null);
const selectedColumn = ref<number | null>(null);
const hoverBorder = ref<HoverBorder | null>(null);
const resizing = ref<ResizeState | null>(null);
const tableBlockRef = ref<HTMLElement | null>(null);
const cellRefs = ref<Record<string, HTMLTextAreaElement>>({});
const richCellRefs = ref<Record<string, {
  getEditor?: () => Editor | null;
  getMarkdownLinkAnchor?: () => { top: number; left: number } | undefined;
  insertMarkdownLink?: (label: string, url: string, display?: 'link' | 'image') => void;
  updateInsertedLinkDisplay?: (display: 'link' | 'image') => boolean;
  updateInsertedImageWidth?: (widthPercent: number) => boolean;
}>>({});
const columnMenu = ref({
  ...closedTableContextMenu(),
  columnIndex: -1,
});

const columnMenuSourcePoint = computed(() =>
  columnMenu.value.visible ? { x: columnMenu.value.x, y: columnMenu.value.y } : null,
);
const { panelRef: columnMenuRef, position: columnMenuPosition } = useViewportClampedFixedPanel({
  visible: computed(() => columnMenu.value.visible),
  getSourcePoint: () => columnMenuSourcePoint.value,
});

function looksLikeRichMarkdown(value: string): boolean {
  return /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)|^#{1,6}\s|^- \[[ x]\]\s|^[-*]\s|^\d+\.\s|^>\s|<u>.+<\/u>|~~.+~~)/m.test(value);
}

function resolveTextMode(data?: TableBlockData): 'plain' | 'rich' {
  if (data?.textMode === 'rich') return 'rich';
  if (data?.textMode === 'plain') return 'plain';
  const cells = data?.rows?.flat() ?? [];
  return cells.some((cell) => looksLikeRichMarkdown(cell ?? '')) ? 'rich' : 'plain';
}

const normalizedData = computed<TableBlockData>(() => {
  const headers = props.data?.headers?.length ? props.data.headers : ['列 1', '列 2', '列 3'];
  const sourceRows = props.data?.rows?.length ? props.data.rows : [['', '', ''], ['', '', '']];
  const rows = sourceRows.map((row) => headers.map((_, index) => row[index] ?? ''));
  const normalizedRows = rows.length ? rows : [headers.map(() => '')];
  const columnWidths = headers.map((_, index) => Math.max(
    MIN_COLUMN_WIDTH,
    props.data?.columnWidths?.[index] ?? DEFAULT_COLUMN_WIDTH,
  ));
  const rowHeights = normalizedRows.map((_, index) => Math.max(
    MIN_ROW_HEIGHT,
    props.data?.rowHeights?.[index] ?? DEFAULT_ROW_HEIGHT,
  ));
  return {
    textMode: resolveTextMode(props.data),
    headers: [...headers],
    rows: normalizedRows,
    columnWidths,
    rowHeights,
  };
});

const activeRowForToolbar = computed(() => selectedRow.value ?? hoveredRow.value);
const activeColumnForToolbar = computed(() => selectedColumn.value ?? hoveredColumn.value);
const isRichMode = computed(() => normalizedData.value.textMode === 'rich');

function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function setCellRef(el: Element | null, row: number, column: number) {
  const key = cellKey(row, column);
  if (el instanceof HTMLTextAreaElement) {
    cellRefs.value[key] = el;
  } else {
    delete cellRefs.value[key];
  }
}

function setRichCellRef(el: unknown, row: number, column: number) {
  const key = cellKey(row, column);
  if (el) {
    richCellRefs.value[key] = el as {
      getEditor?: () => Editor | null;
      getMarkdownLinkAnchor?: () => { top: number; left: number } | undefined;
      insertMarkdownLink?: (label: string, url: string, display?: 'link' | 'image') => void;
      updateInsertedLinkDisplay?: (display: 'link' | 'image') => boolean;
      updateInsertedImageWidth?: (widthPercent: number) => boolean;
    };
  } else {
    delete richCellRefs.value[key];
  }
}

function focusCell(row: number, column: number) {
  nextTick(() => {
    if (isRichMode.value) {
      richCellRefs.value[cellKey(row, column)]?.getEditor?.()?.commands.focus();
      return;
    }
    const textarea = cellRefs.value[cellKey(row, column)];
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  });
}

function getColumnWidth(columnIndex: number): number {
  return normalizedData.value.columnWidths?.[columnIndex] ?? DEFAULT_COLUMN_WIDTH;
}

function getRowHeight(rowIndex: number): number {
  return normalizedData.value.rowHeights?.[rowIndex] ?? DEFAULT_ROW_HEIGHT;
}

function columnStyle(columnIndex: number): Record<string, string> {
  const width = `${getColumnWidth(columnIndex)}px`;
  return {
    width,
    minWidth: width,
  };
}

function rowStyle(rowIndex: number): Record<string, string> {
  return {
    height: `${getRowHeight(rowIndex)}px`,
  };
}

function commit(next: TableBlockData) {
  const columnWidths = next.headers.map((_, index) => Math.max(
    MIN_COLUMN_WIDTH,
    next.columnWidths?.[index] ?? normalizedData.value.columnWidths?.[index] ?? DEFAULT_COLUMN_WIDTH,
  ));
  const normalizedRows = next.rows.map((row) => next.headers.map((_, index) => row[index] ?? ''));
  const rowHeights = normalizedRows.map((_, index) => Math.max(
    MIN_ROW_HEIGHT,
    next.rowHeights?.[index] ?? normalizedData.value.rowHeights?.[index] ?? DEFAULT_ROW_HEIGHT,
  ));

  emit('change', {
    textMode: next.textMode === 'rich' ? 'rich' : 'plain',
    headers: [...next.headers],
    rows: normalizedRows,
    columnWidths,
    rowHeights,
  });
}

function commitColumnWidth(columnIndex: number, width: number) {
  const next = normalizedData.value;
  next.columnWidths = [...(next.columnWidths ?? [])];
  next.columnWidths[columnIndex] = Math.max(MIN_COLUMN_WIDTH, Math.round(width));
  commit(next);
}

function commitRowHeight(rowIndex: number, height: number) {
  const next = normalizedData.value;
  next.rowHeights = [...(next.rowHeights ?? [])];
  next.rowHeights[rowIndex] = Math.max(MIN_ROW_HEIGHT, Math.round(height));
  commit(next);
}

function stopResize() {
  if (!resizing.value) return;
  resizing.value = null;
  document.removeEventListener('mousemove', handleResizeMouseMove);
  document.removeEventListener('mouseup', stopResize);
}

function handleResizeMouseMove(event: MouseEvent) {
  const state = resizing.value;
  if (!state) return;

  if (state.kind === 'column') {
    commitColumnWidth(state.index, state.startSize + event.clientX - state.startClientX);
  } else {
    commitRowHeight(state.index, state.startSize + event.clientY - state.startClientY);
  }
}

function startColumnResize(event: MouseEvent, columnIndex: number) {
  if (!props.editable) return;
  event.preventDefault();
  event.stopPropagation();
  stopResize();
  resizing.value = {
    kind: 'column',
    index: columnIndex,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startSize: getColumnWidth(columnIndex),
  };
  document.addEventListener('mousemove', handleResizeMouseMove);
  document.addEventListener('mouseup', stopResize);
}

function startRowResize(event: MouseEvent, rowIndex: number) {
  if (!props.editable) return;
  event.preventDefault();
  event.stopPropagation();
  stopResize();
  resizing.value = {
    kind: 'row',
    index: rowIndex,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startSize: getRowHeight(rowIndex),
  };
  document.addEventListener('mousemove', handleResizeMouseMove);
  document.addEventListener('mouseup', stopResize);
}

function setTextMode(textMode: 'plain' | 'rich') {
  commit({
    ...normalizedData.value,
    textMode,
  });
}

function updateHeader(index: number, value: string) {
  const next = normalizedData.value;
  new PlainTableColumnController(next, DEFAULT_COLUMN_WIDTH).renameColumn(String(index), value);
  commit(next);
}

function updateCell(rowIndex: number, columnIndex: number, value: string) {
  const next = normalizedData.value;
  next.rows[rowIndex][columnIndex] = value;
  commit(next);
}

function insertRow(index: number, focusColumn = activeCell.value?.column ?? 0) {
  const next = normalizedData.value;
  const targetIndex = Math.max(0, Math.min(index, next.rows.length));
  next.rows.splice(targetIndex, 0, next.headers.map(() => ''));
  next.rowHeights = [...(next.rowHeights ?? [])];
  next.rowHeights.splice(targetIndex, 0, DEFAULT_ROW_HEIGHT);
  commit(next);
  selectedRow.value = targetIndex;
  hoveredRow.value = targetIndex;
  focusCell(targetIndex, Math.min(focusColumn, next.headers.length - 1));
}

function removeRow(rowIndex: number) {
  const next = normalizedData.value;
  if (next.rows.length <= 1) return;
  next.rows.splice(rowIndex, 1);
  next.rowHeights = [...(next.rowHeights ?? [])];
  next.rowHeights.splice(rowIndex, 1);
  commit(next);
  const focusRow = Math.min(rowIndex, next.rows.length - 1);
  selectedRow.value = focusRow;
  hoveredRow.value = focusRow;
  focusCell(focusRow, Math.min(activeCell.value?.column ?? 0, next.headers.length - 1));
}

function insertColumn(index: number, focusRow = activeCell.value?.row ?? 0) {
  const next = normalizedData.value;
  const inserted = new PlainTableColumnController(next, DEFAULT_COLUMN_WIDTH).insertColumnAt(index);
  commit(next);
  selectedColumn.value = inserted.index;
  hoveredColumn.value = inserted.index;
  focusCell(Math.min(focusRow, next.rows.length - 1), inserted.index);
}

function removeColumn(columnIndex: number) {
  const next = normalizedData.value;
  if (next.headers.length <= 1) return;
  new PlainTableColumnController(next, DEFAULT_COLUMN_WIDTH).deleteColumnAt(columnIndex);
  commit(next);
  const focusColumn = Math.min(columnIndex, next.headers.length - 1);
  selectedColumn.value = focusColumn;
  hoveredColumn.value = focusColumn;
  focusCell(Math.min(activeCell.value?.row ?? 0, next.rows.length - 1), focusColumn);
}

function addRow() {
  insertRowFromToolbar('after');
}

function addColumn() {
  insertColumnFromToolbar('after');
}

function selectRow(rowIndex: number) {
  emit('active');
  selectedRow.value = rowIndex;
  selectedColumn.value = null;
  hoveredRow.value = rowIndex;
  activeCell.value = null;
}

function selectColumn(columnIndex: number) {
  emit('active');
  selectedColumn.value = columnIndex;
  selectedRow.value = null;
  hoveredColumn.value = columnIndex;
  activeCell.value = null;
}

function closeColumnMenu() {
  columnMenu.value.visible = false;
}

function closeColumnMenuOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeColumnMenu();
}

function openColumnMenu(event: MouseEvent, columnIndex: number) {
  if (!props.editable) return;
  event.preventDefault();
  event.stopPropagation();
  selectColumn(columnIndex);
  columnMenu.value = {
    visible: true,
    columnIndex,
    x: event.clientX,
    y: event.clientY,
  };
}

function insertColumnFromMenu(position: 'before' | 'after') {
  const columnIndex = columnMenu.value.columnIndex;
  if (columnIndex < 0) return;
  closeColumnMenu();
  insertColumn(position === 'before' ? columnIndex : columnIndex + 1);
}

function removeColumnFromMenu() {
  const columnIndex = columnMenu.value.columnIndex;
  if (columnIndex < 0) return;
  closeColumnMenu();
  removeColumn(columnIndex);
}

function handleTableKeydown(event: KeyboardEvent) {
  if (!props.editable) return;
  if (event.key !== 'Delete') return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;

  if (selectedRow.value != null) {
    event.preventDefault();
    event.stopPropagation();
    removeRow(selectedRow.value);
  }
}

watch(() => columnMenu.value.visible, (visible) => {
  if (visible) {
    window.addEventListener('click', closeColumnMenu);
    window.addEventListener('keydown', closeColumnMenuOnEscape);
  } else {
    window.removeEventListener('click', closeColumnMenu);
    window.removeEventListener('keydown', closeColumnMenuOnEscape);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeColumnMenu);
  window.removeEventListener('keydown', closeColumnMenuOnEscape);
});

function handleRowHeaderFocusout(event: FocusEvent, rowIndex: number) {
  const current = event.currentTarget as HTMLElement;
  window.setTimeout(() => {
    if (current.contains(document.activeElement)) return;
    if (selectedRow.value === rowIndex) {
      selectedRow.value = null;
    }
  }, 0);
}

function handleColumnHeaderFocusout(event: FocusEvent, columnIndex: number) {
  const current = event.currentTarget as HTMLElement;
  window.setTimeout(() => {
    if (current.contains(document.activeElement)) return;
    if (selectedColumn.value === columnIndex) {
      selectedColumn.value = null;
    }
  }, 0);
}

function clearHoverState() {
  hoveredRow.value = null;
  hoveredColumn.value = null;
  hoverBorder.value = null;
}

function setHoverBorder(event: MouseEvent, border: HoverBorder | null) {
  hoverBorder.value = border;
}

function handleCellFocus(row: number, column: number) {
  emit('active');
  activeCell.value = { row, column };
  selectedRow.value = null;
  selectedColumn.value = null;
}

function handleCellKeydown(event: KeyboardEvent, row: number, column: number) {
  if (event.key === 'Enter') {
    event.stopPropagation();
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    event.stopPropagation();
    moveByTab(row, column, event.shiftKey);
  }
}

function moveByTab(row: number, column: number, backwards: boolean) {
  const data = normalizedData.value;
  if (backwards) {
    if (column > 0) {
      focusCell(row, column - 1);
      return;
    }
    if (row > 0) {
      focusCell(row - 1, data.headers.length - 1);
    }
    return;
  }

  if (column < data.headers.length - 1) {
    focusCell(row, column + 1);
    return;
  }
  if (row < data.rows.length - 1) {
    focusCell(row + 1, 0);
    return;
  }
  insertRow(data.rows.length, 0);
}

function handleCellMouseMove(event: MouseEvent, row: number, column: number) {
  hoveredRow.value = row;
  hoveredColumn.value = column;

  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const edge = 8;

  let direction: BorderDirection | null = null;
  if (y <= edge) direction = 'top';
  else if (rect.height - y <= edge) direction = 'bottom';
  else if (x <= edge) direction = 'left';
  else if (rect.width - x <= edge) direction = 'right';

  setHoverBorder(event, direction ? { row, column, direction } : null);
}

function handleHeaderMouseMove(event: MouseEvent, column: number) {
  hoveredColumn.value = column;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const edge = 10;
  let direction: BorderDirection | null = null;
  if (x <= edge) direction = 'left';
  else if (rect.width - x <= edge) direction = 'right';
  setHoverBorder(event, direction ? { row: null, column, direction } : null);
}

function handleRowHeaderMouseMove(event: MouseEvent, row: number) {
  hoveredRow.value = row;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const edge = 10;
  let direction: BorderDirection | null = null;
  if (y <= edge) direction = 'top';
  else if (rect.height - y <= edge) direction = 'bottom';
  setHoverBorder(event, direction ? { row, column: null, direction } : null);
}

function isColumnActive(columnIndex: number): boolean {
  return hoveredColumn.value === columnIndex || activeCell.value?.column === columnIndex;
}

function isRowActive(rowIndex: number): boolean {
  return hoveredRow.value === rowIndex || activeCell.value?.row === rowIndex;
}

function isCellActive(rowIndex: number, columnIndex: number): boolean {
  return activeCell.value?.row === rowIndex && activeCell.value?.column === columnIndex;
}

function shouldEditCell(rowIndex: number, columnIndex: number): boolean {
  return props.editable && !isRichMode.value;
}

function borderClass(rowIndex: number, columnIndex: number): Record<string, boolean> {
  const border = hoverBorder.value;
  return {
    'table-block__cell-wrap--insert-top': border?.row === rowIndex && border?.column === columnIndex && border.direction === 'top',
    'table-block__cell-wrap--insert-bottom': border?.row === rowIndex && border?.column === columnIndex && border.direction === 'bottom',
    'table-block__cell-wrap--insert-left': border?.row === rowIndex && border?.column === columnIndex && border.direction === 'left',
    'table-block__cell-wrap--insert-right': border?.row === rowIndex && border?.column === columnIndex && border.direction === 'right',
  };
}

function headerBorderClass(columnIndex: number): Record<string, boolean> {
  const border = hoverBorder.value;
  return {
    'table-block__cell-wrap--insert-left': border?.row == null && border?.column === columnIndex && border.direction === 'left',
    'table-block__cell-wrap--insert-right': border?.row == null && border?.column === columnIndex && border.direction === 'right',
  };
}

function rowHeaderBorderClass(rowIndex: number): Record<string, boolean> {
  const border = hoverBorder.value;
  return {
    'table-block__cell-wrap--insert-top': border?.column == null && border?.row === rowIndex && border.direction === 'top',
    'table-block__cell-wrap--insert-bottom': border?.column == null && border?.row === rowIndex && border.direction === 'bottom',
  };
}

function applyBorderInsert(border: HoverBorder) {
  if (border.direction === 'top') {
    insertRow(border.row ?? 0, border.column ?? activeCell.value?.column ?? 0);
    return;
  }
  if (border.direction === 'bottom') {
    insertRow((border.row ?? 0) + 1, border.column ?? activeCell.value?.column ?? 0);
    return;
  }
  if (border.direction === 'left') {
    insertColumn(border.column ?? 0, border.row ?? activeCell.value?.row ?? 0);
    return;
  }
  insertColumn((border.column ?? 0) + 1, border.row ?? activeCell.value?.row ?? 0);
}

function insertRowFromToolbar(position: 'before' | 'after') {
  if (hoverBorder.value && (hoverBorder.value.direction === 'top' || hoverBorder.value.direction === 'bottom')) {
    applyBorderInsert(hoverBorder.value);
    return;
  }

  const rowIndex = activeRowForToolbar.value ?? activeCell.value?.row ?? normalizedData.value.rows.length - 1;
  insertRow(position === 'before' ? rowIndex : rowIndex + 1);
}

function insertColumnFromToolbar(position: 'before' | 'after') {
  if (hoverBorder.value && (hoverBorder.value.direction === 'left' || hoverBorder.value.direction === 'right')) {
    applyBorderInsert(hoverBorder.value);
    return;
  }

  const columnIndex = activeColumnForToolbar.value ?? activeCell.value?.column ?? normalizedData.value.headers.length - 1;
  insertColumn(position === 'before' ? columnIndex : columnIndex + 1);
}

function htmlToPlainText(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('img').forEach((img) => {
    const alt = img.getAttribute('alt') || '图片';
    const src = img.getAttribute('src') || '';
    img.replaceWith(document.createTextNode(src ? `[${alt}] ${src}` : `[${alt}]`));
  });
  return container.textContent || '';
}

function clipboardToPlainText(event: ClipboardEvent): string {
  const clipboard = event.clipboardData;
  if (!clipboard) return '';
  const text = clipboard.getData('text/plain');
  if (text) return text;
  const html = clipboard.getData('text/html');
  return html ? htmlToPlainText(html) : '';
}

function insertTextAtCursor(textarea: HTMLTextAreaElement, text: string): string {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const nextValue = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  nextTick(() => {
    const cursor = start + text.length;
    textarea.setSelectionRange(cursor, cursor);
  });
  return nextValue;
}

function handleCellPaste(event: ClipboardEvent, row: number, column: number) {
  if (isRichMode.value) return;
  const text = clipboardToPlainText(event);
  if (!text) return;
  event.preventDefault();
  event.stopPropagation();
  const textarea = event.currentTarget as HTMLTextAreaElement;
  updateCell(row, column, insertTextAtCursor(textarea, text));
}

function activateCell(row: number, column: number) {
  if (!props.editable) return;
  emit('active');
  activeCell.value = { row, column };
  selectedRow.value = null;
  selectedColumn.value = null;
  focusCell(row, column);
}

function insertMarkdownLink(label: string, url: string, _display: 'link' | 'image' = 'link'): boolean {
  if (!props.editable || !isRichMode.value || !activeCell.value) return false;
  const editor = richCellRefs.value[cellKey(activeCell.value.row, activeCell.value.column)];
  const ed = editor?.getEditor?.();
  if (!ed) return false;
  ed.chain().focus().insertContent(label).setLink({ href: url }).run();
  return true;
}

function getMarkdownLinkAnchor(): { top: number; left: number } | undefined {
  if (!isRichMode.value || !activeCell.value) return undefined;
  const editor = richCellRefs.value[cellKey(activeCell.value.row, activeCell.value.column)];
  const ed = editor?.getEditor?.();
  if (!ed) return undefined;
  const { from } = ed.state.selection;
  const coords = ed.view.coordsAtPos(from);
  return coords ? { top: coords.top, left: coords.left } : undefined;
}

function updateInsertedLinkDisplay(_display: 'link' | 'image'): boolean {
  return false;
}

function updateInsertedImageWidth(_widthPercent: number): boolean {
  return false;
}

defineExpose({
  getMarkdownLinkAnchor,
  insertMarkdownLink,
  updateInsertedLinkDisplay,
  updateInsertedImageWidth,
});
</script>

<template>
  <div
    ref="tableBlockRef"
    class="table-block"
    tabindex="0"
    @mousedown="emit('active')"
    @keydown="handleTableKeydown"
    @mouseleave="clearHoverState"
  >
    <div class="table-block__scroll">
      <table>
        <thead>
          <tr>
            <th v-if="editable" class="table-block__corner-cell">
              <span>表格</span>
            </th>
            <th
              v-for="(header, columnIndex) in normalizedData.headers"
              :key="columnIndex"
              class="table-block__header-cell"
              tabindex="0"
              :style="columnStyle(columnIndex)"
              :class="{
                'table-block__header-cell--active': isColumnActive(columnIndex),
                'table-block__header-cell--selected': selectedColumn === columnIndex,
              }"
              @mouseenter="hoveredColumn = columnIndex"
              @mousemove="handleHeaderMouseMove($event, columnIndex)"
              @click="selectColumn(columnIndex)"
              @contextmenu.prevent.stop="openColumnMenu($event, columnIndex)"
              @focusout="handleColumnHeaderFocusout($event, columnIndex)"
            >
              <div class="table-block__header-wrap" :class="headerBorderClass(columnIndex)">
                <input
                  v-if="editable"
                  :value="header"
                  @focus="selectColumn(columnIndex)"
                  @click.stop
                  @input="updateHeader(columnIndex, ($event.target as HTMLInputElement).value)"
                />
                <span v-else>{{ header }}</span>
                <button
                  v-if="editable && activeColumnForToolbar === columnIndex"
                  type="button"
                  class="table-block__column-menu-button"
                  @click.stop="openColumnMenu($event, columnIndex)"
                >
                  列
                </button>
                <button
                  v-if="editable"
                  type="button"
                  class="table-block__resize-handle table-block__resize-handle--column"
                  @mousedown="startColumnResize($event, columnIndex)"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in normalizedData.rows"
            :key="rowIndex"
            :class="{
              'table-block__row--active': isRowActive(rowIndex),
              'table-block__row--selected': selectedRow === rowIndex,
            }"
            @mouseenter="hoveredRow = rowIndex"
          >
            <th
              v-if="editable"
              class="table-block__row-handle-cell"
              tabindex="0"
              @mousemove="handleRowHeaderMouseMove($event, rowIndex)"
              @click="selectRow(rowIndex)"
              @focusout="handleRowHeaderFocusout($event, rowIndex)"
            >
              <div class="table-block__row-handle-wrap" :class="rowHeaderBorderClass(rowIndex)">
                <button type="button" @click.stop="selectRow(rowIndex)">行 {{ rowIndex + 1 }}</button>
              </div>
            </th>
            <td
              v-for="(cell, columnIndex) in row"
              :key="columnIndex"
              :style="{ ...columnStyle(columnIndex), ...rowStyle(rowIndex) }"
              :class="{
                'table-block__cell--row-active': isRowActive(rowIndex),
                'table-block__cell--column-active': isColumnActive(columnIndex),
                'table-block__cell--row-selected': selectedRow === rowIndex,
                'table-block__cell--column-selected': selectedColumn === columnIndex,
                'table-block__cell--active': isCellActive(rowIndex, columnIndex),
              }"
              @mousemove="handleCellMouseMove($event, rowIndex, columnIndex)"
            >
              <div class="table-block__cell-wrap" :class="borderClass(rowIndex, columnIndex)">
                <TableCellRichEditor
                  v-if="isRichMode"
                  :ref="(el: unknown) => setRichCellRef(el, rowIndex, columnIndex)"
                  :cell-id="`table-cell-${rowIndex}-${columnIndex}`"
                  :content="cell"
                  :editable="editable"
                  class="table-block__rich-editor"
                  @change="(value: string) => updateCell(rowIndex, columnIndex, value)"
                  @active="handleCellFocus(rowIndex, columnIndex)"
                  @blur="activeCell = null"
                />
                <textarea
                  v-else-if="shouldEditCell(rowIndex, columnIndex)"
                  :ref="(el) => setCellRef(el as Element | null, rowIndex, columnIndex)"
                  :value="cell"
                  rows="1"
                  @focus="handleCellFocus(rowIndex, columnIndex)"
                  @keydown="handleCellKeydown($event, rowIndex, columnIndex)"
                  @paste="handleCellPaste($event, rowIndex, columnIndex)"
                  @input="updateCell(rowIndex, columnIndex, ($event.target as HTMLTextAreaElement).value)"
                />
                <button
                  v-if="editable"
                  type="button"
                  class="table-block__resize-handle table-block__resize-handle--column"
                  @mousedown="startColumnResize($event, columnIndex)"
                />
                <button
                  v-if="editable"
                  type="button"
                  class="table-block__resize-handle table-block__resize-handle--row"
                  @mousedown="startRowResize($event, rowIndex)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editable && activeRowForToolbar != null" class="table-block__floating-toolbar">
      <span>第 {{ activeRowForToolbar + 1 }} 行</span>
      <button type="button" @click="insertRow(activeRowForToolbar)">上方插入</button>
      <button type="button" @click="insertRow(activeRowForToolbar + 1)">下方插入</button>
      <button type="button" :disabled="normalizedData.rows.length <= 1" @click="removeRow(activeRowForToolbar)">删除行</button>
    </div>

    <div v-if="editable && activeColumnForToolbar != null" class="table-block__floating-toolbar">
      <span>第 {{ activeColumnForToolbar + 1 }} 列</span>
      <button type="button" @click="insertColumn(activeColumnForToolbar)">左侧插入</button>
      <button type="button" @click="insertColumn(activeColumnForToolbar + 1)">右侧插入</button>
      <button type="button" :disabled="normalizedData.headers.length <= 1" @click="removeColumn(activeColumnForToolbar)">删除列</button>
    </div>

    <div v-if="editable" class="table-block__toolbar">
      <label class="table-block__mode-control">
        <span>文字模式</span>
        <select :value="normalizedData.textMode" @change="setTextMode(($event.target as HTMLSelectElement).value as 'plain' | 'rich')">
          <option value="plain">纯文本</option>
          <option value="rich">富文本</option>
        </select>
      </label>
      <button type="button" @click="addRow">添加行</button>
      <button type="button" @click="addColumn">添加列</button>
    </div>

    <Teleport to="body">
      <div
        v-if="columnMenu.visible"
        ref="columnMenuRef"
        class="table-block__column-context-menu"
        :style="{ left: `${columnMenuPosition.left}px`, top: `${columnMenuPosition.top}px` }"
        @mousedown.stop
        @click.stop
        @contextmenu.prevent.stop
      >
        <button type="button" @click="insertColumnFromMenu('before')">在左侧新增列</button>
        <button type="button" @click="insertColumnFromMenu('after')">在右侧新增列</button>
        <button
          type="button"
          class="table-block__column-context-menu-danger"
          :disabled="normalizedData.headers.length <= 1"
          @click="removeColumnFromMenu"
        >
          删除列
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.table-block {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.table-block__scroll {
  overflow-x: auto;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #fff;
}

table {
  width: 100%;
  min-width: 560px;
  border-collapse: separate;
  border-spacing: 0;
}

th,
td {
  min-width: 120px;
  border-right: 1px solid #d0d7de;
  border-bottom: 1px solid #d0d7de;
  padding: 0;
  vertical-align: top;
}

th:last-child,
td:last-child {
  border-right: 0;
}

tbody tr:last-child td,
tbody tr:last-child th {
  border-bottom: 0;
}

.table-block__corner-cell,
.table-block__header-cell,
.table-block__row-handle-cell {
  background: #f6f8fa;
}

.table-block__header-cell,
.table-block__row-handle-cell {
  cursor: pointer;
}

.table-block__corner-cell,
.table-block__row-handle-cell {
  width: 76px;
  min-width: 76px;
  color: #57606a;
  font-size: 12px;
  text-align: center;
}

.table-block__header-cell--active,
.table-block__row--active .table-block__row-handle-cell,
.table-block__cell--row-active,
.table-block__cell--column-active {
  background: #f0f7ff;
}

.table-block__header-cell--selected,
.table-block__row--selected .table-block__row-handle-cell,
.table-block__cell--row-selected,
.table-block__cell--column-selected {
  background: #c6e4ff;
}

.table-block__cell--active {
  box-shadow: inset 0 0 0 2px #1677ff;
}

.table-block__header-wrap,
.table-block__row-handle-wrap,
.table-block__cell-wrap {
  position: relative;
  min-height: 38px;
}

.table-block__row-handle-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 38px;
}

.table-block__cell-wrap {
  height: 100%;
}

input,
textarea,
select {
  font: inherit;
}

input,
textarea {
  width: 100%;
  min-height: 38px;
  border: 0;
  padding: 9px 10px;
  background: transparent;
  line-height: 1.45;
  outline: none;
}

textarea {
  display: block;
  resize: vertical;
}

input {
  padding-right: 46px;
  font-weight: 600;
}

span {
  display: block;
  padding: 9px 10px;
  white-space: pre-wrap;
}

.table-block :deep(.table-block__rich-editor) {
  min-height: 38px;
  overflow: visible;
}

.table-block__row-handle-cell button,
.table-block__column-menu-button,
.table-block__toolbar button,
.table-block__floating-toolbar button {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  padding: 5px 9px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

button:disabled {
  cursor: not-allowed;
  color: #8c959f;
  background: #f6f8fa;
}

.table-block__column-menu-button {
  position: absolute;
  top: 6px;
  right: 6px;
}

.table-block__cell-wrap--insert-top::before,
.table-block__cell-wrap--insert-bottom::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: #1677ff;
  z-index: 2;
}

.table-block__cell-wrap--insert-top::before {
  top: 0;
}

.table-block__cell-wrap--insert-bottom::before {
  bottom: 0;
}

.table-block__cell-wrap--insert-left::before,
.table-block__cell-wrap--insert-right::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #1677ff;
  z-index: 2;
}

.table-block__cell-wrap--insert-left::before {
  left: 0;
}

.table-block__cell-wrap--insert-right::before {
  right: 0;
}

.table-block__resize-handle {
  position: absolute;
  z-index: 4;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.table-block__resize-handle--column {
  top: 0;
  right: 0;
  width: 8px;
  height: 100%;
  cursor: col-resize;
}

.table-block__resize-handle--row {
  right: 0;
  bottom: 0;
  left: 0;
  height: 8px;
  cursor: row-resize;
}

.table-block__resize-handle--column:hover,
.table-block__resize-handle--column:active {
  background: linear-gradient(to right, transparent 3px, #1677ff 3px, #1677ff 5px, transparent 5px);
}

.table-block__resize-handle--row:hover,
.table-block__resize-handle--row:active {
  background: linear-gradient(to bottom, transparent 3px, #1677ff 3px, #1677ff 5px, transparent 5px);
}

.table-block__floating-toolbar,
.table-block__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.table-block__floating-toolbar {
  align-self: flex-start;
  padding: 6px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(31, 35, 40, 0.12);
}

.table-block__floating-toolbar span {
  padding: 0 4px;
  color: #57606a;
  font-size: 12px;
}

.table-block__mode-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #57606a;
  font-size: 12px;
}

.table-block__mode-control span {
  padding: 0;
}

.table-block__mode-control select {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  padding: 5px 8px;
}

.table-block__column-context-menu {
  position: fixed;
  z-index: 1000;
  display: grid;
  min-width: 168px;
  gap: 4px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  padding: 6px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
}

.table-block__column-context-menu button {
  width: 100%;
  border-color: transparent;
  text-align: left;
  background: transparent;
}

.table-block__column-context-menu button:hover:not(:disabled) {
  background: #f1f5f9;
}

.table-block__column-context-menu .table-block__column-context-menu-danger {
  color: #b91c1c;
}
</style>
