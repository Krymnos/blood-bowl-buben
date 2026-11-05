export type Stat = 'ma' | 'st' | 'ag' | 'pa' | 'av'
export type SkillCategory = 'A' | 'D' | 'G' | 'M' | 'P' | 'S' | 'T'

export interface Positional {
  name: string
  keywords: string[]
  min: number
  max: number
  ma: number
  st: number
  ag: string | null
  pa: string | null
  av: string | null
  skills: string[]
  primary: SkillCategory[]
  secondary: SkillCategory[]
  cost: number
}

export interface Roster {
  id: string
  name: string
  tier: number | null
  leagues: string[]
  specialRules: string[]
  rerollCost: number | null
  apothecary: boolean
  positionals: Positional[]
}

export interface SkillDef {
  name: string
  category: SkillCategory
  elite: boolean
  mandatory: boolean
  type: 'active' | 'passive'
  anchor: string
}
