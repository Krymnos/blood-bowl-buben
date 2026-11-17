// End-to-end test of league sync: an admin and a coach on separate "phones" (browser profiles),
// against the Auth + Firestore emulators. Run with `npm run e2e` (starts the emulators and the app).
// Needs Google Chrome (or set CHROME_PATH). Screenshots land in test/screenshots/.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const out = fileURLToPath(new URL('./screenshots', import.meta.url))
mkdirSync(out, { recursive: true })
const PORT = 5180
const base = `http://localhost:${PORT}/`
const appDir = fileURLToPath(new URL('../../app', import.meta.url))
const vite = spawn('npx', ['vite', '.', '--port', String(PORT), '--strictPort'], {
  cwd: appDir,
  env: { ...process.env, VITE_EMULATOR: '1', VITE_EMULATOR_ADMIN_UID: 'admin-uid' },
  stdio: 'ignore',
})
process.on('exit', () => vite.kill())
for (let i = 0; ; i++) {
  if (await fetch(base).then((r) => r.ok, () => false)) break
  if (i > 100) throw new Error('app dev server did not start')
  await new Promise((r) => setTimeout(r, 200))
}
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-buben'
const FS = 'http://127.0.0.1:8181/v1/projects/demo-buben/databases/(default)/documents'
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`)
  if (!ok) failures++
}

// reset emulators, create users with fixed uids
await fetch('http://127.0.0.1:8181/emulator/v1/projects/demo-buben/databases/(default)/documents', { method: 'DELETE' })
await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-buben/accounts', { method: 'DELETE' })
for (const [localId, email] of [['admin-uid', 'ron@example.com'], ['max-uid', 'max@example.com'], ['lena-uid', 'lena@example.com']]) {
  const r = await fetch(`${AUTH}/accounts`, { method: 'POST', headers: owner, body: JSON.stringify({ localId, email, password: 'secret123', displayName: localId }) })
  if (!r.ok) throw new Error(await r.text())
}
const fsList = async (path) => ((await (await fetch(`${FS}/${path}`, { headers: owner })).json()).documents ?? []).map((d) => d.name.split('/').slice(-1)[0])
const fsGet = async (path) => (await fetch(`${FS}/${path}`, { headers: owner })).json()

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
async function phone(name) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()))
  page.on('dialog', (d) => d.accept())
  page.shot = (f) => page.screenshot({ path: `${out}/${name}-${f}.png` })
  return page
}
const text = (page) => page.evaluate(() => document.body.innerText.toLowerCase())
async function click(page, label, sel = 'button') {
  for (let i = 0; i < 50; i++) {
    for (const b of await page.$$(sel)) if ((await b.evaluate((x) => x.textContent ?? '')).includes(label)) return b.click()
    await sleep(200)
  }
  await page.shot('fail')
  throw new Error(`no ${sel} "${label}"`)
}
async function waitText(page, t, ms = 15000) {
  for (let i = 0; i < ms / 200; i++) {
    if ((await text(page)).includes(t.toLowerCase())) return true
    await sleep(200)
  }
  return false
}
async function setup(page, email) {
  await page.goto(base, { waitUntil: 'networkidle0' })
  await click(page, 'Load demo')
  await sleep(800)
  await page.evaluate(() => localStorage.setItem('sd-league-on', 'true'))
  await page.goto(base + '#/league', { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForFunction(() => window.__emuSignIn, { timeout: 15000 })
  await page.evaluate((e) => window.__emuSignIn(e, 'secret123'), email)
}
async function typeInto(page, placeholder, value) {
  const el = await page.$(`input[placeholder="${placeholder}"]`)
  await el.evaluate((e) => e.select())
  await el.type(value)
}

// 1. admin joins directly
const A = await phone('admin')
await setup(A, 'ron@example.com')
check(await waitText(A, 'You are the league admin'), 'admin sees admin join form')
await typeInto(A, 'Your coach name', 'Ron')
await click(A, 'Join as admin')
check(await waitText(A, 'Leaders'), 'admin becomes member, league tabs shown')
await sleep(6000) // first sync after joining (3s)
const aTeams = await fsList('coaches/admin-uid/teams')
const aMatches = await fsList('coaches/admin-uid/matches')
check(aTeams.length === 1 && aMatches.length >= 1, `admin published ${aTeams.length} team(s), ${aMatches.length} match(es)`)
const coachDoc = await fsGet('coaches/admin-uid')
check(coachDoc.fields?.coach?.stringValue === 'Ron' && Object.keys(coachDoc.fields).sort().join() === 'coach,device,updatedAt', 'coach doc has coach name + device, nothing else')
check(!JSON.stringify(coachDoc).includes('example.com'), 'no email stored')

// 1b. admin fills in the participant list (coaches in the app or not)
await click(A, 'admin')
for (const [coach, team] of [['Max', 'Reikland Reserves'], ['Lena', "Grimgut's Gobbos"], ['Olaf', 'Nordmänner']]) {
  await click(A, '+ Add')
  await waitText(A, 'Add participant')
  await typeInto(A, 'Coach name', coach)
  await typeInto(A, 'Team name', team)
  await click(A, 'Save')
  await waitText(A, team)
}
await sleep(1000)
check((await fsList('participants')).length === 3, 'participant list saved')
await click(A, 'table')
await sleep(800)
const tblA = await text(A)
check(/reikland reserves\s+📝 max · not in the app\s+1\s/.test(tblA) && /nordmänner\s+📝 olaf · not in the app\s+0\s/.test(tblA), 'listed coaches not in the app get rows (with the games logged against them, or none yet)')
await A.shot('table-list')

// 2. coach requests to join
const B = await phone('max')
await setup(B, 'max@example.com')
check(await waitText(B, 'Who are you?'), 'non-member sees join form with the participant list')
await B.shot('join')
await click(B, 'Reikland Reserves')
await click(B, 'Request to join')
check(await waitText(B, 'Join request sent as Max'), 'request pending')
check((await fsGet('requests/max-uid')).fields?.participant?.stringValue?.length > 0, 'request names the picked participant')
check((await fsList('coaches/max-uid/teams')).length === 0, 'non-member published nothing')

// 3. admin approves
await A.evaluate(() => (location.hash = '#/league'))
await click(A, 'admin')
check(await waitText(A, 'Max'), 'admin sees the request')
await A.shot('admin-tab')
check(await A.$eval('select', (x) => x.options[x.selectedIndex].text) === 'Max · Reikland Reserves', 'approve form preselects the entry the coach picked')
await click(A, 'Approve')
check(await waitText(B, 'Leaders', 15000), 'coach becomes member live (no reload)')
const pids = await fsList('participants')
const linked = await Promise.all(pids.map((id) => fsGet(`participants/${id}`)))
check(linked.filter((x) => x.fields.uid?.stringValue === 'max-uid').length === 1, 'approval links Max to his entry')
await sleep(6000)
check((await fsList('coaches/max-uid/teams')).length === 1, 'coach published their team after approval')

// 4. league view on the coach's phone
await B.evaluate(() => (location.hash = '#/league'))
await click(B, 'table')
await sleep(1500)
await B.shot('table')
const tbl = await text(B)
check(tbl.includes('ron') && tbl.includes('max'), 'table lists both coaches’ teams')
check(!tbl.includes('reikland reserves') && /gearwhackers\s+max\s+2\s/.test(tbl), 'games logged against “Reikland Reserves” moved to Max’s team')
check(/grimgut's gobbos\s+📝 lena · not in the app\s+2\s/.test(tbl), 'Lena (not in the app) has the 2 games Ron and Max logged against her')
await click(B, 'teams')
await sleep(500)
await B.shot('teams')
await click(B, 'leaders')
await sleep(500)
await B.shot('leaders')
check((await text(B)).includes('touchdowns'), 'league leaderboards render')
// open Ron's team read-only
await click(B, 'teams')
await sleep(300)
const cards = await B.$$('div.cursor-pointer')
await cards[0].click()
await sleep(800)
check((await text(B)).includes('read-only') && (await text(B)).includes('coach ron'), 'read-only league team page opens (Ron’s team first)')
await B.shot('league-team')

// 5. pre-game opponent picker
await B.evaluate(() => (location.hash = '#/'))
await sleep(800)
const homeCards = await B.$$('div.cursor-pointer')
await homeCards[homeCards.length - 1].click()
await sleep(500)
await click(B, 'games')
await click(B, 'New match')
await click(B, 'Pick from the league')
check(await waitText(B, 'League opponents'), 'picker sheet opens')
check((await text(B)).includes('nordmänner') && (await text(B)).includes('not in the app'), 'picker lists participants not in the app')
await B.shot('picker')
const ronTeam = (await (await fetch(`${FS}/coaches/admin-uid/teams/${aTeams[0]}`, { headers: owner })).json()).fields.team.mapValue.fields.name.stringValue
await click(B, ronTeam, 'button.flex')
await sleep(800)
const oppName = await B.$eval('input[placeholder="e.g. Reikland Reserves"]', (x) => x.value)
check(oppName === ronTeam && (await text(B)).includes('linked to league team'), `opponent filled from league (${oppName}) and linked`)
await B.shot('pregame-linked')

// 5b. a coach who played on paper joins later: picks her entry, her games move to her team
const C = await phone('lena')
await setup(C, 'lena@example.com')
check(await waitText(C, 'Who are you?'), 'Lena sees join form')
// her phone: one team under another name, no games of her own
await C.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('sevens-dugout')
  r.onerror = rej
  r.onsuccess = () => {
    const tx = r.result.transaction(['teams', 'matches', 'events'], 'readwrite')
    tx.objectStore('matches').clear()
    tx.objectStore('events').clear()
    const ts = tx.objectStore('teams')
    ts.getAll().onsuccess = (e) => e.target.result.forEach((t) => ts.put({ ...t, name: 'Grünhaut Gang', coach: 'Lena' }))
    tx.oncomplete = () => (r.result.close(), res())
  }
}))
await C.reload({ waitUntil: 'domcontentloaded' })
await waitText(C, 'Who are you?')
check(!(await text(C)).includes('reikland reserves'), 'taken entries are not offered')
await click(C, "Grimgut's Gobbos")
await click(C, 'Request to join')
await A.evaluate(() => (location.hash = '#/league'))
await click(A, 'admin')
await waitText(A, 'Plays in the league as')
await A.shot('approve-lena')
await click(A, 'Approve')
check(await waitText(C, 'Leaders', 15000), 'Lena becomes member')
await sleep(6000)
await click(C, 'table')
await sleep(1000)
const tblC = await text(C)
check(!tblC.includes("grimgut's gobbos") && /grünhaut gang\s+lena\s+2\s/.test(tblC), 'Lena’s team has the 2 games others logged against her')
await C.shot('joined-table')
await click(A, 'table')
check(await waitText(A, 'Grünhaut Gang'), 'admin’s table shows it live')

// 5c. admin imports the old league sheet: new coaches join the list, scores become league results
const sheet = [
  ',Blood Bowl League,,,,,',
  ',November,,,,,',
  ',Coach,Ron,Max,Olaf,Pia,,Pts',
  ',Ron,x,,,,,0',
  ',Max,,x,0:1,,,0',
  ',Olaf,,1:0,x,2:2,,4',
  ',Pia,,,2:2,x,,1',
  ',Dezember,,,,,',
  ',Coach,Ron,Max,Olaf,Pia,,Pts',
  ',Ron,x,,,,,0',
].join('\n')
await click(A, 'admin')
await click(A, 'Import the league sheet')
await waitText(A, 'paste the CSV')
await A.$eval('textarea', (el, v) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}, sheet)
check(await waitText(A, '2 new on the participant list: Ron, Pia') && (await text(A)).includes('2 results'), 'import preview: new coaches and results')
check((await text(A)).includes('linked to the coach in the app with that name: ron'), 'import links the admin’s own new entry to their account')
await A.shot('import-preview')
await click(A, 'Import', 'button.w-full')
check(await waitText(A, 'Imported: 2 new coaches, 2 results'), 'import done')
const results = await fsList('results')
check(results.length === 2 && results.every((id) => id.startsWith('sheet-')), `results saved (${results.join(', ')})`)
const parts = await Promise.all((await fsList('participants')).map(async (id) => ({ id, ...(await fsGet(`participants/${id}`)).fields })))
check(parts.find((p) => p.coach.stringValue === 'Ron')?.uid?.stringValue === 'admin-uid', 'Ron’s entry is linked to the admin')
await A.keyboard.press('Escape')
await A.evaluate(() => (location.hash = '#/'))
await A.evaluate(() => (location.hash = '#/league'))
await click(A, 'table')
await sleep(1000)
const tblI = await text(A)
check(/pia\s+📝 pia · not in the app\s+1\s/.test(tblI) && /nordmänner\s+📝 olaf · not in the app\s+2\s/.test(tblI), 'sheet results count for coaches not in the app')
check(/gearwhackers\s+max\s+3\s/.test(tblI), 'a sheet result counts for a coach in the app')
check(!/\bron\s+📝/.test(tblI), 'no duplicate 📝 row for the admin')
await A.shot('table-imported')
await click(A, 'results')
check(await waitText(A, 'league records (old sheet)'), 'results list shows sheet results')
// admin records a paper-vs-paper game
await click(A, '+ Result')
await waitText(A, 'Add a result')
const pidOf = (c) => parts.find((p) => p.coach.stringValue === c).id
const sels = await A.$$('select')
await sels[0].select(pidOf('Olaf'))
await sels[1].select(pidOf('Pia'))
await click(A, 'Save', 'button.w-full')
await sleep(1000)
check((await fsList('results')).length === 3, 'admin adds a result by hand')
await A.shot('results')

// 5d. Lena logs a past game she played on paper: picks Ron’s record, so it still counts once
const lenaTeam = await C.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('sevens-dugout')
  r.onsuccess = () => (r.result.transaction('teams').objectStore('teams').getAll().onsuccess = (e) => (res(e.target.result[0].id), r.result.close()))
}))
await C.evaluate((id) => (location.hash = `#/team/${id}/past`), lenaTeam)
check(await waitText(C, 'Already in the league'), 'past-game form lists her games logged by others')
await click(C, 'logged by Ron', 'button.flex')
await sleep(300)
await C.shot('past-game')
const nums = await C.$$('input[type="number"][placeholder="0"]')
if (nums[1]) await nums[1].type('1') // a casualty (a TD could change the score)
await click(C, 'Save game')
check(await C.waitForFunction(() => /#\/match\/\d+$/.test(location.hash), { timeout: 10000 }).then(() => true, () => false), 'past game saved, match report opens')
await C.evaluate(() => (location.hash = '#/settings'))
await click(C, 'Sync now')
await sleep(2500)
check((await fsList('coaches/lena-uid/matches')).length === 1, 'past game published')
await C.evaluate(() => (location.hash = '#/league'))
await click(C, 'table')
await sleep(1500)
check(/grünhaut gang\s+lena\s+2\s/.test(await text(C)), 'Lena still has 2 games: her record is paired with Ron’s')
await click(C, 'results')
check(await waitText(C, 'logged by both'), 'the game shows as logged by both')
await C.shot('past-paired')

// 6. second device for the admin → conflict instead of silent overwrite
const A2 = await phone('admin2')
await setup(A2, 'ron@example.com')
await sleep(7000)
await A2.evaluate(() => (location.hash = '#/settings'))
check(await waitText(A2, 'another device'), 'second device of the same coach gets a conflict, nothing overwritten')
await A2.shot('conflict')
check((await fsList('coaches/admin-uid/teams')).length === 1, 'admin data intact')

// 7. admin removes the coach (and their data)
await A.evaluate(() => (location.hash = '#/league'))
await click(A, 'admin')
await waitText(A, 'Members')
for (const row of await A.$$('div.justify-between')) {
  if ((await row.evaluate((x) => x.textContent)).startsWith('Max')) await (await row.$('button')).click()
}
await sleep(3000)
const maxEntry = (await Promise.all((await fsList('participants')).map((id) => fsGet(`participants/${id}`)))).find((x) => x.fields.coach.stringValue === 'Max')
check(!maxEntry.fields.uid, 'removing (with data) frees Max’s participant entry')
check((await fsList('coaches/max-uid/teams')).length === 0 && (await fsList('coaches/max-uid/matches')).length === 0, 'removed coach’s data deleted')
await B.evaluate(() => (location.hash = '#/league'))
check(await waitText(B, 'Ask to join', 15000), 'removed coach loses access (live)')

for (const [n, p] of [['admin', A], ['max', B], ['lena', C], ['admin2', A2]]) {
  const errs = p.errors.filter((e) => !/Failed to load resource|permission|Missing or insufficient/i.test(e))
  check(errs.length === 0, `${n}: no unexpected console errors ${errs.length ? JSON.stringify(errs).slice(0, 400) : ''}`)
}
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
