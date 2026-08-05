import type { WorkspaceViewDefinition } from './types'

/** Catalog of virtual database views (not persisted; kinds may gain instances later). */
export const WORKSPACE_VIEW_CATALOG: WorkspaceViewDefinition[] = [
  {
    id: 'view:learning-plan',
    kind: 'learning-plan',
    name: '学习计划',
    description: '以当前学习目标为种子，沿 prerequisite 展开知识点全集，拼成可浏览的虚拟数据库。',
    icon: '🎯',
  },
  {
    id: 'view:tag-content',
    kind: 'tag-content',
    name: '标签检索',
    description: '指定标签检索被标记的块（nodeView）与文档单元（章节），按更新时间倒序分页展示并支持展开预览原内容。',
    icon: '🏷️',
  },
]

export function getWorkspaceViewById(id: string): WorkspaceViewDefinition | null {
  return WORKSPACE_VIEW_CATALOG.find((item) => item.id === id) ?? null
}
