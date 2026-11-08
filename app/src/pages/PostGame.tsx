import type { ReactNode } from 'react'
import { backupSoon } from '../logic/cloud'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Match, type Player } from '../db'
import type { Stat } from '../rules/types'
import { CASUALTY, CAS_NAMES, EXPENSIVE_MISTAKES, LASTING_INJURY, MISTAKE_NAMES, mistakeBand, STAT_LABEL, type CasResult, type MistakeResult } from '../rules/sevens'
import { computeStats } from '../logic/stats'
import { journeymanPrice, recalcScore, syncMatchInjuries } from '../logic/actions'
import { teamValue } from '../logic/team'
import { d } from '../logic/dice'
import { gp } from '../logic/format'
import { Button, Card, DiceInput, inputCls, LinkButton, NumberInput, Page, Toggle, useSettings, Step } from '../components/ui'
import { Photos } from './MatchReport'

export default function PostGame({ match: m }: { match: Match }) {
  const settings = useSettings()
  const data = useLiveQuery(async () => {
    const team = await db.teams.get(m.teamId)
    const players = (await db.players.bulkGet(m.played)).filter(Boolean) as Player[]
    const roster = await db.players.where('teamId').equals(m.teamId).toArray()
    const events = await db.events.where('matchId').equals(m.id).toArray()
    return { team, players, roster, events }
  }, [m.id, m.played.join()])
  if (!data?.team) return null
  const { team, players, roster, events } = data
  const up = (patch: Partial<Match>) => db.matches.update(m.id, patch)

  const result = m.score.us > m.score.them ? 'W' : m.score.us < m.score.them ? 'L' : 'D'

  // 1 · Outcome: concession gives the winner an extra TD (3 SPP to any player)
  const concessionTd = events.find((e) => e.type === 'td' && e.label === 'concession')
  const setConceded = async (c: 'us' | 'them' | undefined) => {
    if (concessionTd) await db.events.delete(concessionTd.id)
    if (c) await db.events.add({ matchId: m.id, teamId: m.teamId, at: Date.now(), half: 2, turn: m.turn, side: c === 'them' ? 'us' : 'them', type: 'td', label: 'concession' } as never)
    await up({ conceded: c, winnings: undefined })
    await recalcScore(m.id)
  }
  const ourCas = events.filter((e) => e.side === 'them' && e.type === 'cas' && e.victimId != null)
  const deadIds = new Set(ourCas.filter((e) => e.result === 'dead').map((e) => e.victimId!))

  // 2 · Winnings
  const tickets = (m.fanFactor.us + m.fanFactor.them) * 10_000
  const ticketShare = m.conceded === 'them' ? tickets : m.conceded === 'us' ? 0 : tickets / 2
  const autoWinnings = ticketShare + m.score.us * 10_000
  const winnings = m.winnings ?? autoWinnings

  // 3 · Dedicated fans
  const fans = team.dedicatedFans
  let fansAuto = fans
  if (m.fansRoll) {
    if (result === 'W' && m.fansRoll >= fans) fansAuto = fans + 1
    if (result === 'L' && m.fansRoll < fans) fansAuto = Math.max(1, fans - 1)
  }
  const fansAfter = m.fansAfter ?? fansAuto

  // 4 · MVP & SPP
  const mvpPool = players.filter((p) => !deadIds.has(p.id))
  const gameStats = computeStats(players.map((p) => ({ ...p, sppAdjust: 0, advancements: [] })), [{ ...m, status: 'done' }], events, settings)

  // 5 · Journeymen
  const journeymen = players.filter((p) => (m.journeymen ?? []).includes(p.id))
  const hire = (m.hireJourneymen ?? []).filter((id) => !deadIds.has(id))
  const hireCost = journeymen.filter((p) => hire.includes(p.id)).reduce((s, p) => s + journeymanPrice(p, team.rosterId), 0)

  // 6 · Expensive mistakes
  const treasuryBefore = team.treasury + winnings - hireCost
  const band = mistakeBand(treasuryBefore)
  const mistake: MistakeResult | undefined = band >= 0 && m.mistakeRoll ? EXPENSIVE_MISTAKES[m.mistakeRoll - 1][band] : band < 0 ? 'averted' : undefined
  const loss = m.treasuryLoss ?? 0
  const rollMistakeLoss = (r: MistakeResult) => {
    if (r === 'minor') return d(3) * 10_000
    if (r === 'major') return treasuryBefore - Math.floor(treasuryBefore / 2 / 5000) * 5000
    if (r === 'catastrophe') return Math.max(0, treasuryBefore - (d(6) + d(6)) * 10_000)
    return 0
  }
  const treasuryAfter = treasuryBefore - loss

  // 7 · Next match
  const nextTv = teamValue(team, roster.map((p) => {
    const cas = ourCas.find((e) => e.victimId === p.id && e.result && e.result !== 'bh')
    const back = m.missing.includes(p.id) ? { missNextGame: false } : {}
    const hired = hire.includes(p.id) ? { status: 'active' as const } : {}
    return { ...p, ...back, ...hired, ...(cas ? (cas.result === 'dead' ? { status: 'dead' as const } : { missNextGame: true }) : {}) }
  }))

  const finish = async () => {
    if (!confirm('Finish the game and apply winnings, fans, injuries and journeymen to your team?')) return
    await db.transaction('rw', [db.players, db.teams, db.matches, db.events], async () => {
      for (const id of m.missing) await db.players.update(id, { missNextGame: false })
      for (const p of journeymen) {
        if (deadIds.has(p.id)) continue
        if (hire.includes(p.id)) await db.players.update(p.id, { status: 'active', journeyman: false, hiredAt: Date.now() })
        else await db.players.update(p.id, { status: 'released' })
      }
      const t = (await db.teams.get(team.id))!
      const after = t.treasury + winnings - hireCost - loss
      await db.teams.update(team.id, { treasury: after, dedicatedFans: fansAfter })
      await db.matches.update(m.id, {
        status: 'done', finishedAt: Date.now(), winnings, fansBefore: fans, fansAfter, mistakeResult: mistake, treasuryLoss: loss, treasuryAfter: after, hireJourneymen: hire,
      })
      await syncMatchInjuries(m.id)
    })
    backupSoon(1000)
  }

  return (
    <Page title="Post-game" sub={`${team.name} vs ${m.opponent.name}`} back={`/team/${team.id}`} right={<LinkButton variant="ghost" className="!px-2" to="/rules#postmatch">📖</LinkButton>}>
      <Card className="pitch-bg text-center">
        <div className="text-5xl font-black tabular-nums drop-shadow">
          {m.score.us} – {m.score.them}
        </div>
        <div className="mt-1 font-bold">{result === 'W' ? '🏆 Victory!' : result === 'L' ? '💀 Defeat' : '🤝 Draw'}</div>
        <div className="mt-2 flex justify-center gap-2">
          <Button variant="soft" className="!py-1.5 text-xs" onClick={() => up({ status: 'live' })}>
            ‹ Back to live log
          </Button>
        </div>
      </Card>

      <Step n={1} title="Outcome" rule="Dead players are removed from the roster. If a coach concedes, the winner gets an extra touchdown (any player may receive its 3 SPP).">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1 text-sm">
          {([[undefined, 'Played out'], ['them', 'They conceded'], ['us', 'We conceded']] as const).map(([v, l]) => (
            <button key={l} onClick={() => setConceded(v)} className={`rounded-lg py-2 font-semibold ${m.conceded === v ? 'bg-white/15' : 'text-white/50'}`}>
              {l}
            </button>
          ))}
        </div>
        {m.conceded === 'them' && concessionTd && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm">Bonus TD (3 SPP) to</span>
            <select className={inputCls} value={concessionTd.playerId ?? ''} onChange={(e) => db.events.update(concessionTd.id, { playerId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Pick a player…</option>
              {mvpPool.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="text-xs font-bold uppercase tracking-wider text-white/40">Casualties suffered</div>
        {ourCas.length === 0 && <div className="text-sm text-white/50">None. 🙏</div>}
        {ourCas.map((e) => {
          const p = players.find((x) => x.id === e.victimId)
          return (
            <div key={e.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                #{p?.number} {p?.name}
              </span>
              <select className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm" value={e.result ?? ''} onChange={(ev) => db.events.update(e.id, { result: (ev.target.value || undefined) as CasResult | undefined })}>
                <option value="">Apothecary saved / no effect</option>
                {CASUALTY.map((c) => (
                  <option key={c.result} value={c.result}>
                    {c.name}
                  </option>
                ))}
              </select>
              {e.result === 'li' && (
                <select className="rounded-lg border border-red-400/30 bg-black/30 px-2 py-1.5 text-sm" value={e.stat ?? 'av'} onChange={(ev) => db.events.update(e.id, { stat: ev.target.value as Stat })}>
                  {LASTING_INJURY.map((l) => (
                    <option key={l.name} value={l.stat}>
                      −1 {STAT_LABEL[l.stat]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
        {m.missing.length > 0 && <div className="text-xs text-white/50">Players who missed this game return for the next one.</div>}
      </Step>

      <Step n={2} title="Winnings" rule="Ticket sales = (Fan Factor us + them) × 10k, split equally. Plus 10k per touchdown scored. If a coach conceded, the winner gets all ticket sales.">
        <div className="text-xs text-white/50">
          {m.conceded === 'them' ? `All tickets ${gp(tickets)}` : m.conceded === 'us' ? 'No tickets (we conceded)' : `(${m.fanFactor.us} + ${m.fanFactor.them}) × 10k ÷ 2 = ${gp(ticketShare)}`} + {m.score.us} TD × 10k ={' '}
          <b className="text-white">{gp(autoWinnings)}</b>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">Winnings (k)</span>
          <NumberInput className="!w-24" value={winnings / 1000} onChange={(v) => up({ winnings: v * 1000 })} />
          {m.winnings != null && m.winnings !== autoWinnings && (
            <Button variant="ghost" className="!px-2 text-xs" onClick={() => up({ winnings: undefined })}>
              reset
            </Button>
          )}
        </div>
      </Step>

      <Step n={3} title="Dedicated Fans" rule="Win: roll D6, if ≥ your Dedicated Fans gain one. Loss: roll D6, if lower than your Dedicated Fans lose one. Draw: nothing.">
        {result === 'D' ? (
          <div className="text-sm text-white/60">Draw — no change ({fans}).</div>
        ) : (
          <DiceInput label={result === 'W' ? `Win: D6 ≥ ${fans} → +1` : `Loss: D6 < ${fans} → −1`} value={m.fansRoll} onChange={(v) => up({ fansRoll: v, fansAfter: undefined })} />
        )}
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">Dedicated Fans after the game</span>
          <NumberInput className="!w-20" value={fansAfter} onChange={(v) => up({ fansAfter: v })} />
        </div>
      </Step>

      <Step n={4} title="MVP & advancements" rule="Pick a random player (journeymen allowed, dead players not): MVP, +4 SPP. Players may then spend SPP — each spend needs a scouting roll (on the player page).">
        <div className="flex gap-2">
          <select className={inputCls} value={m.mvpPlayerId ?? ''} onChange={(e) => up({ mvpPlayerId: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">MVP…</option>
            {mvpPool.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.number} {p.name}
              </option>
            ))}
          </select>
          <Button variant="soft" className="shrink-0" onClick={() => mvpPool.length && up({ mvpPlayerId: mvpPool[d(mvpPool.length) - 1].id })}>
            🎲 Random
          </Button>
        </div>
        <div className="space-y-1 text-sm">
          {players
            .map((p) => ({ p, s: gameStats.get(p.id)! }))
            .filter(({ s }) => s.sppEarned > 0)
            .sort((a, b) => b.s.sppEarned - a.s.sppEarned)
            .map(({ p, s }) => (
              <div key={p.id} className="flex justify-between">
                <span>
                  #{p.number} {p.name}{' '}
                  <span className="text-xs text-white/40">
                    {[s.td && `${s.td} TD`, s.cas && `${s.cas} CAS`, s.completion && `${s.completion} comp`, s.catch && `${s.catch} catch`, s.interception && `${s.interception} int`, s.mvp && 'MVP'].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <b className="text-gold">+{s.sppEarned} SPP</b>
              </div>
            ))}
        </div>
        <div className="text-xs text-white/40">Spend SPP on the player pages after finishing.</div>
      </Step>

      <Step n={5} title="Hire & fire" rule="Journeymen with SPP or advancements may be bought: Lineman price + value of their advancements. They lose Loner (5+). Hire or fire others on the team page.">
        {journeymen.length === 0 && <div className="text-sm text-white/50">No journeymen this game.</div>}
        {journeymen.map((p) => {
          const sp = gameStats.get(p.id)?.sppEarned ?? 0
          return (
            <Toggle
              key={p.id}
              label={
                <span>
                  Buy #{p.number} {p.name} <span className="text-xs text-white/50">· {gp(journeymanPrice(p, team.rosterId))} · {sp} SPP{deadIds.has(p.id) ? ' · 💀' : ''}</span>
                </span>
              }
              checked={hire.includes(p.id)}
              onChange={(v) => up({ hireJourneymen: v ? [...hire, p.id] : hire.filter((x) => x !== p.id) })}
            />
          )
        })}
        {journeymen.length > 0 && <div className="text-xs text-white/40">Journeymen you don't buy leave after this game.</div>}
      </Step>

      <Step n={6} title="Expensive Mistakes" rule="More than 100k in the treasury? Roll a D6 on the Expensive Mistakes table.">
        <div className="text-xs text-white/50">
          Treasury {gp(team.treasury)} + winnings {gp(winnings)}{hireCost ? ` − journeymen ${gp(hireCost)}` : ''} = <b className="text-white">{gp(treasuryBefore)}</b>
        </div>
        {band < 0 ? (
          <div className="text-sm text-green-300">Below 100k — safe.</div>
        ) : (
          <>
            <DiceInput
              label="Expensive Mistakes D6"
              value={m.mistakeRoll}
              onChange={(v) => {
                const r = EXPENSIVE_MISTAKES[v - 1][band]
                up({ mistakeRoll: v, treasuryLoss: rollMistakeLoss(r) })
              }}
            />
            {mistake && <div className="text-sm font-semibold">{MISTAKE_NAMES[mistake]}</div>}
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm">Gold lost (k)</span>
              <NumberInput className="!w-24" value={loss / 1000} onChange={(v) => up({ treasuryLoss: v * 1000 })} />
            </div>
          </>
        )}
      </Step>

      <Step n={7} title="Prepare for the next match" rule="Work out the new team value. Players who miss the next game through injury don't count.">
        <div className="grid grid-cols-2 gap-2 text-center text-sm">
          <div className="rounded-xl bg-black/30 py-2">
            <div className="font-bold">{gp(nextTv.ctv)}</div>
            <div className="text-[10px] uppercase text-white/40">Next team value</div>
          </div>
          <div className="rounded-xl bg-black/30 py-2">
            <div className="font-bold text-gold">{gp(treasuryAfter)}</div>
            <div className="text-[10px] uppercase text-white/40">Treasury</div>
          </div>
        </div>
      </Step>

      <Card className="space-y-2">
        <div className="text-sm font-bold">Match report</div>
        <textarea className={`${inputCls} h-24`} placeholder="What happened? Heroes, villains, Nuffle's whims…" value={m.notes} onChange={(e) => up({ notes: e.target.value })} />
        <Photos matchId={m.id} editable />
      </Card>

      <Card className="space-y-1 text-sm">
        <Row k="Treasury" v={<>{gp(team.treasury)} → <b className="text-gold">{gp(treasuryAfter)}</b></>} />
        <Row k="Dedicated Fans" v={<>{fans} → <b>{fansAfter}</b></>} />
        <Row k="Injuries" v={ourCas.filter((e) => e.result && e.result !== 'bh').map((e) => CAS_NAMES[e.result!]).join(', ') || 'none'} />
        {journeymen.length > 0 && <Row k="Journeymen bought" v={hire.length ? `${hire.length} (${gp(hireCost)})` : 'none'} />}
      </Card>
      <Button className="w-full !py-4 text-base" onClick={finish}>
        ✅ Finish & apply to team
      </Button>
    </Page>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/60">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}

