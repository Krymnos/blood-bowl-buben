// Writes the rules used by `npm run e2e`: the real rules with the test admin uid filled in.
import { readFileSync, writeFileSync } from 'node:fs'
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const out = rules.replace(/function adminUid\(\) \{ return '[^']*'; \}/, "function adminUid() { return 'admin-uid'; }")
if (out === rules) throw new Error('adminUid() line not found in firestore.rules')
writeFileSync(new URL('./.e2e.rules', import.meta.url), out)
