const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

const STYLES: Record<string, { first: string[]; a: string[]; b: string[] }> = {
  gnome: { first: ['Fizzwick', 'Nimble', 'Tobble', 'Pip', 'Zook', 'Glim', 'Bramwell', 'Dabble', 'Tink', 'Wizzle'], a: ['Gear', 'Copper', 'Moss', 'Spark', 'Thistle', 'Cog'], b: ['whistle', 'bottom', 'twist', 'bolt', 'nose', 'spanner'] },
  halfling: { first: ['Puddin', 'Bilbo', 'Merry', 'Tolly', 'Fatty', 'Sam'], a: ['Pie', 'Barrel', 'Honey', 'Mush'], b: ['crust', 'belly', 'foot', 'room'] },
  orc: { first: ['Grok', 'Urg', 'Snaga', 'Mogg', 'Gash', 'Ruk'], a: ['Skull', 'Bone', 'Teef', 'Iron'], b: ['krusha', 'smasha', 'basha', 'jaw'] },
  dwarf: { first: ['Thorin', 'Grimli', 'Borri', 'Durak', 'Kazrik'], a: ['Iron', 'Stone', 'Bronze', 'Grudge'], b: ['beard', 'helm', 'hammer', 'fist'] },
  elf: { first: ['Aerion', 'Faelwen', 'Liriel', 'Thalor', 'Ithil'], a: ['Silver', 'Moon', 'Swift', 'Star'], b: ['leaf', 'wind', 'song', 'blade'] },
  generic: { first: ['Hans', 'Bruno', 'Otto', 'Greta', 'Klaus', 'Vex', 'Mort', 'Sven'], a: ['Black', 'Grim', 'Red', 'Storm', 'Blood'], b: ['hand', 'boot', 'axe', 'bone', 'heart'] },
}

export function randomName(rosterId: string) {
  const key = rosterId.includes('gnome')
    ? 'gnome'
    : rosterId.includes('halfling')
      ? 'halfling'
      : /orc|goblin|snotling/.test(rosterId)
        ? 'orc'
        : rosterId.includes('dwarf')
          ? 'dwarf'
          : /elf|elven/.test(rosterId)
            ? 'elf'
            : 'generic'
  const s = STYLES[key]
  return `${pick(s.first)} ${pick(s.a)}${pick(s.b)}`
}
