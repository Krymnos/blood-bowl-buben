import { db, uid, type Match, type MatchEvent, type Player } from './db'

const DAY = 86_400_000

/** Demo: a drafted Gnome Sevens team with two league games played. Returns the team id. */
export async function seedDemo(): Promise<number> {
  const now = Date.now()
  return db.transaction('rw', [db.teams, db.players, db.matches, db.events], async () => {
    const teamId = (await db.teams.add({
      name: 'Glimmerdell Gearwhackers',
      coach: 'Me',
      rosterId: 'gnome',
      color: '#7e22ce',
      treasury: 105_000,
      draftDone: true,
      starPlayer: { name: 'Grombrindal, the White Dwarf', cost: 210_000, notes: 'Star Player from the league document' },
      rerolls: 1,
      assistantCoaches: 1,
      cheerleaders: 0,
      apothecary: false,
      dedicatedFans: 2,
      createdAt: now - 21 * DAY,
    } as never)) as number

    const mk = (number: number, name: string, position: string, extra: Partial<Player> = {}) =>
      ({
        teamId, number, name, position, advancements: [], injuries: [], extraSkills: [], missNextGame: false,
        status: 'active', sppAdjust: 0, valueAdjust: 0, hiredAt: now - 21 * DAY, ...extra,
      }) as unknown as Player
    const ids = (await db.players.bulkAdd(
      [
        mk(1, 'Old Barkbottom', 'Altern Forest Treeman'),
        mk(2, 'Rusty', 'Woodland Fox'),
        mk(3, 'Fizzwick Sparkwhistle', 'Gnome Illusionist'),
        mk(4, 'Bramwell Copperbolt', 'Gnome Beastmaster'),
        mk(5, 'Tobble Mossnose', 'Gnome Lineman'),
        mk(6, 'Pip Thistletwist', 'Gnome Lineman'),
        mk(7, 'Zook Gearspanner', 'Gnome Lineman', {
          advancements: [{ id: uid(), kind: 'primary', skill: 'Sidestep', random: true, spp: 3, value: 10_000, scoutRoll: 4, at: now - 6 * DAY }],
        }),
        mk(8, 'Dabble Cogbottom', 'Gnome Lineman', { missNextGame: true }),
      ],
      { allKeys: true },
    )) as number[]
    const P = (n: number) => ids[n - 1]

    const base = {
      teamId, status: 'done', played: ids, missing: [], inducements: [], pettyCash: 0, treasurySpent: 0, prayers: [], desperate: [],
      half: 2, turn: 6, stalling: false, notes: '',
    }
    const m1 = (await db.matches.add({
      ...base,
      date: now - 14 * DAY,
      opponent: { name: 'Reikland Reserves', coach: 'Max', rosterId: 'human', ctv: 590_000 },
      ourCtv: 575_000,
      weather: 'Perfect Conditions',
      fanFactor: { us: 4, them: 5 },
      pettyCash: 15_000,
      prayers: ['Iron Man'],
      kickingFirst: 'them',
      score: { us: 2, them: 1 },
      winnings: 65_000, fansBefore: 1, fansRoll: 4, fansAfter: 2, mvpPlayerId: P(3), treasuryLoss: 0, treasuryAfter: 65_000,
      notes: 'Rusty the fox ran rings around the Blitzers. Old Barkbottom flattened their thrower.',
      finishedAt: now - 14 * DAY,
    } as unknown as Match)) as number
    const m2 = (await db.matches.add({
      ...base,
      date: now - 7 * DAY,
      opponent: { name: "Grimgut's Gobbos", coach: 'Lena', rosterId: 'goblin', ctv: 560_000 },
      ourCtv: 575_000,
      kickingFirst: 'us',
      weather: 'Pouring Rain',
      fanFactor: { us: 3, them: 3 },
      score: { us: 1, them: 2 },
      winnings: 40_000, fansBefore: 2, fansRoll: 3, fansAfter: 2, mvpPlayerId: P(7), mistakeRoll: 3, mistakeResult: 'averted', treasuryLoss: 0, treasuryAfter: 105_000,
      notes: 'Treeman threw Zook for a glorious TD, then the goblins fouled Dabble into the stands.',
      finishedAt: now - 7 * DAY,
    } as unknown as Match)) as number

    let t = now - 14 * DAY
    const ev = (matchId: number, half: number, turn: number, side: 'us' | 'them', type: MatchEvent['type'], extra: Partial<MatchEvent> = {}) =>
      ({ matchId, teamId, at: (t += 60_000), half, turn, side, type, ...extra }) as MatchEvent
    const events: MatchEvent[] = [
      ev(m1, 1, 1, 'us', 'kickoff', { label: 'High Kick' }),
      ev(m1, 1, 2, 'us', 'block', { playerId: P(1) }),
      ev(m1, 1, 3, 'us', 'completion', { playerId: P(3) }),
      ev(m1, 1, 3, 'us', 'reroll', { label: 'team' }),
      ev(m1, 1, 4, 'us', 'td', { playerId: P(2) }),
      ev(m1, 1, 5, 'us', 'kickoff', { label: 'Cheering Fans' }),
      ev(m1, 1, 5, 'them', 'cas', { victimId: P(6), cause: 'block', result: 'bh' }),
      ev(m1, 2, 1, 'us', 'kickoff', { label: 'Quick Snap' }),
      ev(m1, 2, 2, 'them', 'td'),
      ev(m1, 2, 3, 'us', 'cas', { playerId: P(1), cause: 'block', result: 'sh' }),
      ev(m1, 2, 4, 'us', 'ko', { playerId: P(1) }),
      ev(m1, 2, 5, 'us', 'td', { playerId: P(6) }),
      ev(m2, 1, 1, 'us', 'kickoff', { label: 'Changing Weather' }),
      ev(m2, 1, 1, 'us', 'weather', { label: 'Pouring Rain' }),
      ev(m2, 1, 2, 'us', 'fail_dodge', { playerId: P(3) }),
      ev(m2, 1, 2, 'us', 'reroll', { label: 'team' }),
      ev(m2, 1, 3, 'them', 'td'),
      ev(m2, 1, 4, 'us', 'ttm_throw', { playerId: P(1) }),
      ev(m2, 1, 4, 'us', 'ttm_land', { playerId: P(7) }),
      ev(m2, 1, 5, 'us', 'td', { playerId: P(7) }),
      ev(m2, 2, 1, 'us', 'kickoff', { label: 'Pitch Invasion' }),
      ev(m2, 2, 2, 'us', 'cas', { playerId: P(4), cause: 'block', result: 'bh' }),
      ev(m2, 2, 3, 'them', 'cas', { victimId: P(8), cause: 'foul', result: 'sh' }),
      ev(m2, 2, 4, 'us', 'nuffle', { playerId: P(2) }),
      ev(m2, 2, 6, 'them', 'td'),
      ev(m2, 2, 6, 'us', 'note', { text: 'Gobbo chainsaw nearly took out the Treeman. Nearly.' }),
    ]
    await db.events.bulkAdd(events)
    return teamId
  })
}
