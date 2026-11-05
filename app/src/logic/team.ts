import type { Player, Team } from '../db'
import { getPositional, getRoster, isLineman } from '../rules/data'
import { SEVENS } from '../rules/sevens'
import type { Positional, Stat } from '../rules/types'

const tgt = (s: string | null) => (s ? parseInt(s, 10) : null)

export interface Profile {
  ma: number
  st: number
  ag: number | null
  pa: number | null
  av: number | null
  skills: string[]
  baseSkills: string[]
  gainedSkills: string[]
}

export function statDelta(p: Player, s: Stat) {
  const imp = p.advancements.filter((a) => a.kind === 'stat' && a.stat === s).length
  const inj = p.injuries.filter((i) => i.kind === 'stat' && i.stat === s).length
  return { imp, inj }
}

export function profile(p: Player, rosterId: string): Profile {
  const pos = getPositional(rosterId, p.position)
  const dl = (s: Stat) => statDelta(p, s)
  const ma = (pos?.ma ?? 0) + dl('ma').imp - dl('ma').inj - (p.veteran ? 1 : 0)
  const st = (pos?.st ?? 0) + dl('st').imp - dl('st').inj
  const target = (base: number | null, s: Stat, lo: number, hi: number) => {
    const { imp, inj } = dl(s)
    if (base == null) return imp > inj ? Math.max(lo, 7 - (imp - inj)) : null
    return Math.min(hi, Math.max(lo, base - imp + inj))
  }
  const ag = target(tgt(pos?.ag ?? null), 'ag', 1, 6)
  const pa = target(tgt(pos?.pa ?? null), 'pa', 1, 6)
  const avBase = tgt(pos?.av ?? null)
  const av = avBase == null ? null : Math.min(11, Math.max(3, avBase + dl('av').imp - dl('av').inj))
  const baseSkills = [...(pos?.skills ?? []), ...(p.journeyman ? [SEVENS.journeymanLoner] : [])]
  const gainedSkills = [...p.advancements.filter((a) => a.skill).map((a) => a.skill!), ...p.extraSkills]
  return { ma, st, ag, pa, av, baseSkills, gainedSkills, skills: [...baseSkills, ...gainedSkills] }
}

export const fmtTarget = (n: number | null) => (n == null ? '-' : `${n}+`)

export function playerValue(p: Player, rosterId: string) {
  const pos = getPositional(rosterId, p.position)
  return (pos?.cost ?? 0) + p.advancements.reduce((s, a) => s + a.value, 0) + p.valueAdjust
}

export const onRoster = (p: Player) => p.status === 'active'

export function staffValue(t: Team) {
  return (
    t.rerolls * SEVENS.rerollCost +
    t.assistantCoaches * SEVENS.assistantCoachCost +
    t.cheerleaders * SEVENS.cheerleaderCost +
    (t.apothecary ? SEVENS.apothecaryCost : 0) +
    (t.lawyer ? SEVENS.lawyerCost : 0)
  )
}

export function teamValue(t: Team, players: Player[]) {
  const roster = players.filter(onRoster)
  const tv = roster.reduce((s, p) => s + playerValue(p, t.rosterId), 0) + staffValue(t)
  const missing = roster.filter((p) => p.missNextGame).reduce((s, p) => s + playerValue(p, t.rosterId), 0)
  return { tv, ctv: tv - missing }
}

export interface Warning {
  level: 'error' | 'warn'
  text: string
}

export function validateTeam(t: Team, players: Player[]): Warning[] {
  const w: Warning[] = []
  const roster = getRoster(t.rosterId)
  if (!roster) return [{ level: 'error', text: 'Unknown roster' }]
  const active = players.filter(onRoster)
  if (active.length < SEVENS.minPlayers) w.push({ level: 'warn', text: `Only ${active.length} players; need at least ${SEVENS.minPlayers}.` })
  if (active.length > SEVENS.maxPlayers) w.push({ level: 'error', text: `${active.length} players; max ${SEVENS.maxPlayers}.` })
  const nonLine = active.filter((p) => {
    const pos = getPositional(t.rosterId, p.position)
    return pos && !isLineman(pos)
  })
  if (nonLine.length > SEVENS.maxNonLinemen) w.push({ level: 'error', text: `${nonLine.length} non-Linemen; max ${SEVENS.maxNonLinemen}.` })
  for (const pos of roster.positionals) {
    const n = active.filter((p) => p.position === pos.name).length
    if (n > pos.max) w.push({ level: 'error', text: `${n}× ${pos.name}; max ${pos.max}.` })
  }
  const vets = active.filter((p) => p.veteran)
  if (vets.length === 0 && active.some((p) => isLinemanName(t.rosterId, p.position))) w.push({ level: 'warn', text: 'No Veteran chosen (pick one Lineman).' })
  if (vets.length > 1) w.push({ level: 'error', text: 'Only one Veteran allowed.' })
  if (t.treasury < 0) w.push({ level: 'error', text: 'Treasury is negative (over budget).' })
  if (t.dedicatedFans < SEVENS.minFans) w.push({ level: 'warn', text: `Dedicated Fans should be at least ${SEVENS.minFans}.` })
  if (t.assistantCoaches > SEVENS.maxAssistantCoaches) w.push({ level: 'error', text: `Max ${SEVENS.maxAssistantCoaches} Assistant Coaches.` })
  if (t.cheerleaders > SEVENS.maxCheerleaders) w.push({ level: 'error', text: `Max ${SEVENS.maxCheerleaders} Cheerleaders.` })
  for (const p of active) {
    const bad = profile(p, t.rosterId).skills.filter((s) => (SEVENS.forbiddenSkills as readonly string[]).includes(s))
    if (bad.length) w.push({ level: 'error', text: `${p.name}: ${bad.join(', ')} is forbidden in our league.` })
  }
  if (t.apothecary && !roster.apothecary) w.push({ level: 'error', text: `${roster.name} teams cannot hire an Apothecary.` })
  return w
}

export const isLinemanName = (rosterId: string, position: string) => {
  const pos = getPositional(rosterId, position)
  return !!pos && isLineman(pos)
}

/** Positionals that can still be hired given QTY and the 4 non-Lineman cap. */
export function hireable(t: Team, players: Player[]): { pos: Positional; ok: boolean; reason?: string }[] {
  const roster = getRoster(t.rosterId)
  if (!roster) return []
  const active = players.filter(onRoster)
  const nonLine = active.filter((p) => !isLinemanName(t.rosterId, p.position)).length
  return roster.positionals.map((pos) => {
    const n = active.filter((p) => p.position === pos.name).length
    if (active.length >= SEVENS.maxPlayers) return { pos, ok: false, reason: 'Roster full (11)' }
    if (n >= pos.max) return { pos, ok: false, reason: `QTY 0-${pos.max} reached` }
    if (!isLineman(pos) && nonLine >= SEVENS.maxNonLinemen) return { pos, ok: false, reason: '4 non-Linemen reached' }
    if (pos.cost > t.treasury) return { pos, ok: false, reason: 'Not enough gold' }
    return { pos, ok: true }
  })
}

export function nextNumber(players: Player[]) {
  const used = new Set(players.filter(onRoster).map((p) => p.number))
  let n = 1
  while (used.has(n)) n++
  return n
}
