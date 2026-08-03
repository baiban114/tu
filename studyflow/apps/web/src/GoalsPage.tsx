import { useCallback, useEffect, useState } from 'react'
import {
  clearCurrentLearningGoal,
  createLearningGoal,
  deleteLearningGoal,
  listLearningGoals,
  setCurrentLearningGoal,
  updateLearningGoal,
  type LearningGoalDto,
} from '@studyflow/api'

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

export default function GoalsPage() {
  const [items, setItems] = useState<LearningGoalDto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 10
  const [draftTitle, setDraftTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      })
      setDraftTitle('')
      await reload(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(goal: LearningGoalDto) {
    setEditingId(goal.id)
    setEditTitle(goal.title)
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
      })
      setEditingId(null)
      setEditTitle('')
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
      }
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
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
          <button type="button" disabled={saving} onClick={() => void onClearCurrent()}>
            取消当前
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
        <button type="button" disabled={saving || !draftTitle.trim()} onClick={() => void onCreate()}>
          新建并设为当前
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
                <button type="button" disabled={saving} onClick={() => void onSaveEdit()}>保存</button>
                <button type="button" disabled={saving} onClick={() => setEditingId(null)}>取消</button>
              </div>
            ) : (
              <>
                <div className="goals__item-main">
                  <span className="goals__title">{goal.title}</span>
                  <span className="goals__meta">
                    {sourceLabel(String(goal.sourceKind))}
                    {goal.currentFlag ? ' · 当前' : ''}
                    {' · '}
                    {formatWhen(goal.updatedAt)}
                  </span>
                </div>
                <div className="goals__item-actions">
                  {!goal.currentFlag ? (
                    <button type="button" disabled={saving} onClick={() => void onSetCurrent(goal.id)}>
                      设为当前
                    </button>
                  ) : null}
                  <button type="button" disabled={saving} onClick={() => startEdit(goal)}>编辑</button>
                  <button type="button" disabled={saving} onClick={() => void onDelete(goal.id)}>删除</button>
                </div>
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
