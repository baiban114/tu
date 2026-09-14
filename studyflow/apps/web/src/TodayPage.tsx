import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CalendarDays,
  Check,
  Pencil,
  Plus,
  Repeat2,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { zhCN } from 'react-day-picker/locale'
import {
  createDailyPlan,
  deleteDailyPlan,
  fetchLearningHealth,
  listDailyPlans,
  listLearningGoals,
  repeatDailyPlan,
  summarizeDailyPlans,
  updateDailyPlan,
  updateDailyPlanSeries,
  type DailyPlanDaySummaryDto,
  type DailyPlanDto,
  type DailyPlanRepeatUnitDto,
  type LearningGoalDto,
} from '@studyflow/api'

const PAGE_SIZE = 10

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function monthRange(month: Date): [string, string] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  return [toDateKey(first), toDateKey(last)]
}

function formatSelectedDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date)
}

function nextDateKey(value: string): string {
  const date = fromDateKey(value)
  date.setDate(date.getDate() + 1)
  return toDateKey(date)
}

function formatPlanAmount(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
}

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [displayMonth, setDisplayMonth] = useState(() => new Date())
  const [summaries, setSummaries] = useState<DailyPlanDaySummaryDto[]>([])
  const [plans, setPlans] = useState<DailyPlanDto[]>([])
  const [goals, setGoals] = useState<LearningGoalDto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [draft, setDraft] = useState('')
  const [goalId, setGoalId] = useState('')
  const [health, setHealth] = useState('检查中')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [repeatPlan, setRepeatPlan] = useState<DailyPlanDto | null>(null)
  const [repeatUnit, setRepeatUnit] = useState<DailyPlanRepeatUnitDto>('WEEK')
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatEndDate, setRepeatEndDate] = useState('')
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [editPlanTitle, setEditPlanTitle] = useState('')
  const [editPlanGoalId, setEditPlanGoalId] = useState('')
  const [editWholeSeries, setEditWholeSeries] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadCalendar = useCallback(async (month: Date) => {
    const [startDate, endDate] = monthRange(month)
    const result = await summarizeDailyPlans(startDate, endDate)
    setSummaries(result)
  }, [])

  const loadDay = useCallback(async (date: Date, nextPage = 0) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listDailyPlans(toDateKey(date), nextPage, PAGE_SIZE)
      setPlans(result.items)
      setTotal(result.total)
      setPage(result.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载每日计划失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchLearningHealth()
      .then((result) => setHealth(result.status))
      .catch(() => setHealth('服务未连接'))
    void listLearningGoals(0, 100)
      .then((result) => {
        setGoals(result.items)
        setGoalId(result.items.find((goal) => goal.currentFlag)?.id ?? '')
      })
      .catch(() => setGoals([]))
  }, [])

  useEffect(() => {
    void loadCalendar(displayMonth).catch((err) => {
      setError(err instanceof Error ? err.message : '加载月历失败')
    })
  }, [displayMonth, loadCalendar])

  useEffect(() => {
    void loadDay(selectedDate, 0)
  }, [selectedDate, loadDay])

  useEffect(() => {
    if (!repeatPlan) return undefined
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRepeatPlan(null)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [repeatPlan])

  const summaryByDate = useMemo(
    () => new Map(summaries.map((summary) => [summary.date, summary])),
    [summaries],
  )
  const daysWithPlans = useMemo(
    () => summaries.map((summary) => fromDateKey(summary.date)),
    [summaries],
  )
  const completedDays = useMemo(
    () => summaries
      .filter((summary) => summary.total > 0 && summary.completed === summary.total)
      .map((summary) => fromDateKey(summary.date)),
    [summaries],
  )

  const selectedKey = toDateKey(selectedDate)
  const todayKey = toDateKey(new Date())
  const selectedSummary = summaryByDate.get(selectedKey)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const serviceAvailable = health === 'UP' || health.toLowerCase() === 'ok'

  async function refreshAfterChange(nextPage = page) {
    await Promise.all([
      loadDay(selectedDate, nextPage),
      loadCalendar(displayMonth),
    ])
  }

  async function onCreate() {
    const title = draft.trim()
    if (!title) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await createDailyPlan({
        title,
        planDate: selectedKey,
        goalId: goalId || null,
        completed: false,
      })
      setDraft('')
      await refreshAfterChange(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建计划失败')
    } finally {
      setSaving(false)
    }
  }

  async function onToggle(plan: DailyPlanDto) {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await updateDailyPlan(plan.id, {
        title: plan.title,
        planDate: plan.planDate,
        goalId: plan.goalId,
        completed: !plan.completed,
      })
      await refreshAfterChange(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新计划失败')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(plan: DailyPlanDto) {
    if (!window.confirm(`删除“${plan.title}”？`)) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await deleteDailyPlan(plan.id)
      if (editingPlanId === plan.id) cancelPlanEdit()
      const nextPage = plans.length === 1 && page > 0 ? page - 1 : page
      await refreshAfterChange(nextPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除计划失败')
    } finally {
      setSaving(false)
    }
  }

  function startPlanEdit(plan: DailyPlanDto) {
    setEditingPlanId(plan.id)
    setEditPlanTitle(plan.title)
    setEditPlanGoalId(plan.goalId ?? '')
    setEditWholeSeries(Boolean(plan.repeatSeriesId))
    setError(null)
    setNotice(null)
  }

  function cancelPlanEdit() {
    setEditingPlanId(null)
    setEditPlanTitle('')
    setEditPlanGoalId('')
    setEditWholeSeries(false)
  }

  async function onSavePlan(plan: DailyPlanDto) {
    const title = editPlanTitle.trim()
    if (!title) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await updateDailyPlanSeries(plan.id, {
        title,
        goalId: editPlanGoalId || null,
        updateWholeSeries: editWholeSeries,
      })
      cancelPlanEdit()
      setNotice(editWholeSeries
        ? `已修改循环任务，共更新 ${result.updatedCount} 项`
        : '已修改任务')
      await refreshAfterChange(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改任务失败')
    } finally {
      setSaving(false)
    }
  }

  async function onPostponeToToday(plan: DailyPlanDto) {
    const targetDate = toDateKey(new Date())
    if (plan.completed || plan.planDate >= targetDate) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await updateDailyPlan(plan.id, {
        title: plan.title,
        planDate: targetDate,
        goalId: plan.goalId,
        completed: false,
      })
      const nextPage = plans.length === 1 && page > 0 ? page - 1 : page
      setNotice(`已将“${plan.title}”延后到今天`)
      await refreshAfterChange(nextPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : '延后计划失败')
    } finally {
      setSaving(false)
    }
  }

  function openRepeatDialog(plan: DailyPlanDto) {
    setRepeatPlan(plan)
    setRepeatUnit('WEEK')
    setRepeatInterval(1)
    setRepeatEndDate(plan.goalDeadline ?? '')
    setError(null)
    setNotice(null)
  }

  async function onRepeat() {
    if (!repeatPlan || !repeatEndDate) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await repeatDailyPlan(repeatPlan.id, {
        unit: repeatUnit,
        interval: repeatInterval,
        endDate: repeatEndDate,
      })
      setRepeatPlan(null)
      setNotice(`已生成 ${result.createdCount} 项，跳过 ${result.skippedCount} 项`)
      await refreshAfterChange(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建循环计划失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="today-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">每日计划</span>
          <h2>{formatSelectedDate(selectedDate)}</h2>
        </div>
        <span className={serviceAvailable ? 'service-status service-status--up' : 'service-status'}>
          {health}
        </span>
      </header>

      <div className="today-layout">
        <div className="calendar-panel" aria-label="每日计划日历">
          <DayPicker
            animate
            fixedWeeks
            locale={zhCN}
            mode="single"
            month={displayMonth}
            selected={selectedDate}
            showOutsideDays
            onMonthChange={setDisplayMonth}
            onSelect={(date) => {
              if (date) setSelectedDate(date)
            }}
            modifiers={{ hasPlans: daysWithPlans, completed: completedDays }}
            modifiersClassNames={{
              hasPlans: 'calendar-day--planned',
              completed: 'calendar-day--completed',
            }}
          />
          <div className="calendar-legend" aria-label="日历图例">
            <span><i className="legend-dot legend-dot--planned" />有计划</span>
            <span><i className="legend-dot legend-dot--done" />已全部完成</span>
          </div>
        </div>

        <div className="agenda-panel">
          <div className="agenda-panel__header">
            <div>
              <h3>{selectedKey}</h3>
              <p>
                {selectedSummary
                  ? `${selectedSummary.completed}/${selectedSummary.total} 项已完成`
                  : '当天尚无安排'}
              </p>
            </div>
            <CalendarDays size={20} aria-hidden="true" />
          </div>

          <div className="plan-composer">
            <input
              value={draft}
              maxLength={240}
              placeholder="添加当天计划"
              disabled={saving}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void onCreate()
              }}
            />
            <select
              value={goalId}
              disabled={saving}
              aria-label="关联学习目标"
              onChange={(event) => setGoalId(event.target.value)}
            >
              <option value="">不关联目标</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.title}</option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button icon-button--primary"
              title="添加计划"
              aria-label="添加计划"
              disabled={saving || !draft.trim()}
              onClick={() => void onCreate()}
            >
              <Plus size={18} />
            </button>
          </div>

          {error ? <p className="inline-error">{error}</p> : null}
          {notice ? <p className="inline-notice">{notice}</p> : null}

          <div className="plan-list-region" aria-live="polite">
            {loading ? <p className="empty-state">加载中…</p> : null}
            {!loading && plans.length === 0 ? (
              <div className="empty-state">
                <CalendarDays size={28} />
                <span>这一天还没有计划</span>
              </div>
            ) : null}
            {!loading ? (
              <ul className="plan-list">
                {plans.map((plan) => (
                  <li key={plan.id} className={plan.completed ? 'plan-row plan-row--done' : 'plan-row'}>
                    {editingPlanId === plan.id ? (
                      <div className="plan-edit">
                        <div className="plan-edit__fields">
                          <input
                            value={editPlanTitle}
                            maxLength={240}
                            aria-label="编辑任务标题"
                            disabled={saving}
                            onChange={(event) => setEditPlanTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void onSavePlan(plan)
                            }}
                          />
                          <select
                            value={editPlanGoalId}
                            aria-label="编辑任务关联目标"
                            disabled={saving}
                            onChange={(event) => setEditPlanGoalId(event.target.value)}
                          >
                            <option value="">不关联目标</option>
                            {goals.map((goal) => (
                              <option key={goal.id} value={goal.id}>{goal.title}</option>
                            ))}
                          </select>
                        </div>
                        <div className="plan-edit__footer">
                          <div className="plan-edit__scope" role="group" aria-label="修改范围">
                            <button
                              type="button"
                              className={!editWholeSeries ? 'is-active' : ''}
                              aria-pressed={!editWholeSeries}
                              disabled={saving}
                              onClick={() => setEditWholeSeries(false)}
                            >
                              当前任务
                            </button>
                            <button
                              type="button"
                              className={editWholeSeries ? 'is-active' : ''}
                              aria-pressed={editWholeSeries}
                              disabled={saving}
                              onClick={() => setEditWholeSeries(true)}
                            >
                              整个循环组
                            </button>
                          </div>
                          <div className="plan-edit__actions">
                            <button
                              type="button"
                              className="button button--primary button--compact"
                              disabled={saving || !editPlanTitle.trim()}
                              onClick={() => void onSavePlan(plan)}
                            >
                              <Check size={15} />
                              {editWholeSeries ? '保存整组' : '保存'}
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              title="取消修改"
                              aria-label="取消修改"
                              disabled={saving}
                              onClick={cancelPlanEdit}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <label className="plan-check">
                          <input
                            type="checkbox"
                            checked={Boolean(plan.completed)}
                            disabled={saving}
                            onChange={() => void onToggle(plan)}
                          />
                          <span>{plan.title}</span>
                        </label>
                        <div className="plan-row__meta">
                          {plan.plannedAmount != null ? (
                            <span className="plan-row__amount">数量 {formatPlanAmount(plan.plannedAmount)}</span>
                          ) : null}
                          {plan.goalTermSequenceNumber != null && plan.goalTermSequenceTotal != null ? (
                            <span className="plan-row__sequence">
                              序列 {plan.goalTermSequenceNumber}/{plan.goalTermSequenceTotal}
                            </span>
                          ) : null}
                          {plan.goalTitle ? (
                            <span><Target size={13} />{plan.goalTitle}</span>
                          ) : null}
                          {plan.repeatSeriesId ? (
                            <span className="plan-row__series"><Repeat2 size={13} />循环</span>
                          ) : null}
                          {!plan.completed && plan.planDate < todayKey ? (
                            <button
                              type="button"
                              className="icon-button"
                              title="延后到今天"
                              aria-label={`将 ${plan.title} 延后到今天`}
                              disabled={saving}
                              onClick={() => void onPostponeToToday(plan)}
                            >
                              <CalendarClock size={15} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="icon-button"
                            title="修改任务"
                            aria-label={`修改 ${plan.title}`}
                            disabled={saving}
                            onClick={() => startPlanEdit(plan)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            title="循环计划"
                            aria-label={`循环 ${plan.title}`}
                            disabled={saving}
                            onClick={() => openRepeatDialog(plan)}
                          >
                            <Repeat2 size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button--danger"
                            title="删除计划"
                            aria-label={`删除 ${plan.title}`}
                            disabled={saving}
                            onClick={() => void onDelete(plan)}
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

          <div className="agenda-pager">
            <button
              type="button"
              className="button"
              disabled={loading || page <= 0}
              onClick={() => void loadDay(selectedDate, page - 1)}
            >
              上一页
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              type="button"
              className="button"
              disabled={loading || page + 1 >= totalPages}
              onClick={() => void loadDay(selectedDate, page + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {repeatPlan ? (
        <div
          className="repeat-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRepeatPlan(null)
          }}
        >
          <section
            className="repeat-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="repeat-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="repeat-dialog__header">
              <div>
                <span className="eyebrow">循环计划</span>
                <h3 id="repeat-dialog-title">{repeatPlan.title}</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                title="关闭"
                aria-label="关闭循环设置"
                disabled={saving}
                onClick={() => setRepeatPlan(null)}
              >
                <X size={17} />
              </button>
            </header>

            <div className="repeat-dialog__body">
              <fieldset className="repeat-fieldset">
                <legend>周期</legend>
                <div className="repeat-unit-control">
                  {([
                    ['DAY', '天'],
                    ['WEEK', '周'],
                    ['MONTH', '月'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={repeatUnit === value ? 'repeat-unit repeat-unit--active' : 'repeat-unit'}
                      aria-pressed={repeatUnit === value}
                      disabled={saving}
                      onClick={() => setRepeatUnit(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="repeat-form-field">
                <span>每隔</span>
                <div className="repeat-interval-field">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={repeatInterval}
                    disabled={saving}
                    onChange={(event) => setRepeatInterval(Number(event.target.value))}
                  />
                  <span>{{ DAY: '天', WEEK: '周', MONTH: '月' }[repeatUnit]}</span>
                </div>
              </label>

              <label className="repeat-form-field">
                <span>截至日期</span>
                <input
                  type="date"
                  min={nextDateKey(repeatPlan.planDate)}
                  value={repeatEndDate}
                  required
                  disabled={saving}
                  onChange={(event) => setRepeatEndDate(event.target.value)}
                />
                {!repeatEndDate ? (
                  <small className="repeat-form-field__error">
                    {repeatPlan.goalId
                      ? '关联目标未设置截止日期，请先选择截至日期'
                      : '请选择截至日期'}
                  </small>
                ) : repeatEndDate <= repeatPlan.planDate ? (
                  <small className="repeat-form-field__error">
                    截至日期需晚于计划日期
                  </small>
                ) : null}
              </label>
            </div>

            <footer className="repeat-dialog__footer">
              <button
                type="button"
                className="button"
                disabled={saving}
                onClick={() => setRepeatPlan(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={saving
                  || !repeatEndDate
                  || repeatEndDate <= repeatPlan.planDate
                  || repeatInterval < 1
                  || repeatInterval > 365}
                onClick={() => void onRepeat()}
              >
                <Repeat2 size={16} />
                创建循环
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  )
}
