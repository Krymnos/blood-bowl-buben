import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, type CasCause, type EventType, type Match, type MatchEvent, type Player } from '../db'
import { CASUALTY, casualtyFor, CAS_NAMES, KICKOFF, LASTING_INJURY, lastingInjuryFor, SEVENS, STAT_LABEL, weatherFor, WEATHER, type CasResult } from '../rules/sevens'
import type { Stat } from '../rules/types'
import { EVENT_LABEL } from '../logic/events'
import { recalcScore, syncMatchInjuries } from '../logic/actions'
import { d } from '../logic/dice'
import { Button, Field, inputCls, Sheet, Toggle } from '../components/ui'

const US_MAIN: EventType[] = ['td', 'completion', 'cas', 'interception', 'ko', 'ttm_throw', 'ttm_land']
const US_MORE: EventType[] = ['block', 'catch', 'deflection', 'knockdown', 'armour', 'foul', 'sentoff', 'fail_dodge', 'fail_rush', 'fail_pickup', 'fail_catch', 'fail_pass', 'nuffle']
const THEM_MAIN: EventType[] = ['td', 'cas', 'ko', 'interception', 'completion', 'foul']
const THEM_MORE: EventType[] = ['sentoff', 'armour', 'knockdown', 'nuffle', 'reroll']
export const THEM_LABEL: Partial<Record<EventType, string>> = {
  td: '🏈 TD against', cas: '🚑 Casualty on us', ko: '💫 KO on us', interception: '🧤 Intercepted', completion: '🎯 Their completion', foul: '🥾 Fouled us',
  sentoff: '🟥 Their send-off', armour: '🛡️ Our armour broken', knockdown: '⬇️ We got knocked down', nuffle: '☠️ They nuffled', reroll: '🔄 Their re-roll',
}
/** "them" events that hit one of our players */
const THEM_VICTIM: EventType[] = ['cas', 'ko', 'foul', 'armour', 'knockdown']
const CAUSE_LABEL: Record<CasCause, string> = { block: '💥 Block', foul: '🥾 Foul', crowd: '👥 Crowd', other: '❓ Other', self: '🤸 Own action' }
/** our own actions that can leave our player injured (asks what happened to them) */
const SELF_INJURY: EventType[] = ['fail_dodge', 'fail_rush', 'nuffle']

interface Flow {
  type: EventType
  side: 'us' | 'them'
  step: 'player' | 'outcome' | 'cause' | 'result' | 'stat'
  playerId?: number
  victimId?: number
  cause?: CasCause
  result?: CasResult
  star?: boolean
}

/** Live match log. With `edit`, the same screen corrects the log of a finished match. */
export default function LiveMatch({ match: m, edit = false }: { match: Match; edit?: boolean }) {
  const nav = useNavigate()
  const [side, setSide] = useState<'us' | 'them'>('us')
  const [more, setMore] = useState(false)
  const [flow, setFlow] = useState<Flow | null>(null)
  const [sheet, setSheet] = useState<'kickoff' | 'weather' | 'note' | null>(null)
  const [note, setNote] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [editing, setEditing] = useState<MatchEvent | null>(null)
  const data = useLiveQuery(async () => {
    const team = await db.teams.get(m.teamId)
    const players = (await db.players.bulkGet(m.played)).filter(Boolean) as Player[]
    const events = await db.events.where('matchId').equals(m.id).sortBy('at')
    return { team, players, events }
  }, [m.id, m.played.join()])
  if (!data?.team) return null
  const { team, players, events } = data
  const pName = (id?: number) => {
    const p = players.find((x) => x.id === id)
    return p ? `#${p.number} ${p.name}` : ''
  }

  /** writes an event; `add` also closes the current flow */
  const log = async (e: Partial<MatchEvent>) => {
    await db.events.add({ matchId: m.id, teamId: m.teamId, at: Date.now(), half: m.half, turn: m.turn, ...e } as MatchEvent)
    if (e.type === 'td') await recalcScore(m.id)
    await syncMatchInjuries(m.id)
    const label = e.side === 'them' ? THEM_LABEL[e.type!] : EVENT_LABEL[e.type!]
    setFlash(`${label ?? e.type}${e.playerId ? ` · ${pName(e.playerId)}` : ''}${e.victimId ? ` · ${pName(e.victimId)}` : ''}`)
    setTimeout(() => setFlash(null), 1600)
    if (navigator.vibrate) navigator.vibrate(30)
  }
  const add = async (e: Partial<MatchEvent>) => {
    setFlow(null)
    await log(e)
  }

  const start = (type: EventType) => {
    if (side === 'us') return setFlow({ type, side, step: 'player' })
    if (THEM_VICTIM.includes(type)) return setFlow({ type, side, step: 'player' })
    add({ type, side })
  }

  const pickPlayer = (id?: number) => {
    if (!flow) return
    const f = flow.side === 'us' ? { ...flow, playerId: id } : { ...flow, victimId: id }
    if (flow.type === 'cas') setFlow({ ...f, step: 'cause' })
    else if (flow.side === 'us' && id != null && SELF_INJURY.includes(flow.type)) setFlow({ ...f, step: 'outcome' })
    else add({ type: f.type, side: f.side, playerId: f.playerId, victimId: f.victimId })
  }

  const finishCas = (result?: CasResult, stat?: Stat) => {
    if (!flow) return
    add({ type: 'cas', side: flow.side, playerId: flow.playerId, victimId: flow.victimId, cause: flow.cause, result, stat, star: flow.star || undefined })
  }

  const maxTurn = SEVENS.turnsPerHalf + 2 // Time-out can push the marker past 6
  const setTurn = (half: number, turn: number) => db.matches.update(m.id, { half, turn })
  const nextTurn = () => (m.turn < SEVENS.turnsPerHalf ? setTurn(m.half, m.turn + 1) : m.half === 1 ? setTurn(2, 1) : m.turn < maxTurn ? setTurn(2, m.turn + 1) : null)
  const prevTurn = () => (m.turn > 1 ? setTurn(m.half, m.turn - 1) : m.half === 2 ? setTurn(1, SEVENS.turnsPerHalf) : null)

  // Re-rolls: team re-rolls + induced re-rolls, refreshed each half
  const induced = m.inducements.find((i) => i.id === 'reroll')?.qty ?? 0
  const base = team.rerolls + induced
  const thisHalf = events.filter((e) => e.half === m.half && e.side === 'us')
  const used = thisHalf.filter((e) => e.type === 'reroll').length
  const gained = thisHalf.filter((e) => e.type === 'reroll_gain').length
  const left = base + gained - used

  const mainButtons = side === 'us' ? US_MAIN : THEM_MAIN
  const moreButtons = side === 'us' ? US_MORE : THEM_MORE
  const label = (t: EventType) => (side === 'us' ? EVENT_LABEL[t] : THEM_LABEL[t] ?? t)

  return (
    <div className="min-h-dvh pb-8">
      {/* Scoreboard */}
      <div className="pitch-bg sticky top-0 z-20 border-b-4 border-black/40 px-3 pb-3 pt-2 shadow-xl">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-between gap-1 text-xs text-white/80">
            <button onClick={() => nav(edit ? `/match/${m.id}` : `/team/${team.id}`)} className="rounded bg-black/30 px-2 py-1">
              ‹ {edit ? 'Report' : 'Team'}
            </button>
            {edit && <span className="rounded bg-gold px-2 py-1 font-bold text-black">Editing log</span>}
            <button onClick={() => setSheet('weather')} className="rounded bg-black/30 px-2 py-1">{m.weather ?? 'Weather?'}</button>
            <button onClick={() => nav('/rules')} className="rounded bg-black/30 px-2 py-1">📖 Rules</button>
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="truncate text-right text-sm font-bold drop-shadow">{team.name}</div>
            <div className="rounded-xl bg-black/50 px-4 py-1 text-4xl font-black tabular-nums">
              {m.score.us}<span className="text-white/40">–</span>{m.score.them}
            </div>
            <div className="truncate text-sm font-bold drop-shadow">{m.opponent.name || 'Opponent'}</div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <button onClick={prevTurn} className="h-9 w-9 rounded-lg bg-black/40 text-lg" aria-label="Previous turn">‹</button>
            <div className="min-w-36 rounded-lg bg-black/40 px-3 py-1.5 text-center text-sm font-bold">
              Half {m.half} · Turn {m.turn}/{SEVENS.turnsPerHalf}
            </div>
            <button onClick={nextTurn} className="h-9 w-9 rounded-lg bg-black/40 text-lg" aria-label="Next turn">›</button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-xl space-y-3 p-3">
        {/* Re-roll tracker */}
        <div className="rounded-2xl border border-white/10 bg-panel p-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-white/40">Team re-rolls · half {m.half}</div>
              <div className="flex items-center gap-1 pt-0.5">
                {Array.from({ length: Math.max(base + gained, 0) }, (_, i) => (
                  <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${i < left ? 'bg-gold text-black' : 'bg-white/10 text-white/30 line-through'}`}>
                    R
                  </span>
                ))}
                {base + gained === 0 && <span className="text-sm text-white/40">none</span>}
                <span className="ml-1 text-sm font-bold tabular-nums">{left}/{base + gained}</span>
              </div>
            </div>
            <Button className="!px-3" disabled={left <= 0} onClick={() => add({ type: 'reroll', side: 'us', label: 'team' })}>
              🔄 Use
            </Button>
            <Button variant="soft" className="!px-2.5" onClick={() => add({ type: 'reroll_gain', side: 'us', label: 'Brilliant Coaching' })} aria-label="Bonus re-roll">
              ➕
            </Button>
          </div>
          {induced > 0 && <div className="mt-1 text-[11px] text-white/40">incl. {induced} induced re-roll{induced > 1 ? 's' : ''}. ➕ = free re-roll (e.g. Brilliant Coaching, lost at end of drive).</div>}
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
          <button onClick={() => setSide('us')} className={`rounded-xl py-3 font-bold ${side === 'us' ? 'bg-turf' : 'text-white/50'}`}>
            We did…
          </button>
          <button onClick={() => setSide('them')} className={`rounded-xl py-3 font-bold ${side === 'them' ? 'bg-blood' : 'text-white/50'}`}>
            They did…
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {mainButtons.map((t) => (
            <button key={t} onClick={() => start(t)} className={`rounded-2xl border px-3 py-5 text-left text-base font-bold active:scale-95 ${side === 'us' ? 'border-turf/40 bg-turf/15' : 'border-blood/40 bg-blood/15'} ${t === 'td' ? 'col-span-2 py-6 text-xl' : ''}`}>
              {label(t)}
            </button>
          ))}
        </div>
        <button onClick={() => setMore(!more)} className="w-full py-1 text-sm text-white/50">
          {more ? '▲ fewer' : '▼ more stats'}
        </button>
        {more && (
          <div className="grid grid-cols-3 gap-2">
            {moreButtons.map((t) => (
              <button key={t} onClick={() => start(t)} className="rounded-xl bg-white/5 px-2 py-3 text-xs font-semibold active:bg-white/15">
                {label(t)}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Button variant="soft" onClick={() => setSheet('kickoff')}>🦶 Kick-off</Button>
          <Button variant="soft" onClick={() => setSheet('weather')}>🌦️ Weather</Button>
          <Button variant="soft" onClick={() => setSheet('note')}>📝 Note</Button>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between px-1 text-xs font-bold uppercase tracking-wider text-white/40">
            <span>Match log</span>
            <span className="font-normal normal-case">tap an entry to edit</span>
          </div>
          {events.length === 0 && <div className="px-1 text-sm text-white/40">Nothing yet — kick it off!</div>}
          {[...events].reverse().map((e) => (
            <div key={e.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${e.side === 'us' ? 'bg-turf/10' : 'bg-blood/10'}`}>
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setEditing(e)}>
                <span className="w-12 shrink-0 text-[11px] text-white/40">H{e.half} T{e.turn}</span>
                <span className="min-w-0 flex-1">{describe(e, pName)}</span>
              </button>
              <button
                className="shrink-0 rounded px-2 text-white/40 active:text-red-300"
                onClick={async () => {
                  await db.events.delete(e.id)
                  if (e.type === 'td') await recalcScore(m.id)
                  await syncMatchInjuries(m.id)
                }}
                aria-label="Undo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {edit ? (
          <Button className="w-full !py-4 text-base" onClick={async () => { await syncMatchInjuries(m.id); nav(`/match/${m.id}`) }}>
            ✅ Done editing
          </Button>
        ) : (
          <Button className="w-full !py-4 text-base" onClick={() => confirm('End the game and go to the post-game sequence?') && db.matches.update(m.id, { status: 'post' })}>
            🏁 Full time → Post-game
          </Button>
        )}
      </main>

      {flash && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <div className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-black shadow-xl">{flash}</div>
        </div>
      )}

      {/* Player picker */}
      <Sheet open={flow?.step === 'player'} onClose={() => setFlow(null)} title={flow ? `${flow.side === 'us' ? EVENT_LABEL[flow.type] : THEM_LABEL[flow.type]} — ${flow.side === 'us' ? 'who?' : 'which of ours?'}` : ''}>
        <div className="grid grid-cols-3 gap-2">
          {[...players].sort((a, b) => a.number - b.number).map((p) => (
            <button key={p.id} onClick={() => pickPlayer(p.id)} className="rounded-xl bg-white/5 p-2 text-left active:bg-white/15">
              <div className="text-xl font-black">#{p.number}</div>
              <div className="truncate text-xs">{p.name}</div>
              <div className="truncate text-[10px] text-white/40">{p.journeyman ? 'Journeyman' : p.position}</div>
            </button>
          ))}
        </div>
        <Button variant="ghost" className="mt-3 w-full" onClick={() => pickPlayer(undefined)}>
          Skip / not sure
        </Button>
      </Sheet>

      {/* Own action gone wrong: did our player get hurt? */}
      <Sheet open={flow?.step === 'outcome'} onClose={() => setFlow(null)} title={flow ? `${EVENT_LABEL[flow.type]} · ${pName(flow.playerId)} — what happened?` : ''}>
        <div className="space-y-2">
          <Button variant="soft" className="w-full !py-4" onClick={() => add({ type: flow!.type, side: 'us', playerId: flow!.playerId })}>
            ⬇️ Fell over / Stunned — no injury
          </Button>
          <Button
            variant="soft"
            className="w-full !py-4"
            onClick={async () => {
              const f = flow!
              await log({ type: f.type, side: 'us', playerId: f.playerId })
              await add({ type: 'ko', side: 'them', victimId: f.playerId, label: 'self' })
            }}
          >
            💫 Knocked out
          </Button>
          <Button
            variant="soft"
            className="w-full !py-4"
            onClick={async () => {
              const f = flow!
              setFlow({ type: 'cas', side: 'them', victimId: f.playerId, cause: 'self', step: 'result' })
              await log({ type: f.type, side: 'us', playerId: f.playerId })
            }}
          >
            🚑 Casualty → roll on the Casualty table
          </Button>
        </div>
      </Sheet>

      {/* Casualty cause */}
      <Sheet open={flow?.step === 'cause'} onClose={() => setFlow(null)} title="How did it happen?">
        {flow?.side === 'us' && (
          <div className="mb-2 rounded-xl bg-gold/10 px-3">
            <Toggle label={<span>⭐ Victim is a Star Player <span className="text-xs text-white/50">(house rule: 4 SPP)</span></span>} checked={!!flow?.star} onChange={(v) => setFlow({ ...flow!, star: v })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {((flow?.side === 'us' ? ['block', 'foul', 'crowd', 'other'] : ['block', 'foul', 'crowd', 'self', 'other']) as CasCause[]).map((c) => (
            <Button key={c} variant="soft" className="!py-4" onClick={() => setFlow({ ...flow!, cause: c, step: 'result' })}>
              {CAUSE_LABEL[c]}
            </Button>
          ))}
        </div>
        <div className="mt-2 text-xs text-white/50">Block casualties earn SPP. Fouls only with the Fouling Frenzy prayer; crowd pushes 2 SPP with Necessary Violence.</div>
      </Sheet>

      {/* Casualty result */}
      <Sheet open={flow?.step === 'result'} onClose={() => setFlow(null)} title="Casualty result (D16)">
        <div className="space-y-2">
          <Button
            variant="soft"
            className="w-full"
            onClick={() => {
              const niggles = flow?.victimId ? players.find((p) => p.id === flow.victimId)?.injuries.filter((i) => i.kind === 'niggling').length ?? 0 : 0
              const r = casualtyFor(d(16) + niggles).result
              if (r === 'li' && flow?.side === 'them') setFlow({ ...flow!, result: r, step: 'stat' })
              else finishCas(r)
            }}
          >
            🎲 Roll D16{flow?.side === 'them' ? ' (+1 per niggle)' : ''}
          </Button>
          {CASUALTY.map((c) => (
            <button
              key={c.result}
              onClick={() => (c.result === 'li' && flow?.side === 'them' ? setFlow({ ...flow!, result: c.result, step: 'stat' }) : finishCas(c.result))}
              className="flex w-full justify-between rounded-xl bg-white/5 p-3 text-left active:bg-white/15"
            >
              <span>
                <b>{c.name}</b> <span className="text-xs text-white/50">{c.text}</span>
              </span>
              <span className="text-white/40">{c.min}-{c.max}</span>
            </button>
          ))}
          {flow?.side === 'us' && (
            <Button variant="ghost" className="w-full" onClick={() => finishCas(undefined)}>
              Don't know / skip
            </Button>
          )}
          {flow?.side === 'them' && <div className="text-xs text-white/50">Apothecary: roll a 2nd time and pick the result you prefer. Badly Hurt → Reserves.</div>}
        </div>
      </Sheet>

      {/* Lasting injury stat */}
      <Sheet open={flow?.step === 'stat'} onClose={() => setFlow(null)} title="Lasting Injury (D6)">
        <Button variant="soft" className="mb-2 w-full" onClick={() => finishCas('li', lastingInjuryFor(d(6)).stat)}>
          🎲 Roll D6
        </Button>
        <div className="space-y-2">
          {LASTING_INJURY.map((l) => (
            <button key={l.name} onClick={() => finishCas('li', l.stat)} className="flex w-full justify-between rounded-xl bg-white/5 p-3 active:bg-white/15">
              <span>{l.name}</span>
              <span className="text-white/40">{l.min === l.max ? l.min : `${l.min}-${l.max}`}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'kickoff'} onClose={() => setSheet(null)} title="Kick-off event (2D6)">
        <Button
          variant="soft"
          className="mb-2 w-full"
          onClick={() => {
            const r = d(6) + d(6)
            add({ type: 'kickoff', side: 'us', label: KICKOFF[r - 2].name })
            setSheet(KICKOFF[r - 2].name === 'Changing Weather' ? 'weather' : null)
          }}
        >
          🎲 Roll 2D6
        </Button>
        <div className="space-y-1.5">
          {KICKOFF.map((k) => (
            <button
              key={k.name}
              onClick={() => {
                add({ type: 'kickoff', side: 'us', label: k.name })
                setSheet(k.name === 'Changing Weather' ? 'weather' : null)
              }}
              className="w-full rounded-xl bg-white/5 p-2.5 text-left active:bg-white/15"
            >
              <div className="text-sm font-semibold">
                <span className="mr-2 text-white/40">{k.roll}</span>
                {k.name}
              </div>
              <div className="text-xs text-white/50">{k.text}</div>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'weather'} onClose={() => setSheet(null)} title="Weather (2D6)">
        <Button
          variant="soft"
          className="mb-2 w-full"
          onClick={async () => {
            const w = weatherFor(d(6) + d(6)).name
            await db.matches.update(m.id, { weather: w })
            await add({ type: 'weather', side: 'us', label: w })
            setSheet(null)
          }}
        >
          🎲 Roll 2D6
        </Button>
        <div className="space-y-1.5">
          {WEATHER.map((w) => (
            <button
              key={w.name}
              onClick={async () => {
                await db.matches.update(m.id, { weather: w.name })
                await add({ type: 'weather', side: 'us', label: w.name })
                setSheet(null)
              }}
              className="w-full rounded-xl bg-white/5 p-2.5 text-left active:bg-white/15"
            >
              <div className="text-sm font-semibold">
                <span className="mr-2 text-white/40">{w.roll}</span>
                {w.name}
              </div>
              <div className="text-xs text-white/50">{w.text}</div>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'note'} onClose={() => setSheet(null)} title="Add note">
        <textarea className={`${inputCls} h-28`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Treeman threw a gnome for the winning TD!" />
        <Button
          className="mt-2 w-full"
          disabled={!note.trim()}
          onClick={async () => {
            await add({ type: 'note', side: 'us', text: note.trim() })
            setNote('')
            setSheet(null)
          }}
        >
          Add
        </Button>
      </Sheet>

      {editing && <EventEditSheet key={editing.id} e={editing} players={players} onClose={() => setEditing(null)} />}
    </div>
  )
}

const ALL_TYPES = Object.keys(EVENT_LABEL) as EventType[]

/** Correct any field of a logged event (or delete it). */
function EventEditSheet({ e, players, onClose }: { e: MatchEvent; players: Player[]; onClose: () => void }) {
  const [x, setX] = useState<MatchEvent>(e)
  const set = (patch: Partial<MatchEvent>) => setX({ ...x, ...patch })
  const save = async () => {
    await db.events.put(x)
    await recalcScore(x.matchId)
    await syncMatchInjuries(x.matchId)
    onClose()
  }
  const del = async () => {
    await db.events.delete(e.id)
    await recalcScore(e.matchId)
    await syncMatchInjuries(e.matchId)
    onClose()
  }
  const playerSelect = (value: number | undefined, onChange: (v: number | undefined) => void) => (
    <select className={inputCls} value={value ?? ''} onChange={(ev) => onChange(ev.target.value ? Number(ev.target.value) : undefined)}>
      <option value="">– nobody / unknown –</option>
      {[...players].sort((a, b) => a.number - b.number).map((p) => (
        <option key={p.id} value={p.id}>
          #{p.number} {p.name}
        </option>
      ))}
    </select>
  )
  return (
    <Sheet open onClose={onClose} title="Edit log entry">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Half">
            <select className={inputCls} value={x.half} onChange={(ev) => set({ half: Number(ev.target.value) })}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </Field>
          <Field label="Turn">
            <select className={inputCls} value={x.turn} onChange={(ev) => set({ turn: Number(ev.target.value) })}>
              {Array.from({ length: SEVENS.turnsPerHalf + 2 }, (_, i) => i + 1).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            <select className={inputCls} value={x.side} onChange={(ev) => set({ side: ev.target.value as 'us' | 'them' })}>
              <option value="us">Us</option>
              <option value="them">Them</option>
            </select>
          </Field>
        </div>
        <Field label="What happened">
          <select className={inputCls} value={x.type} onChange={(ev) => set({ type: ev.target.value as EventType })}>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {x.side === 'them' ? THEM_LABEL[t] ?? EVENT_LABEL[t] : EVENT_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {x.side === 'us' && !['kickoff', 'weather', 'note', 'reroll_gain'].includes(x.type) && <Field label="Our player">{playerSelect(x.playerId, (v) => set({ playerId: v }))}</Field>}
        {x.side === 'them' && THEM_VICTIM.includes(x.type) && <Field label="Our player hit">{playerSelect(x.victimId, (v) => set({ victimId: v }))}</Field>}
        {x.type === 'cas' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cause">
                <select className={inputCls} value={x.cause ?? ''} onChange={(ev) => set({ cause: (ev.target.value || undefined) as CasCause | undefined })}>
                  <option value="">–</option>
                  {(Object.keys(CAUSE_LABEL) as CasCause[]).map((c) => (
                    <option key={c} value={c}>
                      {CAUSE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Result">
                <select className={inputCls} value={x.result ?? ''} onChange={(ev) => set({ result: (ev.target.value || undefined) as CasResult | undefined })}>
                  <option value="">– unknown / saved –</option>
                  {CASUALTY.map((c) => (
                    <option key={c.result} value={c.result}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {x.result === 'li' && (
              <Field label="Lasting injury">
                <select className={inputCls} value={x.stat ?? 'av'} onChange={(ev) => set({ stat: ev.target.value as Stat })}>
                  {LASTING_INJURY.map((l) => (
                    <option key={l.name} value={l.stat}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {x.side === 'us' && <Toggle label="⭐ Victim was a Star Player (4 SPP)" checked={!!x.star} onChange={(v) => set({ star: v || undefined })} />}
          </>
        )}
        {x.type === 'kickoff' && (
          <Field label="Kick-off event">
            <select className={inputCls} value={x.label ?? ''} onChange={(ev) => set({ label: ev.target.value })}>
              {KICKOFF.map((k) => (
                <option key={k.name}>{k.name}</option>
              ))}
            </select>
          </Field>
        )}
        {x.type === 'weather' && (
          <Field label="Weather">
            <select className={inputCls} value={x.label ?? ''} onChange={(ev) => set({ label: ev.target.value })}>
              {WEATHER.map((w) => (
                <option key={w.name}>{w.name}</option>
              ))}
            </select>
          </Field>
        )}
        {x.type === 'note' && <textarea className={`${inputCls} h-24`} value={x.text ?? ''} onChange={(ev) => set({ text: ev.target.value })} />}
        <div className="flex gap-2">
          <Button variant="danger" onClick={del}>
            Delete
          </Button>
          <Button className="flex-1" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

export function describe(e: MatchEvent, pName: (id?: number) => string) {
  if (e.type === 'kickoff') return <>🦶 Kick-off: <b>{e.label}</b></>
  if (e.type === 'weather') return <>🌦️ Weather: <b>{e.label}</b></>
  if (e.type === 'note') return <>📝 {e.text}</>
  if (e.type === 'reroll' && e.side === 'us') return <>🔄 Team re-roll used</>
  if (e.type === 'reroll_gain') return <>➕ Bonus re-roll{e.label ? ` (${e.label})` : ''}</>
  const base = e.side === 'us' ? EVENT_LABEL[e.type] : THEM_LABEL[e.type] ?? EVENT_LABEL[e.type]
  const who = e.side === 'us' ? pName(e.playerId) : pName(e.victimId)
  const cas = e.type === 'cas' ? [e.star && '⭐ Star Player', e.cause === 'self' ? 'own action' : e.cause, e.result && CAS_NAMES[e.result], e.stat && e.result === 'li' && `−1 ${STAT_LABEL[e.stat]}`].filter(Boolean).join(', ') : ''
  return (
    <>
      {base}
      {e.label === 'concession' && ' (concession)'}
      {e.type === 'ko' && e.label === 'self' && <span className="text-white/50"> (own action)</span>}
      {who && <b> · {who}</b>}
      {cas && <span className="text-white/50"> ({cas})</span>}
    </>
  )
}
