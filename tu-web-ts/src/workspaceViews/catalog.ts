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
]

export function getWorkspaceViewById(id: string): WorkspaceViewDefinition | null {
  return WORKSPACE_VIEW_CATALOG.find((item) => item.id === id) ?? null
}
