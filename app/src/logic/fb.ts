/**
 * Everything that touches the Firebase SDK. Only ever loaded with `import('./fb')`,
 * so coaches who never use League don't download it.
 */
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, getRedirectResult, signInWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type User } from 'firebase/auth'
import {
  collection, collectionGroup, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDocFromServer, getDocsFromServer, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, serverTimestamp, setDoc, updateDoc, writeBatch, type DocumentData, type QuerySnapshot, type Timestamp,
} from 'firebase/firestore'
import { firebaseConfig } from '../league.config'

// Dev only: `VITE_EMULATOR=1 npm run dev` talks to the local Firebase emulators (see firebase/README.md)
const EMU = import.meta.env.DEV && !!import.meta.env.VITE_EMULATOR
const app = initializeApp(EMU ? { ...firebaseConfig, projectId: 'demo-buben' } : firebaseConfig)
const auth = getAuth(app)
const fs = initializeFirestore(app, {
  // offline copy of the league, so the League tab and the opponent picker work at the table
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
})
if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(fs, '127.0.0.1', 8181)
  ;(window as unknown as Record<string, unknown>).__emuSignIn = (email: string, pw: string) => signInWithEmailAndPassword(auth, email, pw)
}

export type FbUser = { uid: string; name: string | null }
const toUser = (u: User | null): FbUser | null => (u ? { uid: u.uid, name: u.displayName } : null)

export function onUser(cb: (u: FbUser | null) => void) {
  getRedirectResult(auth).catch(() => {})
  return onAuthStateChanged(auth, (u) => cb(toUser(u)))
}

export async function signIn() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider)
    else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') throw e
  }
}
export const signOut = () => fbSignOut(auth)

const ms = (t: unknown) => ((t as Timestamp | null)?.toMillis?.() ?? (typeof t === 'number' ? t : undefined))
const ownerOf = (path: string) => path.split('/')[1]

// ---------- membership ----------

export type Presence = { exists: boolean; coach?: string }
export function watchMembership(uid: string, cb: (member: Presence, request: Presence) => void, onError: (e: Error) => void) {
  let member: Presence | undefined
  let request: Presence | undefined
  const fire = () => member && request && cb(member, request)
  const u1 = onSnapshot(doc(fs, 'members', uid), (s) => ((member = { exists: s.exists(), coach: s.data()?.coach }), fire()), onError)
  const u2 = onSnapshot(doc(fs, 'requests', uid), (s) => ((request = { exists: s.exists(), coach: s.data()?.coach }), fire()), onError)
  return () => (u1(), u2())
}

/** `participant`: the entry on the league's participant list this coach says they are (the admin confirms it) */
export const requestJoin = (uid: string, coach: string, participant?: string) =>
  setDoc(doc(fs, 'requests', uid), { coach, ...(participant ? { participant } : {}), requestedAt: serverTimestamp() })
export const withdrawRequest = (uid: string) => deleteDoc(doc(fs, 'requests', uid))

// ---------- admin ----------

/** Approve a join request, linking the coach to their participant-list entry (if any). */
export async function approve(uid: string, coach: string, pid?: string) {
  const b = writeBatch(fs)
  b.set(doc(fs, 'members', uid), { coach, joinedAt: serverTimestamp() })
  if (pid) b.update(doc(fs, 'participants', pid), { uid })
  b.delete(doc(fs, 'requests', uid))
  await b.commit()
}
/** The admin adds themselves (no request needed). */
export async function addMember(uid: string, coach: string, pid?: string) {
  const b = writeBatch(fs)
  b.set(doc(fs, 'members', uid), { coach, joinedAt: serverTimestamp() })
  if (pid) b.update(doc(fs, 'participants', pid), { uid })
  await b.commit()
}
export const rejectRequest = (uid: string) => deleteDoc(doc(fs, 'requests', uid))
export async function removeMember(uid: string, wipeData: boolean) {
  await deleteDoc(doc(fs, 'members', uid))
  if (!wipeData) return
  const refs = [
    ...(await getDocsFromServer(collection(fs, 'coaches', uid, 'teams'))).docs.map((d) => d.ref),
    ...(await getDocsFromServer(collection(fs, 'coaches', uid, 'matches'))).docs.map((d) => d.ref),
    doc(fs, 'coaches', uid),
  ]
  await commitInChunks(refs.map((ref) => (b) => b.delete(ref)))
}

export interface RequestRow { uid: string; coach: string; participant?: string; requestedAt?: number }
export function watchRequests(cb: (rows: RequestRow[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(fs, 'requests'),
    (s) => cb(s.docs.map((d) => ({ uid: d.id, coach: d.data().coach, participant: d.data().participant, requestedAt: ms(d.data().requestedAt) }))),
    onError,
  )
}

// ---------- participant list (admin writes, every signed-in user reads: the join form needs it) ----------

export interface Participant { id: string; coach: string; team: string; rosterId?: string; uid?: string }
export function watchParticipants(cb: (rows: Participant[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(fs, 'participants'),
    (s) =>
      cb(s.docs.map((d) => {
        const x = d.data()
        return { id: d.id, coach: x.coach, team: x.team ?? '', rosterId: x.rosterId || undefined, uid: x.uid || undefined }
      })),
    onError,
  )
}
export async function putParticipant(p: { id?: string; coach: string; team: string; rosterId?: string }) {
  const ref = p.id ? doc(fs, 'participants', p.id) : doc(collection(fs, 'participants'))
  const data = { coach: p.coach, team: p.team, rosterId: p.rosterId ?? '' }
  await (p.id ? updateDoc(ref, data) : setDoc(ref, { ...data, createdAt: serverTimestamp() }))
}
export const deleteParticipant = (id: string) => deleteDoc(doc(fs, 'participants', id))
export const linkParticipant = (id: string, uid: string | null) => updateDoc(doc(fs, 'participants', id), { uid: uid ?? deleteField() })

// ---------- league data (read) ----------

export interface RawLeague {
  members: { uid: string; coach: string; joinedAt?: number }[]
  coaches: { uid: string; coach: string; updatedAt?: number }[]
  teams: { uid: string; id: string; data: DocumentData; updatedAt?: number }[]
  matches: { uid: string; id: string; data: DocumentData; updatedAt?: number }[]
  fromCache: boolean
}
export function watchLeague(cb: (d: RawLeague) => void, onError: (e: Error) => void) {
  const parts: Partial<Record<'members' | 'coaches' | 'teams' | 'matches', QuerySnapshot>> = {}
  const fire = () => {
    const { members, coaches, teams, matches } = parts
    if (!members || !coaches || !teams || !matches) return
    cb({
      members: members.docs.map((d) => ({ uid: d.id, coach: d.data().coach, joinedAt: ms(d.data().joinedAt) })),
      coaches: coaches.docs.map((d) => ({ uid: d.id, coach: d.data().coach, updatedAt: ms(d.data().updatedAt) })),
      teams: teams.docs.map((d) => ({ uid: ownerOf(d.ref.path), id: d.id, data: d.data(), updatedAt: ms(d.data().updatedAt) })),
      matches: matches.docs.map((d) => ({ uid: ownerOf(d.ref.path), id: d.id, data: d.data(), updatedAt: ms(d.data().updatedAt) })),
      fromCache: [members, coaches, teams, matches].some((s) => s.metadata.fromCache),
    })
  }
  const sub = (k: keyof typeof parts, q: Parameters<typeof onSnapshot>[0]) =>
    onSnapshot(q as never, { includeMetadataChanges: true }, (s: QuerySnapshot) => ((parts[k] = s), fire()), onError)
  const unsubs = [
    sub('members', collection(fs, 'members')),
    sub('coaches', collection(fs, 'coaches')),
    sub('teams', collectionGroup(fs, 'teams')),
    sub('matches', collectionGroup(fs, 'matches')),
  ]
  return () => unsubs.forEach((u) => u())
}

// ---------- own data (write) ----------

export interface OwnRemote {
  device?: string
  hashes: Map<string, string> // 'teams/1' → hash
}
export async function fetchOwn(uid: string): Promise<OwnRemote> {
  const [c, t, m] = await Promise.all([
    getDocFromServer(doc(fs, 'coaches', uid)),
    getDocsFromServer(collection(fs, 'coaches', uid, 'teams')),
    getDocsFromServer(collection(fs, 'coaches', uid, 'matches')),
  ])
  const hashes = new Map<string, string>()
  for (const d of t.docs) hashes.set(`teams/${d.id}`, d.data().hash)
  for (const d of m.docs) hashes.set(`matches/${d.id}`, d.data().hash)
  return { device: c.data()?.device, hashes }
}

export type Op = { key: string; data?: DocumentData } // no data = delete
export async function publish(uid: string, coach: string, device: string, ops: Op[]) {
  const writes = ops.map((op) => (b: ReturnType<typeof writeBatch>) => {
    const ref = doc(fs, 'coaches', uid, ...(op.key.split('/') as [string, string]))
    if (op.data) b.set(ref, { ...op.data, updatedAt: serverTimestamp() })
    else b.delete(ref)
  })
  writes.push((b) => b.set(doc(fs, 'coaches', uid), { coach, device, updatedAt: serverTimestamp() }))
  await commitInChunks(writes)
}

async function commitInChunks(writes: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  for (let i = 0; i < writes.length; i += 200) {
    const b = writeBatch(fs)
    writes.slice(i, i + 200).forEach((w) => w(b))
    await b.commit()
  }
}
