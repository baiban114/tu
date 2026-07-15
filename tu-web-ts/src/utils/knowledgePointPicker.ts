import { reactive } from 'vue';
import type { KnowledgePoint } from '@/api/types';

export interface OpenKnowledgePointPickerOptions {
  kbId: string;
  title?: string;
  selectedId?: string | null;
  confirmText?: string;
  hint?: string;
  allowManage?: boolean;
}

export const knowledgePointPickerState = reactive({
  visible: false,
  kbId: '',
  title: '选择知识点',
  selectedId: null as string | null,
  confirmText: '确定',
  hint: '单击节点选中；可在树内右键新建子知识点',
  allowManage: true,
});

let pendingResolve: ((point: KnowledgePoint | null) => void) | null = null;

export function openKnowledgePointPicker(
  options: OpenKnowledgePointPickerOptions,
): Promise<KnowledgePoint | null> {
  if (pendingResolve) {
    pendingResolve(null);
    pendingResolve = null;
  }

  return new Promise((resolve) => {
    pendingResolve = resolve;
    knowledgePointPickerState.kbId = options.kbId;
    knowledgePointPickerState.title = options.title ?? '选择知识点';
    knowledgePointPickerState.selectedId = options.selectedId ?? null;
    knowledgePointPickerState.confirmText = options.confirmText ?? '确定';
    knowledgePointPickerState.hint = options.hint
      ?? '单击节点选中；可在树内右键新建子知识点';
    knowledgePointPickerState.allowManage = options.allowManage ?? true;
    knowledgePointPickerState.visible = true;
  });
}

export function resolveKnowledgePointPicker(point: KnowledgePoint) {
  pendingResolve?.(point);
  pendingResolve = null;
  knowledgePointPickerState.visible = false;
}

export function cancelKnowledgePointPicker() {
  pendingResolve?.(null);
  pendingResolve = null;
  knowledgePointPickerState.visible = false;
}
