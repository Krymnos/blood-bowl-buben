import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ago, backupNow, DEFAULT_PATH, restoreNow, setConfig, testConnection, useCloudConfig, useCloudStatus, type CloudConfig } from '../logic/cloud'
import { Button, Card, inputCls } from './ui'

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

export function CloudStatusLine() {
  const c = useCloudConfig()
  const s = useCloudStatus()
  if (!c) return null
  if (s.busy) return <span className="text-white/50">☁️ Backing up…</span>
  if (s.conflict) return <span className="text-red-300">⚠️ Backup conflict: open Settings</span>
  if (s.error) return <span className="text-amber-300">⚠️ {s.error}</span>
  return (
    <span className="text-white/50">
      ☁️ Backed up {ago(s.lastAt)}
      {s.dirty ? ' · changes pending' : ''}
    </span>
  )
}

export default function CloudBackup() {
  const c = useCloudConfig()
  const s = useCloudStatus()
  const nav = useNavigate()
  const [form, setForm] = useState<CloudConfig>({ owner: '', repo: '', token: '', path: DEFAULT_PATH })
  const [msg, setMsg] = useState<string>()
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMsg(undefined)
    try {
      await fn()
    } catch (e) {
      if ((e as Error).message !== 'conflict') setMsg(`❌ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!c) {
    const f = (k: keyof CloudConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value.trim() })
    return (
      <Card className="space-y-2">
        <div className="text-xs leading-relaxed text-white/60">
          Saves all data to a <b>private</b> GitHub repository: automatically after each finished game and a minute after other changes. Every backup is a commit, so you can go back
          to any earlier state. The token stays on this phone only.
        </div>
        <details className="rounded-xl bg-white/5 p-2 text-xs leading-relaxed text-white/60">
          <summary className="cursor-pointer font-semibold text-white/80">How to get a token</summary>
          <ol className="ml-4 mt-1 list-decimal space-y-1">
            <li>On GitHub, create a <b>private</b> repository, e.g. <code>sevens-dugout-data</code>.</li>
            <li>
              Open{' '}
              <a className="text-turf underline" href={TOKEN_URL} target="_blank" rel="noreferrer">
                Settings → Developer settings → Fine-grained tokens
              </a>{' '}
              → Generate new token.
            </li>
            <li>Expiration: 1 year. Repository access: <b>Only select repositories</b> → the data repository.</li>
            <li>Permissions → Repository → <b>Contents: Read and write</b>. Nothing else.</li>
            <li>Generate, copy the token and paste it below.</li>
          </ol>
        </details>
        <input className={inputCls} placeholder="GitHub user name" autoCapitalize="none" autoCorrect="off" value={form.owner} onChange={f('owner')} />
        <input className={inputCls} placeholder="Data repository, e.g. sevens-dugout-data" autoCapitalize="none" autoCorrect="off" value={form.repo} onChange={f('repo')} />
        <input className={inputCls} placeholder="Token (github_pat_…)" type="password" autoComplete="off" value={form.token} onChange={f('token')} />
        <Button
          className="w-full"
          disabled={busy || !form.owner || !form.repo || !form.token}
          onClick={() =>
            run(async () => {
              const info = await testConnection(form)
              if (!info.private && !confirm('⚠️ This repository is PUBLIC: anyone could read your backup. Use it anyway?')) return
              setConfig(form)
              if (info.hasBackup) {
                setMsg('✅ Connected. A backup already exists on GitHub: restore it to use it on this device, or overwrite it with this device’s data.')
              } else {
                await backupNow()
                setMsg('✅ Connected and first backup saved.')
              }
            })
          }
        >
          {busy ? 'Connecting…' : '🔗 Connect & test'}
        </Button>
        {msg && <div className="text-xs">{msg}</div>}
      </Card>
    )
  }

  const historyUrl = `https://github.com/${c.owner}/${c.repo}/commits/HEAD/${c.path}`
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>
          ☁️ <b>{c.owner}/{c.repo}</b>
        </span>
        <a className="text-xs text-turf underline" href={historyUrl} target="_blank" rel="noreferrer">
          History
        </a>
      </div>
      <div className="text-xs">
        <CloudStatusLine />
      </div>
      {s.conflict && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-2 text-xs leading-relaxed">
          The backup on GitHub is newer than what this device knows about (changed from another device, or never restored here). Auto-backup is paused. Choose which data to keep:
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="soft"
          disabled={busy || s.busy}
          onClick={() =>
            run(async () => {
              if (s.conflict && !confirm('Overwrite the backup on GitHub with the data on THIS device? (The old version stays in the GitHub history.)')) return
              const r = await backupNow(s.conflict)
              setMsg(r === 'unchanged' ? '✅ Nothing changed since the last backup.' : '✅ Backup saved.')
            })
          }
        >
          ⬆️ {s.conflict ? 'Keep this device' : 'Back up now'}
        </Button>
        <Button
          variant="soft"
          disabled={busy || s.busy}
          onClick={() =>
            run(async () => {
              if (!confirm('Replace ALL data on this device with the backup from GitHub?')) return
              await restoreNow()
              nav('/')
            })
          }
        >
          ⬇️ {s.conflict ? 'Keep GitHub' : 'Restore'}
        </Button>
      </div>
      {msg && <div className="text-xs">{msg}</div>}
      <Button
        variant="ghost"
        className="w-full text-xs"
        onClick={() => confirm('Disconnect? The token is removed from this device. Your data and the GitHub backup stay.') && setConfig(undefined)}
      >
        Disconnect (remove token from this device)
      </Button>
    </Card>
  )
}
