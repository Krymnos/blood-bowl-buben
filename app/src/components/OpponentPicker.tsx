import { useState } from 'react'
import type { Match } from '../db'
import { getRoster } from '../rules/data'
import { startData, useLeague } from '../logic/league'
import { teamKey } from '../logic/leagueTable'
import { teamValue } from '../logic/team'
import { gp } from '../logic/format'
import { Button, Sheet } from './ui'

type Opp = Match['opponent']

/**
 * "Pick from league teams": fills in name, coach, roster (and CTV in pre-game) and links the match to the
 * opponent's league team (`opponent.ref`), so both coaches' records are paired. Hidden for non-members.
 */
export default function OpponentPicker({ opponent, onChange, withCtv }: { opponent: Opp; onChange: (o: Opp) => void; withCtv?: boolean }) {
  const L = useLeague()
  const [open, setOpen] = useState(false)
  if (L.membership !== 'member') return null
  const me = L.user?.uid
  const teams = (L.data?.teams ?? []).filter((t) => t.uid !== me).sort((a, b) => a.coach.localeCompare(b.coach) || a.team.name.localeCompare(b.team.name))
  const linked = opponent.ref && L.data?.teams.find((t) => teamKey({ uid: t.uid, teamId: t.team.id }) === teamKey(opponent.ref!))

  return (
    <>
      {opponent.ref ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-turf/15 px-3 py-2 text-xs">
          <span>
            🏟️ Linked to league team <b>{linked ? `${linked.team.name} (${linked.coach})` : opponent.name}</b>
          </span>
          <button className="px-1 text-white/50" aria-label="Unlink league team" onClick={() => onChange({ ...opponent, ref: undefined })}>
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
          🏟️ Pick from league teams
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="League teams">
        {!L.data && <div className="text-sm text-white/50">Loading the league…</div>}
        {L.data && teams.length === 0 && <div className="text-sm text-white/50">No other teams in the league yet.</div>}
        <div className="space-y-1.5">
          {teams.map((t) => {
            const { ctv } = teamValue(t.team, t.players)
            return (
              <button
                key={`${t.uid}:${t.team.id}`}
                className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left active:bg-white/10"
                onClick={() => {
                  onChange({
                    ...opponent,
                    name: t.team.name,
                    coach: t.coach,
                    rosterId: t.team.rosterId,
                    ...(withCtv ? { ctv } : {}),
                    ref: { uid: t.uid, teamId: t.team.id },
                  })
                  setOpen(false)
                }}
              >
                <div className="h-8 w-1.5 rounded-full" style={{ background: t.team.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.team.name}</div>
                  <div className="text-xs text-white/50">
                    {t.coach} · {getRoster(t.team.rosterId)?.name}
                  </div>
                </div>
                <div className="text-sm font-bold">CTV {gp(ctv)}</div>
              </button>
            )
          })}
        </div>
        <div className="mt-3 text-[11px] text-white/40">Playing a guest outside the league? Close this and type the opponent by hand.</div>
      </Sheet>
    </>
  )
}
