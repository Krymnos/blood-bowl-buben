import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { ADMIN_UID } from '../league.config'
import { ago } from '../logic/cloud'
import { downloadLeagueBackup, getLeague, requestJoin, signIn, signOut, startData, syncNow, useLeague, withdrawRequest } from '../logic/league'
import { Button, Card, inputCls } from './ui'

export function LeagueSyncLine() {
  const { sync: s, membership } = useLeague()
  if (membership !== 'member') return null
  if (s.busy) return <span className="text-white/50">🏟️ Publishing to the league…</span>
  if (s.conflict) return <span className="text-red-300">⚠️ League sync paused: open Settings</span>
  if (s.error) return <span className="text-amber-300">⚠️ League: {s.error}</span>
  return (
    <span className="text-white/50">
      🏟️ Published {ago(s.lastAt)}
      {s.dirty ? ' · changes pending' : ''}
    </span>
  )
}

/** Sign-in → join request → waiting → member. Shown on the League tab until you're a member, and in Settings. */
export function LeagueJoin() {
  const L = useLeague()
  const myCoach = useLiveQuery(async () => (await db.teams.toArray()).find((t) => t.coach)?.coach ?? '', [])
  const [coach, setCoach] = useState<string>()
  // participant-list entry picked in the join form; '' = "I'm not on the list"
  const [pid, setPid] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>()
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMsg(undefined)
    try {
      await fn()
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const free = (L.participants ?? []).filter((p) => !p.uid).sort((a, b) => a.coach.localeCompare(b.coach))
  const chosen = free.find((p) => p.id === pid)
  const name = (chosen ? chosen.coach : (coach ?? myCoach ?? '')).trim()

  if (!L.user) {
    return (
      <Card className="space-y-2">
        <div className="text-xs leading-relaxed text-white/60">
          See every team, the league table and league-wide leaderboards. Sign in with Google, ask to join, and once the league admin approves you, your teams and finished games are
          published automatically. Only your coach name is shared, not your email or photo. Your data stays on this phone as before.
        </div>
        <Button className="w-full" disabled={busy || L.loading} onClick={() => run(signIn)}>
          {L.loading ? 'Loading…' : 'Sign in with Google'}
        </Button>
        {(msg || L.error) && <div className="text-xs">{msg ?? `❌ ${L.error}`}</div>}
      </Card>
    )
  }

  const uidLine = (
    <div className="text-[11px] text-white/30">
      Signed in{L.user.name ? ` as ${L.user.name}` : ''} ·{' '}
      <button className="underline" onClick={() => navigator.clipboard?.writeText(L.user!.uid).then(() => setMsg('User id copied.'))}>
        user id {L.user.uid.slice(0, 8)}…
      </button>{' '}
      ·{' '}
      <button className="underline" onClick={() => run(signOut)}>
        sign out
      </button>
    </div>
  )

  if (L.membership === 'unknown') return <Card className="text-sm text-white/50">Checking league membership…{uidLine}</Card>

  if (L.membership === 'requested') {
    return (
      <Card className="space-y-2">
        <div className="text-sm">
          ⏳ Join request sent as <b>{L.coach}</b>. The league admin needs to approve it; this page updates by itself.
        </div>
        <Button variant="ghost" className="w-full text-xs" disabled={busy} onClick={() => run(withdrawRequest)}>
          Withdraw request
        </Button>
        {uidLine}
        {msg && <div className="text-xs">{msg}</div>}
      </Card>
    )
  }

  if (L.membership === 'none') {
    return (
      <Card className="space-y-2">
        {!ADMIN_UID && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-2 text-xs leading-relaxed text-white/70">
            The league admin isn't set up yet. Admin: copy your user id below and put it in <code>league.config.ts</code> and <code>firestore.rules</code>.
          </div>
        )}
        <div className="text-sm">{L.isAdmin ? 'You are the league admin. Pick your coach name to start the league:' : 'Ask to join the Blood Bowl Buben league:'}</div>
        {free.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-white/60">Who are you? Pick your name from the league list:</div>
            {free.map((p) => (
              <button
                key={p.id}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${pid === p.id ? 'bg-turf/30 ring-1 ring-turf' : 'bg-white/5'}`}
                onClick={() => setPid(p.id)}
              >
                <b>{p.coach}</b>
                {p.team && <span className="text-white/50"> · {p.team}</span>}
              </button>
            ))}
            <button className={`w-full rounded-xl px-3 py-2 text-left text-sm ${pid === '' ? 'bg-turf/30 ring-1 ring-turf' : 'bg-white/5 text-white/60'}`} onClick={() => setPid('')}>
              I'm not on the list
            </button>
          </div>
        )}
        {(!free.length || pid === '') && (
          <input className={inputCls} placeholder="Your coach name" maxLength={40} value={coach ?? myCoach ?? ''} onChange={(e) => setCoach(e.target.value)} />
        )}
        <Button className="w-full" disabled={busy || !name || (free.length > 0 && pid === undefined)} onClick={() => run(() => requestJoin(name, chosen?.id))}>
          {L.isAdmin ? 'Join as admin' : 'Request to join'}
        </Button>
        {uidLine}
        {msg && <div className="text-xs">{msg}</div>}
      </Card>
    )
  }
  return null
}

/** Settings: account, sync status, conflicts, admin backup. */
export default function LeagueSettings() {
  const L = useLeague()
  const [msg, setMsg] = useState<string>()
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMsg(undefined)
    try {
      await fn()
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  if (!L.user || L.membership !== 'member') return <LeagueJoin />
  const s = L.sync
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>
          🏟️ <b>{L.coach}</b> {L.isAdmin && <span className="text-xs text-gold">· admin</span>}
        </span>
        <button className="text-xs text-white/50 underline" disabled={busy} onClick={() => confirm('Sign out of the league on this phone? Your published data stays in the league.') && run(signOut)}>
          Sign out
        </button>
      </div>
      <div className="text-xs">
        <LeagueSyncLine />
      </div>
      {s.conflict === 'device' && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-2 text-xs leading-relaxed">
          Your league data was last published from <b>another device</b>. League sync is one phone per coach: publishing from this phone replaces what the other one published.
        </div>
      )}
      {s.conflict === 'empty' && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-2 text-xs leading-relaxed">
          This phone has <b>no teams</b>, but the league still has your published teams. Restore your backup first, or publish anyway to remove your teams from the league.
        </div>
      )}
      <Button
        variant="soft"
        className="w-full"
        disabled={busy || s.busy}
        onClick={() =>
          run(async () => {
            if (s.conflict && !confirm('Publish the data on THIS phone and replace your league data?')) return
            const r = await syncNow(!!s.conflict)
            setMsg(r === 'unchanged' ? '✅ Nothing changed.' : r === 'saved' ? '✅ Published.' : undefined)
          })
        }
      >
        {s.conflict ? '⬆️ Publish from this phone' : '⬆️ Sync now'}
      </Button>
      {L.isAdmin && (
        <Button
          variant="soft"
          className="w-full"
          disabled={busy}
          onClick={() =>
            run(async () => {
              startData()
              for (let i = 0; i < 50 && !getLeague().data; i++) await new Promise((r) => setTimeout(r, 200))
              downloadLeagueBackup()
            })
          }
        >
          ⬇️ Download league backup
        </Button>
      )}
      <div className="text-[11px] leading-relaxed text-white/40">
        Your teams and finished games are published a moment after changes (not during a live game). Photos stay on this phone.
        {L.isAdmin && ' As admin, a league-backup.json is also kept in your GitHub backup repository whenever the league changes.'}
      </div>
      {msg && <div className="text-xs">{msg}</div>}
    </Card>
  )
}
