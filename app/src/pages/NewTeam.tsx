import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { ROSTERS } from '../rules/data'
import { SEVENS } from '../rules/sevens'
import { Button, Card, Field, inputCls, Page } from '../components/ui'
import { gp } from '../logic/format'

const COLORS = ['#15803d', '#b91c1c', '#1d4ed8', '#a16207', '#7e22ce', '#0f766e', '#c2410c', '#be185d', '#475569', '#e5e7eb']

export default function NewTeam() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [coach, setCoach] = useState('')
  const [rosterId, setRosterId] = useState('gnome')
  const [color, setColor] = useState(COLORS[0])
  const tiers = [1, 2, 3, 4]
  const r = ROSTERS.find((x) => x.id === rosterId)

  const create = async () => {
    const id = await db.teams.add({
      name: name.trim() || `${r?.name} Sevens`,
      coach: coach.trim(),
      rosterId,
      color,
      treasury: SEVENS.draftBudget,
      rerolls: 0,
      assistantCoaches: 0,
      cheerleaders: 0,
      apothecary: false,
      dedicatedFans: SEVENS.startingFans,
      createdAt: Date.now(),
    } as never)
    nav(`/team/${id}`, { replace: true })
  }

  return (
    <Page title="Draft a new team" back="/">
      <Card className="space-y-3">
        <Field label="Team name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Glimmerdell Gearwhackers" />
        </Field>
        <Field label="Coach">
          <input className={inputCls} value={coach} onChange={(e) => setCoach(e.target.value)} placeholder="Your name" />
        </Field>
        <Field label="Team colour">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={`h-9 w-9 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
            ))}
          </div>
        </Field>
      </Card>
      <Card>
        <div className="mb-2 text-xs text-white/60">Roster (Sevens tier)</div>
        <div className="space-y-3">
          {tiers.map((t) => (
            <div key={t}>
              <div className="mb-1 text-[11px] font-bold uppercase text-white/40">Tier {t}</div>
              <div className="flex flex-wrap gap-1.5">
                {ROSTERS.filter((x) => (x.tier ?? 4) === t).map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setRosterId(x.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-sm ${rosterId === x.id ? 'bg-turf font-semibold' : 'bg-white/5 text-white/80'}`}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {r && (
        <Card className="text-sm">
          <div className="mb-1 font-semibold">{r.name}</div>
          <ul className="space-y-0.5 text-white/70">
            {r.positionals.map((p) => (
              <li key={p.name} className="flex justify-between">
                <span>
                  0-{p.max} {p.name}
                </span>
                <span>{gp(p.cost)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-white/50">
            Apothecary: {r.apothecary ? 'yes' : 'no'}
            {r.specialRules.length > 0 && <> · {r.specialRules.join(', ')}</>}
          </div>
        </Card>
      )}
      <Card className="text-xs text-white/60">
        League draft: {gp(SEVENS.draftBudget)} budget · 7–11 players · max 4 non-Linemen · Re-rolls {gp(SEVENS.rerollCost)} · Assistant Coaches {gp(SEVENS.assistantCoachCost)} (0-3) · Cheerleaders {gp(SEVENS.cheerleaderCost)} (0-6) · Apothecary {gp(SEVENS.apothecaryCost)} · Goblin lawyer {gp(SEVENS.lawyerCost)} · 1 free Dedicated Fan · Leader forbidden. Left-over budget is lost after the draft.
      </Card>
      <Button className="w-full !py-3.5 text-base" onClick={create}>
        Start drafting →
      </Button>
    </Page>
  )
}
