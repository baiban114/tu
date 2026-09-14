import { useCallback, useEffect, useState } from 'react'
import { CalendarRange, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createGoalTaskTerm,
  deleteGoalTaskTerm,
  distributeGoalTaskTerm,
  listGoalTaskTerms,
  updateGoalTaskTerm,
  type GoalTaskTermDto,
  type LearningGoalDto,
} from '@studyflow/api'

const PAGE_SIZE = 10

interface GoalTaskTermsPanelProps {
  goal: LearningGoalDto
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
}

function todayDateKey(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

export default function GoalTaskTermsPanel({ goal }: GoalTaskTermsPanelProps) {
  const [items, setItems] = useState<GoalTaskTermDto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftTotal, setDraftTotal] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editTotal, setEditTotal] = useState('')
  const [distributionStartDates, setDistributionStartDates] = useState<Record<string, string>>({})
  const [distributionEndDates, setDistributionEndDates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (nextPage = 0) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listGoalTaskTerms(goal.id, nextPage, PAGE_SIZE)
      setItems(result.items)
      setTotal(result.total)
      setPage(result.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务条款失败')
    } finally {
      setLoading(false)
    }
  }, [goal.id])

  useEffect(() => {
    void load(0)
  }, [load])

  async function onCreate() {
    const title = draftTitle.trim()
    const totalAmount = Number(draftTotal)
    if (!title || !Number.isFinite(totalAmount) || totalAmount <= 0) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await createGoalTaskTerm(goal.id, { title, totalAmount })
      setDraftTitle('')
      setDraftTotal('')
      await load(Math.max(0, Math.ceil((total + 1) / PAGE_SIZE) - 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建任务条款失败')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(term: GoalTaskTermDto) {
    setEditingId(term.id)
    setEditTitle(term.title)
    setEditTotal(String(term.totalAmount))
    setError(null)
    setNotice(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTitle('')
    setEditTotal('')
  }

  async function onSave(term: GoalTaskTermDto) {
    const title = editTitle.trim()
    const totalAmount = Number(editTotal)
    if (!title || !Number.isFinite(totalAmount) || totalAmount <= 0) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await updateGoalTaskTerm(goal.id, term.id, { title, totalAmount })
      cancelEdit()
      await load(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存任务条款失败')
    } finally {
      setSaving(false)
    }
  }

  async function onDistribute(term: GoalTaskTermDto) {
    const startDate = getDistributionStartDate(term)
    const endDate = getDistributionEndDate(term)
    if (!startDate || !endDate || startDate > endDate) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await distributeGoalTaskTerm(goal.id, term.id, { startDate, endDate })
      setDistributionStartDates((current) => ({ ...current, [term.id]: result.startDate }))
      setDistributionEndDates((current) => ({ ...current, [term.id]: result.endDate }))
      setNotice(
        `已平分到 ${result.startDate} 至 ${result.endDate}，新建 ${result.createdCount} 项，更新 ${result.updatedCount} 项`,
      )
      await load(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '自动平分失败')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(term: GoalTaskTermDto) {
    if (!window.confirm(`删除任务条款“${term.title}”？未完成的自动计划也会删除。`)) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await deleteGoalTaskTerm(goal.id, term.id)
      if (editingId === term.id) cancelEdit()
      const nextPage = items.length === 1 && page > 0 ? page - 1 : page
      await load(nextPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务条款失败')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const validDraftTotal = Number.isFinite(Number(draftTotal)) && Number(draftTotal) > 0

  function getDistributionStartDate(term: GoalTaskTermDto): string {
    return distributionStartDates[term.id] ?? term.distributionStartDate ?? todayDateKey()
  }

  function getDistributionEndDate(term: GoalTaskTermDto): string {
    return distributionEndDates[term.id]
      ?? term.distributionEndDate
      ?? goal.deadline
      ?? todayDateKey()
  }

  return (
    <section className="goal-terms" aria-label={`${goal.title}的任务条款`}>
      <div className="goal-terms__heading">
        <div>
          <h3>任务条款</h3>
          <p>
            自选开始与截止日期，按天自动平分总量
          </p>
        </div>
        <ListTodo size={18} aria-hidden="true" />
      </div>

      <div className="term-composer">
        <input
          value={draftTitle}
          maxLength={200}
          placeholder="条款，例如：完成题库"
          aria-label="任务条款标题"
          disabled={saving}
          onChange={(event) => setDraftTitle(event.target.value)}
        />
        <input
          type="number"
          min="0.01"
          max="9999999999.99"
          step="0.01"
          value={draftTotal}
          placeholder="总量"
          aria-label="任务条款总量"
          disabled={saving}
          onChange={(event) => setDraftTotal(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void onCreate()
          }}
        />
        <button
          type="button"
          className="icon-button icon-button--primary"
          title="添加任务条款"
          aria-label="添加任务条款"
          disabled={saving || !draftTitle.trim() || !validDraftTotal}
          onClick={() => void onCreate()}
        >
          <Plus size={17} />
        </button>
      </div>

      {error ? <p className="goals__error">{error}</p> : null}
      {notice ? <p className="inline-notice">{notice}</p> : null}

      <div className="term-list-region" aria-live="polite">
        {loading ? <p className="term-empty">加载中…</p> : null}
        {!loading && items.length === 0 ? (
          <div className="term-empty">
            <ListTodo size={24} />
            <span>还没有任务条款</span>
          </div>
        ) : null}
        {!loading && items.length > 0 ? (
          <ul className="term-list">
            {items.map((term) => (
              <li key={term.id} className="term-row">
                {editingId === term.id ? (
                  <div className="term-edit">
                    <input
                      value={editTitle}
                      maxLength={200}
                      aria-label="编辑任务条款标题"
                      disabled={saving}
                      onChange={(event) => setEditTitle(event.target.value)}
                    />
                    <input
                      type="number"
                      min="0.01"
                      max="9999999999.99"
                      step="0.01"
                      value={editTotal}
                      aria-label="编辑任务条款总量"
                      disabled={saving}
                      onChange={(event) => setEditTotal(event.target.value)}
                    />
                    <button
                      type="button"
                      className="button button--primary button--compact"
                      disabled={saving || !editTitle.trim() || Number(editTotal) <= 0}
                      onClick={() => void onSave(term)}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className="button button--compact"
                      disabled={saving}
                      onClick={cancelEdit}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="term-row__main">
                      <strong>{term.title}</strong>
                      <small>
                        总量 {formatAmount(term.totalAmount)}
                        {term.distributedAt
                          ? ` · 已按 ${term.distributionStartDate ?? '未记录'} 至 ${getDistributionEndDate(term)} 平分`
                          : ' · 尚未平分'}
                      </small>
                    </div>
                    <div className="term-row__actions">
                      <label className="term-distribution-date">
                        <span>开始日期</span>
                        <input
                          type="date"
                          value={getDistributionStartDate(term)}
                          max={getDistributionEndDate(term)}
                          aria-label={`${term.title}的计划开始日期`}
                          disabled={saving}
                          onChange={(event) => setDistributionStartDates((current) => ({
                            ...current,
                            [term.id]: event.target.value,
                          }))}
                        />
                      </label>
                      <label className="term-distribution-date">
                        <span>截止日期</span>
                        <input
                          type="date"
                          value={getDistributionEndDate(term)}
                          min={getDistributionStartDate(term)}
                          aria-label={`${term.title}的计划截止日期`}
                          disabled={saving}
                          onChange={(event) => setDistributionEndDates((current) => ({
                            ...current,
                            [term.id]: event.target.value,
                          }))}
                        />
                      </label>
                      <button
                        type="button"
                        className="button button--compact"
                        title="按所选起止日期平分到每日计划"
                        disabled={saving
                          || !getDistributionStartDate(term)
                          || !getDistributionEndDate(term)
                          || getDistributionStartDate(term) > getDistributionEndDate(term)}
                        onClick={() => void onDistribute(term)}
                      >
                        <CalendarRange size={15} />
                        {term.distributedAt ? '重新平分' : '平分到每日计划'}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="编辑任务条款"
                        aria-label={`编辑任务条款 ${term.title}`}
                        disabled={saving}
                        onClick={() => startEdit(term)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        title="删除任务条款"
                        aria-label={`删除任务条款 ${term.title}`}
                        disabled={saving}
                        onClick={() => void onDelete(term)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="term-pager">
        <button
          type="button"
          className="button button--compact"
          disabled={loading || saving || page <= 0}
          onClick={() => void load(page - 1)}
        >
          上一页
        </button>
        <span>{page + 1} / {totalPages}</span>
        <button
          type="button"
          className="button button--compact"
          disabled={loading || saving || page + 1 >= totalPages}
          onClick={() => void load(page + 1)}
        >
          下一页
        </button>
      </div>
    </section>
  )
}
