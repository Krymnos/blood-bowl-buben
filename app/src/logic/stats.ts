import type { Match, MatchEvent, Player } from '../db'
import type { LeagueSettings } from '../rules/sevens'

export interface PlayerStats {
  games: number
  td: number
  /** casualties that earned SPP */
  cas: number
  casAll: number
  casStar: number
  completion: number
  catch: number
  interception: number
  deflection: number
  mvp: number
  ttmThrow: number
  ttmLand: number
  ko: number
  block: number
  knockdown: number
  armour: number
  foul: number
  sentoff: number
  fails: number
  rerolls: number
  casSuffered: number
  koSuffered: number
  sppEarned: number
  sppSpent: number
  spp: number
}

export const emptyStats = (): PlayerStats => ({
  games: 0, td: 0, cas: 0, casAll: 0, casStar: 0, completion: 0, catch: 0, interception: 0, deflection: 0, mvp: 0, ttmThrow: 0, ttmLand: 0,
  ko: 0, block: 0, knockdown: 0, armour: 0, foul: 0, sentoff: 0, fails: 0, rerolls: 0, casSuffered: 0, koSuffered: 0,
  sppEarned: 0, sppSpent: 0, spp: 0,
})

/** SPP one event earns for our acting player, including Prayers to Nuffle that change SPP. */
export function eventSpp(e: MatchEvent, s: LeagueSettings, prayers: readonly string[] = []) {
  if (e.side !== 'us' || e.playerId == null) return 0
  const v = s.spp
  const has = (name: string) => prayers.includes(name)
  switch (e.type) {
    case 'td': return v.td
    case 'completion': return has('Perfect Passing') ? 2 : v.completion
    case 'catch': return has('Fan Interaction') ? 1 : 0
    case 'interception': return v.interception
    case 'deflection': return v.deflection
    case 'ttm_throw': return v.ttmThrow
    case 'ttm_land': return v.ttmLand
    case 'cas': {
      const block = e.cause === 'block' || e.cause == null || (e.cause === 'foul' && has('Fouling Frenzy'))
      if (block) return e.star ? v.casStar : v.cas
      if (e.cause === 'crowd' && has('Necessary Violence')) return 2
      return 0
    }
    default: return 0
  }
}

/** Derives career stats for every player from the event log. */
export function computeStats(players: Player[], matches: Match[], events: MatchEvent[], s: LeagueSettings) {
  const map = new Map<number, PlayerStats>()
  const get = (id: number) => {
    let x = map.get(id)
    if (!x) map.set(id, (x = emptyStats()))
    return x
  }
  const prayersOf = new Map(matches.map((m) => [m.id, m.prayers ?? []]))
  for (const p of players) get(p.id)
  for (const m of matches) {
    if (m.status === 'done') for (const id of m.played) get(id).games++
    if (m.mvpPlayerId != null && m.status === 'done') {
      const x = get(m.mvpPlayerId)
      x.mvp++
      x.sppEarned += s.spp.mvp
    }
  }
  for (const e of events) {
    if (e.side === 'us' && e.playerId != null) {
      const x = get(e.playerId)
      const spp = eventSpp(e, s, prayersOf.get(e.matchId))
      x.sppEarned += spp
      switch (e.type) {
        case 'td': x.td++; break
        case 'completion': x.completion++; break
        case 'catch': x.catch++; break
        case 'interception': x.interception++; break
        case 'deflection': x.deflection++; break
        case 'ttm_throw': x.ttmThrow++; break
        case 'ttm_land': x.ttmLand++; break
        case 'cas': x.casAll++; if (spp > 0) x.cas++; if (e.star) x.casStar++; break
        case 'ko': x.ko++; break
        case 'block': x.block++; break
        case 'knockdown': x.knockdown++; break
        case 'armour': x.armour++; break
        case 'foul': x.foul++; break
        case 'sentoff': x.sentoff++; break
        case 'reroll': x.rerolls++; break
        case 'fail_dodge': case 'fail_rush': case 'fail_pickup': case 'fail_catch': case 'fail_pass': case 'nuffle': x.fails++; break
      }
    }
    if (e.side === 'them' && e.victimId != null) {
      const x = get(e.victimId)
      if (e.type === 'cas') x.casSuffered++
      if (e.type === 'ko') x.koSuffered++
    }
  }
  for (const p of players) {
    const x = get(p.id)
    x.sppEarned += p.sppAdjust
    x.sppSpent = p.advancements.reduce((t, a) => t + a.spp, 0)
    x.spp = x.sppEarned - x.sppSpent
  }
  return map
}

export function cheapestAdvance(p: Player, s: LeagueSettings) {
  const n = p.advancements.length
  if (n >= 6) return null
  return Math.min(s.advCost.randomPrimary[n], s.advCost.chosenPrimary[n], s.advCost.chosenSecondary[n], s.advCost.characteristic[n])
}

export function teamRecord(matches: Match[]) {
  const done = matches.filter((m) => m.status === 'done')
  const w = done.filter((m) => m.score.us > m.score.them).length
  const l = done.filter((m) => m.score.us < m.score.them).length
  return { played: done.length, w, d: done.length - w - l, l, tdFor: sumBy(done, (m) => m.score.us), tdAgainst: sumBy(done, (m) => m.score.them) }
}
const sumBy = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0)

export const resultOf = (m: Match) => (m.score.us > m.score.them ? 'W' : m.score.us < m.score.them ? 'L' : 'D')
