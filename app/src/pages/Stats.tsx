import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { computeStats, resultOf, teamRecord, type PlayerStats } from '../logic/stats'
import { gp } from '../logic/format'
import { Card, Empty, H2, Page, useSettings } from '../components/ui'

const BOARDS: { key: keyof PlayerStats; label: string; icon: string }[] = [
  { key: 'sppEarned', label: 'Star Player Points', icon: '⭐' },
  { key: 'td', label: 'Touchdowns', icon: '🏈' },
  { key: 'cas', label: 'Casualties (SPP)', icon: '🚑' },
  { key: 'completion', label: 'Completions', icon: '🎯' },
  { key: 'interception', label: 'Interceptions', icon: '🧤' },
  { key: 'mvp', label: 'MVP awards', icon: '🏆' },
  { key: 'ko', label: 'KOs dealt', icon: '💫' },
  { key: 'block', label: 'Blocks thrown', icon: '💥' },
  { key: 'foul', label: 'Fouls', icon: '🥾' },
  { key: 'casSuffered', label: 'Casualties suffered', icon: '🩹' },
  { key: 'fails', label: "Nuffle's favourites (blunders)", icon: '☠️' },
  { key: 'games', label: 'Games played', icon: '📅' },
]

export default function Stats() {
  const nav = useNavigate()
  const settings = useSettings()
  const teams = useLiveQuery(() => db.teams.toArray(), [])
  const [teamId, setTeamId] = useState<number | null>(null)
  const tid = teamId ?? teams?.[0]?.id
  const data = useLiveQuery(async () => {
    if (tid == null) return null
    const players = await db.players.where('teamId').equals(tid).toArray()
    const matches = await db.matches.where('teamId').equals(tid).toArray()
    const events = await db.events.where('teamId').equals(tid).toArray()
    return { players, matches, events }
  }, [tid])
  if (!teams) return null
  if (teams.length === 0) return <Page title="Stats"><Empty>Create a team first.</Empty></Page>
  if (!data) return null
  const { players, matches, events } = data
  const stats = computeStats(players, matches, events, settings)
  const done = matches.filter((m) => m.status === 'done').sort((a, b) => a.date - b.date)
  const rec = teamRecord(matches)
  const casFor = events.filter((e) => e.type === 'cas' && e.side === 'us').length
  const casAgainst = events.filter((e) => e.type === 'cas' && e.side === 'them').length
  const deaths = players.filter((p) => p.status === 'dead')

  // streak
  let streak = ''
  if (done.length) {
    const last = resultOf(done[done.length - 1])
    let n = 0
    for (let i = done.length - 1; i >= 0 && resultOf(done[i]) === last; i--) n++
    streak = `${n}${last}`
  }
  const biggestWin = [...done].sort((a, b) => b.score.us - b.score.them - (a.score.us - a.score.them))[0]
  // Most TDs by one player in a single game
  const perGame = new Map<string, number>()
  events.filter((e) => e.type === 'td' && e.side === 'us' && e.playerId).forEach((e) => {
    const k = `${e.matchId}:${e.playerId}`
    perGame.set(k, (perGame.get(k) ?? 0) + 1)
  })
  const bestGame = [...perGame.entries()].sort((a, b) => b[1] - a[1])[0]
  const tally = (type: 'kickoff' | 'weather') => {
    const t = new Map<string, number>()
    events.filter((e) => e.type === type && e.label).forEach((e) => t.set(e.label!, (t.get(e.label!) ?? 0) + 1))
    return [...t.entries()].sort((a, b) => b[1] - a[1])
  }
  const h2h = new Map<string, { w: number; d: number; l: number }>()
  done.forEach((m) => {
    const k = m.opponent.coach || m.opponent.name || '?'
    const x = h2h.get(k) ?? { w: 0, d: 0, l: 0 }
    const r = resultOf(m)
    if (r === 'W') x.w++
    else if (r === 'L') x.l++
    else x.d++
    h2h.set(k, x)
  })
  const pName = (id: number) => players.find((p) => p.id === id)

  return (
    <Page title="Stats & records">
      {teams.length > 1 && (
        <div className="flex gap-1 overflow-x-auto">
          {teams.map((t) => (
            <button key={t.id} onClick={() => setTeamId(t.id)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${t.id === tid ? 'bg-turf font-semibold' : 'bg-white/5'}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 text-center">
        <Big label="W-D-L" v={`${rec.w}-${rec.d}-${rec.l}`} />
        <Big label="TD +/-" v={`${rec.tdFor}:${rec.tdAgainst}`} />
        <Big label="CAS +/-" v={`${casFor}:${casAgainst}`} />
        <Big label="Streak" v={streak || '–'} />
      </div>

      <H2>Records</H2>
      <Card className="space-y-1.5 text-sm">
        <Rec k="Biggest win" v={biggestWin && biggestWin.score.us > biggestWin.score.them ? `${biggestWin.score.us}–${biggestWin.score.them} vs ${biggestWin.opponent.name}` : '–'} />
        <Rec k="Most TDs in one game" v={bestGame ? `${bestGame[1]} · ${pName(Number(bestGame[0].split(':')[1]))?.name}` : '–'} />
        <Rec k="Total winnings" v={gp(done.reduce((s, m) => s + (m.winnings ?? 0), 0))} />
        <Rec k="Lost to Expensive Mistakes" v={gp(done.reduce((s, m) => s + (m.treasuryLoss ?? 0), 0))} />
        <Rec k="Fallen heroes" v={deaths.length ? deaths.map((p) => `💀 ${p.name}`).join(', ') : 'None (yet)'} />
      </Card>

      {BOARDS.map((b) => {
        const rows = players
          .map((p) => ({ p, v: stats.get(p.id)![b.key] as number }))
          .filter((x) => x.v > 0)
          .sort((a, b2) => b2.v - a.v)
          .slice(0, 5)
        if (!rows.length) return null
        return (
          <div key={b.key}>
            <H2>
              {b.icon} {b.label}
            </H2>
            <Card className="!p-1">
              {rows.map(({ p, v }, i) => (
                <button key={p.id} onClick={() => nav(`/team/${p.teamId}/player/${p.id}`)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left active:bg-white/5">
                  <span className={`w-5 text-center font-black ${i === 0 ? 'text-gold' : 'text-white/40'}`}>{i + 1}</span>
                  <span className="flex-1 truncate text-sm">
                    {p.status === 'dead' && '💀 '}
                    {p.name} <span className="text-xs text-white/40">{p.position}</span>
                  </span>
                  <span className="font-bold tabular-nums">{v}</span>
                </button>
              ))}
            </Card>
          </div>
        )
      })}

      {h2h.size > 0 && (
        <>
          <H2>Head to head</H2>
          <Card className="space-y-1 text-sm">
            {[...h2h.entries()].map(([k, x]) => (
              <Rec key={k} k={k} v={`${x.w}W ${x.d}D ${x.l}L`} />
            ))}
          </Card>
        </>
      )}
      {(['weather', 'kickoff'] as const).map((t) => {
        const rows = tally(t)
        if (!rows.length) return null
        return (
          <div key={t}>
            <H2>{t === 'weather' ? '🌦️ Weather' : '🦶 Kick-off events'}</H2>
            <Card className="space-y-1 text-sm">
              {rows.map(([k, n]) => (
                <Rec key={k} k={k} v={`${n}×`} />
              ))}
            </Card>
          </div>
        )
      })}
      {done.length === 0 && <Empty>Play a match to fill the record books.</Empty>}
    </Page>
  )
}

function Big({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-xl bg-panel py-2">
      <div className="text-lg font-black tabular-nums">{v}</div>
      <div className="text-[10px] uppercase text-white/40">{label}</div>
    </div>
  )
}
function Rec({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/60">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  )
}
