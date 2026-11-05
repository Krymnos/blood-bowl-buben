import { db } from '../db'

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(b)
  })

export async function buildBackup() {
  const photos = await db.photos.toArray()
  return {
    app: 'sevens-dugout',
    version: 1,
    exportedAt: new Date().toISOString(),
    teams: await db.teams.toArray(),
    players: await db.players.toArray(),
    matches: await db.matches.toArray(),
    events: await db.events.toArray(),
    settings: await db.settings.toArray(),
    photos: await Promise.all(photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) }))),
  }
}

export async function exportAll() {
  const data = await buildBackup()
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `sevens-dugout-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export async function importAll(text: string) {
  const data = JSON.parse(text)
  if (data.app !== 'sevens-dugout') throw new Error('Not a Sevens Dugout backup')
  const photos = await Promise.all((data.photos ?? []).map(async (p: { blob: string }) => ({ ...p, blob: await (await fetch(p.blob)).blob() })))
  await db.transaction('rw', [db.teams, db.players, db.matches, db.events, db.settings, db.photos], async () => {
    await Promise.all([db.teams.clear(), db.players.clear(), db.matches.clear(), db.events.clear(), db.settings.clear(), db.photos.clear()])
    await db.teams.bulkAdd(data.teams)
    await db.players.bulkAdd(data.players)
    await db.matches.bulkAdd(data.matches)
    await db.events.bulkAdd(data.events)
    await db.settings.bulkAdd(data.settings)
    await db.photos.bulkAdd(photos)
  })
}
