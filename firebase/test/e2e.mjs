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
for (const [localId, email] of [['admin-uid', 'ron@example.com'], ['max-uid', 'max@example.com']]) {
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

// 2. coach requests to join
const B = await phone('max')
await setup(B, 'max@example.com')
check(await waitText(B, 'Ask to join'), 'non-member sees join form')
await typeInto(B, 'Your coach name', 'Max')
await click(B, 'Request to join')
check(await waitText(B, 'Join request sent as Max'), 'request pending')
check((await fsList('coaches/max-uid/teams')).length === 0, 'non-member published nothing')

// 3. admin approves
await A.evaluate(() => (location.hash = '#/league'))
await click(A, 'admin')
check(await waitText(A, 'Max'), 'admin sees the request')
await A.shot('admin-tab')
await click(A, 'Approve')
check(await waitText(B, 'Leaders', 15000), 'coach becomes member live (no reload)')
await sleep(6000)
check((await fsList('coaches/max-uid/teams')).length === 1, 'coach published their team after approval')

// 4. league view on the coach's phone
await B.evaluate(() => (location.hash = '#/league'))
await click(B, 'table')
await sleep(1500)
await B.shot('table')
const tbl = await text(B)
check(tbl.includes('ron') && tbl.includes('max'), 'table lists both coaches’ teams')
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
await click(B, 'Pick from league teams')
check(await waitText(B, 'League teams'), 'picker sheet opens')
await B.shot('picker')
const ronTeam = (await (await fetch(`${FS}/coaches/admin-uid/teams/${aTeams[0]}`, { headers: owner })).json()).fields.team.mapValue.fields.name.stringValue
await click(B, ronTeam, 'button.flex')
await sleep(800)
const oppName = await B.$eval('input[placeholder="e.g. Reikland Reserves"]', (x) => x.value)
check(oppName === ronTeam && (await text(B)).includes('linked to league team'), `opponent filled from league (${oppName}) and linked`)
await B.shot('pregame-linked')

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
await click(A, 'Remove')
await sleep(3000)
check((await fsList('coaches/max-uid/teams')).length === 0 && (await fsList('coaches/max-uid/matches')).length === 0, 'removed coach’s data deleted')
await B.evaluate(() => (location.hash = '#/league'))
check(await waitText(B, 'Ask to join', 15000), 'removed coach loses access (live)')

for (const [n, p] of [['admin', A], ['max', B], ['admin2', A2]]) {
  const errs = p.errors.filter((e) => !/Failed to load resource|permission|Missing or insufficient/i.test(e))
  check(errs.length === 0, `${n}: no unexpected console errors ${errs.length ? JSON.stringify(errs).slice(0, 400) : ''}`)
}
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
