import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { CATEGORY_NAMES, skillsInCategory } from '../rules/data'
import {
  APOTHECARY_RULES, CASUALTY, CHAR_IMPROVEMENT, EXPENSIVE_MISTAKES, INDUCEMENTS, INJURY_ROLL, KICKOFF, LASTING_INJURY, MISTAKE_BANDS, MISTAKE_NAMES, MISTAKE_TEXT,
  PASS_RANGE_NAMES, PASS_TEMPLATE, PRAYERS, REFEREE_RULE, SEVENS, STAT_LABEL, STUNTY_INJURY_ROLL, WEATHER, type MistakeResult, type PassRange, type Table,
} from '../rules/sevens'
import type { SkillCategory } from '../rules/types'
import { gp } from '../logic/format'
import { Card, Page, useSettings } from '../components/ui'

const SECTIONS: [string, string][] = [
  ['prematch', 'Pre-match'], ['kickoff', 'Kick-off'], ['weather', 'Weather'], ['injury', 'Injuries'], ['prayers', 'Prayers'], ['postmatch', 'Post-match'],
  ['mistakes', 'Exp. Mistakes'], ['spp', 'SPP & skills'], ['pass', 'Pass template'], ['start', 'League start'], ['season', 'Season'],
]

export default function Rules() {
  const loc = useLocation()
  const s = useSettings()
  useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [loc.hash])
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <Page title="League rules" sub="Verfassung Vol. 3 · Season 3 — overrides the official rules" back={true}>
      <div className="sticky top-[57px] z-10 -mx-3 flex gap-1.5 overflow-x-auto bg-ink/95 px-3 py-2 backdrop-blur">
        {SECTIONS.map(([id, l]) => (
          <button key={id} onClick={() => go(id)} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold active:bg-white/20">
            {l}
          </button>
        ))}
      </div>

      <Section id="prematch" kicker="Chapter 3" title="Pre-match sequence">
        <Steps
          steps={[
            ['Star Player hiring', 'Both coaches may hire their Star Player for the match. Announce the decision at the same time so it stays fair. Details: separate Star Player document.'],
            ['Fan Factor', 'Each coach rolls a D3 and adds their Dedicated Fans = Fan Factor for the match. Affects a kick-off event and the winnings.'],
            ['Weather', 'Each coach rolls a D6; the total gives the weather for the match.'],
            ['Journeymen', "Can't field enough players (dead, fired, scouted)? Fill the open spots with free volunteers: Linemen only, with Loner (5+). They don't benefit from team re-rolls unless they pass a D6 Loner check. Journeymen earn SPP and may be bought after the match for the usual Lineman price."],
            ['Inducements', 'The underdog may buy inducements with Petty Cash = opponent team value − underdog team value. Unspent Petty Cash is lost after this step.'],
            ['Kick / receive', 'Both coaches roll off; the winner decides who kicks and who receives.'],
          ]}
          start={0}
        />
      </Section>

      <Section id="kickoff" kicker="Ref. G" title="Kick-off (2D6)">
        <TableList rows={KICKOFF} />
      </Section>

      <Section id="weather" kicker="Ref. F" title="Weather (2D6)">
        <div className="mb-2 text-xs text-white/50">Rolled before the game and again on Changing Weather.</div>
        <TableList rows={WEATHER} />
      </Section>

      <Section id="injury" kicker="Ref. E" title="Injury, casualties & apothecary">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Sub>Injury roll (2D6)</Sub>
            <TableList rows={INJURY_ROLL} compact />
          </div>
          <div>
            <Sub>Stunty injury roll (2D6)</Sub>
            <TableList rows={STUNTY_INJURY_ROLL} compact />
          </div>
        </div>
        <Sub>Casualty roll (D16)</Sub>
        <div className="mb-1 text-xs text-white/50">Modifiers: Niggling Injury +1, Decay +1. A Lasting Injury to a stat already at its minimum (or '-'): roll again. PA 6+ is the minimum, it can't become '-'.</div>
        <TableList rows={CASUALTY.map((c) => ({ roll: `${c.min}-${c.max}`, name: c.name, text: c.text }))} compact />
        <Sub>Lasting Injury (D6)</Sub>
        <TableList rows={LASTING_INJURY.map((l) => ({ roll: l.min === l.max ? `${l.min}` : `${l.min}-${l.max}`, name: l.name }))} compact />
        <Sub>Apothecary (0-1)</Sub>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
          {APOTHECARY_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <Sub>Referee</Sub>
        <div className="text-sm text-white/80">{REFEREE_RULE}</div>
      </Section>

      <Section id="prayers" kicker="Ref. B" title="Prayers to Nuffle (D16)">
        <div className="mb-2 text-xs text-white/50">In tournaments only the first 8 are used (D8).</div>
        <TableList rows={PRAYERS} />
      </Section>

      <Section id="postmatch" kicker="Chapter 4" title="Post-match sequence">
        <Steps
          start={1}
          steps={[
            ['Outcome', 'Both coaches record the result (win, loss, draw). Dead players are removed from the roster. If a coach conceded, the winner gets an extra touchdown (any player may receive its 3 SPP). Enter the result in the league table.'],
            ['Winnings', 'Ticket sales = (Fan Factor team 1 + Fan Factor team 2) × 10k, split equally between both coaches. Each coach also gets 10k per touchdown scored. If a coach conceded, the winner gets all the ticket sales.'],
            ['Dedicated Fans', 'Win: roll D6; if ≥ your Dedicated Fans, gain one. Loss: roll D6; if lower than your Dedicated Fans, lose one. Draw: nothing happens.'],
            ['Advancements', "Each coach picks a random player as MVP: +4 SPP (journeymen allowed, dead players not). Players spend SPP on skills and characteristics. Every player who spends SPP rolls a D6: if ≤ his number of advancements, he's scouted and leaves — you get his position's purchase price as compensation. Then update player values."],
            ['Hire & fire', 'Fire or hire players. Journeymen with SPP or advancements may be bought: Lineman price + value of their advancements. They lose Loner (5+) and become full team members.'],
            ['Expensive Mistakes', 'More than 100k in the treasury? Roll a D6 on the Expensive Mistakes table. The more gold, the bigger the risk.'],
            ['Prepare for next match', 'Work out the new team value. Players who miss the next game through injury are not counted.'],
          ]}
        />
      </Section>

      <Section id="mistakes" kicker="Ref. A" title="Expensive Mistakes (D6)">
        <div className="overflow-x-auto">
          <table className="w-full text-center text-[11px]">
            <thead>
              <tr className="text-white/50">
                <th className="py-1 text-left">D6</th>
                {MISTAKE_BANDS.map((b) => (
                  <th key={b} className="px-0.5 font-semibold">{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EXPENSIVE_MISTAKES.map((row, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-1.5 text-left font-black text-gold">{i + 1}</td>
                  {row.map((r, j) => (
                    <td key={j} className={`px-0.5 ${MISTAKE_TONE[r]}`}>{MISTAKE_SHORT[r]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 space-y-1 text-sm">
          {(Object.keys(MISTAKE_TEXT) as MistakeResult[]).map((r) => (
            <div key={r}>
              <b className={MISTAKE_TONE[r]}>{MISTAKE_NAMES[r].split(' (')[0]}:</b> <span className="text-white/70">{MISTAKE_TEXT[r]}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="spp" kicker="Ref. C" title="Star Player Points & skills">
        <Sub>SPP cost per advancement</Sub>
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="text-[11px] text-white/50">
              <th className="text-left">#</th>
              <th>Random primary</th>
              <th>Chosen primary</th>
              <th>Chosen secondary</th>
              <th>Charac&shy;teristic</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="py-1 text-left font-black text-gold">{i + 1}</td>
                <td>{s.advCost.randomPrimary[i]}</td>
                <td>{s.advCost.chosenPrimary[i]}</td>
                <td>{s.advCost.chosenSecondary[i]}</td>
                <td>{s.advCost.characteristic[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Sub>Earning SPP</Sub>
            <KV rows={[
              ['Completion', s.spp.completion], ['Superb TTM throw', s.spp.ttmThrow], ['TTM safe landing', s.spp.ttmLand], ['Interception', s.spp.interception],
              ['Casualty', s.spp.cas], ['Casualty on a Star Player*', s.spp.casStar], ['Touchdown', s.spp.td], ['MVP', s.spp.mvp],
            ].map(([k, v]) => [k as string, `${v} SPP`])} />
            <div className="mt-1 text-[11px] text-white/50">* House rule.</div>
          </div>
          <div>
            <Sub>Player value</Sub>
            <KV rows={[
              ['Random primary skill', gp(s.valueIncrease.randomPrimary)], ['Primary skill', gp(s.valueIncrease.primary)], ['Secondary skill', gp(s.valueIncrease.secondary)],
              ['Elite skill extra', gp(s.valueIncrease.elite)], ['+1 AV', gp(s.valueIncrease.av)], ['+1 MA / PA', gp(s.valueIncrease.ma)], ['+1 AG', gp(s.valueIncrease.ag)], ['+1 ST', gp(s.valueIncrease.st)],
            ].map(([k, v]) => [k, `+${v}`])} />
            <div className="mt-1 text-[11px] text-white/50">Elite: Block, Dodge, Guard, Mighty Blow.</div>
          </div>
        </div>
        <Sub>Characteristic improvement (D16)</Sub>
        <TableList compact rows={CHAR_IMPROVEMENT.map((c) => ({ roll: c.min === c.max ? `${c.min}` : `${c.min}-${c.max}`, name: c.stats.length === 5 ? 'Any' : c.stats.map((x) => `+1 ${STAT_LABEL[x]}`).join(' or ') }))} />
        <div className="text-[11px] text-white/50">You may take a chosen Primary or Secondary skill instead after rolling.</div>
        <Sub>Random skills (1st D6 + 2nd D6)</Sub>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-white/50">
                <th className="text-left">D6</th>
                {(['A', 'G', 'M', 'P', 'S', 'D'] as SkillCategory[]).map((c) => (
                  <th key={c} className="px-1 text-left font-semibold">{CATEGORY_NAMES[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => (
                <tr key={i} className={`border-t border-white/5 ${i === 6 ? 'border-white/20' : ''}`}>
                  <td className="whitespace-nowrap py-1 pr-1 font-bold text-gold">{i < 6 ? '1-3' : '4-6'} · {(i % 6) + 1}</td>
                  {(['A', 'G', 'M', 'P', 'S', 'D'] as SkillCategory[]).map((c) => {
                    const sk = skillsInCategory(c)[i]
                    const banned = sk && (SEVENS.forbiddenSkills as readonly string[]).includes(sk.name)
                    return <td key={c} className={`px-1 ${banned ? 'text-red-300 line-through' : ''}`}>{sk?.name}{sk?.elite ? ' ◆' : ''}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-white/50">◆ elite · Leader is forbidden in our league.</div>
      </Section>

      <Section id="pass" kicker="Ref. D" title="Pass template">
        <PassTemplate />
      </Section>

      <Section id="start" kicker="Chapter 2" title="League start">
        <div className="text-sm text-white/80">
          Each coach builds a team worth at most {gp(SEVENS.draftBudget)} under the normal Sevens rules — teams start with a team value of at most {gp(SEVENS.draftBudget)}. Every team starts with one Dedicated Fan that doesn't count towards team value. You also pick one Star Player for your roster (see the separate Star Player document).
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[['7-11', 'players'], ['0-4', 'positionals (rest Linemen)'], [gp(SEVENS.rerollCost), 're-roll'], ['✕ Leader', 'forbidden']].map(([a, b]) => (
            <div key={b} className="rounded-xl bg-turf/40 px-1 py-2">
              <div className="font-black text-gold">{a}</div>
              <div className="text-[10px] leading-tight text-white/70">{b}</div>
            </div>
          ))}
        </div>
        <Sub>Staff</Sub>
        <KV rows={[
          [`0-${SEVENS.maxAssistantCoaches} Assistant Coaches`, gp(SEVENS.assistantCoachCost)],
          [`0-${SEVENS.maxCheerleaders} Cheerleaders`, gp(SEVENS.cheerleaderCost)],
          ['0-1 Apothecary (or similar)', gp(SEVENS.apothecaryCost)],
          ['0-1 Goblin lawyer — keep one scouted player once per season', gp(SEVENS.lawyerCost)],
        ]} />
        <Sub>Inducements (Petty Cash only)</Sub>
        <KV rows={INDUCEMENTS.map((i) => [`0-${i.max} ${i.name}${i.note ? ` — ${i.note}` : ''}`, gp(i.cost(undefined))])} />
      </Section>

      <Section id="season" kicker="Chapter 1" title="Season 3">
        <div className="space-y-2 text-sm text-white/80">
          <p>Regular Season over three months, at most 24 games per coach, then the Play-offs.</p>
          <p>Each month every coach may play one ranked game against every other coach (9 coaches → max 8 games a month) to collect league points. Coaches arrange games themselves. Missed games from earlier months may be made up.</p>
        </div>
        <Sub>Play-offs (top 8)</Sub>
        <KV rows={[
          ['Free For All Wildcard Brawl', 'Places 5-8'],
          ['Quarter-final', 'Wildcard vs 4th'],
          ['Semi-final', '1st vs quarter-finalist'],
          ['Semi-final', '2nd vs 3rd'],
          ['Final', 'Semi-final winners'],
        ]} />
        <div className="rounded-xl bg-gold/10 p-3 text-sm">🏆 <b className="text-gold">Champion's reward:</b> one free re-roll when building the team for the next season.</div>
      </Section>
      <div className="px-1 pb-6 text-[11px] text-white/30">Source: Blood Bowl Sevens League — Verfassung Vol. 3 · Season 3. Edit SPP and values in Settings.</div>
    </Page>
  )
}

const MISTAKE_SHORT: Record<MistakeResult, string> = { averted: '–', minor: '-D3×10', major: '-50%', catastrophe: 'Keep 2D6×10' }
const MISTAKE_TONE: Record<MistakeResult, string> = { averted: 'text-white/40', minor: 'text-amber-200', major: 'text-orange-400', catastrophe: 'text-red-400' }

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <Card className="space-y-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">{kicker}</div>
          <h2 className="text-xl font-black uppercase leading-tight">{title}</h2>
        </div>
        {children}
      </Card>
    </section>
  )
}
const Sub = ({ children }: { children: ReactNode }) => <div className="pt-2 text-xs font-bold uppercase tracking-wider text-white/50">{children}</div>

function TableList({ rows, compact }: { rows: Table[]; compact?: boolean }) {
  return (
    <div className="divide-y divide-white/5">
      {rows.map((r) => (
        <div key={r.roll + r.name} className={`flex gap-3 ${compact ? 'py-1' : 'py-2'}`}>
          <div className="w-10 shrink-0 text-right font-black text-gold">{r.roll}</div>
          <div className="min-w-0">
            <div className="text-sm font-bold">{r.name}</div>
            {r.text && <div className="text-xs leading-snug text-white/60">{r.text}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Steps({ steps, start }: { steps: [string, string][]; start: number }) {
  return (
    <div className="space-y-2">
      {steps.map(([t, d], i) => (
        <div key={t} className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-turf text-lg font-black text-gold">{i + start}</div>
          <div>
            <div className="font-bold">{t}</div>
            <div className="text-xs leading-snug text-white/60">{d}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <div className="divide-y divide-white/5 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 py-1">
          <span className="text-white/70">{k}</span>
          <span className="shrink-0 font-semibold">{v}</span>
        </div>
      ))}
    </div>
  )
}

const PT_COLOR: Record<PassRange, string> = { q: '#9acd32', s: '#ffd500', l: '#ff8c00', b: '#a52a2a', x: '#d3d3d3' }

function PassTemplate() {
  return (
    <div>
      <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
        {Array.from({ length: 14 }, (_, r) => 13 - r).map((dy) =>
          PASS_TEMPLATE[dy].map((c, dx) => (
            <div
              key={`${dy}-${dx}`}
              className="flex aspect-square items-center justify-center text-[9px] font-bold"
              style={{ background: dx === 0 && dy === 0 ? '#14532d' : PT_COLOR[c], color: c === 'b' || (dx === 0 && dy === 0) ? '#fff' : '#0008' }}
            >
              {dx === 0 && dy === 0 ? 'T' : dx === 0 ? dy : dy === 0 ? dx : ''}
            </div>
          )),
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {(Object.keys(PT_COLOR) as PassRange[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: PT_COLOR[k] }} />
            {PASS_RANGE_NAMES[k]}
          </span>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-white/50">Thrower at T. Count squares across and up to the target (any direction).</div>
    </div>
  )
}
