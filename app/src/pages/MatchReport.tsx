import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, type Match, type MatchStatus, type Player } from '../db'
import { getRoster } from '../rules/data'
import { INDUCEMENTS, MISTAKE_NAMES, WEATHER, type MistakeResult } from '../rules/sevens'
import { ROSTERS } from '../rules/data'
import { compressImage } from '../logic/photo'
import { deleteMatch } from '../logic/actions'
import { fmtDate, gp } from '../logic/format'
import { resultOf } from '../logic/stats'
import { Badge, Button, Card, Field, H2, inputCls, LinkButton, NumberInput, Page, Sheet, Stepper } from '../components/ui'
import { describe } from './LiveMatch'

export default function MatchReport({ match: m }: { match: Match }) {
  const nav = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const data = useLiveQuery(async () => {
    const team = await db.teams.get(m.teamId)
    const players = (await db.players.bulkGet([...m.played, ...m.missing])).filter(Boolean) as Player[]
    const events = await db.events.where('matchId').equals(m.id).sortBy('at')
    return { team, players, events }
  }, [m.id])
  if (!data?.team) return null
  const { team, players, events } = data
  const pName = (id?: number) => {
    const p = players.find((x) => x.id === id)
    return p ? `#${p.number} ${p.name}` : ''
  }
  const r = resultOf(m)
  const mvp = players.find((p) => p.id === m.mvpPlayerId)
  const halves = [1, 2].map((h) => events.filter((e) => e.half === h))
  const ourCas = events.filter((e) => e.type === 'cas' && e.side === 'us').length
  const theirCas = events.filter((e) => e.type === 'cas' && e.side === 'them').length
  const rerollsUsed = events.filter((e) => e.type === 'reroll' && e.side === 'us').length

  return (
    <Page title={`vs ${m.opponent.name || 'Opponent'}`} sub={`${fmtDate(m.date)}${m.opponent.rosterId ? ` · ${getRoster(m.opponent.rosterId)?.name}` : ''}${m.opponent.coach ? ` · ${m.opponent.coach}` : ''}`} back={`/team/${team.id}`} right={<Button variant="ghost" className="!px-2" onClick={() => setEditOpen(true)} aria-label="Edit match">✎</Button>}>
      <Card className="pitch-bg">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <div className="text-sm font-bold">{team.name}</div>
          <div className="text-5xl font-black tabular-nums drop-shadow">
            {m.score.us}–{m.score.them}
          </div>
          <div className="text-sm font-bold">{m.opponent.name}</div>
        </div>
        <div className="mt-2 flex justify-center gap-2">
          <Badge tone={r === 'W' ? 'green' : r === 'L' ? 'red' : 'default'}>{r === 'W' ? 'WIN' : r === 'L' ? 'LOSS' : 'DRAW'}</Badge>
          <Badge>CAS {ourCas}–{theirCas}</Badge>
          {m.weather && <Badge tone="blue">{m.weather}</Badge>}
          {m.conceded && <Badge tone="gold">{m.conceded === 'us' ? 'We conceded' : 'They conceded'}</Badge>}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Info k="MVP" v={mvp ? `🏆 ${mvp.name}` : '–'} />
        <Info k="Winnings" v={gp(m.winnings)} />
        <Info k="Fan Factor" v={`${m.fanFactor.us} vs ${m.fanFactor.them}`} />
        <Info k="Dedicated Fans" v={m.fansBefore != null ? `${m.fansBefore} → ${m.fansAfter}` : '–'} />
        <Info k="CTV" v={`${gp(m.ourCtv)} vs ${gp(m.opponent.ctv)}`} />
        <Info k="Treasury after" v={gp(m.treasuryAfter)} />
        <Info k="Kicked first" v={m.kickingFirst ? (m.kickingFirst === 'us' ? 'Us' : 'Them') : '–'} />
        <Info k="Re-rolls used" v={String(rerollsUsed)} />
        {(m.starHired?.us || m.starHired?.them) && <Info k="Star Players" v={[m.starHired?.us && `us (${gp(m.starFee)})`, m.starHired?.them && 'them'].filter(Boolean).join(' · ')} />}
        {(m.journeymen?.length ?? 0) > 0 && <Info k="Journeymen" v={`${m.journeymen!.length} · ${m.hireJourneymen?.length ?? 0} bought`} />}
      </div>
      {(m.inducements.length > 0 || m.prayers.length > 0 || (m.mistakeResult && m.mistakeResult !== 'averted')) && (
        <Card className="space-y-1 text-sm">
          {m.inducements.map((i) => (
            <div key={i.id}>
              {i.qty}× {INDUCEMENTS.find((x) => x.id === i.id)?.name ?? i.id} <span className="text-white/40">({gp(i.cost * i.qty)})</span>
            </div>
          ))}
          {m.prayers.length > 0 && <div>🙏 {m.prayers.join(', ')}</div>}
          {m.desperate.length > 0 && <div>😈 {m.desperate.join(', ')}</div>}
          {m.inducements.length > 0 && <div className="text-xs text-white/50">Petty Cash {gp(m.pettyCash)}{m.treasurySpent ? ` · from Treasury ${gp(m.treasurySpent)}` : ''}</div>}
          {m.mistakeResult && m.mistakeResult !== 'averted' && <div className="text-red-300">💸 {MISTAKE_NAMES[m.mistakeResult]}: −{gp(m.treasuryLoss)}</div>}
        </Card>
      )}

      <LinkButton variant="soft" className="w-full" to={`/match/${m.id}/log`}>
        ✎ Edit match log (TDs, casualties, SPP…)
      </LinkButton>

      {halves.map((evs, i) =>
        evs.length ? (
          <div key={i} className="space-y-1">
            <H2>{i === 0 ? 'First half' : 'Second half'}</H2>
            {evs.map((e) => (
              <div key={e.id} className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${e.side === 'us' ? 'bg-turf/10' : 'bg-blood/10'}`}>
                <span className="w-8 shrink-0 text-[11px] text-white/40">T{e.turn}</span>
                <span>{describe(e, pName)}</span>
              </div>
            ))}
          </div>
        ) : null,
      )}

      <H2>Report</H2>
      <Card className="space-y-2">
        <textarea className={`${inputCls} h-24`} placeholder="Match report…" value={m.notes} onChange={(e) => db.matches.update(m.id, { notes: e.target.value })} />
        <Photos matchId={m.id} editable />
      </Card>
      <Button
        variant="ghost"
        className="w-full text-red-300"
        onClick={async () => {
          if (!confirm('Delete this match record? Its stats disappear; treasury/fans/injury changes stay as they are.')) return
          await deleteMatch(m)
          nav(`/team/${team.id}`)
        }}
      >
        Delete match record
      </Button>
      {editOpen && <EditMatchSheet m={m} players={players} onClose={() => setEditOpen(false)} />}
    </Page>
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-panel px-3 py-2">
      <div className="text-[10px] uppercase text-white/40">{k}</div>
      <div className="truncate font-semibold">{v}</div>
    </div>
  )
}

export function Photos({ matchId, editable }: { matchId: number; editable?: boolean }) {
  const photos = useLiveQuery(() => db.photos.where('matchId').equals(matchId).toArray(), [matchId])
  const urls = useMemo(() => (photos ?? []).map((p) => ({ id: p.id, url: URL.createObjectURL(p.blob) })), [photos])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u.url)), [urls])
  const [big, setBig] = useState<string | null>(null)
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <div key={u.id} className="relative">
            <img src={u.url} onClick={() => setBig(u.url)} className="h-20 w-20 rounded-lg object-cover" />
            {editable && (
              <button className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-black text-xs" onClick={() => confirm('Delete photo?') && db.photos.delete(u.id)}>
                ✕
              </button>
            )}
          </div>
        ))}
        {editable && (
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/20 text-xs text-white/50">
            📷
            <span>Add photo</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                await db.photos.add({ matchId, blob: await compressImage(f), at: Date.now() } as never)
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>
      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setBig(null)}>
          <img src={big} className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  )
}

/** Correct any recorded match detail after the fact. Team-level effects (treasury, fans, injuries) are not re-applied. */
function EditMatchSheet({ m, players, onClose }: { m: Match; players: Player[]; onClose: () => void }) {
  const [x, setX] = useState<Match>(m)
  const set = (patch: Partial<Match>) => setX({ ...x, ...patch })
  const opp = (patch: Partial<Match['opponent']>) => set({ opponent: { ...x.opponent, ...patch } })
  const k = (v?: number) => (v ?? 0) / 1000
  const setInd = (id: string, qty: number, cost: number) => {
    const rest = x.inducements.filter((i) => i.id !== id)
    set({ inducements: qty > 0 ? [...rest, { id, qty, cost }] : rest })
  }
  const roster = ROSTERS.find((r) => r.id === x.opponent.rosterId)
  return (
    <Sheet open onClose={onClose} title="Edit match">
      <div className="space-y-3">
        <div className="rounded-lg bg-gold/10 p-2 text-xs text-white/70">
          Changes here only fix the record. Treasury, Dedicated Fans and injuries on the team aren't re-applied — correct those on the team or player page.
        </div>
        <Field label="Date">
          <input type="date" className={inputCls} value={new Date(x.date).toISOString().slice(0, 10)} onChange={(e) => e.target.value && set({ date: new Date(e.target.value).getTime() })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Opponent team">
            <input className={inputCls} value={x.opponent.name} onChange={(e) => opp({ name: e.target.value })} />
          </Field>
          <Field label="Coach">
            <input className={inputCls} value={x.opponent.coach} onChange={(e) => opp({ coach: e.target.value })} />
          </Field>
        </div>
        <Field label="Opponent roster">
          <select className={inputCls} value={x.opponent.rosterId} onChange={(e) => opp({ rosterId: e.target.value })}>
            <option value="">–</option>
            {ROSTERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Our team value (k)"><NumberInput value={k(x.ourCtv)} onChange={(v) => set({ ourCtv: v * 1000 })} /></Field>
          <Field label="Their team value (k)"><NumberInput value={k(x.opponent.ctv)} onChange={(v) => opp({ ctv: v * 1000 })} /></Field>
          <Field label="Score us"><NumberInput value={x.score.us} onChange={(v) => set({ score: { ...x.score, us: v } })} /></Field>
          <Field label="Score them"><NumberInput value={x.score.them} onChange={(v) => set({ score: { ...x.score, them: v } })} /></Field>
          <Field label="Fan Factor us"><NumberInput value={x.fanFactor.us} onChange={(v) => set({ fanFactor: { ...x.fanFactor, us: v } })} /></Field>
          <Field label="Fan Factor them"><NumberInput value={x.fanFactor.them} onChange={(v) => set({ fanFactor: { ...x.fanFactor, them: v } })} /></Field>
        </div>
        <div className="text-[11px] text-white/40">The score is recalculated from the log whenever a TD is added or removed there.</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Weather">
            <select className={inputCls} value={x.weather ?? ''} onChange={(e) => set({ weather: e.target.value || undefined })}>
              <option value="">–</option>
              {WEATHER.map((w) => (
                <option key={w.name}>{w.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Kicked first">
            <select className={inputCls} value={x.kickingFirst ?? ''} onChange={(e) => set({ kickingFirst: (e.target.value || undefined) as Match['kickingFirst'] })}>
              <option value="">–</option>
              <option value="us">Us</option>
              <option value="them">Them</option>
            </select>
          </Field>
          <Field label="Conceded">
            <select className={inputCls} value={x.conceded ?? ''} onChange={(e) => set({ conceded: (e.target.value || undefined) as Match['conceded'] })}>
              <option value="">Nobody</option>
              <option value="us">We conceded</option>
              <option value="them">They conceded</option>
            </select>
          </Field>
          <Field label="MVP">
            <select className={inputCls} value={x.mvpPlayerId ?? ''} onChange={(e) => set({ mvpPlayerId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">–</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Winnings (k)"><NumberInput value={k(x.winnings)} onChange={(v) => set({ winnings: v * 1000 })} /></Field>
          <Field label="Treasury after (k)"><NumberInput value={k(x.treasuryAfter)} onChange={(v) => set({ treasuryAfter: v * 1000 })} /></Field>
          <Field label="Fans before"><NumberInput value={x.fansBefore ?? 0} onChange={(v) => set({ fansBefore: v })} /></Field>
          <Field label="Fans after"><NumberInput value={x.fansAfter ?? 0} onChange={(v) => set({ fansAfter: v })} /></Field>
          <Field label="Expensive Mistakes">
            <select className={inputCls} value={x.mistakeResult ?? ''} onChange={(e) => set({ mistakeResult: (e.target.value || undefined) as MistakeResult | undefined })}>
              <option value="">–</option>
              {(Object.keys(MISTAKE_NAMES) as MistakeResult[]).map((r) => (
                <option key={r} value={r}>
                  {MISTAKE_NAMES[r].split(' (')[0]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gold lost (k)"><NumberInput value={k(x.treasuryLoss)} onChange={(v) => set({ treasuryLoss: v * 1000 })} /></Field>
          <Field label="Petty Cash (k)"><NumberInput value={k(x.pettyCash)} onChange={(v) => set({ pettyCash: v * 1000 })} /></Field>
          <Field label="Star fee paid (k)"><NumberInput value={k(x.starHired?.us ? x.starFee : 0)} onChange={(v) => set({ starFee: v * 1000, starHired: { us: v > 0, them: x.starHired?.them ?? false } })} /></Field>
        </div>
        <Field label="Prayers to Nuffle (comma separated)">
          <input className={inputCls} value={x.prayers.join(', ')} onChange={(e) => set({ prayers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </Field>
        <div>
          <div className="text-xs text-white/60">Inducements</div>
          {INDUCEMENTS.map((i) => {
            const cost = i.cost(roster)
            return <Stepper key={i.id} label={i.name} sub={gp(cost)} value={x.inducements.find((y) => y.id === i.id)?.qty ?? 0} max={i.max} onChange={(q) => setInd(i.id, q, cost)} />
          })}
        </div>
        <Field label="Match status">
          <select className={inputCls} value={x.status} onChange={(e) => set({ status: e.target.value as MatchStatus })}>
            <option value="done">Finished</option>
            <option value="live">Live (reopen log — post-game would apply effects again!)</option>
          </select>
        </Field>
        <Button
          className="w-full"
          onClick={async () => {
            await db.matches.put(x)
            onClose()
          }}
        >
          Save
        </Button>
      </div>
    </Sheet>
  )
}
