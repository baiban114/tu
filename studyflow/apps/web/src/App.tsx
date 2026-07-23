import { useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { fetchLearningHealth } from '@studyflow/api'
import { formatStudyMinutes } from '@studyflow/core'
import NotesPage from './NotesPage'

export default function App() {
  const [health, setHealth] = useState<string>('检查中…')

  useEffect(() => {
    void fetchLearningHealth()
      .then((res) => setHealth(res.status))
      .catch(() => setHealth('未连接 studyflow-service'))
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <h1>StudyFlow</h1>
        <p className="app__tagline">学习驾驶舱 · monorepo `studyflow/` + `studyflow-service/`</p>
      </header>

      <nav className="app__nav">
        <Link to="/">今日</Link>
        <Link to="/notes">记录</Link>
        <Link to="/mastery">掌握度</Link>
        <Link to="/insights">洞察</Link>
      </nav>

      <main className="app__main">
        <Routes>
          <Route
            path="/"
            element={(
              <section>
                <h2>今日</h2>
                <p>后端状态：{health}</p>
                <p>示例：{formatStudyMinutes(95)} 学习时长</p>
                <p>
                  个人状态先从
                  {' '}
                  <Link to="/notes">纯文本记录</Link>
                  {' '}
                  开始。
                </p>
              </section>
            )}
          />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/mastery" element={<section><h2>掌握度</h2><p>待实现</p></section>} />
          <Route path="/insights" element={<section><h2>洞察</h2><p>待实现</p></section>} />
        </Routes>
      </main>
    </div>
  )
}
