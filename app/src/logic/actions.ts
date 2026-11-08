import { db, getSettings, type Injury, type Match, type Player, type Team } from '../db'
import { getPositional, getRoster, isLineman } from '../rules/data'
import { SEVENS } from '../rules/sevens'
import { nextNumber, teamValue } from './team'

/** Draft mode: before the draft is finished and before the first match. */
export const isDraft = (team: Team, matchCount: number) => !team.draftDone && matchCount === 0

/** League rule: left-over draft budget is lost — every team starts its first game with 0 in the treasury. */
export async function finishDraft(team: Team) {
  await db.teams.update(team.id, { draftDone: true, treasury: 0 })
}

const newPlayer = (teamId: number, number: number, name: string, position: string, extra: Partial<Player> = {}) =>
  ({
    teamId, number, name, position, advancements: [], injuries: [], extraSkills: [], missNextGame: false,
    status: 'active', sppAdjust: 0, valueAdjust: 0, hiredAt: Date.now(), ...extra,
  }) as unknown as Player

export async function hirePlayer(team: Team, position: string, name: string) {
  const pos = getPositional(team.rosterId, position)
  if (!pos) return
  const players = await db.players.where('teamId').equals(team.id).toArray()
  await db.transaction('rw', db.players, db.teams, async () => {
    await db.players.add(newPlayer(team.id, nextNumber(players), name, position))
    const t = (await db.teams.get(team.id))!
    await db.teams.update(team.id, { treasury: t.treasury - pos.cost })
  })
}

/** In draft mode removal refunds the hiring fee; afterwards it is a firing (no refund). */
export async function removePlayer(team: Team, p: Player, draft: boolean) {
  if (draft) {
    await db.transaction('rw', db.players, db.teams, async () => {
      await db.players.delete(p.id)
      await db.teams.update(team.id, { treasury: team.treasury + (getPositional(team.rosterId, p.position)?.cost ?? 0) })
    })
  } else {
    await db.players.update(p.id, { status: 'fired' })
  }
}

type StaffKey = 'rerolls' | 'assistantCoaches' | 'cheerleaders' | 'apothecary' | 'lawyer'

/** Buying staff costs gold; selling refunds only during the draft. */
export async function changeStaff(team: Team, key: StaffKey, next: number | boolean, draft: boolean) {
  const s = await getSettings()
  const cost: Record<StaffKey, number> = {
    rerolls: draft ? SEVENS.rerollCost : s.rerollCostLeague,
    assistantCoaches: SEVENS.assistantCoachCost,
    cheerleaders: SEVENS.cheerleaderCost,
    apothecary: SEVENS.apothecaryCost,
    lawyer: SEVENS.lawyerCost,
  }
  const cur = Number(team[key] ?? 0)
  const diff = Number(next) - cur
  const delta = diff > 0 ? -diff * cost[key] : draft ? -diff * cost[key] : 0
  await db.teams.update(team.id, { [key]: next, treasury: team.treasury + delta })
}

export async function startMatch(teamId: number) {
  let team = (await db.teams.get(teamId))!
  const matchCount = await db.matches.where('teamId').equals(teamId).count()
  if (isDraft(team, matchCount)) {
    await finishDraft(team)
    team = (await db.teams.get(teamId))!
  }
  const players = await db.players.where('teamId').equals(teamId).toArray()
  const active = players.filter((p) => p.status === 'active')
  const { ctv } = teamValue(team, players)
  const id = await db.matches.add({
    teamId,
    date: Date.now(),
    status: 'setup',
    opponent: { name: '', coach: '', rosterId: '', ctv: 0 },
    ourCtv: ctv,
    played: active.filter((p) => !p.missNextGame).map((p) => p.id),
    missing: active.filter((p) => p.missNextGame).map((p) => p.id),
    fanFactor: { us: 0, them: 0 },
    inducements: [],
    pettyCash: 0,
    treasurySpent: 0,
    prayers: [],
    desperate: [],
    half: 1,
    turn: 1,
    score: { us: 0, them: 0 },
    stalling: false,
    starHired: { us: false, them: false },
    starFee: team.starPlayer?.cost ?? 0,
    journeymen: [],
    notes: '',
  } as unknown as Match)
  return id
}

export const linemanPositions = (rosterId: string) => getRoster(rosterId)?.positionals.filter(isLineman) ?? []

/** Fill the squad with free Journeymen (Lineman + Loner 5+) for one match. */
export async function addJourneymen(m: Match, team: Team, count: number, position: string, names: string[]) {
  await db.transaction('rw', db.players, db.matches, async () => {
    const ids: number[] = []
    for (let i = 0; i < count; i++) {
      const players = await db.players.where('teamId').equals(team.id).toArray()
      const used = new Set(players.filter((p) => p.status === 'active' || p.status === 'journeyman').map((p) => p.number))
      let n = 1
      while (used.has(n)) n++
      ids.push((await db.players.add(newPlayer(team.id, n, names[i], position, { status: 'journeyman', journeyman: true }))) as number)
    }
    const cur = (await db.matches.get(m.id))!
    await db.matches.update(m.id, { played: [...cur.played, ...ids], journeymen: [...(cur.journeymen ?? []), ...ids] })
  })
}

export async function removeJourneyman(m: Match, id: number) {
  await db.transaction('rw', db.players, db.matches, db.events, async () => {
    const cur = (await db.matches.get(m.id))!
    await db.matches.update(m.id, { played: cur.played.filter((x) => x !== id), journeymen: (cur.journeymen ?? []).filter((x) => x !== id) })
    if ((await db.events.where('playerId').equals(id).count()) === 0) await db.players.delete(id)
    else await db.players.update(id, { status: 'released' })
  })
}

/** Cost to buy a journeyman after the match: Lineman price + value of his advancements. */
export const journeymanPrice = (p: Player, rosterId: string) =>
  (getPositional(rosterId, p.position)?.cost ?? 0) + p.advancements.reduce((s, a) => s + a.value, 0)

export async function deleteMatch(m: Match) {
  await db.transaction('rw', [db.matches, db.events, db.photos, db.teams, db.players], async () => {
    // a finished match already changed the team (treasury, fans, injuries) — those are not rolled back
    if (m.status !== 'done' && m.treasurySpent && m.status !== 'setup') {
      const t = await db.teams.get(m.teamId)
      if (t) await db.teams.update(t.id, { treasury: t.treasury + m.treasurySpent })
    }
    if (m.status !== 'done') for (const id of m.journeymen ?? []) {
      const p = await db.players.get(id)
      if (p?.status === 'journeyman') await db.players.delete(id)
    }
    await db.events.where('matchId').equals(m.id).delete()
    await db.photos.where('matchId').equals(m.id).delete()
    await db.matches.delete(m.id)
  })
}

export async function recalcScore(matchId: number) {
  const evs = await db.events.where('matchId').equals(matchId).toArray()
  await db.matches.update(matchId, {
    score: { us: evs.filter((e) => e.type === 'td' && e.side === 'us').length, them: evs.filter((e) => e.type === 'td' && e.side === 'them').length },
  })
}

export const rosterName = (id: string) => getRoster(id)?.name ?? id

/**
 * Applies the casualties our players suffered in a finished match to the roster: injuries, MNG, death.
 * Idempotent — injuries from this match are rebuilt from the log, so it runs again after the log of a
 * finished match is edited. MNG is only touched while this is still the team's latest match.
 */
export async function syncMatchInjuries(matchId: number) {
  const m = await db.matches.get(matchId)
  if (!m || m.status !== 'done') return
  const events = await db.events.where('matchId').equals(matchId).toArray()
  const cas = events.filter((e) => e.side === 'them' && e.type === 'cas' && e.victimId != null)
  const teamMatches = await db.matches.where('teamId').equals(m.teamId).toArray()
  const latest = !teamMatches.some((x) => x.id > m.id)
  const players = await db.players.where('teamId').equals(m.teamId).toArray()
  for (const p of players) {
    const mine = cas.filter((e) => e.victimId === p.id)
    const fromMatch = p.injuries.some((i) => i.matchId === m.id) || p.diedInMatch === m.id
    if (!mine.length && !fromMatch) continue
    const injuries = [
      ...p.injuries.filter((i) => i.matchId !== m.id),
      ...mine.flatMap((e): Injury[] =>
        e.result === 'si' ? [{ id: `${e.id}`, kind: 'niggling' as const, matchId: m.id, at: e.at }]
        : e.result === 'li' ? [{ id: `${e.id}`, kind: 'stat' as const, stat: e.stat ?? 'av', matchId: m.id, at: e.at }]
        : [],
      ),
    ]
    const dead = mine.some((e) => e.result === 'dead')
    const patch: Partial<Player> = { injuries }
    if (dead) Object.assign(patch, { status: 'dead', diedInMatch: m.id })
    else if (p.diedInMatch === m.id) Object.assign(patch, { status: p.journeyman ? 'released' : 'active', diedInMatch: undefined })
    if (latest && !dead) patch.missNextGame = mine.some((e) => e.result === 'sh' || e.result === 'si' || e.result === 'li')
    await db.players.update(p.id, patch)
  }
}
