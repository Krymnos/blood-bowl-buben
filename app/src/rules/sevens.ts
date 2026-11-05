import type { Roster, Stat } from './types'

/**
 * League rules: Blood Bowl Sevens + "Verfassung Vol. 3" (our league's house rules, which override the official rules).
 */
export const SEVENS = {
  draftBudget: 600_000,
  minPlayers: 7,
  maxPlayers: 11,
  maxNonLinemen: 4,
  rerollCost: 100_000,
  assistantCoachCost: 20_000,
  maxAssistantCoaches: 3,
  cheerleaderCost: 20_000,
  maxCheerleaders: 6,
  apothecaryCost: 80_000,
  lawyerCost: 30_000,
  startingFans: 1,
  minFans: 1,
  turnsPerHalf: 6,
  journeymanLoner: 'Loner (5+)',
  forbiddenSkills: ['Leader'],
  starPlayerDrumRefund: 50_000,
} as const

export interface Table<T = string> {
  roll: string
  name: string
  text?: string
  value?: T
}

/** Weather (2D6) — Verfassung Ref. F */
export const WEATHER: (Table & { min: number; max: number })[] = [
  { min: 2, max: 2, roll: '2', name: 'Sweltering Heat', text: 'Roll a D6 for each player on the pitch at the end of a drive. On a 1 the player collapses and may not be set up for the next kick-off.' },
  { min: 3, max: 3, roll: '3', name: 'Very Sunny', text: '-1 modifier on all passing rolls.' },
  { min: 4, max: 10, roll: '4-10', name: 'Perfect Conditions', text: 'No effect.' },
  { min: 11, max: 11, roll: '11', name: 'Pouring Rain', text: '-1 modifier to all catch, intercept and pick-up rolls.' },
  { min: 12, max: 12, roll: '12', name: 'Blizzard', text: 'Going For It (GFI) slips and is Knocked Down on a 1-2. Only Quick or Short passes.' },
]
export const weatherFor = (roll: number) => WEATHER.find((w) => roll >= w.min && roll <= w.max)!

/** Kick-off Event table (2D6) — Verfassung Ref. G */
export const KICKOFF: Table[] = [
  { roll: '2', name: 'Get the Ref', text: 'Each team immediately receives one free Bribe. It must be used by the end of the game or it is lost.' },
  { roll: '3', name: 'Time-out', text: "Kicking team's turn marker on turn 6, 7 or 8: both coaches move their marker back one space. Otherwise both move it forward one space." },
  { roll: '4', name: 'Solid Defense', text: 'D3+3 Open players on the kicking team may be moved and set up again in different locations (normal set-up rules).' },
  { roll: '5', name: 'High Kick', text: 'One Open player on the receiving team may immediately be placed in the square the ball will land in.' },
  { roll: '6', name: 'Cheering Fans', text: 'Both coaches roll D6 + Cheerleaders. Highest: first Block in their next turn gets an extra offensive assist. Tie: both.' },
  { roll: '7', name: 'Brilliant Coaching', text: 'Both coaches roll D6 + Assistant Coaches. Highest (tie: both) gains a free team re-roll for this drive. Lost if not used by the end of the drive.' },
  { roll: '8', name: 'Changing Weather', text: 'Roll again on the Weather table. If the result is Perfect Conditions, the ball scatters (3) in the air before landing.' },
  { roll: '9', name: 'Quick Snap', text: 'Receiving coach selects up to D3+3 Open players; each may move one square in any direction, even into the opposition half.' },
  { roll: '10', name: 'Charge!', text: 'Kicking coach selects up to D3+3 Open players for a free Move action, one at a time. One may Blitz instead, one may Throw Team-mate, one may Kick Team-mate. A player falling over or being knocked down ends the Charge.' },
  { roll: '11', name: 'Dodgy Snack', text: 'Both roll a D6. Lowest (tie: both) picks a random player on the pitch and rolls D6: 2+ = -1 MA and -1 AV for the drive; 1 = to the Reserves box for the drive (locked in the lavatory).' },
  { roll: '12', name: 'Pitch Invasion', text: 'Both roll D6 + Fan Factor. Lowest (tie: both) randomly selects D3 of their players on the pitch: placed Prone and Stunned.' },
]

/** Injury roll (2D6) — Verfassung Ref. E */
export const INJURY_ROLL: Table[] = [
  { roll: '2-7', name: 'Stunned', text: 'Sent to the Reserves box if the player is off the pitch.' },
  { roll: '8-9', name: "KO'd", text: 'Removed from the pitch and placed in the Knocked-out box.' },
  { roll: '10+', name: 'Casualty!', text: 'Removed from the pitch, placed in the Casualty box and suffers a Casualty roll.' },
]
export const STUNTY_INJURY_ROLL: Table[] = [
  { roll: '2-6', name: 'Stunned' },
  { roll: '7-8', name: "KO'd" },
  { roll: '9', name: 'Casualty (Badly Hurt)', text: 'Becomes a casualty but only suffers Badly Hurt (no Casualty roll).' },
  { roll: '10+', name: 'Casualty!', text: 'Casualty roll as normal.' },
]

/** Casualty table (D16) — Verfassung Ref. E. Modifiers: Niggling Injury +1, Decay +1. */
export type CasResult = 'bh' | 'sh' | 'si' | 'li' | 'dead'
export const CASUALTY: { min: number; max: number; result: CasResult; name: string; text: string }[] = [
  { min: 1, max: 6, result: 'bh', name: 'Badly Hurt', text: 'No long-term effect.' },
  { min: 7, max: 9, result: 'sh', name: 'Seriously Hurt', text: 'Miss next game.' },
  { min: 10, max: 12, result: 'si', name: 'Serious Injury', text: 'Miss next game + Niggling Injury.' },
  { min: 13, max: 14, result: 'li', name: 'Lasting Injury', text: 'Miss next game + characteristic reduction (D6).' },
  { min: 15, max: 16, result: 'dead', name: 'Dead', text: 'Far too dead to play Blood Bowl!' },
]
export const casualtyFor = (roll: number) =>
  CASUALTY.find((c) => Math.min(16, roll) >= c.min && Math.min(16, roll) <= c.max)!
export const CAS_NAMES: Record<CasResult, string> = Object.fromEntries(CASUALTY.map((c) => [c.result, c.name])) as Record<CasResult, string>

export const LASTING_INJURY: { min: number; max: number; name: string; stat: Stat }[] = [
  { min: 1, max: 2, name: 'Head Injury (-1 AV)', stat: 'av' },
  { min: 3, max: 3, name: 'Smashed Knee (-1 MA)', stat: 'ma' },
  { min: 4, max: 4, name: 'Broken Arm (-1 PA)', stat: 'pa' },
  { min: 5, max: 5, name: 'Neck Injury (-1 AG)', stat: 'ag' },
  { min: 6, max: 6, name: 'Dislocated Shoulder (-1 ST)', stat: 'st' },
]
export const lastingInjuryFor = (roll: number) => LASTING_INJURY.find((l) => roll >= l.min && roll <= l.max)!

export const APOTHECARY_RULES = [
  'Any team except Nurgle, Khemri, Necromantic and Undead.',
  'Once per match, may try to cure a friendly permanent player who has suffered a Casualty or been KO\'d, used immediately after the injury.',
  'Cannot heal Star Players, Journeymen or Mercenaries.',
  'With several (temporary) apothecaries, only one can be used per injury.',
  "KO'd on the pitch: becomes Stunned instead. KO'd off the pitch (crowd): goes to Reserves.",
  'Casualty: make a 2nd Casualty roll and choose which result applies. If the result is only Badly Hurt (even if it was the original), the player goes to the Reserves box.',
  'The Apothecary must be used before any other healing attempt (skills etc.).',
]
export const REFEREE_RULE = "Amateur Referee: when you argue the call, you succeed on a 5+ instead of a 6+, and your coach isn't thrown out on a natural 1."

/** Characteristic improvement (D16) — Verfassung Ref. C. May pick a Primary or Secondary skill instead after rolling. */
export const CHAR_IMPROVEMENT: { min: number; max: number; stats: Stat[] }[] = [
  { min: 1, max: 7, stats: ['ma', 'av'] },
  { min: 8, max: 13, stats: ['ma', 'pa', 'av'] },
  { min: 14, max: 14, stats: ['ag', 'pa'] },
  { min: 15, max: 15, stats: ['st', 'ag'] },
  { min: 16, max: 16, stats: ['ma', 'st', 'ag', 'pa', 'av'] },
]
export const charImprovementFor = (roll: number) => CHAR_IMPROVEMENT.find((c) => roll >= c.min && roll <= c.max)!.stats

export const STAT_LABEL: Record<Stat, string> = { ma: 'MA', st: 'ST', ag: 'AG', pa: 'PA', av: 'AV' }

export interface InducementDef {
  id: string
  name: string
  max: number
  cost: (r: Roster | undefined) => number
  available?: (r: Roster | undefined) => boolean
  note?: string
}

/** Inducements — Verfassung Ch. 2. Bought only with Petty Cash. */
export const INDUCEMENTS: InducementDef[] = [
  { id: 'cheer', name: 'Temporary Cheerleaders', max: 2, cost: () => 30_000 },
  { id: 'coach', name: 'Assistant Coaches', max: 2, cost: () => 30_000 },
  { id: 'keg', name: 'Bloodweiser Kegs', max: 2, cost: () => 50_000, note: '+1 to KO recovery' },
  { id: 'drum', name: 'Werbetrommel (promo drum)', max: 6, cost: () => 50_000, note: 'Refunds 50k when hiring a Star Player' },
  { id: 'apo', name: 'Temporary Apothecary', max: 2, cost: () => 100_000, available: (r) => !!r?.apothecary, note: 'Only teams with Apothecary access' },
  { id: 'bribe', name: 'Bribes', max: 3, cost: (r) => (r?.id === 'black_orc' || r?.id === 'goblin' ? 50_000 : 100_000), note: '50k for Black Orcs and Goblins' },
  { id: 'reroll', name: 'Extra Team Re-rolls', max: 8, cost: () => 200_000 },
  { id: 'wizard', name: 'Hireling Sports Wizard', max: 1, cost: () => 220_000, note: 'Same as rolling an 8 on the Desperate Measures table' },
  { id: 'chef', name: 'Halfling Master Chef', max: 1, cost: (r) => (r?.id === 'halfling' ? 100_000 : 300_000), note: '100k for Halflings' },
]

/** Prayers to Nuffle (D16) — Verfassung Ref. B. In tournaments only the first 8 (D8). */
export const PRAYERS: Table[] = [
  { roll: '1', name: 'Treacherous Trapdoor', text: 'A player landing on a trapdoor rolls a D6: on a 1 they are pushed into the crowd. If carrying the ball, it bounces.' },
  { roll: '2', name: 'Friends with the Ref', text: 'Argue the call results for this team are treated as 2-4 and 5-6 instead of 2-5 and 6 for the whole match.' },
  { roll: '3', name: 'Stiletto', text: 'One random player of yours taking part in the game gains Stab until the end of the game.' },
  { roll: '4', name: 'Iron Man', text: 'One chosen player gets +1 AV (max 11+) for the match.' },
  { roll: '5', name: 'Knuckle Dusters', text: 'One chosen player gets Mighty Blow (+1) for the match.' },
  { roll: '6', name: 'Bad Habits', text: 'D3 random opposition players gain Loner (2+) until the end of the game.' },
  { roll: '7', name: 'Greasy Cleats', text: 'One random opposition player has -1 MA until the end of the game.' },
  { roll: '8', name: 'Blessed Statue of Nuffle', text: 'One random player of yours gains Pro for the match.' },
  { roll: '9', name: 'Moles under the Pitch', text: 'Opposing players get -1 when going for it.' },
  { roll: '10', name: 'Perfect Passing', text: 'Your players earn 2 SPP per completion instead of 1.' },
  { roll: '11', name: 'Fan Interaction', text: 'Your players earn 1 SPP for catching the ball after a Pass action.' },
  { roll: '12', name: 'Necessary Violence', text: 'If an opposing player is eliminated after being pushed into the crowd, the pusher earns 2 SPP.' },
  { roll: '13', name: 'Fouling Frenzy', text: 'Your players earn 2 SPP for a Casualty caused by a Foul, exactly like a Block casualty.' },
  { roll: '14', name: 'Throw a Rock', text: 'Once per game, at the start of your turn: pick a random opposing player on the pitch and roll D6. On 4+ they are hit by a rock and immediately tackled.' },
  { roll: '15', name: 'Under Scrutiny', text: 'Opposing fouls that break armour are always seen by the referee, even without a double.' },
  { roll: '16', name: 'Intensive Training', text: 'One random player of yours gains a single Primary skill of your choice until the end of the game.' },
]

export type MistakeResult = 'averted' | 'minor' | 'major' | 'catastrophe'
const A = 'averted', Mi = 'minor', Ma = 'major', C = 'catastrophe'
/** EXPENSIVE_MISTAKES[d6-1][band] where band 0 = 100-195k ... 5 = 600k+ — Verfassung Ref. A */
export const EXPENSIVE_MISTAKES: MistakeResult[][] = [
  [Mi, Mi, Ma, Ma, C, C],
  [A, Mi, Mi, Ma, Ma, C],
  [A, A, Mi, Mi, Ma, Ma],
  [A, A, A, Mi, Mi, Ma],
  [A, A, A, A, Mi, Mi],
  [A, A, A, A, A, Mi],
]
export const MISTAKE_BANDS = ['100-195k', '200-295k', '300-395k', '400-495k', '500-595k', '600k+']
export const MISTAKE_NAMES: Record<MistakeResult, string> = {
  averted: 'Crisis Averted',
  minor: 'Minor Incident (lose D3 × 10k)',
  major: 'Major Incident (lose half, rounded down to 5k)',
  catastrophe: 'Catastrophe (keep only 2D6 × 10k)',
}
export const MISTAKE_TEXT: Record<MistakeResult, string> = {
  averted: 'Thanks to some careful management the team behaves itself for once!',
  minor: 'The team gets up to some mischief: lose D3 × 10k gold.',
  major: 'Half the gold in the treasury (rounded down to the nearest 5k) is lost to an unfortunate mishap.',
  catastrophe: 'The treasury is emptied, except for 2D6 × 10k gold sensibly squirreled away for just such an occasion.',
}
export const mistakeBand = (treasury: number) => (treasury < 100_000 ? -1 : Math.min(5, Math.floor(treasury / 100_000) - 1))

/**
 * Pass template — Verfassung Ref. D. PASS_TEMPLATE[dy][dx] for dy, dx = 0..13.
 * q = Quick, s = Short, l = Long, b = Long Bomb, x = out of range.
 */
const PT_ROWS = [
  'qqqqsssllllbbb', // 0
  'qqqqsssllllbbb', // 1
  'qqqssssllllbbx', // 2
  'qqssssslllbbbx', // 3
  'ssssssllllbbbx', // 4
  'sssssllllbbbxx', // 5
  'sssslllllbbbxx', // 6
  'llllllllbbbxxx', // 7
  'lllllllbbbbxxx', // 8
  'lllllbbbbbxxxx', // 9
  'lllbbbbbbxxxxx', // 10
  'bbbbbbbxxxxxxx', // 11
  'bbbbbxxxxxxxxx', // 12
  'bbxxxxxxxxxxxx', // 13
]
export type PassRange = 'q' | 's' | 'l' | 'b' | 'x'
export const PASS_TEMPLATE: PassRange[][] = PT_ROWS.map((r) => r.split('') as PassRange[])
export const PASS_RANGE_NAMES: Record<PassRange, string> = { q: 'Quick pass', s: 'Short pass', l: 'Long pass', b: 'Long bomb', x: 'Out of range' }

/** House-rule settings — all editable. Defaults are the league's Verfassung Vol. 3 values. */
export interface LeagueSettings {
  spp: { td: number; cas: number; casStar: number; completion: number; interception: number; deflection: number; mvp: number; ttmThrow: number; ttmLand: number }
  /** advancement costs: index = number of advancements already taken (0..5) */
  advCost: { randomPrimary: number[]; chosenPrimary: number[]; chosenSecondary: number[]; characteristic: number[] }
  valueIncrease: { randomPrimary: number; primary: number; secondary: number; elite: number; ma: number; st: number; ag: number; pa: number; av: number }
  rerollCostLeague: number
  winsPoints: number
  drawPoints: number
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  spp: { td: 3, cas: 2, casStar: 4, completion: 1, interception: 2, deflection: 0, mvp: 4, ttmThrow: 1, ttmLand: 1 },
  advCost: {
    randomPrimary: [3, 4, 6, 8, 10, 15],
    chosenPrimary: [6, 8, 12, 16, 20, 30],
    chosenSecondary: [10, 12, 16, 20, 24, 34],
    characteristic: [14, 16, 20, 24, 28, 38],
  },
  valueIncrease: { randomPrimary: 10_000, primary: 20_000, secondary: 40_000, elite: 10_000, ma: 20_000, st: 60_000, ag: 30_000, pa: 20_000, av: 10_000 },
  rerollCostLeague: 100_000,
  winsPoints: 3,
  drawPoints: 1,
}

export const LEVEL_NAMES = ['Rookie', 'Experienced', 'Veteran', 'Emerging Star', 'Star', 'Superstar', 'Legend']
