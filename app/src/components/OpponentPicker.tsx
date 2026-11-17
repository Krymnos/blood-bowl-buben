import { useState } from 'react'
import type { Match } from '../db'
import { getRoster } from '../rules/data'
import { startData, useLeague } from '../logic/league'
import { participantTeam, teamKey } from '../logic/leagueTable'
import { teamValue } from '../logic/team'
import { gp } from '../logic/format'
import { Button, Sheet } from './ui'

type Opp = Match['opponent']
interface Entry { key: string; name: string; coach: string; rosterId: string; color?: string; ctv?: number; ref?: Opp['ref']; pid?: string }

/**
 * "Pick from the league": the participant list (in the app or not) plus teams in the app that aren't on it.
 * Fills in name, coach, roster (and CTV in pre-game) and stores `opponent.pid` / `opponent.ref`, so the game counts
 * for the right team and both coaches' records are paired. Hidden for non-members.
 */
export default function OpponentPicker({ opponent, onChange, withCtv }: { opponent: Opp; onChange: (o: Opp) => void; withCtv?: boolean }) {
  const L = useLeague()
  const [open, setOpen] = useState(false)
  if (L.membership !== 'member') return null
  const me = L.user?.uid
  const d = L.data
  const entries: Entry[] = []
  const covered = new Set<string>()
  for (const p of d?.participants ?? []) {
    const { team: t } = d ? participantTeam(d, p) : {}
    if (t) covered.add(teamKey({ uid: t.uid, teamId: t.team.id }))
    if (p.uid === me) continue
    entries.push(
      t
        ? { key: p.id, pid: p.id, name: t.team.name, coach: t.coach, rosterId: t.team.rosterId, color: t.team.color, ctv: teamValue(t.team, t.players).ctv, ref: { uid: t.uid, teamId: t.team.id } }
        : { key: p.id, pid: p.id, name: p.team || p.coach, coach: p.coach, rosterId: p.rosterId ?? '' },
    )
  }
  for (const t of d?.teams ?? []) {
    const k = teamKey({ uid: t.uid, teamId: t.team.id })
    if (t.uid === me || covered.has(k)) continue
    entries.push({ key: k, name: t.team.name, coach: t.coach, rosterId: t.team.rosterId, color: t.team.color, ctv: teamValue(t.team, t.players).ctv, ref: { uid: t.uid, teamId: t.team.id } })
  }
  entries.sort((a, b) => a.coach.localeCompare(b.coach) || a.name.localeCompare(b.name))
  const linked = opponent.ref || opponent.pid

  return (
    <>
      {linked ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-turf/15 px-3 py-2 text-xs">
          <span>
            {opponent.ref ? '🏟️ Linked to league team' : '📝 On the league list (not in the app yet):'} <b>{opponent.name || opponent.coach}</b>
            {opponent.coach ? ` (${opponent.coach})` : ''}
          </span>
          <button className="px-1 text-white/50" aria-label="Unlink" onClick={() => onChange({ ...opponent, ref: undefined, pid: undefined })}>
            ✕
          </button>
        </div>
      ) : (
        <Button
          variant="soft"
          className="w-full"
          onClick={() => {
            startData()
            setOpen(true)
          }}
        >
          🏟️ Pick from the league
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="League opponents">
        {!d && <div className="text-sm text-white/50">Loading the league…</div>}
        {d && entries.length === 0 && <div className="text-sm text-white/50">No other coaches in the league yet.</div>}
        <div className="space-y-1.5">
          {entries.map((e) => (
            <button
              key={e.key}
              className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left active:bg-white/10"
              onClick={() => {
                onChange({
                  ...opponent,
                  name: e.name,
                  coach: e.coach,
                  rosterId: e.rosterId || opponent.rosterId,
                  ...(withCtv && e.ctv ? { ctv: e.ctv } : {}),
                  ref: e.ref,
                  pid: e.pid,
                })
                setOpen(false)
              }}
            >
              <div className="h-8 w-1.5 rounded-full" style={{ background: e.color ?? 'rgba(255,255,255,.15)' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{e.name}</div>
                <div className="text-xs text-white/50">
                  {e.coach}
                  {e.rosterId ? ` · ${getRoster(e.rosterId)?.name ?? ''}` : ''}
                  {e.ref ? '' : ' · 📝 not in the app'}
                </div>
              </div>
              {e.ctv ? <div className="text-sm font-bold">CTV {gp(e.ctv)}</div> : null}
            </button>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-white/40">Opponent not on the list? Close this and type them in by hand. The game then doesn't count in the league (a friendly) unless the admin adds them to the list.</div>
      </Sheet>
    </>
  )
}
