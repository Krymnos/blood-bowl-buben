import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type Player, type Team } from '../db'
import { getRoster, isLineman } from '../rules/data'
import { SEVENS, STAT_LABEL } from '../rules/sevens'
import { fmtTarget, hireable, playerValue, profile, teamValue, validateTeam } from '../logic/team'
import { cheapestAdvance, computeStats, resultOf, teamRecord } from '../logic/stats'
import { changeStaff, finishDraft, hirePlayer, isDraft, startMatch } from '../logic/actions'
import { fmtDate, gp } from '../logic/format'
import { randomName } from '../logic/names'
import { Badge, Button, Card, Empty, Field, H2, inputCls, NumberInput, Page, Sheet, Stepper, Toggle, useSettings } from '../components/ui'

export default function TeamPage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const settings = useSettings()
  const [tab, setTab] = useState<'roster' | 'staff' | 'games'>('roster')
  const [hireOpen, setHireOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const data = useLiveQuery(async () => {
    const team = await db.teams.get(id)
    const players = await db.players.where('teamId').equals(id).toArray()
    const matches = await db.matches.where('teamId').equals(id).toArray()
    const events = await db.events.where('teamId').equals(id).toArray()
    return { team, players, matches, events }
  }, [id])
  if (!data) return null
  const { team, players, matches, events } = data
  if (!team) return <Page title="Not found" back="/">Team not found.</Page>
  const roster = getRoster(team.rosterId)!
  const draft = isDraft(team, matches.length)
  const active = players.filter((p) => p.status === 'active').sort((a, b) => a.number - b.number)
  const gone = players.filter((p) => p.status !== 'active' && p.status !== 'journeyman' && !(p.status === 'released' && p.journeyman))
  const { tv, ctv } = teamValue(team, players)
  const warnings = validateTeam(team, players)
  const stats = computeStats(players, matches, events, settings)
  const rec = teamRecord(matches)
  const nonLine = active.filter((p) => roster.positionals.find((x) => x.name === p.position && !isLineman(x))).length

  return (
    <Page
      title={team.name}
      sub={`${roster.name} · Tier ${roster.tier ?? '?'}${team.coach ? ` · Coach ${team.coach}` : ''}`}
      back="/"
      right={
        <Button variant="ghost" className="!px-2" onClick={() => setEditOpen(true)}>
          ✎
        </Button>
      }
    >
      <div className="grid grid-cols-4 gap-2 text-center">
        <Kpi label="TV" value={gp(tv)} />
        <Kpi label="CTV" value={gp(ctv)} />
        <Kpi label={draft ? 'Budget left' : 'Treasury'} value={gp(team.treasury)} tone={team.treasury < 0 ? 'red' : 'gold'} />
        <Kpi label="Record" value={`${rec.w}-${rec.d}-${rec.l}`} />
      </div>
      <div className="h-1 rounded-full" style={{ background: team.color }} />

      {draft && (
        <Card className="border-gold/30 bg-gold/5 text-xs text-white/70">
          <b className="text-gold">Draft mode</b> — hiring and staff are paid from the {gp(SEVENS.draftBudget)} budget; removing refunds. League rule: left-over budget is lost — the treasury starts at 0 for the first game.
          <Button
            className="mt-2 w-full"
            onClick={() => confirm(`Finish the draft? The ${gp(team.treasury)} left over is lost and the treasury becomes 0.`) && finishDraft(team)}
          >
            ✅ Finish draft (treasury → 0)
          </Button>
        </Card>
      )}
      {warnings.length > 0 && (
        <Card className="space-y-1 border-blood/40">
          {warnings.map((w, i) => (
            <div key={i} className={`text-sm ${w.level === 'error' ? 'text-red-300' : 'text-amber-200'}`}>
              {w.level === 'error' ? '⛔' : '⚠️'} {w.text}
            </div>
          ))}
        </Card>
      )}

      <div className="flex gap-1 rounded-xl bg-white/5 p-1">
        {(['roster', 'staff', 'games'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize ${tab === t ? 'bg-white/15' : 'text-white/50'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'roster' && (
        <>
          <H2 right={<span className="text-xs text-white/40">{active.length}/11 · {nonLine}/4 non-Linemen</span>}>Players</H2>
          {active.length === 0 && <Empty>No players yet. Hire your first player below.</Empty>}
          {active.map((p) => (
            <PlayerRow key={p.id} p={p} team={team} spp={stats.get(p.id)?.spp ?? 0} canAdvance={(cheapestAdvance(p, settings) ?? 999) <= (stats.get(p.id)?.spp ?? 0)} onClick={() => nav(`/team/${team.id}/player/${p.id}`)} />
          ))}
          <Button variant="soft" className="w-full" onClick={() => setHireOpen(true)}>
            + Hire player
          </Button>
          {gone.length > 0 && (
            <>
              <H2>Former players</H2>
              {gone.map((p) => (
                <Card key={p.id} onClick={() => nav(`/team/${team.id}/player/${p.id}`)} className="opacity-60">
                  <div className="flex justify-between text-sm">
                    <span>
                      {p.status === 'dead' ? '💀' : p.status === 'scouted' ? '🕵️' : '👋'} {p.name} <span className="text-white/50">· {p.position}</span>
                    </span>
                    <span className="text-white/50">{p.status}</span>
                  </div>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {tab === 'staff' && <StaffTab team={team} draft={draft} />}

      {tab === 'games' && (
        <>
          <Button
            className="w-full !py-3"
            onClick={async () => nav(`/match/${await startMatch(team.id)}`)}
            disabled={matches.some((m) => m.status !== 'done')}
          >
            🏈 New match
          </Button>
          {matches.some((m) => m.status !== 'done') && <div className="text-center text-xs text-white/50">Finish the game in progress first.</div>}
          {matches.length === 0 && <Empty>No games played yet.</Empty>}
          {[...matches]
            .sort((a, b) => b.date - a.date)
            .map((m) => (
              <Card key={m.id} onClick={() => nav(`/match/${m.id}`)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">vs {m.opponent.name || 'Opponent'}</div>
                    <div className="text-xs text-white/50">
                      {fmtDate(m.date)} · {m.opponent.rosterId ? getRoster(m.opponent.rosterId)?.name : ''} {m.weather ? `· ${m.weather}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.status === 'done' ? <Badge tone={resultOf(m) === 'W' ? 'green' : resultOf(m) === 'L' ? 'red' : 'default'}>{resultOf(m)}</Badge> : <Badge tone="gold">{m.status}</Badge>}
                    <span className="text-xl font-black tabular-nums">
                      {m.score.us}–{m.score.them}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
        </>
      )}

      <HireSheet open={hireOpen} onClose={() => setHireOpen(false)} team={team} players={players} />
      {editOpen && <EditTeamSheet open onClose={() => setEditOpen(false)} team={team} />}
    </Page>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'red' }) {
  return (
    <div className="rounded-xl bg-panel px-1 py-2">
      <div className={`text-base font-bold tabular-nums ${tone === 'gold' ? 'text-gold' : tone === 'red' ? 'text-red-400' : ''}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
    </div>
  )
}

export function PlayerRow({ p, team, spp, canAdvance, onClick }: { p: Player; team: Team; spp: number; canAdvance: boolean; onClick?: () => void }) {
  const pr = profile(p, team.rosterId)
  return (
    <Card onClick={onClick} className="!p-2.5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black" style={{ background: team.color, color: '#fff' }}>
          {p.number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-semibold">{p.name}</span>
            {p.journeyman && <Badge>Journeyman</Badge>}
            {p.missNextGame && <Badge tone="red">MNG</Badge>}
            {p.injuries.some((i) => i.kind === 'niggling') && <Badge tone="red">Niggle ×{p.injuries.filter((i) => i.kind === 'niggling').length}</Badge>}
            {p.injuries.filter((i) => i.kind === 'stat').map((i) => (
              <Badge key={i.id} tone="red">−1 {STAT_LABEL[i.stat!]}</Badge>
            ))}
            {canAdvance && <Badge tone="gold">★ Advance</Badge>}
          </div>
          <div className="text-xs text-white/50">{p.position}</div>
          <div className="mt-1 flex gap-2 font-mono text-xs">
            <span>MA {pr.ma}</span>
            <span>ST {pr.st}</span>
            <span>AG {fmtTarget(pr.ag)}</span>
            <span>PA {fmtTarget(pr.pa)}</span>
            <span>AV {fmtTarget(pr.av)}</span>
          </div>
          <div className="mt-1 text-xs leading-snug text-white/60">
            {pr.baseSkills.join(', ')}
            {pr.gainedSkills.length > 0 && (
              <>
                {pr.baseSkills.length > 0 && ', '}
                <span className="font-semibold text-gold">{pr.gainedSkills.join(', ')}</span>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold">{gp(playerValue(p, team.rosterId))}</div>
          <div className="text-xs text-white/50">{spp} SPP</div>
        </div>
      </div>
    </Card>
  )
}

function HireSheet({ open, onClose, team, players }: { open: boolean; onClose: () => void; team: Team; players: Player[] }) {
  const options = hireable(team, players)
  const [pick, setPick] = useState<string | null>(null)
  const [name, setName] = useState('')
  const close = () => {
    setPick(null)
    setName('')
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} title={pick ? `Hire ${pick}` : 'Hire player'}>
      {!pick ? (
        <div className="space-y-2">
          {options.map(({ pos, ok, reason }) => (
            <button
              key={pos.name}
              disabled={!ok}
              onClick={() => {
                setPick(pos.name)
                setName(randomName(team.rosterId))
              }}
              className="w-full rounded-xl bg-white/5 p-3 text-left active:bg-white/10 disabled:opacity-40"
            >
              <div className="flex justify-between">
                <span className="font-semibold">{pos.name}</span>
                <span className="font-bold">{gp(pos.cost)}</span>
              </div>
              <div className="font-mono text-xs text-white/60">
                MA {pos.ma} ST {pos.st} AG {pos.ag ?? '-'} PA {pos.pa ?? '-'} AV {pos.av ?? '-'} · {isLineman(pos) ? 'Lineman' : 'Positional'} · 0-{pos.max}
              </div>
              <div className="text-xs text-white/50">{pos.skills.join(', ') || 'No skills'}</div>
              {!ok && <div className="text-xs text-red-300">{reason}</div>}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Name">
            <div className="flex gap-2">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="soft" onClick={() => setName(randomName(team.rosterId))}>
                🎲
              </Button>
            </div>
          </Field>
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setPick(null)}>
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={async () => {
                await hirePlayer(team, pick, name.trim() || pick)
                close()
              }}
            >
              Hire
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function StaffTab({ team, draft }: { team: Team; draft: boolean }) {
  const roster = getRoster(team.rosterId)!
  const s = useSettings()
  const rr = draft ? SEVENS.rerollCost : s.rerollCostLeague
  const star = team.starPlayer ?? { name: '', cost: 0 }
  return (
    <>
      <Card>
        <Stepper label="Team Re-rolls" sub={`${gp(rr)} each`} value={team.rerolls} max={8} onChange={(v) => changeStaff(team, 'rerolls', v, draft)} />
        <Stepper label="Assistant Coaches" sub={`${gp(SEVENS.assistantCoachCost)} · 0-${SEVENS.maxAssistantCoaches}`} value={team.assistantCoaches} max={SEVENS.maxAssistantCoaches} onChange={(v) => changeStaff(team, 'assistantCoaches', v, draft)} />
        <Stepper label="Cheerleaders" sub={`${gp(SEVENS.cheerleaderCost)} · 0-${SEVENS.maxCheerleaders}`} value={team.cheerleaders} max={SEVENS.maxCheerleaders} onChange={(v) => changeStaff(team, 'cheerleaders', v, draft)} />
        {roster.apothecary ? (
          <Toggle label={<span>Apothecary <span className="text-xs text-white/50">· {gp(SEVENS.apothecaryCost)}</span></span>} checked={team.apothecary} onChange={(v) => changeStaff(team, 'apothecary', v, draft)} />
        ) : (
          <div className="py-1.5 text-sm text-white/40">Apothecary: not available for {roster.name}</div>
        )}
        <Toggle label={<span>Goblin lawyer <span className="text-xs text-white/50">· {gp(SEVENS.lawyerCost)} · keep 1 scouted player per season</span></span>} checked={!!team.lawyer} onChange={(v) => changeStaff(team, 'lawyer', v, draft)} />
        {team.lawyer && <Toggle label={<span className="text-xs text-white/60">Lawyer already used this season</span>} checked={!!team.lawyerUsed} onChange={(v) => db.teams.update(team.id, { lawyerUsed: v })} />}
        <Stepper label="Dedicated Fans" sub="Start at 1 · free · not in team value · change after games" value={team.dedicatedFans} min={1} max={10} onChange={(v) => db.teams.update(team.id, { dedicatedFans: v })} />
      </Card>
      <H2>Star Player</H2>
      <Card className="space-y-2">
        <div className="text-xs text-white/50">Your roster's Star Player (see the league's Star Player document). Hire him in pre-game step 0; the fee is paid from the treasury.</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="Name">
              <input className={inputCls} defaultValue={star.name} onBlur={(e) => db.teams.update(team.id, { starPlayer: { ...star, name: e.target.value } })} placeholder="e.g. Grombrindal" />
            </Field>
          </div>
          <Field label="Fee (k)">
            <NumberInput value={star.cost / 1000} onChange={(v) => db.teams.update(team.id, { starPlayer: { ...star, cost: v * 1000 } })} />
          </Field>
        </div>
        <Field label="Notes (stats, skills)">
          <input className={inputCls} defaultValue={star.notes ?? ''} onBlur={(e) => db.teams.update(team.id, { starPlayer: { ...star, notes: e.target.value } })} />
        </Field>
      </Card>
      <div className="px-1 text-xs text-white/40">{draft ? 'Draft: buying is paid from the budget, removing refunds.' : 'Buying costs gold, lowering gives no refund. To fix a mistake without gold changes, use ✎ (top right).'}</div>
    </>
  )
}

function EditTeamSheet({ open, onClose, team }: { open: boolean; onClose: () => void; team: Team }) {
  const nav = useNavigate()
  const [x, setX] = useState<Team>(team)
  const set = (patch: Partial<Team>) => setX({ ...x, ...patch })
  if (!open) return null
  return (
    <Sheet open={open} onClose={onClose} title="Edit team">
      <div className="space-y-3">
        <div className="rounded-lg bg-gold/10 p-2 text-xs text-white/70">Free edit: values are set directly, no gold is charged or refunded.</div>
        <Field label="Name">
          <input className={inputCls} value={x.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Coach">
            <input className={inputCls} value={x.coach} onChange={(e) => set({ coach: e.target.value })} />
          </Field>
          <Field label="Colour">
            <input type="color" className="h-11 w-full rounded-xl border border-white/10 bg-black/30" value={x.color} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Field label="Treasury (k)">
            <NumberInput value={x.treasury / 1000} onChange={(v) => set({ treasury: v * 1000 })} />
          </Field>
          <Field label="Dedicated Fans">
            <NumberInput value={x.dedicatedFans} onChange={(v) => set({ dedicatedFans: v })} />
          </Field>
          <Field label="Team re-rolls">
            <NumberInput value={x.rerolls} onChange={(v) => set({ rerolls: v })} />
          </Field>
          <Field label="Assistant Coaches">
            <NumberInput value={x.assistantCoaches} onChange={(v) => set({ assistantCoaches: v })} />
          </Field>
          <Field label="Cheerleaders">
            <NumberInput value={x.cheerleaders} onChange={(v) => set({ cheerleaders: v })} />
          </Field>
        </div>
        <Toggle label="Apothecary" checked={x.apothecary} onChange={(v) => set({ apothecary: v })} />
        <Toggle label="Goblin lawyer" checked={!!x.lawyer} onChange={(v) => set({ lawyer: v })} />
        <Toggle label="Lawyer used this season" checked={!!x.lawyerUsed} onChange={(v) => set({ lawyerUsed: v })} />
        <Toggle label="Draft finished" checked={!!x.draftDone} onChange={(v) => set({ draftDone: v })} />
        <Field label="Notes">
          <textarea className={`${inputCls} h-20`} value={x.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <Button
          className="w-full"
          onClick={async () => {
            await db.teams.put(x)
            onClose()
          }}
        >
          Save
        </Button>
        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            if (!confirm(`Delete ${team.name} and all its games? This cannot be undone.`)) return
            await db.transaction('rw', [db.teams, db.players, db.matches, db.events, db.photos], async () => {
              const ms = await db.matches.where('teamId').equals(team.id).primaryKeys()
              await db.photos.where('matchId').anyOf(ms).delete()
              await db.events.where('teamId').equals(team.id).delete()
              await db.matches.where('teamId').equals(team.id).delete()
              await db.players.where('teamId').equals(team.id).delete()
              await db.teams.delete(team.id)
            })
            nav('/')
          }}
        >
          Delete team
        </Button>
      </div>
    </Sheet>
  )
}
