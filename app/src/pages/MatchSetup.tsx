import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, type Match, type Player } from '../db'
import { getRoster, ROSTERS } from '../rules/data'
import { INDUCEMENTS, PRAYERS, SEVENS, weatherFor, WEATHER, type Table } from '../rules/sevens'
import { addJourneymen, deleteMatch, linemanPositions, removeJourneyman } from '../logic/actions'
import { d } from '../logic/dice'
import { gp } from '../logic/format'
import { randomName } from '../logic/names'
import { Button, Card, DiceInput, Field, inputCls, LinkButton, NumberInput, Page, Stepper, Toggle, Step } from '../components/ui'

export default function MatchSetup({ match: m }: { match: Match }) {
  const nav = useNavigate()
  const data = useLiveQuery(async () => {
    const team = await db.teams.get(m.teamId)
    const players = (await db.players.bulkGet([...m.played, ...m.missing])).filter(Boolean) as Player[]
    return { team, players }
  }, [m.teamId, m.played.join(), m.missing.join()])
  const [roll, setRoll] = useState<{ us: number; them: number } | null>(null)
  if (!data?.team) return null
  const { team, players } = data
  const roster = getRoster(team.rosterId)
  const up = (patch: Partial<Match>) => db.matches.update(m.id, patch)

  // Inducements: only Petty Cash = opponent TV − our TV (underdog only)
  const theirCtv = m.opponent.ctv
  const petty = Math.max(0, theirCtv - m.ourCtv)
  const total = m.inducements.reduce((s, i) => s + i.qty * i.cost, 0)
  const setInd = (id: string, qty: number, cost: number) => {
    const rest = m.inducements.filter((i) => i.id !== id)
    up({ inducements: qty > 0 ? [...rest, { id, qty, cost }] : rest })
  }

  // Star player
  const starHired = m.starHired ?? { us: false, them: false }
  const drums = m.inducements.find((i) => i.id === 'drum')?.qty ?? 0
  const starFee = starHired.us ? (m.starFee ?? 0) : 0
  const drumRefund = Math.min(starFee, drums * SEVENS.starPlayerDrumRefund)
  const starSpend = starFee - drumRefund

  // Journeymen
  const journeymen = players.filter((p) => (m.journeymen ?? []).includes(p.id))
  const available = m.played.length
  const linemen = linemanPositions(team.rosterId)
  const [jmPos, setJmPos] = [m.jmPosition ?? linemen[0]?.name ?? '', (v: string) => up({ jmPosition: v })]

  const kickOff = async () => {
    await db.transaction('rw', db.matches, db.teams, async () => {
      const t = (await db.teams.get(team.id))!
      await db.teams.update(team.id, { treasury: t.treasury - starSpend })
      await db.matches.update(m.id, { status: 'live', treasurySpent: starSpend, prayers: m.prayers.filter(Boolean), pettyCash: m.pettyCash || petty })
    })
  }

  return (
    <Page title="Pre-game" sub={`${team.name} vs ${m.opponent.name || '…'}`} back={`/team/${team.id}`} right={<LinkButton variant="ghost" className="!px-2" to="/rules#prematch">📖</LinkButton>}>
      <Card className="space-y-3">
        <div className="text-sm font-bold">Opponent</div>
        <Field label="Team name">
          <input className={inputCls} value={m.opponent.name} onChange={(e) => up({ opponent: { ...m.opponent, name: e.target.value } })} placeholder="e.g. Reikland Reserves" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Coach">
            <input className={inputCls} value={m.opponent.coach} onChange={(e) => up({ opponent: { ...m.opponent, coach: e.target.value } })} />
          </Field>
          <Field label="Roster">
            <select className={inputCls} value={m.opponent.rosterId} onChange={(e) => up({ opponent: { ...m.opponent, rosterId: e.target.value } })}>
              <option value="">–</option>
              {ROSTERS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Their team value (k)">
            <NumberInput value={theirCtv / 1000} onChange={(v) => up({ opponent: { ...m.opponent, ctv: v * 1000 } })} />
          </Field>
          <Field label="Our team value (k)">
            <NumberInput value={m.ourCtv / 1000} onChange={(v) => up({ ourCtv: v * 1000 })} />
          </Field>
        </div>
        <div className="text-xs text-white/50">
          {available} players available
          {m.missing.length > 0 && <span className="text-red-300"> · missing: {players.filter((p) => m.missing.includes(p.id)).map((p) => p.name).join(', ')}</span>}
        </div>
      </Card>

      <Step n={0} title="Star Player hiring" rule="Both coaches may hire their Star Player for this match. Announce the decision at the same time.">
        <Toggle label={`We hire ${team.starPlayer?.name || 'our Star Player'}`} checked={starHired.us} onChange={(v) => up({ starHired: { ...starHired, us: v } })} />
        {starHired.us && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm">Fee (k, paid from treasury)</span>
            <NumberInput className="!w-24" value={(m.starFee ?? 0) / 1000} onChange={(v) => up({ starFee: v * 1000 })} />
          </div>
        )}
        {!team.starPlayer && <div className="text-xs text-white/40">Tip: set your Star Player and fee on the team's Staff tab.</div>}
        <Toggle label="Opponent hires their Star Player" checked={starHired.them} onChange={(v) => up({ starHired: { ...starHired, them: v } })} />
      </Step>

      <Step n={1} title="Fan Factor" rule="Each coach rolls a D3 and adds their Dedicated Fans. Used for Pitch Invasion and winnings.">
        <DiceInput
          label={`Our D3 + ${team.dedicatedFans} Dedicated Fans`}
          sides={3}
          value={m.fanFactor.us ? m.fanFactor.us - team.dedicatedFans : undefined}
          onChange={(v) => up({ fanFactor: { ...m.fanFactor, us: v + team.dedicatedFans } })}
        />
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">Our Fan Factor</span>
          <NumberInput className="!w-20" value={m.fanFactor.us} onChange={(v) => up({ fanFactor: { ...m.fanFactor, us: v } })} />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">Their Fan Factor</span>
          <NumberInput className="!w-20" value={m.fanFactor.them} onChange={(v) => up({ fanFactor: { ...m.fanFactor, them: v } })} />
        </div>
      </Step>

      <Step n={2} title="Weather" rule="Each coach rolls a D6; the total (2D6) is looked up on the Weather table.">
        <DiceInput label="Weather 2D6" sides={6} count={2} value={undefined} onChange={(v) => up({ weather: weatherFor(v).name })} />
        <select className={inputCls} value={m.weather ?? ''} onChange={(e) => up({ weather: e.target.value || undefined })}>
          <option value="">–</option>
          {WEATHER.map((w) => (
            <option key={w.name} value={w.name}>
              {w.roll}: {w.name}
            </option>
          ))}
        </select>
        {m.weather && <div className="text-xs text-white/60">{WEATHER.find((w) => w.name === m.weather)?.text}</div>}
      </Step>

      <Step
        n={3}
        title="Journeymen"
        rule={`Can't field ${SEVENS.minPlayers}? Fill up with free Journeymen: Linemen only, with Loner (5+). They can earn SPP and be MVP, and may be bought after the match.`}
      >
        <div className={`text-sm ${available < SEVENS.minPlayers ? 'text-amber-200' : 'text-white/60'}`}>
          {available} available{available < SEVENS.minPlayers ? ` — ${SEVENS.minPlayers - available} short` : ' — no Journeymen needed'}
        </div>
        {journeymen.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
            <span>
              #{p.number} {p.name} <span className="text-xs text-white/40">{p.position} · Loner (5+)</span>
            </span>
            <button className="px-2 text-white/40" onClick={() => removeJourneyman(m, p.id)} aria-label="Remove journeyman">
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          {linemen.length > 1 && (
            <select className={inputCls} value={jmPos} onChange={(e) => setJmPos(e.target.value)}>
              {linemen.map((l) => (
                <option key={l.name}>{l.name}</option>
              ))}
            </select>
          )}
          <Button
            variant="soft"
            className="shrink-0"
            disabled={!jmPos}
            onClick={() => {
              const n = Math.max(1, SEVENS.minPlayers - available)
              addJourneymen(m, team, n, jmPos, Array.from({ length: n }, () => randomName(team.rosterId)))
            }}
          >
            + {available < SEVENS.minPlayers ? SEVENS.minPlayers - available : 1} Journeym{available < SEVENS.minPlayers - 1 ? 'en' : 'an'}
          </Button>
        </div>
      </Step>

      <Step n={4} title="Inducements" rule="Only the underdog buys inducements, and only with Petty Cash (their team value − ours). Unspent Petty Cash is lost.">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">Petty Cash (k)</span>
          <NumberInput className="!w-24" value={(m.pettyCash || petty) / 1000} onChange={(v) => up({ pettyCash: v * 1000 })} />
        </div>
        {theirCtv === 0 && <div className="text-xs text-white/40">Enter their team value above to work out Petty Cash.</div>}
        {theirCtv > 0 && petty === 0 && <div className="text-xs text-white/40">We're not the underdog — no Petty Cash.</div>}
        {INDUCEMENTS.filter((i) => !i.available || i.available(roster)).map((i) => {
          const cost = i.cost(roster)
          const cur = m.inducements.find((x) => x.id === i.id)?.qty ?? 0
          return <Stepper key={i.id} label={i.name} sub={`${gp(cost)} · 0-${i.max}${i.note ? ` · ${i.note}` : ''}`} value={cur} max={i.max} onChange={(q) => setInd(i.id, q, cost)} />
        })}
        <div className="flex justify-between border-t border-white/10 pt-2 text-sm">
          <span className="text-white/60">Spent / Petty Cash</span>
          <b className={total > (m.pettyCash || petty) ? 'text-red-400' : 'text-gold'}>
            {gp(total)} / {gp(m.pettyCash || petty)}
          </b>
        </div>
        {total > (m.pettyCash || petty) && <div className="text-xs text-red-300">More than your Petty Cash.</div>}

        <div className="border-t border-white/10 pt-2">
          <Stepper label="🙏 Prayers to Nuffle (D16)" sub="If you get any — the Verfassung only lists the table" value={m.prayers.length} max={4} onChange={(q) => up({ prayers: q > m.prayers.length ? [...m.prayers, ''] : m.prayers.slice(0, q) })} />
          {m.prayers.map((pr, i) => (
            <TableRoll key={i} table={PRAYERS} sides={16} value={pr || undefined} onChange={(v) => { const a = [...m.prayers]; a[i] = v; up({ prayers: a }) }} />
          ))}
        </div>
      </Step>

      <Step n={5} title="Kick or receive" rule="Both coaches roll off; the winner decides who kicks and who receives.">
        <div className="flex items-center gap-2">
          <Button variant="soft" onClick={() => { let a, b; do { a = d(6); b = d(6) } while (a === b); setRoll({ us: a, them: b }) }}>
            🎲 Roll-off
          </Button>
          {roll && (
            <span className="text-sm">
              Us <b>{roll.us}</b> – <b>{roll.them}</b> Them → <b className="text-gold">{roll.us > roll.them ? 'we choose' : 'they choose'}</b>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={m.kickingFirst === 'us' ? 'primary' : 'soft'} onClick={() => up({ kickingFirst: 'us' })}>
            🦶 We kick
          </Button>
          <Button variant={m.kickingFirst === 'them' ? 'primary' : 'soft'} onClick={() => up({ kickingFirst: 'them' })}>
            🙌 We receive
          </Button>
        </div>
      </Step>

      {starSpend > 0 && (
        <Card className="text-sm">
          Kick-off pays <b className="text-gold">{gp(starSpend)}</b> for the Star Player from the treasury ({gp(team.treasury)})
          {drumRefund > 0 && <span className="text-white/50"> — {gp(drumRefund)} refunded by {drums} Werbetrommel{drums > 1 ? 'n' : ''}</span>}.
        </Card>
      )}
      <Button className="w-full !py-4 text-lg" onClick={kickOff}>
        🏈 Kick-off!
      </Button>
      <Button
        variant="ghost"
        className="w-full text-red-300"
        onClick={async () => {
          if (!confirm('Discard this match?')) return
          await deleteMatch(m)
          nav(`/team/${team.id}`)
        }}
      >
        Discard match
      </Button>
    </Page>
  )
}


export function TableRoll({ table, value, onChange, sides }: { table: Table[]; value?: string; onChange: (v: string) => void; sides?: number }) {
  const entry = table.find((t) => t.name === value)
  return (
    <div className="py-1">
      <div className="flex gap-2">
        <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">–</option>
          {table.map((t) => (
            <option key={t.name} value={t.name}>
              {t.roll}: {t.name}
            </option>
          ))}
        </select>
        <Button variant="soft" className="shrink-0" onClick={() => onChange(table[d(sides ?? table.length) - 1].name)}>
          🎲
        </Button>
      </div>
      {entry?.text && <div className="mt-1 text-xs text-white/60">{entry.text}</div>}
    </div>
  )
}
