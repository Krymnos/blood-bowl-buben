/** League-wide results: pairing both coaches' records of a game, the table, head-to-head and leaderboards. */
import type { LeagueRef, MatchEvent } from '../db'
import type { LeagueSettings } from '../rules/sevens'
import type { LeagueData, LeagueMatch, LeagueTeam } from './league'
import { computeStats, type PlayerStats } from './stats'

export const teamKey = (r: LeagueRef) => `${r.uid}:${r.teamId}`
const selfKey = (m: LeagueMatch) => teamKey({ uid: m.uid, teamId: m.match.teamId })
const norm = (s: string) => s.trim().toLowerCase()
/** both records of one game must be logged within this window */
const PAIR_WINDOW = 2 * 24 * 3600_000
export const POINTS = { w: 3, d: 1, l: 0 }

const casFor = (ev: MatchEvent[]) => ev.filter((e) => e.type === 'cas' && e.side === 'us').length
const casAgainst = (ev: MatchEvent[]) => ev.filter((e) => e.type === 'cas' && e.side === 'them' && e.cause !== 'self').length

export interface LeagueGame {
  id: string
  date: number
  /** team key of side a (whose record is the primary one) */
  a: string
  /** team key of side b; null = guest outside the league */
  b: string | null
  guest?: string
  score: { a: number; b: number }
  cas: { a: number; b: number }
  /** one or both coaches' records */
  records: LeagueMatch[]
  /** both coaches logged it, but differently */
  mismatch?: string
}

/** Resolves which league team a record was played against: the picked ref, else a unique exact team-name match. */
export function opponentKey(m: LeagueMatch, d: LeagueData, byName = nameIndex(d)): string | null {
  const self = selfKey(m)
  const ref = m.match.opponent.ref
  if (ref) {
    const k = teamKey(ref)
    return k !== self && d.teams.some((t) => teamKey({ uid: t.uid, teamId: t.team.id }) === k) ? k : null
  }
  const k = byName.get(norm(m.match.opponent.name ?? ''))
  return k && k !== self ? k : null
}
function nameIndex(d: LeagueData) {
  const idx = new Map<string, string | null>()
  for (const t of d.teams) {
    const n = norm(t.team.name)
    idx.set(n, idx.has(n) ? null : teamKey({ uid: t.uid, teamId: t.team.id }))
  }
  return new Map([...idx].filter((e): e is [string, string] => e[1] != null))
}

/** Every finished game in the league, counted once. */
export function leagueGames(d: LeagueData): LeagueGame[] {
  const byName = nameIndex(d)
  const teamKeys = new Set(d.teams.map((t) => teamKey({ uid: t.uid, teamId: t.team.id })))
  const recs = d.matches
    .filter((m) => m.match?.status === 'done' && teamKeys.has(selfKey(m)))
    .map((m) => ({ m, self: selfKey(m), opp: opponentKey(m, d, byName) }))
    .sort((x, y) => x.m.match.date - y.m.match.date)
  const used = new Set<typeof recs[number]>()
  const games: LeagueGame[] = []
  for (const r of recs) {
    if (used.has(r)) continue
    used.add(r)
    let other: typeof r | undefined
    if (r.opp) {
      let best = Infinity
      for (const o of recs) {
        if (used.has(o) || o.self !== r.opp || o.opp !== r.self) continue
        const diff = Math.abs(o.m.match.date - r.m.match.date)
        if (diff <= PAIR_WINDOW && diff < best) {
          best = diff
          other = o
        }
      }
      if (other) used.add(other)
    }
    // primary record: deterministic, so every phone shows the same table
    const [p, q] = other && other.self < r.self ? [other, r] : [r, other]
    const pm = p.m.match
    const g: LeagueGame = {
      id: `${p.m.uid}:${pm.id}`,
      date: pm.date,
      a: p.self,
      b: p.opp,
      guest: p.opp ? undefined : pm.opponent.name || 'Guest',
      score: { a: pm.score.us, b: pm.score.them },
      // each side's casualties from its own coach's log when there is one
      cas: { a: casFor(p.m.events), b: q ? casFor(q.m.events) : casAgainst(p.m.events) },
      records: q ? [p.m, q.m] : [p.m],
    }
    if (q) {
      const qs = q.m.match.score
      if (qs.us !== pm.score.them || qs.them !== pm.score.us) {
        const who = (r: LeagueMatch) => d.coachName[r.uid] ?? '?'
        g.mismatch = `${who(p.m)} logged ${pm.score.us}–${pm.score.them}, ${who(q.m)} logged ${qs.them}–${qs.us}`
      }
    }
    games.push(g)
  }
  return games.sort((x, y) => y.date - x.date)
}

export interface TableRow {
  key: string
  team: LeagueTeam
  p: number
  w: number
  d: number
  l: number
  tdFor: number
  tdAgainst: number
  casFor: number
  casAgainst: number
  pts: number
}

/** League table: only games between two league teams count (guests don't). Win 3, draw 1, loss 0. */
export function leagueTable(d: LeagueData, games: LeagueGame[]): TableRow[] {
  const rows = new Map<string, TableRow>()
  for (const t of d.teams) {
    const key = teamKey({ uid: t.uid, teamId: t.team.id })
    rows.set(key, { key, team: t, p: 0, w: 0, d: 0, l: 0, tdFor: 0, tdAgainst: 0, casFor: 0, casAgainst: 0, pts: 0 })
  }
  const add = (key: string, tf: number, ta: number, cf: number, ca: number) => {
    const r = rows.get(key)
    if (!r) return
    r.p++
    r.tdFor += tf
    r.tdAgainst += ta
    r.casFor += cf
    r.casAgainst += ca
    const res = tf > ta ? 'w' : tf < ta ? 'l' : 'd'
    r[res]++
    r.pts += POINTS[res]
  }
  for (const g of games) {
    if (!g.b) continue
    add(g.a, g.score.a, g.score.b, g.cas.a, g.cas.b)
    add(g.b, g.score.b, g.score.a, g.cas.b, g.cas.a)
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.pts - x.pts ||
      y.tdFor - y.tdAgainst - (x.tdFor - x.tdAgainst) ||
      y.casFor - y.casAgainst - (x.casFor - x.casAgainst) ||
      y.tdFor - x.tdFor ||
      x.p - y.p ||
      x.team.team.name.localeCompare(y.team.team.name),
  )
}

export interface H2H { a: string; b: string; w: number; d: number; l: number; tdFor: number; tdAgainst: number }
/** Coach vs coach records (from coach a's view). */
export function headToHead(games: LeagueGame[]): H2H[] {
  const map = new Map<string, H2H>()
  for (const g of games) {
    if (!g.b) continue
    let ua = g.a.split(':')[0]
    let ub = g.b.split(':')[0]
    if (ua === ub) continue
    let [sa, sb] = [g.score.a, g.score.b]
    if (ua > ub) ([ua, ub, sa, sb] = [ub, ua, sb, sa])
    const k = `${ua}|${ub}`
    const x = map.get(k) ?? { a: ua, b: ub, w: 0, d: 0, l: 0, tdFor: 0, tdAgainst: 0 }
    if (sa > sb) x.w++
    else if (sa < sb) x.l++
    else x.d++
    x.tdFor += sa
    x.tdAgainst += sb
    map.set(k, x)
  }
  return [...map.values()].sort((x, y) => y.w + y.d + y.l - (x.w + x.d + x.l))
}

export interface LeaguePlayerRow { key: string; t: LeagueTeam; player: LeagueTeam['players'][number]; stats: PlayerStats }
/** Career stats of every player in the league, each from their own coach's match logs. */
export function leaguePlayers(d: LeagueData, settings: LeagueSettings): LeaguePlayerRow[] {
  const out: LeaguePlayerRow[] = []
  for (const t of d.teams) {
    const ms = d.matches.filter((m) => m.uid === t.uid && m.match.teamId === t.team.id)
    const stats = computeStats(t.players, ms.map((m) => m.match), ms.flatMap((m) => m.events), settings)
    for (const p of t.players) out.push({ key: `${t.uid}:${t.team.id}:${p.id}`, t, player: p, stats: stats.get(p.id)! })
  }
  return out
}

export const findTeam = (d: LeagueData | undefined, key: string | null | undefined) =>
  key ? d?.teams.find((t) => teamKey({ uid: t.uid, teamId: t.team.id }) === key) : undefined
