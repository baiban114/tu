import { Link, Route, Routes } from 'react-router-dom'
import NotesPage from './NotesPage'
import GoalsPage from './GoalsPage'
import MasteryPage from './MasteryPage'
import TodayPage from './TodayPage'

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>StudyFlow</h1>
        <p className="app__tagline">学习驾驶舱 · monorepo `studyflow/` + `studyflow-service/`</p>
      </header>

      <nav className="app__nav">
        <Link to="/">今日</Link>
        <Link to="/goals">目标</Link>
        <Link to="/notes">记录</Link>
        <Link to="/mastery">掌握度</Link>
        <Link to="/insights">洞察</Link>
      </nav>

      <main className="app__main">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/mastery" element={<MasteryPage />} />
          <Route path="/insights" element={<section><h2>洞察</h2><p>待实现</p></section>} />
        </Routes>
      </main>
    </div>
  )
}
