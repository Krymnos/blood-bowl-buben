import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type Match, type MatchEvent } from '../db'
import { ROSTERS } from '../rules/data'
import { isDraft } from '../logic/actions'
import { startData, useLeague, type LeagueData } from '../logic/league'
import { findTeam, isPaper, leagueGames, resolver, teamKey, type LeagueGame } from '../logic/leagueTable'
import { teamValue } from '../logic/team'
import { fmtMonth } from '../logic/sheetImport'
import { fmtDate } from '../logic/format'
import { Button, Card, Field, H2, inputCls, NumberInput, Page } from '../components/ui'
import OpponentPicker from '../components/OpponentPicker'

type Opp = Match['opponent']
type Line = { played: boolean; td: number; cas: number; completion: number; interception: number }
const COLS = [
  ['td', 'TD'],
  ['cas', 'CAS'],
  ['completion', 'Comp'],
  ['interception', 'Int'],
] as const

/**
 * League games of this coach that they haven't logged themselves: results in the league records (old sheet,
 * admin-entered) and games the opponent logged. Picking one fills in opponent, date and score, so the new record
 * is paired with it (linked to the result, or on the opponent's exact date) and the game counts once.
 * A result that might already be a coach's record with another score is left out until that's fixed.
 */
function openResults(d: LeagueData | undefined, me: string | undefined, teamId: number) {
  if (!d || !me) return []
  const res = resolver(d)
  const mine = teamKey({ uid: me, teamId })
  const keys = new Set(d.participants.filter((p) => p.uid === me).map((p) => res.byPid.get(p.id)).filter((k): k is string => !!k && (k === mine || isPaper(k))))
  return leagueGames(d).filter(
    (g) =>
      (keys.has(g.a) || keys.has(g.b ?? '')) &&
      (g.records.length ? g.records.every((m) => m.uid !== me) : !!g.result && !g.maybeSame),
  )
}

/** Log a game after the fact (played before using the app, or on paper): score and who scored, no pre-/post-game sequence. */
export default function PastGame() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const L = useLeague()
  const data = useLiveQuery(async () => {
    const team = await db.teams.get(id)
    const players = await db.players.where('teamId').equals(id).toArray()
    const matchCount = await db.matches.where('teamId').equals(id).count()
    return { team, players, matchCount }
  }, [id])
  useEffect(() => {
    if (L.membership === 'member') startData()
  }, [L.membership])
  const [opp, setOpp] = useState<Opp>({ name: '', coach: '', rosterId: '', ctv: 0 })
  const [date, setDate] = useState(Date.now())
  const [score, setScore] = useState({ us: 0, them: 0 })
  const [casAgainst, setCasAgainst] = useState(0)
  const [mvp, setMvp] = useState<number>()
  const [resultId, setResultId] = useState<string>()
  const [picked, setPicked] = useState<string>()
  const [lines, setLines] = useState<Record<number, Line>>({})
  const [busy, setBusy] = useState(false)
  const open = useMemo(() => openResults(L.data, L.user?.uid, id), [L.data, L.user?.uid, id])
  if (!data?.team) return null
  const { team, players, matchCount } = data
  const squad = players.filter((p) => p.status === 'active' || p.status === 'dead' || p.status === 'retired' || p.status === 'fired').sort((a, b) => a.number - b.number)
  // former players are listed (they may have played back then), unticked
  const line = (pid: number): Line => lines[pid] ?? { played: squad.find((p) => p.id === pid)?.status === 'active', td: 0, cas: 0, completion: 0, interception: 0 }
  const setLine = (pid: number, patch: Partial<Line>) => setLines({ ...lines, [pid]: { ...line(pid), ...patch } })
  const tds = squad.reduce((n, p) => n + (line(p.id).played ? line(p.id).td : 0), 0)
  const draft = isDraft(team, matchCount)

  const pickResult = (g: LeagueGame) => {
    const d = L.data!
    const res = resolver(d)
    const mine = new Set(d.participants.filter((p) => p.uid === L.user?.uid).map((p) => res.byPid.get(p.id)))
    const home = mine.has(g.a)
    const r = g.records.length ? undefined : g.result
    const otherKey = home ? g.b : g.a
    const otherPid = r ? (home ? r.b : r.a) : d.participants.find((x) => res.byPid.get(x.id) === otherKey)?.id
    const p = d.participants.find((x) => x.id === otherPid)
    const t = findTeam(d, otherKey)
    setOpp({
      name: t?.team.name ?? (p?.team || p?.coach || ''),
      coach: t?.coach ?? p?.coach ?? '',
      rosterId: t?.team.rosterId ?? p?.rosterId ?? '',
      ctv: t ? teamValue(t.team, t.players).ctv : 0,
      ...(otherPid ? { pid: otherPid } : {}),
      ...(t ? { ref: { uid: t.uid, teamId: t.team.id } } : {}),
    })
    setDate(g.date)
    setScore(home ? { us: g.score.a, them: g.score.b } : { us: g.score.b, them: g.score.a })
    setCasAgainst(home ? g.cas.b : g.cas.a)
    setResultId(r?.id)
    setPicked(g.id)
  }

  const save = async () => {
    setBusy(true)
    try {
      const us = Math.max(score.us, tds)
      const played = squad.filter((p) => line(p.id).played).map((p) => p.id)
      const mid = await db.transaction('rw', db.matches, db.events, db.teams, async () => {
        const mid = (await db.matches.add({
          teamId: team.id,
          date,
          status: 'done',
          opponent: opp,
          ourCtv: teamValue(team, players).ctv,
          played,
          missing: [],
          fanFactor: { us: 0, them: 0 },
          inducements: [],
          pettyCash: 0,
          treasurySpent: 0,
          prayers: [],
          desperate: [],
          half: 2,
          turn: 7,
          score: { us, them: score.them },
          stalling: false,
          starHired: { us: false, them: false },
          journeymen: [],
          mvpPlayerId: mvp,
          notes: 'Logged afterwards (past game).',
          finishedAt: Date.now(),
          pastGame: true,
          ...(resultId ? { resultId } : {}),
        } as unknown as Match)) as number
        let at = date
        const ev = (e: Partial<MatchEvent>) => ({ matchId: mid, teamId: team.id, at: at++, half: 1, turn: 1, side: 'us', ...e }) as MatchEvent
        const events: MatchEvent[] = []
        for (const p of squad) {
          const l = line(p.id)
          if (!l.played) continue
          for (let i = 0; i < l.td; i++) events.push(ev({ type: 'td', playerId: p.id }))
          for (let i = 0; i < l.cas; i++) events.push(ev({ type: 'cas', playerId: p.id, cause: 'block' }))
          for (let i = 0; i < l.completion; i++) events.push(ev({ type: 'completion', playerId: p.id }))
          for (let i = 0; i < l.interception; i++) events.push(ev({ type: 'interception', playerId: p.id }))
        }
        // the score is recalculated from the log's touchdowns when the log is edited: keep them complete
        for (let i = tds; i < us; i++) events.push(ev({ type: 'td' }))
        for (let i = 0; i < score.them; i++) events.push(ev({ type: 'td', side: 'them' }))
        // casualties our team suffered (no player: the roster's injuries are set by hand)
        for (let i = 0; i < casAgainst; i++) events.push(ev({ type: 'cas', side: 'them', cause: 'block' }))
        if (events.length) await db.events.bulkAdd(events as MatchEvent[])
        if (draft) await db.teams.update(team.id, { draftDone: true })
        return mid
      })
      nav(`/match/${mid}`, { replace: true })
    } catch (e) {
      alert((e as Error).message)
      setBusy(false)
    }
  }

  const num = (v: number, set: (v: number) => void) => (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={9}
      className="w-10 rounded-lg border border-white/10 bg-black/30 py-1 text-center text-sm tabular-nums"
      value={v || ''}
      placeholder="0"
      onChange={(e) => set(Math.max(0, Math.min(9, Number(e.target.value) || 0)))}
    />
  )

  return (
    <Page title="Log a past game" sub={team.name} back={`/team/${team.id}`}>
      <div className="rounded-lg bg-gold/10 p-2 text-xs text-white/70">
        For games played before you used the app. Only the result and who earned SPP: treasury, Dedicated Fans and injuries aren’t changed, so set those on the team and player pages.
        If you already set a player’s SPP by hand (SPP adjustment), lower it, or the game’s SPP count twice.
      </div>
      {draft && <div className="px-1 text-xs text-amber-300">⚠️ This ends the team’s draft mode. Afterwards set the treasury to what it is now (team page → ✎).</div>}

      {open.length > 0 && (
        <>
          <H2>Already in the league</H2>
          <Card className="!p-1">
            {open.map((g) => {
              const sel = picked === g.id
              const when = !g.records.length && g.result?.month ? fmtMonth(g.result.month) : fmtDate(g.date)
              const by = g.records.length ? `logged by ${g.records.map((m) => L.data!.coachName[m.uid] ?? '?').join(', ')}` : '📋 league records'
              return (
                <button key={g.id} onClick={() => pickResult(g)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-sm ${sel ? 'bg-turf/20' : 'active:bg-white/5'}`}>
                  <span className="min-w-0">
                    <span className="block truncate">
                      {g.paperA?.coach ?? findTeam(L.data, g.a)?.coach} vs {g.paper?.coach ?? findTeam(L.data, g.b)?.coach}
                    </span>
                    <span className="block truncate text-[11px] text-white/40">
                      {when} · {by}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">
                    {g.score.a}–{g.score.b}
                    {sel ? ' ✓' : ''}
                  </span>
                </button>
              )
            })}
          </Card>
          <div className="px-1 text-[11px] text-white/40">Pick the game to fill in opponent, date and score: then it still counts once, with your players’ stats. Keep the date as filled in.</div>
        </>
      )}

      <H2>Game</H2>
      <OpponentPicker opponent={opp} onChange={(o) => (setOpp(o), setResultId(undefined), setPicked(undefined))} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Opponent team">
          <input className={inputCls} value={opp.name} onChange={(e) => setOpp({ ...opp, name: e.target.value })} />
        </Field>
        <Field label="Coach">
          <input className={inputCls} value={opp.coach} onChange={(e) => setOpp({ ...opp, coach: e.target.value })} />
        </Field>
        <Field label="Opponent roster">
          <select className={inputCls} value={opp.rosterId} onChange={(e) => setOpp({ ...opp, rosterId: e.target.value })}>
            <option value="">–</option>
            {ROSTERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className={inputCls} value={new Date(date).toISOString().slice(0, 10)} onChange={(e) => e.target.value && setDate(new Date(`${e.target.value}T12:00`).getTime())} />
        </Field>
        <Field label={`Score ${team.name}`}>
          <NumberInput value={score.us} onChange={(v) => setScore({ ...score, us: v })} />
        </Field>
        <Field label="Score opponent">
          <NumberInput value={score.them} onChange={(v) => setScore({ ...score, them: v })} />
        </Field>
        <Field label="Casualties we suffered">
          <NumberInput value={casAgainst} onChange={setCasAgainst} />
        </Field>
        <Field label="MVP">
          <select className={inputCls} value={mvp ?? ''} onChange={(e) => setMvp(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">–</option>
            {squad
              .filter((p) => line(p.id).played)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <H2>Players</H2>
      <Card className="!p-1">
        <div className="grid grid-cols-[1.5rem_1fr_repeat(4,2.5rem)] items-center gap-x-1 px-1 pb-1 text-[10px] uppercase text-white/40">
          <span />
          <span>Played</span>
          {COLS.map(([, l]) => (
            <span key={l} className="text-center">
              {l}
            </span>
          ))}
        </div>
        {squad.map((p) => {
          const l = line(p.id)
          return (
            <div key={p.id} className={`grid grid-cols-[1.5rem_1fr_repeat(4,2.5rem)] items-center gap-x-1 px-1 py-0.5 ${l.played ? '' : 'opacity-40'}`}>
              <input type="checkbox" checked={l.played} onChange={(e) => setLine(p.id, { played: e.target.checked })} aria-label={`${p.name} played`} />
              <span className="truncate text-sm">
                #{p.number} {p.name}
                {p.status !== 'active' && <span className="text-[10px] text-white/40"> · {p.status}</span>}
              </span>
              {COLS.map(([k]) => (
                <span key={k} className="flex justify-center">
                  {num(l[k], (v) => setLine(p.id, { [k]: v }))}
                </span>
              ))}
            </div>
          )
        })}
      </Card>
      {tds > score.us && <div className="px-1 text-xs text-amber-300">⚠️ {tds} touchdowns entered: the score is saved as {tds}–{score.them}.</div>}
      {tds < score.us && <div className="px-1 text-[11px] text-white/40">{score.us - tds} touchdown{score.us - tds > 1 ? 's' : ''} without a scorer: fine, they just earn no SPP.</div>}
      <Button className="w-full !py-3" disabled={busy || !(opp.name || opp.coach)} onClick={save}>
        Save game
      </Button>
      <div className="px-1 text-[11px] text-white/40">Afterwards you can add details in the match’s log, like for any other game.</div>
    </Page>
  )
}
