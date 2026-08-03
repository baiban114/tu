import { useCallback, useEffect, useState } from 'react'
import {
  deleteKnowledgePointMastery,
  listKnowledgePointMastery,
  upsertKnowledgePointMastery,
  type KnowledgePointMasteryDto,
  type MasteryStatusDto,
} from '@studyflow/api'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'mastered':
      return '已掌握'
    case 'learning':
      return '学习中'
    default:
      return '未学'
  }
}

export default function MasteryPage() {
  const [items, setItems] = useState<KnowledgePointMasteryDto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 10
  const [pointId, setPointId] = useState('')
  const [kbId, setKbId] = useState('')
  const [status, setStatus] = useState<MasteryStatusDto>('learning')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (nextPage = page) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listKnowledgePointMastery(nextPage, pageSize)
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

  async function onUpsert() {
    const id = pointId.trim()
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await upsertKnowledgePointMastery({
        knowledgePointId: id,
        kbId: kbId.trim() || null,
        status,
      })
      setPointId('')
      await reload(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function onCycle(row: KnowledgePointMasteryDto) {
    const next: MasteryStatusDto =
      row.status === 'unknown'
        ? 'learning'
        : row.status === 'learning'
          ? 'mastered'
          : 'unknown'
    setSaving(true)
    setError(null)
    try {
      await upsertKnowledgePointMastery({
        knowledgePointId: row.knowledgePointId,
        kbId: row.kbId,
        status: next,
        score: row.score,
        note: row.note,
      })
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(row: KnowledgePointMasteryDto) {
    setSaving(true)
    setError(null)
    try {
      await deleteKnowledgePointMastery(row.knowledgePointId)
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="mastery-page">
      <h2>掌握度</h2>
      <p className="muted">
        按知识点记录学习状态（未学 / 学习中 / 已掌握）。tu 学习计划视图会订阅投影以高亮「建议下一项」。
      </p>

      <div className="mastery-page__form">
        <input
          value={pointId}
          placeholder="知识点 ID"
          onChange={(e) => setPointId(e.target.value)}
        />
        <input
          value={kbId}
          placeholder="知识库 ID（可选）"
          onChange={(e) => setKbId(e.target.value)}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as MasteryStatusDto)}
        >
          <option value="unknown">未学</option>
          <option value="learning">学习中</option>
          <option value="mastered">已掌握</option>
        </select>
        <button type="button" disabled={saving || !pointId.trim()} onClick={() => void onUpsert()}>
          保存
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">加载中…</p> : null}

      <ul className="mastery-page__list">
        {items.map((row) => (
          <li key={`${row.knowledgePointId}-${row.id ?? 'x'}`} className="mastery-page__item">
            <div>
              <strong>{row.knowledgePointId}</strong>
              {' '}
              <span className={`chip chip--${row.status}`}>{statusLabel(row.status)}</span>
              {row.kbId ? <span className="muted"> · kb {row.kbId}</span> : null}
              <div className="muted">{formatWhen(row.updatedAt)}</div>
            </div>
            <div className="mastery-page__actions">
              <button type="button" disabled={saving} onClick={() => void onCycle(row)}>
                切换状态
              </button>
              <button type="button" disabled={saving} onClick={() => void onDelete(row)}>
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>

      {items.length === 0 && !loading ? (
        <p className="muted">尚无掌握度记录。可在上方录入，或从 tu 学习计划行上切换状态。</p>
      ) : null}

      <div className="mastery-page__pager">
        <button
          type="button"
          disabled={page <= 0 || loading}
          onClick={() => void reload(page - 1)}
        >
          上一页
        </button>
        <span>
          {page + 1}
          /
          {totalPages}
        </span>
        <button
          type="button"
          disabled={page + 1 >= totalPages || loading}
          onClick={() => void reload(page + 1)}
        >
          下一页
        </button>
      </div>
    </section>
  )
}
