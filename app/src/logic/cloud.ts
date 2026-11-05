/**
 * Cloud backup to a private GitHub repository via the GitHub REST API (no own server).
 * Config + token live in localStorage on this device only: never in the backup file.
 */
import { useSyncExternalStore } from 'react'
import { db } from '../db'
import { buildBackup, importAll } from './backup'

export interface CloudConfig {
  owner: string
  repo: string
  token: string
  path: string
}
export interface CloudStatus {
  lastAt?: number // last successful backup or restore
  sha?: string // blob sha of the file on GitHub as this device last saw it
  hash?: string // hash of the data last backed up / restored
  dirty?: boolean // local changes since then
  error?: string
  conflict?: boolean // file on GitHub was changed by another device
  busy?: boolean
}

const CFG_KEY = 'sd-cloud-config'
const ST_KEY = 'sd-cloud-status'
export const DEFAULT_PATH = 'sevens-dugout-backup.json'
const AUTO_DELAY = 60_000

const load = <T>(k: string): T | undefined => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : undefined
  } catch {
    return undefined
  }
}
let config = load<CloudConfig>(CFG_KEY)
let status: CloudStatus = { ...load<CloudStatus>(ST_KEY), busy: false }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function setStatus(patch: Partial<CloudStatus>) {
  status = { ...status, ...patch }
  const { busy: _busy, ...persist } = status
  localStorage.setItem(ST_KEY, JSON.stringify(persist))
  emit()
}
export function setConfig(c: CloudConfig | undefined) {
  config = c
  if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c))
  else localStorage.removeItem(CFG_KEY)
  // new target: forget what we knew about the remote file
  setStatus({ sha: undefined, hash: undefined, lastAt: undefined, error: undefined, conflict: false })
}
export const useCloudConfig = () => useSyncExternalStore(subscribe, () => config)
export const useCloudStatus = () => useSyncExternalStore(subscribe, () => status)

// ---------- GitHub API ----------

async function gh(c: CloudConfig, path: string, init: RequestInit & { accept?: string } = {}) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: init.accept ?? 'application/vnd.github+json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok && res.status !== 404) {
    let msg = `GitHub error ${res.status}`
    try {
      msg += `: ${(await res.json()).message}`
    } catch {
      /* ignore */
    }
    if (res.status === 401) msg = 'Token invalid or expired: create a new one'
    if (res.status === 403) msg = 'Token lacks permission (needs Contents: Read and write on this repo)'
    throw new Error(msg)
  }
  return res
}

const filePath = (c: CloudConfig) => `/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`

async function remoteFile(c: CloudConfig): Promise<{ sha: string } | null> {
  const res = await gh(c, filePath(c), { accept: 'application/vnd.github.object+json' })
  if (res.status === 404) return null
  return { sha: (await res.json()).sha }
}

/** Checks repo access. Returns info for the settings screen. */
export async function testConnection(c: CloudConfig) {
  const res = await gh(c, '')
  if (res.status === 404) throw new Error('Repository not found, or the token has no access to it')
  const repo = await res.json()
  const file = await remoteFile(c)
  return { private: repo.private as boolean, hasBackup: !!file }
}

// ---------- backup / restore ----------

/** Small stable hash (FNV-1a) so unchanged data isn't committed again. crypto.subtle needs HTTPS, this doesn't. */
function hashOf(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16) + ':' + s.length
}
async function snapshot() {
  const data = await buildBackup()
  const text = JSON.stringify(data)
  const hash = hashOf(JSON.stringify({ ...data, exportedAt: undefined }))
  return { data, text, hash }
}
function toBase64(s: string) {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

let running: Promise<unknown> | null = null
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  while (running) await running.catch(() => {})
  const p = (async () => {
    setStatus({ busy: true })
    try {
      return await fn()
    } finally {
      setStatus({ busy: false })
    }
  })()
  running = p
  try {
    return await p
  } finally {
    running = null
  }
}

/** Upload all data. `force` overwrites the file even if another device changed it. */
export function backupNow(force = false): Promise<'saved' | 'unchanged'> {
  return exclusive(async () => {
    const c = config
    if (!c) throw new Error('Cloud backup is not set up')
    try {
      const snap = await snapshot()
      if (!force && snap.hash === status.hash && !status.conflict) {
        setStatus({ dirty: false, error: undefined })
        return 'unchanged' as const
      }
      const remote = await remoteFile(c)
      if (!force && remote && remote.sha !== status.sha) {
        setStatus({ conflict: true, error: 'The backup on GitHub was changed from another device (or this phone never restored it).' })
        throw new Error('conflict')
      }
      const d = snap.data
      const res = await gh(c, filePath(c), {
        method: 'PUT',
        body: JSON.stringify({
          message: `Backup: ${d.teams.length} team(s), ${d.matches.filter((m) => m.status === 'done').length} match(es)`,
          content: toBase64(snap.text),
          ...(remote ? { sha: remote.sha } : {}),
        }),
      })
      const sha = (await res.json()).content.sha as string
      setStatus({ sha, hash: snap.hash, lastAt: Date.now(), dirty: false, error: undefined, conflict: false })
      return 'saved' as const
    } catch (e) {
      if ((e as Error).message !== 'conflict') setStatus({ error: (e as Error).message === 'Failed to fetch' ? 'Offline: will retry' : (e as Error).message })
      throw e
    }
  })
}

/** Replace all data on this device with the backup from GitHub. */
export function restoreNow() {
  return exclusive(async () => {
    const c = config
    if (!c) throw new Error('Cloud backup is not set up')
    const res = await gh(c, filePath(c), { accept: 'application/vnd.github.raw+json' })
    if (res.status === 404) throw new Error('No backup on GitHub yet')
    await importAll(await res.text())
    const remote = await remoteFile(c)
    const snap = await snapshot()
    setStatus({ sha: remote?.sha, hash: snap.hash, lastAt: Date.now(), dirty: false, error: undefined, conflict: false })
  })
}

// ---------- automatic backup ----------

let timer: ReturnType<typeof setTimeout> | undefined
/** Back up after `delay` ms of quiet. Skipped while a match is live (one commit per game, not per event). */
export function backupSoon(delay = AUTO_DELAY) {
  if (!config || status.conflict) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if ((await db.matches.where('status').equals('live').count()) > 0) return
    backupNow().catch(() => {})
  }, delay)
}

let installed = false
export function initCloud() {
  if (installed) return
  installed = true
  const touch = () => {
    if (!status.dirty) setStatus({ dirty: true })
    backupSoon()
  }
  for (const t of db.tables) {
    t.hook('creating', () => void touch())
    t.hook('updating', () => void touch())
    t.hook('deleting', () => void touch())
  }
  window.addEventListener('online', () => status.dirty && backupSoon(5_000))
  if (status.dirty) backupSoon(10_000)
}

export function ago(ts?: number) {
  if (!ts) return 'never'
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}
