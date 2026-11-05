import Dexie, { type EntityTable } from 'dexie'
import type { Stat } from './rules/types'
import type { CasResult, LeagueSettings, MistakeResult } from './rules/sevens'
import { DEFAULT_SETTINGS } from './rules/sevens'

export interface Team {
  id: number
  name: string
  rosterId: string
  coach: string
  color: string
  treasury: number
  rerolls: number
  assistantCoaches: number
  cheerleaders: number
  apothecary: boolean
  dedicatedFans: number
  createdAt: number
  notes?: string
  /** true once the draft is finished (left-over budget is gone, treasury starts at 0) */
  draftDone?: boolean
  /** Goblin-Rechtsanwalt: keep one scouted player per season */
  lawyer?: boolean
  lawyerUsed?: boolean
  /** the Star Player this team may hire before each match */
  starPlayer?: { name: string; cost: number; notes?: string }
}

export interface Advancement {
  id: string
  kind: 'primary' | 'secondary' | 'stat'
  skill?: string
  stat?: Stat
  random: boolean
  spp: number
  value: number
  at: number
  /** scouting D6 after spending SPP: ≤ number of advancements → scouted */
  scoutRoll?: number
}

export interface Injury {
  id: string
  kind: 'niggling' | 'stat'
  stat?: Stat
  matchId?: number
  at: number
}

export type PlayerStatus = 'active' | 'dead' | 'fired' | 'retired' | 'scouted' | 'journeyman' | 'released'

export interface Player {
  id: number
  teamId: number
  number: number
  name: string
  position: string
  veteran: boolean
  advancements: Advancement[]
  injuries: Injury[]
  /** skills added by hand (e.g. Hatred from Getting Even) — no value change */
  extraSkills: string[]
  missNextGame: boolean
  status: PlayerStatus
  sppAdjust: number
  valueAdjust: number
  hiredAt: number
  diedInMatch?: number
  /** free stand-in Lineman with Loner (5+) */
  journeyman?: boolean
}

export type MatchStatus = 'setup' | 'live' | 'post' | 'done'

export interface InducementPick {
  id: string
  qty: number
  cost: number
}

export interface Match {
  id: number
  teamId: number
  date: number
  status: MatchStatus
  opponent: { name: string; coach: string; rosterId: string; ctv: number }
  ourCtv: number
  /** players eligible to play this game (snapshot at setup) */
  played: number[]
  /** players that missed this game through injury (flags cleared on finish) */
  missing: number[]
  weather?: string
  fanFactor: { us: number; them: number }
  inducements: InducementPick[]
  pettyCash: number
  treasurySpent: number
  prayers: string[]
  desperate: string[]
  half: number
  turn: number
  score: { us: number; them: number }
  /** legacy (old winnings formula) */
  stalling: boolean
  /** who conceded (gave up) the match */
  conceded?: 'us' | 'them'
  /** who kicked off the first drive */
  kickingFirst?: 'us' | 'them'
  starHired?: { us: boolean; them: boolean }
  /** our star player's fee for this match */
  starFee?: number
  /** journeymen added for this match (player ids) */
  journeymen?: number[]
  /** Lineman position used for journeymen */
  jmPosition?: string
  /** journeymen the coach decided to buy after the match */
  hireJourneymen?: number[]
  winnings?: number
  fansBefore?: number
  fansRoll?: number
  fansAfter?: number
  mvpPlayerId?: number
  mistakeRoll?: number
  mistakeResult?: MistakeResult
  treasuryLoss?: number
  treasuryAfter?: number
  notes: string
  finishedAt?: number
}

export type EventType =
  | 'td' | 'completion' | 'interception' | 'deflection' | 'cas' | 'ko' | 'ttm_throw' | 'ttm_land'
  | 'block' | 'knockdown' | 'armour' | 'foul' | 'sentoff'
  | 'fail_dodge' | 'fail_rush' | 'fail_pickup' | 'fail_catch' | 'fail_pass' | 'nuffle'
  | 'catch' | 'reroll' | 'reroll_gain'
  | 'kickoff' | 'weather' | 'note'

export type CasCause = 'block' | 'foul' | 'crowd' | 'other'

export interface MatchEvent {
  id: number
  matchId: number
  teamId: number
  at: number
  half: number
  turn: number
  /** which team performed it */
  side: 'us' | 'them'
  type: EventType
  /** our acting player (side us) */
  playerId?: number
  /** our player on the receiving end (side them: casualty/KO suffered etc.) */
  victimId?: number
  cause?: CasCause
  result?: CasResult
  stat?: Stat
  /** casualty inflicted on an opposing Star Player (house rule: 4 SPP) */
  star?: boolean
  label?: string
  text?: string
}

export interface Photo {
  id: number
  matchId: number
  blob: Blob
  at: number
}

export interface SettingsRow {
  id: 'league'
  value: LeagueSettings
}

export const db = new Dexie('sevens-dugout') as Dexie & {
  teams: EntityTable<Team, 'id'>
  players: EntityTable<Player, 'id'>
  matches: EntityTable<Match, 'id'>
  events: EntityTable<MatchEvent, 'id'>
  photos: EntityTable<Photo, 'id'>
  settings: EntityTable<SettingsRow, 'id'>
}

db.version(1).stores({
  teams: '++id, name',
  players: '++id, teamId, status',
  matches: '++id, teamId, status, date',
  events: '++id, matchId, teamId, playerId, victimId, type',
  photos: '++id, matchId',
  settings: 'id',
})

export async function getSettings(): Promise<LeagueSettings> {
  const row = await db.settings.get('league')
  return mergeSettings(row?.value)
}

export function mergeSettings(v?: Partial<LeagueSettings>): LeagueSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...v,
    spp: { ...DEFAULT_SETTINGS.spp, ...v?.spp },
    advCost: { ...DEFAULT_SETTINGS.advCost, ...v?.advCost },
    valueIncrease: { ...DEFAULT_SETTINGS.valueIncrease, ...v?.valueIncrease },
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10)
