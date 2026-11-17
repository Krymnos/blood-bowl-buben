/**
 * League sync: Google sign-in, join requests, pushing own teams/matches to Firestore, reading the whole league.
 * The phone stays the main copy; this is a layer on top (see docs/LEAGUE-SYNC-FIREBASE.md).
 * The Firebase SDK is loaded lazily (./fb) only once this device uses League.
 */
import { useSyncExternalStore } from 'react'
import { db, type Match, type MatchEvent, type Player, type Team } from '../db'
import { ADMIN_UID, LEAGUE_BACKUP_PATH } from '../league.config'
import { hasCloud, hashOf, onBackup, putFile } from './cloud'
import type { FbUser, Op, Participant, RawLeague, RequestRow } from './fb'

export type { Participant }

export type Membership = 'unknown' | 'none' | 'requested' | 'member'

export interface LeagueTeam { uid: string; coach: string; team: Team; players: Player[]; updatedAt?: number }
export interface LeagueMatch { uid: string; match: Match; events: MatchEvent[]; updatedAt?: number }
export interface LeagueData {
  members: { uid: string; coach: string; joinedAt?: number }[]
  /** the league's participant list (admin-made): every coach in the league, in the app or not */
  participants: Participant[]
  coachName: Record<string, string>
  teams: LeagueTeam[]
  matches: LeagueMatch[]
  fromCache: boolean
}
export interface SyncStatus {
  lastAt?: number
  dirty?: boolean
  error?: string
  busy?: boolean
  /** 'device': last published from another phone; 'empty': this phone has no teams but the league still has some */
  conflict?: 'device' | 'empty'
}
export interface LeagueState {
  /** this device has signed in before: load the SDK at start */
  enabled: boolean
  loading: boolean
  user: FbUser | null
  membership: Membership
  coach?: string
  isAdmin: boolean
  sync: SyncStatus
  data?: LeagueData
  dataError?: string
  requests?: RequestRow[]
  /** participant list, live while signed in (also before joining: the join form picks from it) */
  participants?: Participant[]
  error?: string
}

const K = { on: 'sd-league-on', sync: 'sd-league-sync', device: 'sd-league-device', hashes: 'sd-league-hashes', backup: 'sd-league-backup-hash' }
const AUTO_DELAY = 30_000
const load = <T,>(k: string): T | undefined => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : undefined
  } catch {
    return undefined
  }
}
const deviceId = load<string>(K.device) ?? Math.random().toString(36).slice(2, 12)
localStorage.setItem(K.device, JSON.stringify(deviceId))

let state: LeagueState = {
  enabled: !!load<boolean>(K.on),
  loading: false,
  user: null,
  membership: 'unknown',
  isAdmin: false,
  sync: { ...load<SyncStatus>(K.sync), busy: false },
}
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
function set(patch: Partial<LeagueState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
function setSync(patch: Partial<SyncStatus>) {
  const sync = { ...state.sync, ...patch }
  const { busy: _b, ...persist } = sync
  localStorage.setItem(K.sync, JSON.stringify(persist))
  set({ sync })
}
export const useLeague = () => useSyncExternalStore(subscribe, () => state)
export const getLeague = () => state

// ---------- SDK + auth ----------

let fbP: Promise<typeof import('./fb')> | undefined
const fb = () => (fbP ??= import('./fb'))
let stopMembership: (() => void) | undefined
let stopRequests: (() => void) | undefined
let stopParticipants: (() => void) | undefined

async function start() {
  if (fbP) return fb()
  set({ loading: true })
  try {
    const api = await fb()
    api.onUser(onUser)
    return api
  } catch (e) {
    fbP = undefined
    set({ error: `Could not load league sync: ${(e as Error).message}` })
    throw e
  } finally {
    set({ loading: false })
  }
}

function onUser(user: FbUser | null) {
  stopMembership?.()
  stopRequests?.()
  stopParticipants?.()
  stopData()
  stopMembership = stopRequests = stopParticipants = undefined
  const isAdmin = !!user && !!ADMIN_UID && user.uid === ADMIN_UID
  reconciled = false
  set({ user, isAdmin, membership: user ? 'unknown' : 'none', coach: undefined, requests: undefined, participants: undefined, data: undefined })
  if (!user) return
  if (!state.enabled) {
    localStorage.setItem(K.on, 'true')
    set({ enabled: true })
  }
  void fb().then((api) => {
    stopParticipants = api.watchParticipants(
      (participants) => set({ participants, data: state.data && { ...state.data, participants } }),
      () => {},
    )
    stopMembership = api.watchMembership(
      user.uid,
      (member, request) => {
        const was = state.membership
        const membership: Membership = member.exists ? 'member' : request.exists ? 'requested' : 'none'
        set({ membership, coach: member.coach ?? request.coach, error: undefined })
        if (membership === 'member' && was !== 'member') {
          reconciled = false
          syncSoon(3_000)
          if (wanted || isAdmin) openData()
          if (isAdmin) stopRequests ??= api.watchRequests((requests) => set({ requests }), () => {})
        }
        if (membership !== 'member' && was === 'member') stopData()
      },
      (e) => set({ error: e.message }),
    )
  })
}

/** Signing in also enables league sync on this device. */
export async function signIn() {
  const api = await start()
  await api.signIn()
}
export async function signOut() {
  const api = await start()
  await api.signOut()
  localStorage.removeItem(K.on)
  localStorage.removeItem(K.hashes)
  localStorage.removeItem(K.sync)
  set({ enabled: false, sync: {} })
}

// ---------- joining ----------

/** `pid`: the participant-list entry this coach picked ("who are you?") */
export async function requestJoin(coach: string, pid?: string) {
  const api = await fb()
  const uid = state.user!.uid
  // the admin doesn't need approval
  if (state.isAdmin) await api.addMember(uid, coach, pid)
  else await api.requestJoin(uid, coach, pid)
}
export const withdrawRequest = async () => (await fb()).withdrawRequest(state.user!.uid)
export const approve = async (uid: string, coach: string, pid?: string) => (await fb()).approve(uid, coach, pid)
export const reject = async (uid: string) => (await fb()).rejectRequest(uid)
/** Wiping their data also frees their participant-list entry (so they could join again under it). */
export async function removeMember(uid: string, wipe: boolean) {
  const api = await fb()
  await api.removeMember(uid, wipe)
  if (wipe) for (const p of state.participants ?? []) if (p.uid === uid) await api.linkParticipant(p.id, null)
}

// ---------- participant list (admin) ----------

export const saveParticipant = async (p: { id?: string; coach: string; team: string; rosterId?: string }) => (await fb()).putParticipant(p)
export const deleteParticipant = async (id: string) => (await fb()).deleteParticipant(id)
export const linkParticipant = async (id: string, uid: string | null) => (await fb()).linkParticipant(id, uid)

// ---------- reading the league ----------

let stopLeague: (() => void) | undefined
let wanted = false
/** Live listeners on the whole league. Kept for the session once started (re-listening costs reads). */
export function startData() {
  wanted = true
  openData()
}
function openData() {
  if (stopLeague || state.membership !== 'member') return
  void fb().then((api) => {
    if (stopLeague || state.membership !== 'member') return
    stopLeague = api.watchLeague(
      (raw) => {
        set({ data: toLeague(raw), dataError: undefined })
        if (state.isAdmin && !raw.fromCache) leagueBackupSoon()
      },
      (e) => {
        set({ dataError: e.message })
        stopData()
      },
    )
  })
}
function stopData() {
  stopLeague?.()
  stopLeague = undefined
}
function toLeague(raw: RawLeague): LeagueData {
  const coachName: Record<string, string> = {}
  for (const c of raw.coaches) coachName[c.uid] = c.coach
  for (const m of raw.members) coachName[m.uid] = m.coach
  return {
    members: raw.members,
    participants: state.participants ?? [],
    coachName,
    teams: raw.teams.map((t) => ({ uid: t.uid, coach: coachName[t.uid] ?? '?', team: t.data.team, players: t.data.players ?? [], updatedAt: t.updatedAt })),
    matches: raw.matches.map((m) => ({ uid: m.uid, match: m.data.match, events: m.data.events ?? [], updatedAt: m.updatedAt })),
    fromCache: raw.fromCache,
  }
}

// ---------- pushing own data ----------

type LocalDoc = { key: string; data: Record<string, unknown>; hash: string }
async function localDocs(): Promise<LocalDoc[]> {
  const [teams, players, matches, events] = await Promise.all([db.teams.toArray(), db.players.toArray(), db.matches.where('status').equals('done').toArray(), db.events.toArray()])
  const teamIds = new Set(teams.map((t) => t.id))
  const out: LocalDoc[] = []
  const add = (key: string, body: Record<string, unknown>) => {
    const hash = hashOf(JSON.stringify(body))
    out.push({ key, data: { ...body, hash }, hash })
  }
  for (const t of teams) add(`teams/${t.id}`, { team: t, players: players.filter((p) => p.teamId === t.id) })
  // only finished games are published; no live-event spam
  for (const m of matches) if (teamIds.has(m.teamId)) add(`matches/${m.id}`, { match: m, events: events.filter((e) => e.matchId === m.id) })
  return out
}

let reconciled = false
let running: Promise<unknown> | null = null

/** Publish changed teams/matches and delete removed ones. `force` resolves a conflict in favour of this device. */
export async function syncNow(force = false): Promise<'saved' | 'unchanged' | 'skipped'> {
  while (running) await running.catch(() => {})
  const p = doSync(force)
  running = p
  try {
    return await p
  } finally {
    running = null
  }
}

async function doSync(force: boolean): Promise<'saved' | 'unchanged' | 'skipped'> {
  const user = state.user
  if (!user || state.membership !== 'member' || !state.coach) return 'skipped'
  if (!navigator.onLine) {
    setSync({ dirty: true, error: 'Offline: will retry' })
    return 'skipped'
  }
  setSync({ busy: true })
  try {
    const api = await fb()
    const local = await localDocs()
    let known = new Map(Object.entries(load<Record<string, string>>(K.hashes) ?? {}))
    if (!reconciled || force) {
      // first sync this session: compare against what is really in Firestore (also refills a wiped project)
      const remote = await api.fetchOwn(user.uid)
      if (!force && remote.device && remote.device !== deviceId) {
        setSync({ conflict: 'device', error: undefined })
        return 'skipped'
      }
      known = remote.hashes
    }
    const localKeys = new Set(local.map((d) => d.key))
    const knownTeams = [...known.keys()].filter((k) => k.startsWith('teams/')).length
    if (!force && local.every((d) => !d.key.startsWith('teams/')) && knownTeams > 0) {
      // safety net: an emptied phone must not silently wipe the coach's league data
      setSync({ conflict: 'empty', error: undefined })
      return 'skipped'
    }
    const ops: Op[] = [
      ...local.filter((d) => known.get(d.key) !== d.hash).map((d) => ({ key: d.key, data: d.data })),
      ...[...known.keys()].filter((k) => !localKeys.has(k)).map((key) => ({ key })),
    ]
    if (ops.length || !reconciled || force) {
      await withTimeout(api.publish(user.uid, state.coach, deviceId, ops), 45_000)
    }
    localStorage.setItem(K.hashes, JSON.stringify(Object.fromEntries(local.map((d) => [d.key, d.hash]))))
    reconciled = true
    setSync({ lastAt: Date.now(), dirty: false, error: undefined, conflict: undefined })
    return ops.length ? 'saved' : 'unchanged'
  } catch (e) {
    const msg = (e as Error).message
    setSync({ error: /offline|unavailable|timed out|network/i.test(msg) ? 'Offline: will retry' : msg })
    throw e
  } finally {
    setSync({ busy: false })
  }
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Sync timed out (offline?)')), ms))])

let timer: ReturnType<typeof setTimeout> | undefined
/** Push after `delay` ms of quiet; skipped while a match is live (one push per game, not per event). */
export function syncSoon(delay = AUTO_DELAY) {
  if (state.membership !== 'member' || state.sync.conflict) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if ((await db.matches.where('status').equals('live').count()) > 0) return
    syncNow().catch(() => {})
  }, delay)
}

// ---------- league backup (admin) ----------

export function buildLeagueBackup(d: LeagueData) {
  return {
    app: 'blood-bowl-buben-league',
    version: 1,
    exportedAt: new Date().toISOString(),
    members: d.members,
    participants: d.participants,
    teams: d.teams.map((t) => ({ uid: t.uid, coach: t.coach, team: t.team, players: t.players })),
    matches: d.matches.map((m) => ({ uid: m.uid, match: m.match, events: m.events })),
  }
}
export function downloadLeagueBackup() {
  if (!state.data) throw new Error('League data not loaded yet')
  const blob = new Blob([JSON.stringify(buildLeagueBackup(state.data))], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `blood-bowl-buben-league-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

let backupTimer: ReturnType<typeof setTimeout> | undefined
/** Admin only: keep `league-backup.json` in the private GitHub backup repo up to date, only when something changed. */
function leagueBackupSoon(delay = 60_000) {
  if (!state.isAdmin || !hasCloud()) return
  clearTimeout(backupTimer)
  backupTimer = setTimeout(async () => {
    const d = state.data
    if (!d || d.fromCache) return
    if ((await db.matches.where('status').equals('live').count()) > 0) return leagueBackupSoon()
    const snap = buildLeagueBackup(d)
    const hash = hashOf(JSON.stringify({ ...snap, exportedAt: undefined }))
    if (hash === load<string>(K.backup)) return
    try {
      await putFile(LEAGUE_BACKUP_PATH, JSON.stringify(snap), `League backup: ${snap.teams.length} team(s), ${snap.matches.length} match(es)`)
      localStorage.setItem(K.backup, JSON.stringify(hash))
    } catch {
      /* retried on the next change or backup */
    }
  }, delay)
}

// ---------- init ----------

let installed = false
export function initLeague() {
  if (installed) return
  installed = true
  const touch = () => {
    if (!state.enabled) return
    if (!state.sync.dirty) setSync({ dirty: true })
    syncSoon()
  }
  for (const t of [db.teams, db.players, db.matches, db.events]) {
    t.hook('creating', () => void touch())
    t.hook('updating', () => void touch())
    t.hook('deleting', () => void touch())
  }
  window.addEventListener('online', () => state.sync.dirty && syncSoon(5_000))
  // after the admin's own GitHub backup, also refresh the league backup
  onBackup(() => leagueBackupSoon(5_000))
  if (state.enabled) start().catch(() => {})
}

/**
 * Which of this phone's teams plays as participant `pid` in the league (only asked when the coach has several
 * published teams and none has the entry's name). Published right away.
 */
export async function setLeagueTeam(teamId: number, pid: string) {
  await db.transaction('rw', db.teams, async () => {
    for (const t of await db.teams.toArray()) {
      if (t.id === teamId) await db.teams.update(t.id, { leaguePid: pid })
      else if (t.leaguePid === pid) await db.teams.update(t.id, { leaguePid: undefined })
    }
  })
  await syncNow().catch(() => {})
}
