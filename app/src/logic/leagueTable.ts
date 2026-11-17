/** League-wide results: pairing both coaches' records of a game, the table, head-to-head and leaderboards. */
import type { LeagueRef, MatchEvent } from '../db'
import type { LeagueSettings } from '../rules/sevens'
import type { LeagueData, LeagueMatch, LeagueResult, LeagueTeam, Participant } from './league'
import { computeStats, type PlayerStats } from './stats'

export const teamKey = (r: LeagueRef) => `${r.uid}:${r.teamId}`
const selfKey = (m: LeagueMatch) => teamKey({ uid: m.uid, teamId: m.match.teamId })
const norm = (s: string) => s.trim().toLowerCase()
/** both records of one game must be logged within this window */
const PAIR_WINDOW = 2 * 24 * 3600_000
export const POINTS = { w: 3, d: 1, l: 0 }
const DAY = 24 * 3600_000

/** 'YYYY-MM' → first and last moment of that month (local time) */
export function monthRange(month: string): [number, number] {
  const [y, m] = month.split('-').map(Number)
  return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime() - 1]
}
/**
 * When a coach's record can be the same game as a recorded result (same two teams, same score): within the
 * result's month or the month after (a pair plays once per month, catch-up games from earlier months are allowed),
 * or within 14 days of a dated result.
 */
export function inResultWindow(r: Pick<LeagueResult, 'date' | 'month'>, date: number) {
  if (r.month) {
    const [from, to] = monthRange(r.month)
    return date >= from && date <= to + 31 * DAY
  }
  return Math.abs(date - r.date) <= 14 * DAY
}

const casFor = (ev: MatchEvent[]) => ev.filter((e) => e.type === 'cas' && e.side === 'us').length
const casAgainst = (ev: MatchEvent[]) => ev.filter((e) => e.type === 'cas' && e.side === 'them' && e.cause !== 'self').length

export interface LeagueGame {
  id: string
  date: number
  /** side a: team key whose record is the primary one, or for a recorded result a team key / `#<pid>` */
  a: string
  /**
   * side b: a team key in the app, `#<pid>` (a participant not in the app yet), or null: not counted
   * (opponent not on the participant list, e.g. a friendly)
   */
  b: string | null
  /** side b's name/coach when it isn't a team in the app (from the participant list, else as typed) */
  paper?: { name: string; coach: string }
  /** side a's name/coach when it isn't a team in the app (only for recorded results) */
  paperA?: { name: string; coach: string }
  score: { a: number; b: number }
  cas: { a: number; b: number }
  /** one or both coaches' records; none for a recorded result no coach logged */
  records: LeagueMatch[]
  /** the admin's recorded result: the game itself (no records), or the one a coach's record replaced */
  result?: LeagueResult
  /** both coaches logged it, but differently (or differently from the recorded result it's linked to) */
  mismatch?: string
  /** a recorded result that might be the same game as this coach's record (same teams, close, other score) */
  maybeSame?: LeagueGame
}

/** Name key of an opponent (team name, else coach name): typed opponents are matched to the participant list by it. */
export function paperKey(o: { name?: string; coach?: string }): string | null {
  const n = norm(o.name ?? '')
  if (n) return `~${n}`
  const c = norm(o.coach ?? '')
  return c ? `~coach:${c}` : null
}
/** a participant who isn't in the app yet (own row, from the records of the coaches who played them) */
export const isPaper = (k: string | null | undefined) => !!k && k.startsWith('#')

/**
 * The team a participant plays as: their team in the app once they joined (the one they picked, else the one with
 * the entry's team name, else their only published team), otherwise none. `unsure`: joined, but several teams and
 * none picked yet.
 */
export function participantTeam(d: LeagueData, p: Participant): { team?: LeagueTeam; unsure?: boolean } {
  if (!p.uid) return {}
  const ts = d.teams.filter((t) => t.uid === p.uid)
  const t = ts.find((t) => t.team.leaguePid === p.id) ?? ts.find((t) => norm(t.team.name) === norm(p.team)) ?? (ts.length === 1 ? ts[0] : undefined)
  return t ? { team: t } : { unsure: ts.length > 1 }
}

type Resolver = { byPid: Map<string, string>; byName: Map<string, string> }
/** participant id → table key, and name key → table key (participant list first, then team names in the app) */
export function resolver(d: LeagueData): Resolver {
  const byPid = new Map<string, string>()
  const names = new Map<string, string | null>()
  const listed = new Map<string, string | null>()
  // a name used twice is ambiguous: left out
  const put = (m: Map<string, string | null>, pk: string | null, k: string) => pk && m.set(pk, m.has(pk) && m.get(pk) !== k ? null : k)
  for (const t of d.teams) put(names, paperKey({ name: t.team.name }), teamKey({ uid: t.uid, teamId: t.team.id }))
  for (const p of d.participants) {
    const { team } = participantTeam(d, p)
    const k = team ? teamKey({ uid: team.uid, teamId: team.team.id }) : `#${p.id}`
    byPid.set(p.id, k)
    put(listed, paperKey({ name: p.team }), k)
    put(listed, paperKey({ coach: p.coach }), k)
    if (team) put(listed, paperKey({ name: team.team.name }), k)
  }
  const byName = new Map(names)
  for (const [pk, k] of listed) byName.set(pk, k)
  return { byPid, byName: new Map([...byName].filter((e): e is [string, string] => e[1] != null)) }
}

/**
 * Which side b a record was played against: the picked team in the app (ref), else the picked participant (pid),
 * else the participant (or team in the app) with that name. Null = not counted.
 */
export function opponentKey(m: LeagueMatch, d: LeagueData, r = resolver(d)): string | null {
  const self = selfKey(m)
  const o = m.match.opponent
  const k =
    (o.ref && d.teams.some((t) => teamKey({ uid: t.uid, teamId: t.team.id }) === teamKey(o.ref!)) ? teamKey(o.ref) : undefined) ??
    (o.pid ? r.byPid.get(o.pid) : undefined) ??
    r.byName.get(paperKey(o) ?? '') ??
    // by coach name, when the typed team name isn't on the list
    r.byName.get(paperKey({ coach: o.coach }) ?? '')
  return k && k !== self ? k : null
}

/** Every finished game in the league, counted once. */
export function leagueGames(d: LeagueData): LeagueGame[] {
  const res = resolver(d)
  const pById = new Map(d.participants.map((p) => [`#${p.id}`, p]))
  const teamKeys = new Set(d.teams.map((t) => teamKey({ uid: t.uid, teamId: t.team.id })))
  const recs = d.matches
    .filter((m) => m.match?.status === 'done' && teamKeys.has(selfKey(m)))
    .map((m) => ({ m, self: selfKey(m), opp: opponentKey(m, d, res) }))
    .sort((x, y) => x.m.match.date - y.m.match.date)
  // pair both coaches' records of a game: best candidates first (score agrees, then closest date), each record once
  type Rec = (typeof recs)[number]
  const agrees = (x: Rec, y: Rec) => x.m.match.score.us === y.m.match.score.them && x.m.match.score.them === y.m.match.score.us
  const cands: { x: Rec; y: Rec; rank: number }[] = []
  recs.forEach((x, i) => {
    if (!x.opp || isPaper(x.opp)) return
    for (const y of recs.slice(i + 1)) {
      if (y.self !== x.opp || y.opp !== x.self) continue
      const diff = Math.abs(y.m.match.date - x.m.match.date)
      if (diff <= PAIR_WINDOW) cands.push({ x, y, rank: (agrees(x, y) ? 0 : PAIR_WINDOW + 1) + diff })
    }
  })
  const partner = new Map<Rec, Rec>()
  for (const c of cands.sort((p, q) => p.rank - q.rank)) {
    if (partner.has(c.x) || partner.has(c.y)) continue
    partner.set(c.x, c.y)
    partner.set(c.y, c.x)
  }
  const used = new Set<Rec>()
  const games: LeagueGame[] = []
  for (const r of recs) {
    if (used.has(r)) continue
    used.add(r)
    const other = partner.get(r)
    if (other) used.add(other)
    // primary record: deterministic, so every phone shows the same table
    const [p, q] = other && other.self < r.self ? [other, r] : [r, other]
    const pm = p.m.match
    const listed = p.opp ? pById.get(p.opp) : undefined
    const g: LeagueGame = {
      id: `${p.m.uid}:${pm.id}`,
      date: pm.date,
      a: p.self,
      b: p.opp,
      paper: listed
        ? { name: listed.team || listed.coach, coach: listed.coach }
        : p.opp
          ? undefined
          : { name: pm.opponent.name || 'Opponent', coach: pm.opponent.coach ?? '' },
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
  return addResults(d, res, games).sort((x, y) => y.date - x.date)
}

/**
 * Recorded results count unless a coach's record is the same game: linked to it (`match.resultId`), or the same
 * two teams with the same score in the result's window. Then the record counts (it has the details).
 */
function addResults(d: LeagueData, res: Resolver, games: LeagueGame[]): LeagueGame[] {
  const pById = new Map(d.participants.map((p) => [p.id, p]))
  type Cand = { r: LeagueResult; g: LeagueGame; flip: boolean; rank: number }
  const cands: Cand[] = []
  const sides = (r: LeagueResult) => [res.byPid.get(r.a), res.byPid.get(r.b)] as const
  for (const r of d.results) {
    const [ka, kb] = sides(r)
    if (!ka || !kb || ka === kb) continue
    for (const g of games) {
      const flip = g.a === kb && g.b === ka
      if (!flip && !(g.a === ka && g.b === kb)) continue
      const [sa, sb] = flip ? [g.score.b, g.score.a] : [g.score.a, g.score.b]
      const linked = g.records.some((m) => m.match.resultId === r.id)
      if (linked) cands.push({ r, g, flip, rank: 0 })
      else if (sa === r.score.a && sb === r.score.b && inResultWindow(r, g.date)) cands.push({ r, g, flip, rank: 1 + Math.abs(g.date - r.date) / DAY })
    }
  }
  const taken = new Set<LeagueGame>()
  const replaced = new Set<string>()
  for (const c of cands.sort((x, y) => x.rank - y.rank)) {
    if (taken.has(c.g) || replaced.has(c.r.id)) continue
    taken.add(c.g)
    replaced.add(c.r.id)
    c.g.result = c.r
    const [sa, sb] = c.flip ? [c.r.score.b, c.r.score.a] : [c.r.score.a, c.r.score.b]
    if (sa !== c.g.score.a || sb !== c.g.score.b) {
      const note = `the league records say ${sa}–${sb}`
      c.g.mismatch = c.g.mismatch ? `${c.g.mismatch}; ${note}` : `Logged ${c.g.score.a}–${c.g.score.b}, but ${note}`
    }
  }
  const out = [...games]
  const label = (k: string, pid: string) => {
    if (!isPaper(k)) return undefined
    const p = pById.get(pid)
    return { name: p?.team || p?.coach || '?', coach: p?.coach ?? '' }
  }
  for (const r of d.results) {
    if (replaced.has(r.id)) continue
    const [ka, kb] = sides(r)
    if (!ka || !kb || ka === kb) continue
    const g: LeagueGame = {
      id: `r:${r.id}`,
      date: r.date,
      a: ka,
      b: kb,
      paperA: label(ka, r.a),
      paper: label(kb, r.b),
      score: { ...r.score },
      cas: r.cas ? { ...r.cas } : { a: 0, b: 0 },
      records: [],
      result: r,
    }
    // same two teams, close in time, but another score: maybe the same game typed differently
    g.maybeSame = games.find((x) => !x.result && ((x.a === ka && x.b === kb) || (x.a === kb && x.b === ka)) && inResultWindow(r, x.date))
    out.push(g)
  }
  return out
}

export interface PaperTeam { key: string; participant: Participant; name: string; coach: string; games: LeagueGame[] }
/** Participants not in the app yet (or not linked to a team yet), with the games logged against them. */
export function paperTeams(d: LeagueData, games: LeagueGame[]): PaperTeam[] {
  const r = resolver(d)
  return d.participants
    .filter((p) => isPaper(r.byPid.get(p.id)))
    .map((p) => {
      const key = `#${p.id}`
      return { key, participant: p, name: p.team || p.coach, coach: p.coach, games: games.filter((g) => g.a === key || g.b === key) }
    })
}

export interface TableRow {
  key: string
  /** the team in the app; absent for a participant not in the app yet */
  team?: LeagueTeam
  name: string
  coach: string
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

/**
 * League table. Win 3, draw 1, loss 0. Every participant has a row from the start; one not in the app yet gets
 * their results from the records of the coaches who played them.
 */
export function leagueTable(d: LeagueData, games: LeagueGame[]): TableRow[] {
  const rows = new Map<string, TableRow>()
  const blank = { p: 0, w: 0, d: 0, l: 0, tdFor: 0, tdAgainst: 0, casFor: 0, casAgainst: 0, pts: 0 }
  for (const t of d.teams) {
    const key = teamKey({ uid: t.uid, teamId: t.team.id })
    rows.set(key, { key, team: t, name: t.team.name, coach: t.coach, ...blank })
  }
  for (const pt of paperTeams(d, games)) rows.set(pt.key, { key: pt.key, name: pt.name, coach: pt.coach, ...blank })
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
      x.name.localeCompare(y.name),
  )
}

export interface H2H { a: string; b: string; w: number; d: number; l: number; tdFor: number; tdAgainst: number }
/** Coach vs coach records (from coach a's view). */
export function headToHead(games: LeagueGame[]): H2H[] {
  const map = new Map<string, H2H>()
  for (const g of games) {
    if (!g.b || isPaper(g.b) || isPaper(g.a)) continue
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
