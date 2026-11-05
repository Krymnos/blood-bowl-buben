import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db, uid, type Advancement, type Player, type PlayerStatus, type Team } from '../db'
import { CATEGORY_NAMES, findSkill, getPositional, getRoster, skillsInCategory, skillUrl } from '../rules/data'
import { CAS_NAMES, charImprovementFor, LEVEL_NAMES, SEVENS, STAT_LABEL, type LeagueSettings } from '../rules/sevens'
import type { SkillCategory, Stat } from '../rules/types'
import { fmtTarget, isLinemanName, playerValue, profile, statDelta } from '../logic/team'
import { computeStats } from '../logic/stats'
import { isDraft, removePlayer, setVeteran } from '../logic/actions'
import { d } from '../logic/dice'
import { EVENT_LABEL } from '../logic/events'
import { fmtDate, gp } from '../logic/format'
import { Badge, Button, Card, DiceInput, Field, H2, inputCls, NumberInput, Page, Sheet, Toggle, useSettings } from '../components/ui'


export default function PlayerPage() {
  const { id, pid } = useParams()
  const teamId = Number(id)
  const playerId = Number(pid)
  const settings = useSettings()
  const [advOpen, setAdvOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editAdv, setEditAdv] = useState<Advancement | null>(null)
  const data = useLiveQuery(async () => {
    const team = await db.teams.get(teamId)
    const player = await db.players.get(playerId)
    const players = await db.players.where('teamId').equals(teamId).toArray()
    const matches = await db.matches.where('teamId').equals(teamId).toArray()
    const events = await db.events.where('teamId').equals(teamId).toArray()
    return { team, player, players, matches, events }
  }, [teamId, playerId])
  if (!data) return null
  const { team, player: p, matches, events, players } = data
  if (!team || !p) return <Page title="Not found" back={`/team/${teamId}`}>Player not found.</Page>
  const pr = profile(p, team.rosterId)
  const pos = getPositional(team.rosterId, p.position)
  const st = computeStats(players, matches, events, settings).get(p.id)!
  const n = p.advancements.length
  const myEvents = events.filter((e) => (e.side === 'us' && e.playerId === p.id) || (e.side === 'them' && e.victimId === p.id))

  return (
    <Page title={`#${p.number} ${p.name}`} sub={`${p.position} · ${LEVEL_NAMES[n]}`} back={`/team/${teamId}`} right={<Button variant="ghost" className="!px-2" onClick={() => setEditOpen(true)}>✎</Button>}>
      <Card>
        <div className="grid grid-cols-5 gap-1 text-center">
          {(['ma', 'st', 'ag', 'pa', 'av'] as Stat[]).map((s) => {
            const v = s === 'ma' ? pr.ma : s === 'st' ? pr.st : fmtTarget(pr[s] as number | null)
            const { imp, inj } = statDelta(p, s)
            return (
              <div key={s} className="rounded-xl bg-black/30 py-2">
                <div className={`text-xl font-black ${imp > inj ? 'text-gold' : inj > imp ? 'text-red-400' : ''}`}>{v}</div>
                <div className="text-[10px] text-white/50">{STAT_LABEL[s]}</div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pr.baseSkills.map((s) => <SkillChip key={s} name={s} />)}
          {pr.gainedSkills.map((s) => <SkillChip key={s} name={s} gained />)}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.veteran && <Badge tone="blue">Veteran (−1 MA, once/game re-roll)</Badge>}
          {p.journeyman && <Badge>Journeyman (Loner 5+)</Badge>}
          {p.missNextGame && <Badge tone="red">Misses next game</Badge>}
          {p.status !== 'active' && <Badge tone="red">{p.status}</Badge>}
          {p.injuries.map((i) => (
            <Badge key={i.id} tone="red">{i.kind === 'niggling' ? 'Niggling Injury' : `−1 ${STAT_LABEL[i.stat!]}`}</Badge>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-white/60">Value</span>
          <span className="font-bold">{gp(playerValue(p, team.rosterId))}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/60">Skill access</span>
          <span>
            Primary <b>{pos?.primary.join(' ') || '–'}</b> · Secondary <b>{pos?.secondary.join(' ') || '–'}</b>
          </span>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl font-black text-gold">{st.spp} <span className="text-base font-semibold text-white/60">SPP</span></div>
            <div className="text-xs text-white/50">
              {st.sppEarned} earned · {st.sppSpent} spent · {n}/6 advancements
            </div>
          </div>
          <Button disabled={n >= 6 || (p.status !== 'active' && p.status !== 'journeyman')} onClick={() => setAdvOpen(true)}>
            ★ Advance
          </Button>
        </div>
        {n < 6 && (
          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
            <CostBox label="Rand. primary" cost={settings.advCost.randomPrimary[n]} spp={st.spp} />
            <CostBox label="Primary" cost={settings.advCost.chosenPrimary[n]} spp={st.spp} />
            <CostBox label="Secondary" cost={settings.advCost.chosenSecondary[n]} spp={st.spp} />
            <CostBox label="Stat" cost={settings.advCost.characteristic[n]} spp={st.spp} />
          </div>
        )}
      </Card>

      <H2>Career</H2>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="Games" v={st.games} />
        <Stat label="TD" v={st.td} />
        <Stat label="CAS" v={st.cas} />
        <Stat label="Comp" v={st.completion} />
        <Stat label="Int" v={st.interception} />
        <Stat label="MVP" v={st.mvp} />
        <Stat label="KO dealt" v={st.ko} />
        <Stat label="Blocks" v={st.block} />
        <Stat label="Fouls" v={st.foul} />
        <Stat label="Sent off" v={st.sentoff} />
        <Stat label="CAS taken" v={st.casSuffered} />
        <Stat label="Blunders" v={st.fails} />
      </div>

      {p.advancements.length > 0 && (
        <>
          <H2>Advancements</H2>
          <Card className="space-y-1 text-sm">
            {p.advancements.map((a, i) => (
              <button key={a.id} onClick={() => setEditAdv(a)} className="flex w-full justify-between text-left active:bg-white/5">
                <span>
                  {i + 1}. {a.kind === 'stat' ? `+1 ${STAT_LABEL[a.stat!]}` : a.skill} <span className="text-white/40">({a.random ? 'random ' : ''}{a.kind})</span>
                  {a.scoutRoll != null && <span className="text-xs text-white/40"> · scout {a.scoutRoll}</span>}
                </span>
                <span className="text-white/50">
                  {a.spp} SPP · +{gp(a.value)} ✎
                </span>
              </button>
            ))}
            <button
              className="pt-1 text-xs text-red-300"
              onClick={async () => {
                if (confirm('Undo the last advancement? Its SPP are refunded.')) await db.players.update(p.id, { advancements: p.advancements.slice(0, -1) })
              }}
            >
              Undo last advancement
            </button>
          </Card>
        </>
      )}

      <H2>Highlights</H2>
      {myEvents.length === 0 && <div className="px-1 text-sm text-white/40">Nothing yet. Go make history.</div>}
      <Card className="space-y-1.5 text-sm">
        {matches
          .filter((m) => m.mvpPlayerId === p.id)
          .map((m) => (
            <div key={`mvp${m.id}`}>
              🏆 MVP vs <Link className="underline" to={`/match/${m.id}`}>{m.opponent.name}</Link>
            </div>
          ))}
        {myEvents
          .filter((e) => !['block', 'knockdown', 'armour', 'reroll', 'foul'].includes(e.type) || (e.side === 'us' && e.type === 'foul'))
          .map((e) => {
            const m = matches.find((x) => x.id === e.matchId)
            const label = e.side === 'them' ? (e.type === 'cas' ? `🩹 Suffered ${e.result ? CAS_NAMES[e.result] : 'casualty'}` : e.type === 'ko' ? '😵 Knocked out' : `😬 ${e.type}`) : EVENT_LABEL[e.type] ?? e.type
            return (
              <div key={e.id} className="flex justify-between gap-2">
                <span>{label}{e.side === 'us' && e.type === 'cas' && e.result ? ` (${CAS_NAMES[e.result]})` : ''}</span>
                <span className="shrink-0 text-xs text-white/40">
                  vs {m?.opponent.name} · H{e.half} T{e.turn}
                </span>
              </div>
            )
          })}
      </Card>
      <div className="px-1 text-xs text-white/30">Hired {fmtDate(p.hiredAt)}</div>

      <AdvanceSheet open={advOpen} onClose={() => setAdvOpen(false)} p={p} team={team} settings={settings} spp={st.spp} />
      {editOpen && <EditPlayerSheet onClose={() => setEditOpen(false)} p={p} team={team} draft={isDraft(team, matches.length)} />}
      {editAdv && <EditAdvSheet key={editAdv.id} a={editAdv} p={p} onClose={() => setEditAdv(null)} />}
    </Page>
  )
}

function SkillChip({ name, gained }: { name: string; gained?: boolean }) {
  const url = skillUrl(name)
  const elite = findSkill(name)?.elite
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`rounded-lg px-2 py-1 text-xs ${gained ? 'bg-gold/20 font-semibold text-gold' : 'bg-white/10 text-white/80'}`}>
      {name}
      {elite && ' ◆'}
    </a>
  )
}
function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-xl bg-panel py-2">
      <div className="text-lg font-bold">{v}</div>
      <div className="text-[10px] uppercase text-white/40">{label}</div>
    </div>
  )
}
function CostBox({ label, cost, spp }: { label: string; cost: number; spp: number }) {
  return (
    <div className={`rounded-lg py-1 ${spp >= cost ? 'bg-turf/30 text-green-200' : 'bg-white/5 text-white/40'}`}>
      <div className="font-bold">{cost}</div>
      {label}
    </div>
  )
}

type AdvKind = 'randomPrimary' | 'chosenPrimary' | 'chosenSecondary' | 'characteristic'
const FORBIDDEN = SEVENS.forbiddenSkills as readonly string[]

function AdvanceSheet({ open, onClose, p, team, settings, spp }: { open: boolean; onClose: () => void; p: Player; team: Team; settings: LeagueSettings; spp: number }) {
  const [kind, setKind] = useState<AdvKind | null>(null)
  const [cat, setCat] = useState<SkillCategory | null>(null)
  const [skill, setSkill] = useState<string>('')
  const [d16, setD16] = useState<number | undefined>()
  const [stat, setStat] = useState<Stat | 'primary' | 'secondary' | null>(null)
  const [scout, setScout] = useState<{ advId: string; count: number; roll?: number } | null>(null)
  const pos = getPositional(team.rosterId, p.position)
  const owned = new Set(profile(p, team.rosterId).skills.map((s) => s.split(' (')[0].toLowerCase()))
  const blocked = (name: string) => owned.has(name.toLowerCase()) || FORBIDDEN.includes(name)
  const n = p.advancements.length
  const cost = kind ? settings.advCost[kind][n] : 0
  const reset = () => {
    setKind(null); setCat(null); setSkill(''); setD16(undefined); setStat(null); setScout(null)
  }
  const close = () => { reset(); onClose() }
  const v = settings.valueIncrease

  const rollRandom = (c: SkillCategory) => {
    const list = skillsInCategory(c)
    if (!list.some((s) => !blocked(s.name))) return
    let s
    do s = list[(d(6) > 3 ? 6 : 0) + d(6) - 1]
    while (blocked(s.name))
    setSkill(s.name)
  }

  const save = async () => {
    let adv: Advancement
    const base = { id: uid(), spp: cost, at: Date.now(), random: kind === 'randomPrimary' }
    const elite = (name: string) => (findSkill(name)?.elite ? v.elite : 0)
    if (kind === 'characteristic' && (stat === 'primary' || stat === 'secondary')) {
      adv = { ...base, kind: stat, skill, value: (stat === 'primary' ? v.primary : v.secondary) + elite(skill) }
    } else if (kind === 'characteristic' && stat) {
      adv = { ...base, kind: 'stat', stat: stat as Stat, value: v[stat as Stat] }
    } else if (kind === 'randomPrimary') {
      adv = { ...base, kind: 'primary', skill, value: v.randomPrimary + elite(skill) }
    } else {
      const isPrimary = kind === 'chosenPrimary'
      adv = { ...base, kind: isPrimary ? 'primary' : 'secondary', skill, value: (isPrimary ? v.primary : v.secondary) + elite(skill) }
    }
    await db.players.update(p.id, { advancements: [...p.advancements, adv] })
    setScout({ advId: adv.id, count: n + 1 })
  }

  const setScoutRoll = async (roll: number) => {
    if (!scout) return
    setScout({ ...scout, roll })
    const cur = (await db.players.get(p.id))!
    await db.players.update(p.id, { advancements: cur.advancements.map((a) => (a.id === scout.advId ? { ...a, scoutRoll: roll } : a)) })
  }
  const scouted = scout?.roll != null && scout.roll <= scout.count
  const compensation = pos?.cost ?? 0

  const cats: SkillCategory[] = (kind === 'chosenSecondary' || stat === 'secondary' ? pos?.secondary : pos?.primary) ?? []
  const needSkill = kind && kind !== 'characteristic' ? true : stat === 'primary' || stat === 'secondary'
  const canSave = kind && (needSkill ? !!skill : !!stat)
  const statOk = (s: Stat) => statDelta(p, s).imp < 2

  if (scout) {
    return (
      <Sheet open={open} onClose={close} title="Scouting roll">
        <div className="space-y-3">
          <div className="text-sm text-white/70">
            Every player who spends SPP rolls a D6. If the roll is <b>≤ {scout.count}</b> (his number of advancements), talent scouts buy him: he leaves and you get his purchase price ({gp(compensation)}).
          </div>
          <DiceInput label="Scouting D6" value={scout.roll} onChange={setScoutRoll} />
          {scout.roll != null && !scouted && <div className="rounded-xl bg-turf/30 p-3 text-center font-bold text-green-200">Stays with the team! 🎉</div>}
          {scouted && (
            <div className="space-y-2">
              <div className="rounded-xl bg-blood/30 p-3 text-center font-bold text-red-200">🕵️ Scouted!</div>
              <Button
                variant="danger"
                className="w-full"
                onClick={async () => {
                  await db.transaction('rw', db.players, db.teams, async () => {
                    await db.players.update(p.id, { status: 'scouted' })
                    const t = (await db.teams.get(team.id))!
                    await db.teams.update(team.id, { treasury: t.treasury + compensation })
                  })
                  close()
                }}
              >
                He leaves (+{gp(compensation)} to treasury)
              </Button>
              {team.lawyer && !team.lawyerUsed && (
                <Button
                  variant="soft"
                  className="w-full"
                  onClick={async () => {
                    await db.teams.update(team.id, { lawyerUsed: true })
                    close()
                  }}
                >
                  ⚖️ Goblin lawyer: keep him (once per season)
                </Button>
              )}
            </div>
          )}
          <Button variant={scout.roll == null || !scouted ? 'primary' : 'ghost'} className="w-full" onClick={close}>
            {scout.roll == null ? 'Skip for now' : scouted ? 'Decide later' : 'Done'}
          </Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={close} title="Advance player">
      {!kind && (
        <div className="space-y-2">
          {(['randomPrimary', 'chosenPrimary', 'chosenSecondary', 'characteristic'] as AdvKind[]).map((k) => {
            const c = settings.advCost[k][n]
            const label = { randomPrimary: 'Random Primary skill', chosenPrimary: 'Chosen Primary skill', chosenSecondary: 'Chosen Secondary skill', characteristic: 'Characteristic improvement (D16)' }[k]
            const val = { randomPrimary: v.randomPrimary, chosenPrimary: v.primary, chosenSecondary: v.secondary, characteristic: 0 }[k]
            return (
              <button key={k} onClick={() => setKind(k)} className="flex w-full justify-between rounded-xl bg-white/5 p-3 text-left active:bg-white/10">
                <span>
                  {label}
                  {val > 0 && <span className="text-xs text-white/40"> · +{gp(val)}</span>}
                </span>
                <span className={c <= spp ? 'font-bold text-gold' : 'text-red-300'}>{c} SPP</span>
              </button>
            )
          })}
          <div className="text-xs text-white/50">You have {spp} SPP. If you can't afford it, the app warns you but still lets you record it.</div>
        </div>
      )}

      {kind === 'characteristic' && (
        <div className="space-y-3">
          <DiceInput label="Characteristic roll" sides={16} value={d16} onChange={(x) => { setD16(x); setStat(null) }} />
          {d16 && (
            <div className="flex flex-wrap gap-2">
              {charImprovementFor(d16).map((s) => (
                <button key={s} disabled={!statOk(s)} onClick={() => setStat(s)} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-30 ${stat === s ? 'bg-turf' : 'bg-white/10'}`}>
                  +1 {STAT_LABEL[s]} <span className="text-xs text-white/60">+{gp(v[s])}</span>
                </button>
              ))}
              <button onClick={() => { setStat('primary'); setSkill('') }} className={`rounded-lg px-3 py-2 text-sm ${stat === 'primary' ? 'bg-turf' : 'bg-white/10'}`}>
                Primary skill instead
              </button>
              <button onClick={() => { setStat('secondary'); setSkill('') }} className={`rounded-lg px-3 py-2 text-sm ${stat === 'secondary' ? 'bg-turf' : 'bg-white/10'}`}>
                Secondary skill instead
              </button>
            </div>
          )}
        </div>
      )}

      {needSkill && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button key={c} onClick={() => { setCat(c); setSkill('') }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${cat === c ? 'bg-turf' : 'bg-white/10'}`}>
                {CATEGORY_NAMES[c]}
              </button>
            ))}
          </div>
          {cat && kind === 'randomPrimary' && (
            <Button variant="soft" className="w-full" onClick={() => rollRandom(cat)}>
              🎲 Roll on the {CATEGORY_NAMES[cat]} table (D6 + D6)
            </Button>
          )}
          {cat && (
            <Field label={kind === 'randomPrimary' ? 'Result (or select what you rolled)' : 'Skill'}>
              <select className={inputCls} value={skill} onChange={(e) => setSkill(e.target.value)}>
                <option value="">Choose…</option>
                {skillsInCategory(cat).map((s, i) => (
                  <option key={s.name} value={s.name} disabled={blocked(s.name)}>
                    {kind === 'randomPrimary' ? `${i < 6 ? '1-3' : '4-6'}/${(i % 6) + 1}: ` : ''}
                    {s.name}
                    {s.elite ? ' ◆' : ''}
                    {FORBIDDEN.includes(s.name) ? ' (forbidden)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {skill && (
            <div className="rounded-xl bg-gold/10 p-3 text-center text-lg font-bold text-gold">
              {skill}
              <a className="ml-2 text-xs font-normal underline" href={skillUrl(skill)} target="_blank" rel="noreferrer">rules</a>
            </div>
          )}
        </div>
      )}

      {kind && (
        <div className="mt-4 flex gap-2">
          <Button variant="soft" className="flex-1" onClick={reset}>
            Back
          </Button>
          <Button className="flex-1" disabled={!canSave} onClick={save}>
            Spend {cost} SPP{cost > spp ? ' ⚠️' : ''}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

/** Edit or delete one advancement (SPP cost, value, skill). */
function EditAdvSheet({ a, p, onClose }: { a: Advancement; p: Player; onClose: () => void }) {
  const [x, setX] = useState<Advancement>(a)
  const write = (list: Advancement[]) => db.players.update(p.id, { advancements: list })
  return (
    <Sheet open onClose={onClose} title="Edit advancement">
      <div className="space-y-3">
        {x.kind === 'stat' ? (
          <Field label="Characteristic">
            <select className={inputCls} value={x.stat} onChange={(e) => setX({ ...x, stat: e.target.value as Stat })}>
              {(['ma', 'st', 'ag', 'pa', 'av'] as Stat[]).map((s) => (
                <option key={s} value={s}>+1 {STAT_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Skill">
            <input className={inputCls} value={x.skill ?? ''} onChange={(e) => setX({ ...x, skill: e.target.value })} />
          </Field>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Field label="SPP spent"><NumberInput value={x.spp} onChange={(v) => setX({ ...x, spp: v })} /></Field>
          <Field label="Value (k)"><NumberInput value={x.value / 1000} onChange={(v) => setX({ ...x, value: v * 1000 })} /></Field>
          <Field label="Scout roll"><NumberInput value={x.scoutRoll ?? 0} onChange={(v) => setX({ ...x, scoutRoll: v || undefined })} /></Field>
        </div>
        <Toggle label="Random skill" checked={x.random} onChange={(v) => setX({ ...x, random: v })} />
        <div className="flex gap-2">
          <Button variant="danger" onClick={async () => { await write(p.advancements.filter((y) => y.id !== a.id)); onClose() }}>
            Delete
          </Button>
          <Button className="flex-1" onClick={async () => { await write(p.advancements.map((y) => (y.id === a.id ? x : y))); onClose() }}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function EditPlayerSheet({ onClose, p, team, draft }: { onClose: () => void; p: Player; team: Team; draft: boolean }) {
  const nav = useNavigate()
  const [name, setName] = useState(p.name)
  const [number, setNumber] = useState(p.number)
  const [position, setPosition] = useState(p.position)
  const [sppAdjust, setSppAdjust] = useState(p.sppAdjust)
  const [valueAdjust, setValueAdjust] = useState(p.valueAdjust)
  const [extra, setExtra] = useState(p.extraSkills.join(', '))
  const save = async () => {
    await db.players.update(p.id, {
      name, number, position, sppAdjust, valueAdjust,
      extraSkills: extra.split(',').map((s) => s.trim()).filter(Boolean),
    })
    onClose()
  }
  const setStatus = async (status: PlayerStatus) => {
    await db.players.update(p.id, { status, ...(status === 'active' ? { journeyman: false } : {}) })
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Edit player">
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <Field label="#">
            <NumberInput value={number} onChange={setNumber} />
          </Field>
          <div className="col-span-3">
            <Field label="Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
        </div>
        <Field label="Position">
          <select className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)}>
            {getRoster(team.rosterId)?.positionals.map((x) => (
              <option key={x.name}>{x.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Extra skills/traits without value change (comma separated, e.g. Hatred (Elf))">
          <input className={inputCls} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="SPP correction (+/−)">
            <NumberInput value={sppAdjust} onChange={setSppAdjust} />
          </Field>
          <Field label="Value correction (gp)">
            <NumberInput value={valueAdjust} onChange={setValueAdjust} />
          </Field>
        </div>
        <Button className="w-full" onClick={save}>
          Save
        </Button>
        {isLinemanName(team.rosterId, p.position) && <Toggle label="Veteran (one Lineman per team)" checked={p.veteran} onChange={(v) => setVeteran(team, p, v)} />}
        <Toggle label="Misses next game" checked={p.missNextGame} onChange={(v) => db.players.update(p.id, { missNextGame: v })} />
        <Toggle label="Journeyman (Loner 5+)" checked={!!p.journeyman} onChange={(v) => db.players.update(p.id, { journeyman: v })} />
        <H2>Injuries</H2>
        <div className="flex flex-wrap gap-2">
          {p.injuries.map((i) => (
            <button key={i.id} onClick={() => db.players.update(p.id, { injuries: p.injuries.filter((x) => x.id !== i.id) })} className="rounded-lg bg-blood/30 px-2.5 py-1.5 text-sm">
              {i.kind === 'niggling' ? 'Niggling' : `−1 ${STAT_LABEL[i.stat!]}`} ✕
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" onClick={() => db.players.update(p.id, { injuries: [...p.injuries, { id: uid(), kind: 'niggling', at: Date.now() }] })}>
            + Niggling
          </Button>
          {(['ma', 'st', 'ag', 'pa', 'av'] as Stat[]).map((s) => (
            <Button key={s} variant="soft" className="!px-2.5" onClick={() => db.players.update(p.id, { injuries: [...p.injuries, { id: uid(), kind: 'stat', stat: s, at: Date.now() }] })}>
              −1 {STAT_LABEL[s]}
            </Button>
          ))}
        </div>
        <H2>Status: {p.status}</H2>
        <div className="flex flex-wrap gap-2">
          {p.status !== 'active' && <Button variant="soft" onClick={() => setStatus('active')}>Back on roster</Button>}
          {p.status !== 'fired' && <Button variant="soft" onClick={() => setStatus('fired')}>Fire</Button>}
          {p.status !== 'retired' && <Button variant="soft" onClick={() => setStatus('retired')}>Retire</Button>}
          {p.status !== 'scouted' && <Button variant="soft" onClick={() => setStatus('scouted')}>🕵️ Scouted</Button>}
          {p.status !== 'dead' && <Button variant="danger" onClick={() => setStatus('dead')}>💀 Dead</Button>}
          {draft && (
            <Button
              variant="danger"
              onClick={async () => {
                await removePlayer(team, p, true)
                nav(`/team/${team.id}`)
              }}
            >
              Remove (refund)
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
