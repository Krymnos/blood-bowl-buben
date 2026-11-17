import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getRoster } from '../rules/data'
import { LEVEL_NAMES, STAT_LABEL } from '../rules/sevens'
import type { Stat } from '../rules/types'
import { approve, reject, removeMember, startData, useLeague, type LeagueData, type LeagueTeam } from '../logic/league'
import { findTeam, headToHead, leagueGames, leaguePlayers, leagueTable, teamKey, type LeagueGame } from '../logic/leagueTable'
import { fmtTarget, playerValue, profile, statDelta, teamValue } from '../logic/team'
import { computeStats, resultOf, teamRecord } from '../logic/stats'
import { fmtDate, gp } from '../logic/format'
import { LeagueJoin } from '../components/LeagueAccount'
import { Badge, Button, Card, Empty, H2, Page, useSettings } from '../components/ui'
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
          {tab === 'teams' && <TeamsTab data={data!} />}
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
  const me = useLeague().user?.uid
  const rows = leagueTable(data, games)
  if (!rows.length) return <Empty>No teams published yet.</Empty>
  return (
    <>
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
              <tr key={r.key} onClick={() => nav(teamLink(r.team))} className={`cursor-pointer border-t border-white/5 active:bg-white/5 ${r.team.uid === me ? 'bg-turf/10' : ''}`}>
                <td className={`py-1.5 text-center font-black ${i === 0 && r.p > 0 ? 'text-gold' : 'text-white/40'}`}>{i + 1}</td>
                <td className="max-w-[9rem] py-1.5">
                  <div className="truncate font-semibold">{r.team.team.name}</div>
                  <div className="truncate text-[11px] text-white/40">{r.team.coach}</div>
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
        Win 3 · draw 1 · loss 0. Ties: TD difference, then CAS difference. Only games between two league teams count: pick the opponent from the league in pre-game (or use their exact team name).
        A game both coaches logged counts once.
      </div>
    </>
  )
}

function GameCard({ g, data }: { g: LeagueGame; data: LeagueData }) {
  const nav = useNavigate()
  const a = findTeam(data, g.a)
  const b = findTeam(data, g.b)
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
        <button className="truncate text-right font-semibold" onClick={() => b && nav(teamLink(b))}>
          {b?.team.name ?? g.guest}
          <div className="truncate text-[11px] font-normal text-white/40">{b ? b.coach : 'guest'}</div>
        </button>
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-1 text-[11px] text-white/40">
        <span>
          {fmtDate(g.date)} · CAS {g.cas.a}–{g.cas.b}
        </span>
        <span>{g.b ? (g.records.length === 2 ? '✓ logged by both' : `logged by ${loggedBy[0]} only`) : 'not counted (guest)'}</span>
      </div>
      {g.mismatch && <div className="mt-1 text-xs text-red-300">⚠️ {g.mismatch}. Fix the score in one of the match records.</div>}
    </Card>
  )
}

function ResultsTab({ data, games }: { data: LeagueData; games: LeagueGame[] }) {
  const flagged = games.filter((g) => g.mismatch)
  if (!games.length) return <Empty>No finished games published yet.</Empty>
  return (
    <>
      {flagged.length > 0 && <div className="px-1 text-xs text-red-300">⚠️ {flagged.length} game{flagged.length > 1 ? 's' : ''} logged differently by the two coaches.</div>}
      {games.map((g) => (
        <GameCard key={g.id} g={g} data={data} />
      ))}
    </>
  )
}

function TeamsTab({ data }: { data: LeagueData }) {
  const nav = useNavigate()
  const coaches = [...new Set([...data.members.map((m) => m.uid), ...data.teams.map((t) => t.uid)])]
  return (
    <>
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
  return (
    <>
      <H2>Join requests</H2>
      {!L.requests?.length && <div className="px-1 text-sm text-white/40">No pending requests.</div>}
      {L.requests?.map((r) => (
        <Card key={r.uid} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{r.coach}</div>
            <div className="text-[11px] text-white/40">
              {r.requestedAt ? fmtDate(r.requestedAt) : ''} · {r.uid.slice(0, 8)}…
            </div>
          </div>
          <Button className="!px-3 !py-1.5" disabled={busy} onClick={() => run(() => approve(r.uid, r.coach))}>
            Approve
          </Button>
          <Button variant="ghost" className="!px-2 !py-1.5 text-red-300" disabled={busy} onClick={() => confirm(`Reject ${r.coach}?`) && run(() => reject(r.uid))}>
            ✕
          </Button>
        </Card>
      ))}
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
  const rec = teamRecord(ms.map((m) => m.match))
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
      {ms.length === 0 && <div className="px-1 text-sm text-white/40">No finished games published.</div>}
      {[...ms]
        .sort((a, b) => b.match.date - a.match.date)
        .map(({ match: m }) => {
          const r = resultOf(m)
          return (
            <Card key={m.id} className="!p-2.5">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-semibold">vs {m.opponent.name || 'Opponent'}</div>
                  <div className="text-[11px] text-white/40">
                    {fmtDate(m.date)}
                    {m.opponent.coach ? ` · ${m.opponent.coach}` : ''}
                    {m.weather ? ` · ${m.weather}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r === 'W' ? 'green' : r === 'L' ? 'red' : 'default'}>{r}</Badge>
                  <span className="text-lg font-black tabular-nums">
                    {m.score.us}–{m.score.them}
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
