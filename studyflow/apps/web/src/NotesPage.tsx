import { useCallback, useEffect, useState } from 'react'
import {
  createPersonalNote,
  deletePersonalNote,
  listPersonalNotes,
  updatePersonalNote,
  type PersonalNoteDto,
} from '@studyflow/api'

function previewLine(body: string): string {
  const line = body.trim().split(/\r?\n/)[0] ?? ''
  if (line.length <= 80) return line || '（空）'
  return `${line.slice(0, 80)}…`
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function NotesPage() {
  const [items, setItems] = useState<PersonalNoteDto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 10
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (nextPage = page) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listPersonalNotes(nextPage, pageSize)
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
    const body = draft.trim()
    if (!body) return
    setSaving(true)
    setError(null)
    try {
      await createPersonalNote(body)
      setDraft('')
      await reload(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(note: PersonalNoteDto) {
    setEditingId(note.id)
    setEditBody(note.body)
  }

  async function onSaveEdit() {
    if (!editingId) return
    const body = editBody.trim()
    if (!body) return
    setSaving(true)
    setError(null)
    try {
      await updatePersonalNote(editingId, body)
      setEditingId(null)
      setEditBody('')
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('删除这条记录？')) return
    setSaving(true)
    setError(null)
    try {
      await deletePersonalNote(id)
      if (editingId === id) {
        setEditingId(null)
        setEditBody('')
      }
      await reload(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="notes">
      <h2>个人记录</h2>
      <p className="notes__hint">先用纯文本记状态；属性定型后再结构化。</p>

      <div className="notes__composer">
        <textarea
          className="notes__textarea"
          rows={5}
          placeholder="写一条记录…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
        />
        <button
          type="button"
          className="notes__btn notes__btn--primary"
          disabled={saving || !draft.trim()}
          onClick={() => void onCreate()}
        >
          保存
        </button>
      </div>

      {error ? <p className="notes__error">{error}</p> : null}
      {loading ? <p className="notes__meta">加载中…</p> : null}

      <ul className="notes__list">
        {items.map((note) => (
          <li key={note.id} className="notes__item">
            {editingId === note.id ? (
              <div className="notes__edit">
                <textarea
                  className="notes__textarea"
                  rows={6}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  disabled={saving}
                />
                <div className="notes__actions">
                  <button
                    type="button"
                    className="notes__btn notes__btn--primary"
                    disabled={saving || !editBody.trim()}
                    onClick={() => void onSaveEdit()}
                  >
                    更新
                  </button>
                  <button
                    type="button"
                    className="notes__btn"
                    disabled={saving}
                    onClick={() => {
                      setEditingId(null)
                      setEditBody('')
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="notes__item-btn"
                onClick={() => startEdit(note)}
              >
                <span className="notes__preview">{previewLine(note.body)}</span>
                <span className="notes__when">{formatWhen(note.updatedAt)}</span>
              </button>
            )}
            {editingId !== note.id ? (
              <button
                type="button"
                className="notes__btn notes__btn--danger"
                disabled={saving}
                onClick={() => void onDelete(note.id)}
              >
                删除
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {!loading && items.length === 0 ? (
        <p className="notes__meta">还没有记录。</p>
      ) : null}

      {total > pageSize ? (
        <div className="notes__pager">
          <button
            type="button"
            className="notes__btn"
            disabled={saving || page <= 0}
            onClick={() => void reload(page - 1)}
          >
            上一页
          </button>
          <span className="notes__meta">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="notes__btn"
            disabled={saving || page + 1 >= totalPages}
            onClick={() => void reload(page + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}
    </section>
  )
}
