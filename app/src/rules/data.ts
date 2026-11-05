import teamsJson from '../data/teams.json'
import skillsJson from '../data/skills.json'
import type { Positional, Roster, SkillCategory, SkillDef } from './types'

export const ROSTERS = teamsJson as Roster[]
export const SKILLS = skillsJson as SkillDef[]

const rosterById = new Map(ROSTERS.map((r) => [r.id, r]))
export const getRoster = (id: string): Roster | undefined => rosterById.get(id)

export const getPositional = (rosterId: string, name: string): Positional | undefined =>
  getRoster(rosterId)?.positionals.find((p) => p.name === name)

export const isLineman = (p: Positional) => p.keywords.includes('Lineman')

export const CATEGORY_NAMES: Record<SkillCategory, string> = {
  A: 'Agility',
  D: 'Devious',
  G: 'General',
  M: 'Mutation',
  P: 'Passing',
  S: 'Strength',
  T: 'Trait',
}

/** Skills in a category, in Skill Table order (index 0-5 = 1st D6 1-3, index 6-11 = 1st D6 4-6). */
export const skillsInCategory = (c: SkillCategory) => SKILLS.filter((s) => s.category === c)

const skillByName = new Map(SKILLS.map((s) => [s.name.toLowerCase(), s]))
/** Finds a skill, tolerating values like "Loner (4+)" or "Hatred (Troll)". */
export function findSkill(name: string): SkillDef | undefined {
  const n = name.toLowerCase()
  return skillByName.get(n) ?? SKILLS.find((s) => s.name.includes('(') && n.startsWith(s.name.toLowerCase().split(' (')[0] + ' ('))
}
export const skillUrl = (name: string) => {
  const s = findSkill(name)
  return s ? `https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/#${s.anchor}` : undefined
}
