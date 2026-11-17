// Firestore Security Rules tests. Run with `npm test` (starts the Firestore emulator; needs Java).
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

const ADMIN = 'admin'
let env

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const testRules = rules.replace(/function adminUid\(\) \{ return '[^']*'; \}/, `function adminUid() { return '${ADMIN}'; }`)
if (testRules === rules) throw new Error('adminUid() line not found in firestore.rules')

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()
const team = (n = 'Gnomes') => ({ team: { id: 1, name: n }, players: [{ id: 1, name: 'Fizz' }], hash: 'h1', updatedAt: serverTimestamp() })
const match = () => ({ match: { id: 7, score: { us: 2, them: 1 } }, events: [{ id: 1, type: 'td' }], hash: 'h2', updatedAt: serverTimestamp() })
const coachDoc = (coach = 'Max') => ({ coach, device: 'd1', updatedAt: serverTimestamp() })

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-buben', firestore: { rules: testRules } })
})
after(async () => env?.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  // Seed with rules disabled: alice and bob are members with published data, admin is implicitly a member.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const uid of ['alice', 'bob']) {
      await setDoc(doc(db, 'members', uid), { coach: uid, joinedAt: 1 })
      await setDoc(doc(db, 'coaches', uid), { coach: uid, device: 'd', updatedAt: 1 })
      await setDoc(doc(db, 'coaches', uid, 'teams', '1'), { team: { id: 1 }, players: [], hash: 'x', updatedAt: 1 })
      await setDoc(doc(db, 'coaches', uid, 'matches', '1'), { match: { id: 1 }, events: [], hash: 'x', updatedAt: 1 })
    }
    await setDoc(doc(db, 'requests', 'carol'), { coach: 'Carol', requestedAt: 1 })
  })
})

describe('strangers get nothing', () => {
  for (const [who, uid] of [['signed out', null], ['signed-in non-member', 'mallory']]) {
    test(`${who} cannot read league data`, async () => {
      const db = as(uid)
      await assertFails(getDoc(doc(db, 'coaches', 'alice')))
      await assertFails(getDoc(doc(db, 'coaches', 'alice', 'teams', '1')))
      await assertFails(getDocs(collectionGroup(db, 'teams')))
      await assertFails(getDocs(collectionGroup(db, 'matches')))
      await assertFails(getDocs(collection(db, 'members')))
      await assertFails(getDoc(doc(db, 'members', 'alice')))
      await assertFails(getDocs(collection(db, 'requests')))
      await assertFails(getDoc(doc(db, 'requests', 'carol')))
    })
    test(`${who} cannot write league data`, async () => {
      const db = as(uid)
      await assertFails(setDoc(doc(db, 'coaches', 'alice', 'teams', '2'), team()))
      await assertFails(setDoc(doc(db, 'members', uid ?? 'x'), { coach: 'Me', joinedAt: 1 }))
      if (uid) await assertFails(setDoc(doc(db, 'coaches', uid), coachDoc()))
      if (uid) await assertFails(setDoc(doc(db, 'coaches', uid, 'teams', '1'), team()))
    })
  }
  test('signed out cannot create a join request', async () => {
    await assertFails(setDoc(doc(as(null), 'requests', 'x'), { coach: 'X', requestedAt: serverTimestamp() }))
  })
})

describe('join requests', () => {
  test('a signed-in user can create, read, update and withdraw their own request', async () => {
    const db = as('dave')
    const ref = doc(db, 'requests', 'dave')
    await assertSucceeds(getDoc(ref)) // not there yet: reading your own path is allowed
    await assertSucceeds(setDoc(ref, { coach: 'Dave', requestedAt: serverTimestamp() }))
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(setDoc(ref, { coach: 'Dave the Brave', requestedAt: serverTimestamp() }))
    await assertSucceeds(deleteDoc(ref))
  })
  test('the user can read whether they are a member', async () => {
    await assertSucceeds(getDoc(doc(as('dave'), 'members', 'dave')))
  })
  test('cannot write someone else’s request', async () => {
    await assertFails(setDoc(doc(as('dave'), 'requests', 'carol'), { coach: 'Evil', requestedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(as('dave'), 'requests', 'carol')))
  })
  test('request must be well-formed', async () => {
    const ref = doc(as('dave'), 'requests', 'dave')
    await assertFails(setDoc(ref, { coach: '', requestedAt: serverTimestamp() }))
    await assertFails(setDoc(ref, { coach: 'x'.repeat(41), requestedAt: serverTimestamp() }))
    await assertFails(setDoc(ref, { coach: 'Dave', requestedAt: 123 }))
    await assertFails(setDoc(ref, { coach: 'Dave', requestedAt: serverTimestamp(), admin: true }))
  })
  test('members cannot list requests; admin can', async () => {
    await assertFails(getDocs(collection(as('alice'), 'requests')))
    await assertSucceeds(getDocs(collection(as(ADMIN), 'requests')))
  })
})

describe('admin', () => {
  test('admin approves a request (member created, request deleted in one batch)', async () => {
    const db = as(ADMIN)
    const b = writeBatch(db)
    b.set(doc(db, 'members', 'carol'), { coach: 'Carol', joinedAt: serverTimestamp() })
    b.delete(doc(db, 'requests', 'carol'))
    await assertSucceeds(b.commit())
    // carol can now publish and read
    await assertSucceeds(setDoc(doc(as('carol'), 'coaches', 'carol', 'teams', '3'), team()))
    await assertSucceeds(getDocs(collectionGroup(as('carol'), 'teams')))
  })
  test('admin can add themselves as a member and publish without a member doc', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'coaches', ADMIN), coachDoc('Ron')))
    await assertSucceeds(setDoc(doc(as(ADMIN), 'members', ADMIN), { coach: 'Ron', joinedAt: serverTimestamp() }))
  })
  test('admin removes a member: access is cut off at once', async () => {
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'members', 'bob')))
    await assertFails(getDocs(collectionGroup(as('bob'), 'teams')))
    await assertFails(setDoc(doc(as('bob'), 'coaches', 'bob', 'teams', '1'), team()))
    await assertFails(deleteDoc(doc(as('bob'), 'coaches', 'bob', 'teams', '1')))
  })
  test('admin can delete a coach’s data but not write it', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'coaches', 'bob', 'teams', '1'), team('Hijacked')))
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'coaches', 'bob', 'teams', '1')))
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'coaches', 'bob')))
  })
  test('member doc must be well-formed', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'members', 'zed'), { coach: 'Zed', joinedAt: 1, admin: true }))
  })
})

describe('members', () => {
  test('can read everything in the league', async () => {
    const db = as('alice')
    await assertSucceeds(getDocs(collectionGroup(db, 'teams')))
    await assertSucceeds(getDocs(collectionGroup(db, 'matches')))
    await assertSucceeds(getDocs(collection(db, 'members')))
    await assertSucceeds(getDocs(collection(db, 'coaches')))
    await assertSucceeds(getDoc(doc(db, 'coaches', 'bob', 'teams', '1')))
  })
  test('write, update and delete their own data', async () => {
    const db = as('alice')
    await assertSucceeds(setDoc(doc(db, 'coaches', 'alice'), coachDoc('Alice')))
    await assertSucceeds(setDoc(doc(db, 'coaches', 'alice', 'teams', '2'), team()))
    await assertSucceeds(updateDoc(doc(db, 'coaches', 'alice', 'teams', '2'), { hash: 'h9' }))
    await assertSucceeds(setDoc(doc(db, 'coaches', 'alice', 'matches', '12'), match()))
    await assertSucceeds(deleteDoc(doc(db, 'coaches', 'alice', 'matches', '12')))
  })
  test('cannot touch another coach’s data', async () => {
    const db = as('alice')
    await assertFails(setDoc(doc(db, 'coaches', 'bob'), coachDoc('Bob?')))
    await assertFails(setDoc(doc(db, 'coaches', 'bob', 'teams', '1'), team('Hijacked')))
    await assertFails(updateDoc(doc(db, 'coaches', 'bob', 'matches', '1'), { hash: 'y' }))
    await assertFails(deleteDoc(doc(db, 'coaches', 'bob', 'teams', '1')))
    await assertFails(deleteDoc(doc(db, 'coaches', 'bob')))
  })
  test('cannot add members, approve requests or make themselves admin', async () => {
    const db = as('alice')
    await assertFails(setDoc(doc(db, 'members', 'mallory'), { coach: 'M', joinedAt: 1 }))
    await assertFails(deleteDoc(doc(db, 'members', 'bob')))
    await assertFails(deleteDoc(doc(db, 'requests', 'carol')))
    await assertFails(getDoc(doc(db, 'requests', 'carol')))
    await assertFails(setDoc(doc(db, 'league', 'config'), { adminUid: 'alice' }))
  })
  test('only teams/matches with numeric ids and known fields', async () => {
    const db = as('alice')
    await assertFails(setDoc(doc(db, 'coaches', 'alice', 'junk', '1'), team()))
    await assertFails(setDoc(doc(db, 'coaches', 'alice', 'teams', 'abc'), team()))
    await assertFails(setDoc(doc(db, 'coaches', 'alice', 'teams', '1'), { ...team(), extra: 1 }))
    await assertFails(setDoc(doc(db, 'coaches', 'alice'), { coach: 'Alice', admin: true }))
    await assertFails(setDoc(doc(db, 'coaches', 'alice'), { coach: '' }))
  })
  test('a full publish batch (200 docs + coach doc) passes the rules', async () => {
    const db = as('alice')
    const b = writeBatch(db)
    for (let i = 1; i <= 200; i++) b.set(doc(db, 'coaches', 'alice', i % 2 ? 'teams' : 'matches', String(i)), i % 2 ? team() : match())
    b.set(doc(db, 'coaches', 'alice'), coachDoc('Alice'))
    await assertSucceeds(b.commit())
  })
  test('nothing else in the database is reachable', async () => {
    await assertFails(getDoc(doc(as('alice'), 'secrets', 'x')))
    await assertFails(setDoc(doc(as('alice'), 'secrets', 'x'), { a: 1 }))
  })
})

describe('deployed rules', () => {
  test('only the configured admin uid is admin', async () => {
    const env2 = await initializeTestEnvironment({ projectId: 'demo-buben-2', firestore: { rules } })
    try {
      await assertFails(getDocs(collection(env2.authenticatedContext('anyone').firestore(), 'requests')))
      await assertFails(setDoc(doc(env2.authenticatedContext('anyone').firestore(), 'members', 'anyone'), { coach: 'A', joinedAt: 1 }))
    } finally {
      await env2.cleanup()
    }
  })
})
