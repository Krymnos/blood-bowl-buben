import { HashRouter, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import Home from './pages/Home'
import NewTeam from './pages/NewTeam'
import TeamPage from './pages/TeamPage'
import PlayerPage from './pages/PlayerPage'
import MatchSetup from './pages/MatchSetup'
import LiveMatch from './pages/LiveMatch'
import PostGame from './pages/PostGame'
import MatchReport from './pages/MatchReport'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import Rules from './pages/Rules'

function MatchRouter() {
  const id = Number(useParams().mid)
  const m = useLiveQuery(() => db.matches.get(id), [id])
  if (m === undefined) return null
  if (!m) return <div className="p-6">Match not found.</div>
  if (m.status === 'setup') return <MatchSetup match={m} />
  if (m.status === 'live') return <LiveMatch match={m} />
  if (m.status === 'post') return <PostGame match={m} />
  return <MatchReport match={m} />
}

function MatchLogEditor() {
  const id = Number(useParams().mid)
  const m = useLiveQuery(() => db.matches.get(id), [id])
  if (m === undefined) return null
  if (!m) return <div className="p-6">Match not found.</div>
  return <LiveMatch match={m} edit />
}

function Nav() {
  const loc = useLocation()
  if (/^\/match\/\d+/.test(loc.pathname)) return null
  const cls = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-gold' : 'text-white/50'}`
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-xl">
        <NavLink to="/" end className={cls}>
          <span className="text-xl">🏈</span>Teams
        </NavLink>
        <NavLink to="/stats" className={cls}>
          <span className="text-xl">📊</span>Stats
        </NavLink>
        <NavLink to="/rules" className={cls}>
          <span className="text-xl">📖</span>Rules
        </NavLink>
        <NavLink to="/settings" className={cls}>
          <span className="text-xl">⚙️</span>Settings
        </NavLink>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/team/new" element={<NewTeam />} />
        <Route path="/team/:id" element={<TeamPage />} />
        <Route path="/team/:id/player/:pid" element={<PlayerPage />} />
        <Route path="/match/:mid" element={<MatchRouter />} />
        <Route path="/match/:mid/log" element={<MatchLogEditor />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <Nav />
    </HashRouter>
  )
}
