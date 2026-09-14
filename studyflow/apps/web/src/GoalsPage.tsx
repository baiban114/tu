import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Flag,
  ListTodo,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import {
  clearCurrentLearningGoal,
  createGoalMilestone,
  createLearningGoal,
  deleteGoalMilestone,
  deleteLearningGoal,
  listGoalMilestones,
  listLearningGoals,
  setCurrentLearningGoal,
  updateGoalMilestone,
  updateLearningGoal,
  type GoalMilestoneDto,
  type LearningGoalDto,
} from '@studyflow/api'
import GoalTaskTermsPanel from './GoalTaskTermsPanel'

const MILESTONE_PAGE_SIZE = 10

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function sourceLabel(kind: string): string {
  switch (kind) {
    case 'knowledge_point':
      return '知识点'
    case 'resource_item':
      return '资源'
    case 'resource_excerpt':
      return '节选'
    default:
      return '自拟'
  }
}

function deadlineLabel(deadline?: string | null): string {
  if (!deadline) return '未设截止日期'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${deadline}T00:00:00`)
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  const formatted = target.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  if (days < 0) return `${formatted} · 已逾期 ${Math.abs(days)} 天`
  if (days === 0) return `${formatted} · 今天截止`
  return `${formatted} · 还剩 ${days} 天`
}

export default function GoalsPage() {
  const [items, setItems] = useState<LearningGoalDto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 10
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDeadline, setDraftDeadline] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDeadline, setEditDeadline] = useState('')
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null)
  const [expandedTermsGoalId, setExpandedTermsGoalId] = useState<string | null>(null)
  const [milestones, setMilestones] = useState<GoalMilestoneDto[]>([])
  const [milestoneTotal, setMilestoneTotal] = useState(0)
  const [milestonePage, setMilestonePage] = useState(0)
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDeadline, setMilestoneDeadline] = useState('')
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [editMilestoneTitle, setEditMilestoneTitle] = useState('')
  const [editMilestoneDeadline, setEditMilestoneDeadline] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [milestoneLoading, setMilestoneLoading] = useState(false)
  const [milestoneSaving, setMilestoneSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [milestoneError, setMilestoneError] = useState<string | null>(null)

  const reload = useCallback(async (nextPage = page) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listLearningGoals(nextPage, pageSize)
      setItems(result.items)
      setTotal(result.total)
      setPage(result.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void reload(0)
  }, [])

  const loadMilestones = useCallback(async (targetGoalId: string, nextPage = 0) => {
    setMilestoneLoading(true)
    setMilestoneError(null)
    try {
      const result = await listGoalMilestones(targetGoalId, nextPage, MILESTONE_PAGE_SIZE)
      setMilestones(result.items)
      setMilestoneTotal(result.total)
      setMilestonePage(result.page)
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : '加载里程碑失败')
    } finally {
      setMilestoneLoading(false)
    }
  }, [])

  async function onCreate() {
    const title = draftTitle.trim()
    if (!title) return
    setSaving(true)
    setError(null)
    try {
      await createLearningGoal({
        title,
        sourceKind: 'free_text',
        setCurrent: true,
        deadline: draftDeadline || null,
      })
      setDraftTitle('')
      setDraftDeadline('')
      await reload(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(goal: LearningGoalDto) {
    setExpandedGoalId(null)
    setExpandedTermsGoalId(null)
    setEditingId(goal.id)
    setEditTitle(goal.title)
    setEditDeadline(goal.deadline ?? '')
  }

  async function onSaveEdit() {
    if (!editingId) return
    const title = editTitle.trim()
    if (!title) return
    const existing = items.find((item) => item.id === editingId)
    if (!existing) return
    setSaving(true)
    setError(null)
    try {
      await updateLearningGoal(editingId, {
        title,
        kbId: existing.kbId,
        sourceKind: existing.sourceKind,
        knowledgePointId: existing.knowledgePointId,
        resourceItemId: existing.resourceItemId,
        resourceExcerptId: existing.resourceExcerptId,
        snapshotJson: existing.snapshotJson,
        setCurrent: Boolean(existing.currentFlag),
        deadline: editDeadline || null,
      })
      setEditingId(null)
      setEditTitle('')
      setEditDeadline('')
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败')
    } finally {
      setSaving(false)
    }
  }

  async function onSetCurrent(id: string) {
    setSaving(true)
    setError(null)
    try {
      await setCurrentLearningGoal(id)
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置当前目标失败')
    } finally {
      setSaving(false)
    }
  }

  async function onClearCurrent() {
    setSaving(true)
    setError(null)
    try {
      await clearCurrentLearningGoal()
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除失败')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('删除这个学习目标？')) return
    setSaving(true)
    setError(null)
    try {
      await deleteLearningGoal(id)
      if (editingId === id) {
        setEditingId(null)
        setEditTitle('')
        setEditDeadline('')
      }
      if (expandedGoalId === id) {
        setExpandedGoalId(null)
        setMilestones([])
        setMilestoneTotal(0)
      }
      if (expandedTermsGoalId === id) setExpandedTermsGoalId(null)
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  function resetMilestoneEditor() {
    setEditingMilestoneId(null)
    setEditMilestoneTitle('')
    setEditMilestoneDeadline('')
  }

  function toggleMilestones(goalId: string) {
    if (expandedGoalId === goalId) {
      setExpandedGoalId(null)
      resetMilestoneEditor()
      return
    }
    setExpandedTermsGoalId(null)
    setExpandedGoalId(goalId)
    setMilestones([])
    setMilestoneTotal(0)
    setMilestonePage(0)
    setMilestoneTitle('')
    setMilestoneDeadline('')
    resetMilestoneEditor()
    void loadMilestones(goalId, 0)
  }

  function toggleTaskTerms(goalId: string) {
    setExpandedGoalId(null)
    resetMilestoneEditor()
    setExpandedTermsGoalId((currentGoalId) => currentGoalId === goalId ? null : goalId)
  }

  async function onCreateMilestone(goalId: string) {
    const title = milestoneTitle.trim()
    if (!title) return
    setMilestoneSaving(true)
    setMilestoneError(null)
    try {
      await createGoalMilestone(goalId, {
        title,
        deadline: milestoneDeadline || null,
        completed: false,
      })
      setMilestoneTitle('')
      setMilestoneDeadline('')
      await loadMilestones(goalId, Math.max(0, Math.ceil((milestoneTotal + 1) / MILESTONE_PAGE_SIZE) - 1))
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : '新建里程碑失败')
    } finally {
      setMilestoneSaving(false)
    }
  }

  async function onToggleMilestone(milestone: GoalMilestoneDto) {
    setMilestoneSaving(true)
    setMilestoneError(null)
    try {
      await updateGoalMilestone(milestone.goalId, milestone.id, {
        title: milestone.title,
        deadline: milestone.deadline,
        completed: !milestone.completed,
        sortOrder: milestone.sortOrder,
      })
      await loadMilestones(milestone.goalId, milestonePage)
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : '更新里程碑失败')
    } finally {
      setMilestoneSaving(false)
    }
  }

  function startMilestoneEdit(milestone: GoalMilestoneDto) {
    setEditingMilestoneId(milestone.id)
    setEditMilestoneTitle(milestone.title)
    setEditMilestoneDeadline(milestone.deadline ?? '')
  }

  async function onSaveMilestone(milestone: GoalMilestoneDto) {
    const title = editMilestoneTitle.trim()
    if (!title) return
    setMilestoneSaving(true)
    setMilestoneError(null)
    try {
      await updateGoalMilestone(milestone.goalId, milestone.id, {
        title,
        deadline: editMilestoneDeadline || null,
        completed: Boolean(milestone.completed),
        sortOrder: milestone.sortOrder,
      })
      resetMilestoneEditor()
      await loadMilestones(milestone.goalId, milestonePage)
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : '保存里程碑失败')
    } finally {
      setMilestoneSaving(false)
    }
  }

  async function onDeleteMilestone(milestone: GoalMilestoneDto) {
    if (!window.confirm(`删除里程碑“${milestone.title}”？`)) return
    setMilestoneSaving(true)
    setMilestoneError(null)
    try {
      await deleteGoalMilestone(milestone.goalId, milestone.id)
      if (editingMilestoneId === milestone.id) resetMilestoneEditor()
      const nextPage = milestones.length === 1 && milestonePage > 0
        ? milestonePage - 1
        : milestonePage
      await loadMilestones(milestone.goalId, nextPage)
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : '删除里程碑失败')
    } finally {
      setMilestoneSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const milestoneTotalPages = Math.max(1, Math.ceil(milestoneTotal / MILESTONE_PAGE_SIZE))
  const current = items.find((item) => item.currentFlag)

  return (
    <section className="goals">
      <h2>学习目标</h2>
      <p className="goals__hint">
        在此设立目标后，tu 工作区「学习计划」视图可选用并同步修改当前目标。
      </p>

      {current ? (
        <div className="goals__current">
          <span className="goals__current-label">当前目标</span>
          <strong>{current.title}</strong>
          <span className="goals__current-deadline">{deadlineLabel(current.deadline)}</span>
          <button
            type="button"
            className="icon-button"
            title="取消当前目标"
            aria-label="取消当前目标"
            disabled={saving}
            onClick={() => void onClearCurrent()}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <p className="goals__hint">尚未设置当前目标。</p>
      )}

      <div className="goals__composer">
        <input
          className="goals__input"
          value={draftTitle}
          placeholder="新目标标题，例如：掌握图算法"
          disabled={saving}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onCreate()
          }}
        />
        <label className="date-field">
          <CalendarDays size={16} />
          <input
            type="date"
            value={draftDeadline}
            disabled={saving}
            aria-label="目标截至日期"
            onChange={(e) => setDraftDeadline(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button button--primary"
          disabled={saving || !draftTitle.trim()}
          onClick={() => void onCreate()}
        >
          <Plus size={16} />
          新建目标
        </button>
      </div>

      {error ? <p className="goals__error">{error}</p> : null}
      {loading ? <p className="goals__hint">加载中…</p> : null}

      <ul className="goals__list">
        {items.map((goal) => (
          <li key={goal.id} className={goal.currentFlag ? 'goals__item goals__item--current' : 'goals__item'}>
            {editingId === goal.id ? (
              <div className="goals__edit">
                <input
                  className="goals__input"
                  value={editTitle}
                  disabled={saving}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <label className="date-field">
                  <CalendarDays size={16} />
                  <input
                    type="date"
                    value={editDeadline}
                    disabled={saving}
                    aria-label="编辑目标截至日期"
                    onChange={(e) => setEditDeadline(e.target.value)}
                  />
                </label>
                <button className="button button--primary" type="button" disabled={saving} onClick={() => void onSaveEdit()}>
                  保存
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditingId(null)
                    setEditTitle('')
                    setEditDeadline('')
                  }}
                >
                  取消
                </button>
              </div>
            ) : (
              <>
                <div className="goals__item-summary">
                  <div className="goals__item-main">
                    <span className="goals__title">{goal.title}</span>
                    <span className="goals__meta">
                      {sourceLabel(String(goal.sourceKind))}
                      {goal.currentFlag ? ' · 当前' : ''}
                      {' · '}{deadlineLabel(goal.deadline)}
                      {' · 更新于 '}{formatWhen(goal.updatedAt)}
                    </span>
                  </div>
                  <div className="goals__item-actions">
                    <button
                      type="button"
                      className="button button--compact"
                      aria-expanded={expandedTermsGoalId === goal.id}
                      aria-controls={`goal-task-terms-${goal.id}`}
                      disabled={saving || milestoneSaving}
                      onClick={() => toggleTaskTerms(goal.id)}
                    >
                      <ListTodo size={15} />
                      任务条款
                      {expandedTermsGoalId === goal.id
                        ? <ChevronUp size={14} />
                        : <ChevronDown size={14} />}
                    </button>
                    <button
                      type="button"
                      className="button button--compact"
                      aria-expanded={expandedGoalId === goal.id}
                      aria-controls={`goal-milestones-${goal.id}`}
                      disabled={saving || milestoneSaving}
                      onClick={() => toggleMilestones(goal.id)}
                    >
                      <Flag size={15} />
                      里程碑
                      {expandedGoalId === goal.id
                        ? <ChevronUp size={14} />
                        : <ChevronDown size={14} />}
                    </button>
                    {!goal.currentFlag ? (
                      <button
                        type="button"
                        className="icon-button"
                        title="设为当前目标"
                        aria-label={`将 ${goal.title} 设为当前目标`}
                        disabled={saving || milestoneSaving}
                        onClick={() => void onSetCurrent(goal.id)}
                      >
                        <Star size={16} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-button"
                      title="编辑目标"
                      aria-label={`编辑 ${goal.title}`}
                      disabled={saving || milestoneSaving}
                      onClick={() => startEdit(goal)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      title="删除目标"
                      aria-label={`删除 ${goal.title}`}
                      disabled={saving || milestoneSaving}
                      onClick={() => void onDelete(goal.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {expandedGoalId === goal.id ? (
                  <section
                    id={`goal-milestones-${goal.id}`}
                    className="goal-milestones"
                    aria-label={`${goal.title}的里程碑`}
                  >
                    <div className="goal-milestones__heading">
                      <div>
                        <h3>阶段里程碑</h3>
                        <p>
                          {milestoneTotal > 0
                            ? `共 ${milestoneTotal} 个阶段任务`
                            : '按顺序拆分目标阶段'}
                        </p>
                      </div>
                      <Flag size={18} aria-hidden="true" />
                    </div>

                    <div className="milestone-composer">
                      <input
                        value={milestoneTitle}
                        maxLength={200}
                        placeholder="添加阶段任务"
                        aria-label="里程碑标题"
                        disabled={milestoneSaving}
                        onChange={(event) => setMilestoneTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void onCreateMilestone(goal.id)
                        }}
                      />
                      <input
                        type="date"
                        value={milestoneDeadline}
                        max={goal.deadline ?? undefined}
                        aria-label="里程碑截止日期"
                        disabled={milestoneSaving}
                        onChange={(event) => setMilestoneDeadline(event.target.value)}
                      />
                      <button
                        type="button"
                        className="icon-button icon-button--primary"
                        title="添加里程碑"
                        aria-label="添加里程碑"
                        disabled={milestoneSaving || !milestoneTitle.trim()}
                        onClick={() => void onCreateMilestone(goal.id)}
                      >
                        <Plus size={17} />
                      </button>
                    </div>

                    {milestoneError ? <p className="goals__error">{milestoneError}</p> : null}

                    <div className="milestone-list-region" aria-live="polite">
                      {milestoneLoading ? <p className="milestone-empty">加载中…</p> : null}
                      {!milestoneLoading && milestones.length === 0 ? (
                        <div className="milestone-empty">
                          <Flag size={24} />
                          <span>还没有里程碑</span>
                        </div>
                      ) : null}
                      {!milestoneLoading && milestones.length > 0 ? (
                        <ol className="milestone-list">
                          {milestones.map((milestone) => (
                            <li
                              key={milestone.id}
                              className={milestone.completed
                                ? 'milestone-row milestone-row--done'
                                : 'milestone-row'}
                            >
                              {editingMilestoneId === milestone.id ? (
                                <div className="milestone-edit">
                                  <input
                                    value={editMilestoneTitle}
                                    maxLength={200}
                                    aria-label="编辑里程碑标题"
                                    disabled={milestoneSaving}
                                    onChange={(event) => setEditMilestoneTitle(event.target.value)}
                                  />
                                  <input
                                    type="date"
                                    value={editMilestoneDeadline}
                                    max={goal.deadline ?? undefined}
                                    aria-label="编辑里程碑截止日期"
                                    disabled={milestoneSaving}
                                    onChange={(event) => setEditMilestoneDeadline(event.target.value)}
                                  />
                                  <button
                                    type="button"
                                    className="button button--primary button--compact"
                                    disabled={milestoneSaving || !editMilestoneTitle.trim()}
                                    onClick={() => void onSaveMilestone(milestone)}
                                  >
                                    保存
                                  </button>
                                  <button
                                    type="button"
                                    className="button button--compact"
                                    disabled={milestoneSaving}
                                    onClick={resetMilestoneEditor}
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <label className="milestone-check">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(milestone.completed)}
                                      disabled={milestoneSaving}
                                      onChange={() => void onToggleMilestone(milestone)}
                                    />
                                    <span>
                                      <strong>{milestone.title}</strong>
                                      <small>
                                        第 {milestone.sortOrder} 阶段 · {deadlineLabel(milestone.deadline)}
                                      </small>
                                    </span>
                                  </label>
                                  <div className="milestone-row__actions">
                                    <button
                                      type="button"
                                      className="icon-button"
                                      title="编辑里程碑"
                                      aria-label={`编辑里程碑 ${milestone.title}`}
                                      disabled={milestoneSaving}
                                      onClick={() => startMilestoneEdit(milestone)}
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-button icon-button--danger"
                                      title="删除里程碑"
                                      aria-label={`删除里程碑 ${milestone.title}`}
                                      disabled={milestoneSaving}
                                      onClick={() => void onDeleteMilestone(milestone)}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </>
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </div>

                    <div className="milestone-pager">
                      <button
                        type="button"
                        className="button button--compact"
                        disabled={milestoneLoading || milestoneSaving || milestonePage <= 0}
                        onClick={() => void loadMilestones(goal.id, milestonePage - 1)}
                      >
                        上一页
                      </button>
                      <span>{milestonePage + 1} / {milestoneTotalPages}</span>
                      <button
                        type="button"
                        className="button button--compact"
                        disabled={milestoneLoading
                          || milestoneSaving
                          || milestonePage + 1 >= milestoneTotalPages}
                        onClick={() => void loadMilestones(goal.id, milestonePage + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  </section>
                ) : null}

                {expandedTermsGoalId === goal.id ? (
                  <div id={`goal-task-terms-${goal.id}`} className="goal-terms-host">
                    <GoalTaskTermsPanel goal={goal} />
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>

      {items.length === 0 && !loading ? (
        <p className="goals__hint">暂无目标，先在上方新建一条。</p>
      ) : null}

      <div className="goals__pager">
        <button
          type="button"
          disabled={saving || page <= 0}
          onClick={() => void reload(page - 1)}
        >
          上一页
        </button>
        <span>
          {page + 1}
          /
          {totalPages}
          （共
          {total}
          条）
        </span>
        <button
          type="button"
          disabled={saving || page + 1 >= totalPages}
          onClick={() => void reload(page + 1)}
        >
          下一页
        </button>
      </div>
    </section>
  )
}
