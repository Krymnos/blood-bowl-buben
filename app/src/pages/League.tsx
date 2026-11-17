import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getRoster, ROSTERS } from '../rules/data'
import { LEVEL_NAMES, STAT_LABEL } from '../rules/sevens'
import type { Stat } from '../rules/types'
import {
  approve, deleteParticipant, linkParticipant, reject, removeMember, saveParticipant, setLeagueTeam, startData, useLeague, type LeagueData, type LeagueTeam, type Participant,
} from '../logic/league'
import { findTeam, headToHead, isPaper, leagueGames, leaguePlayers, leagueTable, paperTeams, participantTeam, teamKey, type LeagueGame, type PaperTeam } from '../logic/leagueTable'
import { fmtTarget, playerValue, profile, statDelta, teamValue } from '../logic/team'
import { computeStats, teamRecord } from '../logic/stats'
import { fmtDate, gp } from '../logic/format'
import { LeagueJoin } from '../components/LeagueAccount'
import { Badge, Button, Card, Empty, Field, H2, inputCls, Page, Sheet, useSettings } from '../components/ui'
import { PlayerRow } from './TeamPage'
import { BOARDS } from './Stats'

type Tab = 'table' | 'results' | 'teams' | 'leaders' | 'admin'

/** Loads league data once (live, kept for the session) and gates on membership. */
function useLeagueData(): { data?: LeagueData; gate?: React.ReactNode } {
  const L = useLeague()
  useEffect(() => {
    if (L.membership === 'member') startData()
  }, [L.membership])
  if (!L.user || L.membership !== 'member') return { gate: <LeagueJoin /> }
  if (L.dataError && !L.data) return { gate: <Card className="text-sm text-red-300">❌ {L.dataError}</Card> }
  if (!L.data) return { gate: <Card className="text-sm text-white/50">Loading the league…</Card> }
  return { data: L.data }
}

export default function League() {
  const L = useLeague()
  const { data, gate } = useLeagueData()
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('sd-league-tab') as Tab) || 'table')
  const pick = (t: Tab) => (sessionStorage.setItem('sd-league-tab', t), setTab(t))
  const games = useMemo(() => (data ? leagueGames(data) : []), [data])
  const tabs: Tab[] = ['table', 'results', 'teams', 'leaders', ...(L.isAdmin ? (['admin'] as Tab[]) : [])]
  const pending = L.requests?.length ?? 0

  return (
    <Page title="League" sub={data ? `Blood Bowl Buben · ${data.members.length} coaches · ${data.teams.length} teams${data.fromCache ? ' · offline copy' : ''}` : 'Blood Bowl Buben'}>
      {gate ?? (
        <>
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            {tabs.map((t) => (
              <button key={t} onClick={() => pick(t)} className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize ${tab === t ? 'bg-white/15' : 'text-white/50'}`}>
                {t}
                {t === 'admin' && pending > 0 && <span className="ml-1 rounded-full bg-gold px-1.5 text-[10px] text-ink">{pending}</span>}
              </button>
            ))}
          </div>
          {tab === 'table' && <TableTab data={data!} games={games} />}
          {tab === 'results' && <ResultsTab data={data!} games={games} />}
          {tab === 'teams' && <TeamsTab data={data!} games={games} />}
          {tab === 'leaders' && <LeadersTab data={data!} games={games} />}
          {tab === 'admin' && <AdminTab data={data!} />}
        </>
      )}
    </Page>
  )
}

const teamLink = (t: LeagueTeam) => `/league/${t.uid}/${t.team.id}`

function TableTab({ data, games }: { data: LeagueData; games: LeagueGame[] }) {
  const nav = useNavigate()
  const L = useLeague()
  const me = L.user?.uid
  const [paper, setPaper] = useState<string>()
  const rows = leagueTable(data, games)
  return (
    <>
      <PaperSheet data={data} games={games} paperKey={paper} onClose={() => setPaper(undefined)} />
      <PickLeagueTeam data={data} />
      {!data.participants.length && (
        <div className="px-1 text-xs text-amber-300">
          {L.isAdmin
            ? '⚠️ Add the league’s coaches in Admin → Participants: games only count against coaches on that list.'
            : '⚠️ The admin hasn’t filled in the participant list yet: games only count against coaches on it.'}
        </div>
      )}
      {!rows.length && <Empty>No teams yet.</Empty>}
      <Card className="!p-1 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[10px] uppercase text-white/40">
              <th className="w-5 py-1 font-normal">#</th>
              <th className="text-left font-normal">Team</th>
              <th className="font-normal">P</th>
              <th className="font-normal">W-D-L</th>
              <th className="font-normal">TD</th>
              <th className="font-normal">CAS</th>
              <th className="font-normal">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} onClick={() => (r.team ? nav(teamLink(r.team)) : setPaper(r.key))} className={`cursor-pointer border-t border-white/5 active:bg-white/5 ${r.team?.uid === me ? 'bg-turf/10' : ''}`}>
                <td className={`py-1.5 text-center font-black ${i === 0 && r.p > 0 ? 'text-gold' : 'text-white/40'}`}>{i + 1}</td>
                <td className="max-w-[9rem] py-1.5">
                  <div className="truncate font-semibold">{r.name}</div>
                  <div className="truncate text-[11px] text-white/40">{r.team ? r.coach : `📝 ${r.coach ? `${r.coach} · ` : ''}not in the app`}</div>
                </td>
                <td className="text-center">{r.p}</td>
                <td className="whitespace-nowrap text-center">
                  {r.w}-{r.d}-{r.l}
                </td>
                <td className="whitespace-nowrap text-center text-xs">
                  {r.tdFor}:{r.tdAgainst}
                </td>
                <td className="whitespace-nowrap text-center text-xs">
                  {r.casFor}:{r.casAgainst}
                </td>
                <td className="text-center font-black">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="px-1 text-[11px] leading-relaxed text-white/40">
        Win 3 · draw 1 · loss 0. Ties: TD difference, then CAS difference. A game both coaches logged counts once.
        📝 = not in the app yet: their row has the games others logged against them. When they join, they pick their name from the league list and the games move to their team.
        Games against opponents not on the list (friendlies) don’t count.
      </div>
    </>
  )
}

function GameCard({ g, data, onPaper }: { g: LeagueGame; data: LeagueData; onPaper?: (key: string) => void }) {
  const nav = useNavigate()
  const a = findTeam(data, g.a)
  const b = findTeam(data, g.b)
  const paper = isPaper(g.b)
  const loggedBy = g.records.map((r) => data.coachName[r.uid] ?? '?')
  return (
    <Card className={`!p-2.5 ${g.mismatch ? 'border-red-400/50' : ''}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <button className="truncate text-left font-semibold" onClick={() => a && nav(teamLink(a))}>
          {a?.team.name}
          <div className="truncate text-[11px] font-normal text-white/40">{a?.coach}</div>
        </button>
        <div className="text-xl font-black tabular-nums">
          {g.score.a}–{g.score.b}
        </div>
        <button className="truncate text-right font-semibold" onClick={() => (b ? nav(teamLink(b)) : paper && onPaper?.(g.b!))}>
          {b?.team.name ?? g.paper?.name}
          <div className="truncate text-[11px] font-normal text-white/40">{b ? b.coach : paper ? `📝 ${g.paper?.coach || 'not in the app'}` : g.paper?.coach || 'not on the list'}</div>
        </button>
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-1 text-[11px] text-white/40">
        <span>
          {fmtDate(g.date)} · CAS {g.cas.a}–{g.cas.b}
        </span>
        <span>{!g.b ? 'not counted: opponent not on the league list' : g.records.length === 2 ? '✓ logged by both' : `logged by ${loggedBy[0]}${paper ? '' : ' only'}`}</span>
      </div>
      {g.mismatch && <div className="mt-1 text-xs text-red-300">⚠️ {g.mismatch}. Fix the score in one of the match records.</div>}
    </Card>
  )
}

function ResultsTab({ data, games }: { data: LeagueData; games: LeagueGame[] }) {
  const [paper, setPaper] = useState<string>()
  const flagged = games.filter((g) => g.mismatch)
  if (!games.length) return <Empty>No finished games published yet.</Empty>
  return (
    <>
      <PaperSheet data={data} games={games} paperKey={paper} onClose={() => setPaper(undefined)} />
      {flagged.length > 0 && <div className="px-1 text-xs text-red-300">⚠️ {flagged.length} game{flagged.length > 1 ? 's' : ''} logged differently by the two coaches.</div>}
      {games.map((g) => (
        <GameCard key={g.id} g={g} data={data} onPaper={setPaper} />
      ))}
    </>
  )
}

/** A participant not in the app yet: their games so far. */
function PaperSheet({ data, games, paperKey, onClose }: { data: LeagueData; games: LeagueGame[]; paperKey?: string; onClose: () => void }) {
  const pt: PaperTeam | undefined = paperKey ? paperTeams(data, games).find((x) => x.key === paperKey) : undefined
  const joined = pt?.participant.uid
  return (
    <Sheet open={!!pt} onClose={onClose} title={pt?.name ?? ''}>
      {pt && (
        <div className="space-y-3 text-sm">
          <div className="text-white/60">
            📝 {joined ? `${data.coachName[joined] ?? pt.coach} has joined but hasn't published this team yet.` : `${pt.coach} isn't in the app yet.`}{' '}
            {pt.games.length ? `These ${pt.games.length} game${pt.games.length > 1 ? 's' : ''} count from the other coaches' records:` : 'No games against them yet.'}
          </div>
          {pt.games.length > 0 && (
            <Card className="!p-2 space-y-1">
              {pt.games.map((g) => {
                const a = findTeam(data, g.a)
                return (
                  <div key={g.id} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">
                      {fmtDate(g.date)} · vs {a?.team.name} <span className="text-white/40">({a?.coach})</span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {g.score.b}–{g.score.a}
                    </span>
                  </div>
                )
              })}
            </Card>
          )}
          {!joined && (
            <div className="text-xs text-white/40">
              When {pt.coach} joins the app, they pick “{pt.coach} · {pt.name}” in the join form. Once the admin approves, these games move to their team.
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

/** I joined as a participant but have several published teams: which one plays in the league? */
function PickLeagueTeam({ data }: { data: LeagueData }) {
  const me = useLeague().user?.uid
  const [busy, setBusy] = useState(false)
  const p = data.participants.find((x) => x.uid === me && participantTeam(data, x).unsure)
  if (!p) return null
  return (
    <Card className="space-y-2 border-gold/40">
      <div className="text-sm">
        Which of your teams plays in the league as <b>{p.team || p.coach}</b>?
      </div>
      {data.teams
        .filter((t) => t.uid === me)
        .map((t) => (
          <Button key={t.team.id} variant="soft" className="w-full" disabled={busy} onClick={() => (setBusy(true), setLeagueTeam(t.team.id, p.id).finally(() => setBusy(false)))}>
            {t.team.name}
          </Button>
        ))}
    </Card>
  )
}

function TeamsTab({ data, games }: { data: LeagueData; games: LeagueGame[] }) {
  const nav = useNavigate()
  const [paper, setPaper] = useState<string>()
  const coaches = [...new Set([...data.members.map((m) => m.uid), ...data.teams.map((t) => t.uid)])]
  const offApp = paperTeams(data, games)
  return (
    <>
      <PaperSheet data={data} games={games} paperKey={paper} onClose={() => setPaper(undefined)} />
      {coaches.map((uid) => {
        const ts = data.teams.filter((t) => t.uid === uid)
        const member = data.members.some((m) => m.uid === uid)
        return (
          <div key={uid} className="space-y-2">
            <H2>
              {data.coachName[uid] ?? '?'}
              {!member && ' (left the league)'}
            </H2>
            {ts.length === 0 && <div className="px-1 text-xs text-white/40">No teams published yet.</div>}
            {ts.map((t) => {
              const { tv, ctv } = teamValue(t.team, t.players)
              const rec = teamRecord(data.matches.filter((m) => m.uid === uid && m.match.teamId === t.team.id).map((m) => m.match))
              return (
                <Card key={t.team.id} onClick={() => nav(teamLink(t))}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-2 rounded-full" style={{ background: t.team.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{t.team.name}</div>
                      <div className="text-xs text-white/50">
                        {getRoster(t.team.rosterId)?.name} · {t.players.filter((p) => p.status === 'active').length} players · {rec.w}-{rec.d}-{rec.l}
                      </div>
                    </div>
                    <div className="text-right text-sm font-bold">
                      TV {gp(tv)}
                      {ctv !== tv && <div className="text-xs font-normal text-white/50">CTV {gp(ctv)}</div>}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      })}
      {offApp.length > 0 && (
        <div className="space-y-2">
          <H2>📝 Not in the app yet</H2>
          {offApp.map((pt) => (
            <Card key={pt.key} onClick={() => setPaper(pt.key)}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-bold">{pt.name}</div>
                  <div className="text-xs text-white/50">
                    {pt.coach}
                    {pt.participant.rosterId ? ` · ${getRoster(pt.participant.rosterId)?.name ?? ''}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-white/40">{pt.games.length} games</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function LeadersTab({ data, games }: { data: LeagueData; games: LeagueGame[] }) {
  const nav = useNavigate()
  const settings = useSettings()
  const rows = leaguePlayers(data, settings)
  const h2h = headToHead(games)
  return (
    <>
      {BOARDS.filter((b) => b.key !== 'games').map((b) => {
        const top = rows
          .map((r) => ({ r, v: r.stats[b.key] as number }))
          .filter((x) => x.v > 0)
          .sort((x, y) => y.v - x.v)
          .slice(0, 5)
        if (!top.length) return null
        return (
          <div key={b.key}>
            <H2>
              {b.icon} {b.label}
            </H2>
            <Card className="!p-1">
              {top.map(({ r, v }, i) => (
                <button key={r.key} onClick={() => nav(`${teamLink(r.t)}/${r.player.id}`)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left active:bg-white/5">
                  <span className={`w-5 text-center font-black ${i === 0 ? 'text-gold' : 'text-white/40'}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {r.player.status === 'dead' && '💀 '}
                    {r.player.name} <span className="text-xs text-white/40">{r.t.team.name}</span>
                  </span>
                  <span className="font-bold tabular-nums">{v}</span>
                </button>
              ))}
            </Card>
          </div>
        )
      })}
      {h2h.length > 0 && (
        <>
          <H2>Head to head (coaches)</H2>
          <Card className="space-y-1 text-sm">
            {h2h.map((x) => (
              <div key={`${x.a}|${x.b}`} className="flex justify-between gap-2">
                <span className="truncate">
                  {data.coachName[x.a] ?? '?'} <span className="text-white/40">vs</span> {data.coachName[x.b] ?? '?'}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {x.w}-{x.d}-{x.l} <span className="text-xs font-normal text-white/40">TD {x.tdFor}:{x.tdAgainst}</span>
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
      {!rows.some((r) => r.stats.games > 0) && <Empty>Play some games to fill the league record books.</Empty>}
    </>
  )
}

function AdminTab({ data }: { data: LeagueData }) {
  const L = useLeague()
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [edit, setEdit] = useState<Partial<Participant>>()
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const free = data.participants.filter((p) => !p.uid).sort((a, b) => a.coach.localeCompare(b.coach))
  const label = (p: Participant) => `${p.coach}${p.team ? ` · ${p.team}` : ''}`
  return (
    <>
      <ParticipantSheet data={data} p={edit} onClose={() => setEdit(undefined)} />
      <H2>Join requests</H2>
      {!L.requests?.length && <div className="px-1 text-sm text-white/40">No pending requests.</div>}
      {L.requests?.map((r) => {
        const asked = free.some((p) => p.id === r.participant) ? r.participant! : ''
        const pid = pick[r.uid] ?? asked
        return (
          <Card key={r.uid} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.coach}</div>
                <div className="text-[11px] text-white/40">
                  {r.requestedAt ? fmtDate(r.requestedAt) : ''} · {r.uid.slice(0, 8)}…
                </div>
              </div>
              <Button className="!px-3 !py-1.5" disabled={busy} onClick={() => run(() => approve(r.uid, r.coach, pid || undefined))}>
                Approve
              </Button>
              <Button variant="ghost" className="!px-2 !py-1.5 text-red-300" disabled={busy} onClick={() => confirm(`Reject ${r.coach}?`) && run(() => reject(r.uid))}>
                ✕
              </Button>
            </div>
            {data.participants.length > 0 && (
              <label className="block text-[11px] text-white/50">
                {r.participant && !asked ? '⚠️ The entry they picked is gone or taken. ' : ''}Plays in the league as
                <select className={`${inputCls} mt-1 !py-1.5 text-sm`} value={pid} onChange={(e) => setPick({ ...pick, [r.uid]: e.target.value })}>
                  <option value="">– not on the list –</option>
                  {free.map((p) => (
                    <option key={p.id} value={p.id}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Card>
        )
      })}
      <H2 right={<button className="text-xs text-gold" onClick={() => setEdit({ coach: '', team: '' })}>+ Add</button>}>Participants</H2>
      {!data.participants.length && <div className="px-1 text-sm text-white/40">No participants yet. Add every coach in the league, in the app or not.</div>}
      {data.participants.length > 0 && (
        <Card className="!p-1">
          {[...data.participants]
            .sort((a, b) => a.coach.localeCompare(b.coach))
            .map((p) => {
              const { team } = participantTeam(data, p)
              return (
                <button key={p.id} onClick={() => setEdit(p)} className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-sm active:bg-white/5">
                  <span className="min-w-0 truncate">
                    {label(p)}
                    {p.rosterId && <span className="text-xs text-white/40"> · {getRoster(p.rosterId)?.name}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-white/40">{p.uid ? `✓ ${team ? team.team.name : `${data.coachName[p.uid] ?? '?'}, no team yet`}` : '📝'}</span>
                </button>
              )
            })}
        </Card>
      )}
      <div className="px-1 text-[11px] leading-relaxed text-white/40">
        Games only count against coaches on this list. A joining coach picks their entry; you confirm it when approving. 📝 = not in the app yet.
      </div>
      <H2>Members</H2>
      <Card className="space-y-1.5">
        {data.members.map((m) => (
          <div key={m.uid} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              {m.coach}
              {m.uid === L.user?.uid && <span className="text-xs text-gold"> · you</span>}
              <span className="text-xs text-white/40"> · {data.teams.filter((t) => t.uid === m.uid).length} teams</span>
            </span>
            {m.uid !== L.user?.uid && (
              <button
                className="shrink-0 text-xs text-red-300"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Remove ${m.coach} from the league? They lose access at once.`)) return
                  const wipe = confirm(`Also delete ${m.coach}'s published teams and games from the league?\n\nOK = delete them · Cancel = keep them visible`)
                  run(() => removeMember(m.uid, wipe))
                }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </Card>
      <div className="px-1 text-[11px] leading-relaxed text-white/40">The league backup download is in Settings → League.</div>
    </>
  )
}

/** Admin: add or edit a participant-list entry, and who it is in the app. */
function ParticipantSheet({ data, p, onClose }: { data: LeagueData; p?: Partial<Participant>; onClose: () => void }) {
  const [f, setF] = useState<Partial<Participant>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => setF(p ?? {}), [p])
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      onClose()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const coach = (f.coach ?? '').trim()
  return (
    <Sheet open={!!p} onClose={onClose} title={p?.id ? 'Participant' : 'Add participant'}>
      <div className="space-y-3">
        <Field label="Coach">
          <input className={inputCls} placeholder="Coach name" maxLength={40} value={f.coach ?? ''} onChange={(e) => setF({ ...f, coach: e.target.value })} />
        </Field>
        <Field label="Team name">
          <input className={inputCls} placeholder="Team name" maxLength={60} value={f.team ?? ''} onChange={(e) => setF({ ...f, team: e.target.value })} />
        </Field>
        <Field label="Roster">
          <select className={inputCls} value={f.rosterId ?? ''} onChange={(e) => setF({ ...f, rosterId: e.target.value || undefined })}>
            <option value="">–</option>
            {ROSTERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        {p?.id && (
          <Field label="In the app as">
            <select className={inputCls} value={p.uid ?? ''} disabled={busy} onChange={(e) => run(() => linkParticipant(p.id!, e.target.value || null))}>
              <option value="">– not in the app yet –</option>
              {data.members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.coach}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Button className="w-full" disabled={busy || !coach} onClick={() => run(() => saveParticipant({ id: p?.id, coach, team: (f.team ?? '').trim(), rosterId: f.rosterId }))}>
          Save
        </Button>
        {p?.id && (
          <Button
            variant="ghost"
            className="w-full text-red-300"
            disabled={busy}
            onClick={() => confirm(`Remove ${p.coach} from the participant list? Games against them stop counting (unless the opponent is in the app).`) && run(() => deleteParticipant(p.id!))}
          >
            Remove from list
          </Button>
        )}
        <div className="text-[11px] leading-relaxed text-white/40">
          Games other coaches logged with this team name (or coach name) count against this entry. Once linked to a coach in the app, they count for their team.
        </div>
      </div>
    </Sheet>
  )
}

// ---------- read-only team & player ----------

function useLeagueTeam() {
  const { uid, teamId } = useParams()
  const { data, gate } = useLeagueData()
  const t = findTeam(data, teamKey({ uid: uid!, teamId: Number(teamId) }))
  return { data, gate, t }
}

export function LeagueTeamPage() {
  const nav = useNavigate()
  const settings = useSettings()
  const { data, gate, t } = useLeagueTeam()
  if (gate) return <Page title="League team" back="/league">{gate}</Page>
  if (!t) return <Page title="Not found" back="/league">This team isn't in the league (any more).</Page>
  const team = t.team
  const roster = getRoster(team.rosterId)
  const ms = data!.matches.filter((m) => m.uid === t.uid && m.match.teamId === team.id)
  const stats = computeStats(t.players, ms.map((m) => m.match), ms.flatMap((m) => m.events), settings)
  const { tv, ctv } = teamValue(team, t.players)
  const key = teamKey({ uid: t.uid, teamId: team.id })
  // league view of this team's games: its own records plus games others logged against it (paired once)
  const games = leagueGames(data!)
    .filter((g) => g.a === key || g.b === key)
    .map((g) => {
      const home = g.a === key
      const opp = home ? (findTeam(data, g.b) ?? (g.paper && { team: { name: g.paper.name }, coach: g.paper.coach })) : findTeam(data, g.a)
      return { g, us: home ? g.score.a : g.score.b, them: home ? g.score.b : g.score.a, opp, mine: g.records.some((r) => r.uid === t.uid) }
    })
  const rec = { w: games.filter((x) => x.us > x.them).length, d: games.filter((x) => x.us === x.them).length, l: games.filter((x) => x.us < x.them).length }
  const active = t.players.filter((p) => p.status === 'active').sort((a, b) => a.number - b.number)
  const gone = t.players.filter((p) => ['dead', 'retired', 'fired', 'scouted'].includes(p.status))
  return (
    <Page title={team.name} sub={`${roster?.name ?? team.rosterId} · Coach ${t.coach} · read-only`} back="/league">
      <div className="grid grid-cols-4 gap-2 text-center">
        <Kpi label="TV" value={gp(tv)} />
        <Kpi label="CTV" value={gp(ctv)} />
        <Kpi label="Treasury" value={gp(team.treasury)} />
        <Kpi label="Record" value={`${rec.w}-${rec.d}-${rec.l}`} />
      </div>
      <div className="h-1 rounded-full" style={{ background: team.color }} />
      <Card className="flex flex-wrap gap-1.5 text-xs">
        <Badge>{team.rerolls} re-roll{team.rerolls === 1 ? '' : 's'}</Badge>
        {team.assistantCoaches > 0 && <Badge>{team.assistantCoaches} assistant coach{team.assistantCoaches > 1 ? 'es' : ''}</Badge>}
        {team.cheerleaders > 0 && <Badge>{team.cheerleaders} cheerleader{team.cheerleaders > 1 ? 's' : ''}</Badge>}
        {team.apothecary && <Badge>Apothecary</Badge>}
        {team.lawyer && <Badge>Goblin lawyer</Badge>}
        <Badge>{team.dedicatedFans} Dedicated Fans</Badge>
        {team.starPlayer?.name && <Badge tone="gold">⭐ {team.starPlayer.name} ({gp(team.starPlayer.cost)})</Badge>}
      </Card>
      <H2 right={<span className="text-xs text-white/40">{active.length}/11</span>}>Players</H2>
      {active.map((p) => (
        <PlayerRow key={p.id} p={p} team={team} spp={stats.get(p.id)?.spp ?? 0} canAdvance={false} onClick={() => nav(`${teamLink(t)}/${p.id}`)} />
      ))}
      {gone.length > 0 && (
        <>
          <H2>Former players</H2>
          {gone.map((p) => (
            <Card key={p.id} onClick={() => nav(`${teamLink(t)}/${p.id}`)} className="opacity-60">
              <div className="flex justify-between text-sm">
                <span>
                  {p.status === 'dead' ? '💀' : p.status === 'scouted' ? '🕵️' : '👋'} {p.name} <span className="text-white/50">· {p.position}</span>
                </span>
                <span className="text-white/50">{p.status}</span>
              </div>
            </Card>
          ))}
        </>
      )}
      <H2>Games</H2>
      {games.length === 0 && <div className="px-1 text-sm text-white/40">No finished games published.</div>}
      {games.map(({ g, us, them, opp, mine }) => {
        const r = us > them ? 'W' : us < them ? 'L' : 'D'
        return (
          <Card key={g.id} className="!p-2.5">
            <div className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <div className="truncate font-semibold">vs {opp?.team.name || 'Opponent'}</div>
                <div className="truncate text-[11px] text-white/40">
                  {fmtDate(g.date)}
                  {opp?.coach ? ` · ${opp.coach}` : ''}
                  {!mine ? ` · logged by ${g.records.map((x) => data!.coachName[x.uid] ?? '?').join(', ')}` : ''}
                  {g.b === null ? ' · not counted' : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={r === 'W' ? 'green' : r === 'L' ? 'red' : 'default'}>{r}</Badge>
                <span className="text-lg font-black tabular-nums">
                  {us}–{them}
                </span>
              </div>
            </div>
          </Card>
        )
      })}
    </Page>
  )
}

export function LeaguePlayerPage() {
  const { pid } = useParams()
  const settings = useSettings()
  const { data, gate, t } = useLeagueTeam()
  if (gate) return <Page title="League player" back="/league">{gate}</Page>
  const p = t?.players.find((x) => x.id === Number(pid))
  if (!t || !p) return <Page title="Not found" back="/league">Player not found.</Page>
  const ms = data!.matches.filter((m) => m.uid === t.uid && m.match.teamId === t.team.id)
  const st = computeStats(t.players, ms.map((m) => m.match), ms.flatMap((m) => m.events), settings).get(p.id)!
  const pr = profile(p, t.team.rosterId)
  const n = p.advancements.length
  return (
    <Page title={`#${p.number} ${p.name}`} sub={`${p.position} · ${LEVEL_NAMES[n]} · ${t.team.name}`} back={teamLink(t)}>
      <Card>
        <div className="grid grid-cols-5 gap-1 text-center">
          {(['ma', 'st', 'ag', 'pa', 'av'] as Stat[]).map((s) => {
            const v = s === 'ma' ? pr.ma : s === 'st' ? pr.st : fmtTarget(pr[s] as number | null)
            const { imp, inj } = statDelta(p, s)
            return (
              <div key={s} className="rounded-xl bg-black/30 py-2">
                <div className={`text-xl font-black ${imp > inj ? 'text-gold' : inj > imp ? 'text-red-400' : ''}`}>{v}</div>
                <div className="text-[10px] text-white/50">{STAT_LABEL[s]}</div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {pr.baseSkills.map((s) => (
            <span key={s} className="rounded-lg bg-white/10 px-2 py-1 text-white/80">
              {s}
            </span>
          ))}
          {pr.gainedSkills.map((s) => (
            <span key={s} className="rounded-lg bg-gold/20 px-2 py-1 font-semibold text-gold">
              {s}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.status !== 'active' && <Badge tone="red">{p.status}</Badge>}
          {p.missNextGame && <Badge tone="red">Misses next game</Badge>}
          {p.injuries.map((i) => (
            <Badge key={i.id} tone="red">
              {i.kind === 'niggling' ? 'Niggling Injury' : `−1 ${STAT_LABEL[i.stat!]}`}
            </Badge>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-white/60">Value · SPP</span>
          <span className="font-bold">
            {gp(playerValue(p, t.team.rosterId))} · {st.spp} SPP <span className="font-normal text-white/40">({st.sppEarned} earned)</span>
          </span>
        </div>
      </Card>
      <H2>Career</H2>
      <div className="grid grid-cols-4 gap-2 text-center">
        {(
          [
            ['Games', st.games], ['TD', st.td], ['CAS', st.cas], ['Comp', st.completion], ['Int', st.interception], ['MVP', st.mvp], ['KO dealt', st.ko], ['CAS taken', st.casSuffered],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-panel py-2">
            <div className="text-lg font-bold">{v}</div>
            <div className="text-[10px] uppercase text-white/40">{k}</div>
          </div>
        ))}
      </div>
      {n > 0 && (
        <>
          <H2>Advancements</H2>
          <Card className="space-y-1 text-sm">
            {p.advancements.map((a, i) => (
              <div key={a.id} className="flex justify-between">
                <span>
                  {i + 1}. {a.kind === 'stat' ? `+1 ${STAT_LABEL[a.stat!]}` : a.skill} <span className="text-white/40">({a.random ? 'random ' : ''}{a.kind})</span>
                </span>
                <span className="text-white/50">{a.spp} SPP</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </Page>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panel px-1 py-2">
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
    </div>
  )
}
