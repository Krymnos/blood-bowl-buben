# Firebase (league sync)

Security rules for the league's Firestore database, their tests, and an end-to-end test of the app against the emulators. The plan is in [docs/LEAGUE-SYNC-FIREBASE.md](../docs/LEAGUE-SYNC-FIREBASE.md).

| File | What |
|---|---|
| `firestore.rules` | **the** access rules (members read everything, each coach writes only their own data, the admin manages members) |
| `test/rules.test.mjs` | rules tests (`npm test`) |
| `test/e2e.mjs` | admin + coach in two browser profiles against the Auth + Firestore emulators (`npm run e2e`) |

Needs Java for the emulators (`brew install openjdk`; the npm scripts add it to `PATH`). The e2e test also needs Google Chrome (or `CHROME_PATH`).

```bash
cd firebase
npm install
npm test             # rules tests in the Firestore emulator
npm run e2e          # starts emulators + the app in emulator mode, runs the league flows, screenshots in test/screenshots/
npx firebase login   # once, as the Google account that owns the project
npm run deploy:rules # publish firestore.rules to the live project
```

**Changing the admin:** the admin's Firebase user id is in `adminUid()` in `firestore.rules` and in `LEAGUE_ADMIN_UID` in `app/src/league.config.ts`. Change both, deploy the rules, push the app. Empty = nobody is admin.

**Any rules change:** run `npm test` first, then `npm run deploy:rules`. Rules aren't deployed by the GitHub Pages workflow.

**App against the emulators by hand:** start `npx firebase emulators:start --only auth,firestore --project demo-buben` here, then in `app/`: `VITE_EMULATOR=1 VITE_EMULATOR_ADMIN_UID=<uid> npm run dev`. Emulator mode only exists in dev builds.
