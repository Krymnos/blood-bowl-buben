# League sync (Firebase)

> **Status (2026-11-17): built (steps 1–6), not live yet.** Waiting on: rules deployed, admin user id filled in, two-phone test (see *Next steps*).

## Goal
Every coach in the Blood Bowl Buben league keeps tracking their own team(s) in the app, and everyone can see the whole league in one place:
- all teams and rosters (players, skills, injuries, TV)
- results and a league table
- league-wide leaderboards (TDs, casualties, MVPs…)
- head-to-head records

Each coach logs in with their own account. Nobody shares a token, and nobody can change someone else's data.

**Not in scope:** photo sync (Cloud Storage isn't on the free plan), async online play (Part 2 stays parked, see [PART2-ONLINE-PLAY.md](PART2-ONLINE-PLAY.md)), and enforcing rules on the server.

## Approach

### Services: Firebase Spark plan (free, no billing account)
- **Authentication:** Google sign-in.
- **Cloud Firestore:** EU region. Free limits: 1 GB stored, 50k reads / 20k writes / 20k deletes per day. A 10-coach league uses about 1% of that.
- **Security Rules:** enforce access on Google's side.
- **Hosting stays on GitHub Pages.** The private GitHub backup stays as each coach's own safety net.

### Backing up the Firebase data
- **No new repo.** The admin's phone already backs up to `blood-bowl-buben-data`. It also writes a second file there, `league-backup.json`: a snapshot of every coach's teams and matches. It's written about a minute after the league changes (and after the admin's own backup), only when the content changed, and only while the admin's app is open.
- **A manual "Download league backup" button** (admin only) saves the same JSON on demand.
- **Firestore's own export is not an option.** Managed export needs the paid Blaze plan.
- **Firebase is also rebuildable.** Every coach's phone holds their full data, so a wiped project can be refilled by each app pushing again. That happens automatically on the next sync.

### Principles
- **The phone stays the main copy.** IndexedDB keeps working offline at the table. Sync is a layer on top, not a rewrite.
- **Each coach publishes; everyone reads.** A coach only ever writes under their own user id.
- **No live-event spam.** Like the GitHub backup, a match is pushed when it's finished (and after edits), not per event.
- **Minimal personal data.** Store the coach name entered in the app, not the Google email or photo.

### Data structure
```
members/{uid}                    { coach, joinedAt }                      admin writes
participants/{pid}               { coach, team, rosterId, uid?, createdAt } admin writes, signed-in users read
requests/{uid}                   { coach, participant?, requestedAt }     the user writes their own
coaches/{uid}                    { coach, device, updatedAt }             owner writes
coaches/{uid}/teams/{teamId}     { team, players[], hash, updatedAt }     owner writes
coaches/{uid}/matches/{matchId}  { match, events[], hash, updatedAt }     owner writes
```
- **The admin is a fixed user id** in `firebase/firestore.rules` (`adminUid()`) and `app/src/league.config.ts` (`LEAGUE_ADMIN_UID`). No `league/config` document: one less thing to bootstrap, and no "first one to claim admin wins" window. While the id is empty, nobody is admin.
- `hash` lets a phone see what's already published; `device` detects a second phone publishing for the same coach.
- `teamId` / `matchId` are the local Dexie ids. They are unique within a coach's path, so they can't collide with other coaches.
- One document per team (team plus players) and one per match (match plus its event log). That's a handful of writes per game and well under Firestore's 1 MiB limit per document.
- The League view reads with **collection-group queries** (`teams`, `matches`) and live listeners.
- **Photos are excluded.**

### Security Rules (outline)
- `isMember()` = a `members/{request.auth.uid}` document exists.
- **Members** can read `coaches/**`, `members`, `league/config`.
- `coaches/{uid}/**`: write only if `request.auth.uid == uid` and the user is a member.
- `requests/{uid}`: create/update only by that uid; read/delete by the admin.
- `participants/**`: write by the admin only; readable by any signed-in user (the join form offers "who are you?"). It holds only coach and team names.
- `members/**`, `league/config`: write by the admin only.
- **Everyone else gets nothing;** signed-in strangers only see the participant list.
- Rules are tested with the Firebase emulator: `cd firebase && npm test` (28 tests, incl. a check that a weakened rule makes them fail). See [firebase/README.md](../firebase/README.md).

### Joining the league
1. A coach opens the app → **League** → "Sign in with Google".
2. If they're not a member yet, they pick their name from the participant list ("Who are you?", only entries not taken yet; or "I'm not on the list" and type a name). The app writes a join request with it.
3. The admin (you) sees pending requests in the app, with the picked entry preselected (changeable), and taps **Approve**: that creates `members/{uid}` and links the entry to the coach (`participants/{pid}.uid`) in one batch.
4. The coach's teams and matches start syncing. Removing a member cuts off their access straight away.

### Sync layer
- **Same trigger as the GitHub backup:** Dexie hooks mark data dirty, and a debounced push runs while no match is live, right after a game finishes, and when the phone comes back online.
- **Only changed teams and matches are written,** found by comparing a content hash per document.
- **Deletes are synced too:** a team or match deleted locally is deleted in Firestore.
- **First sync of each session compares with Firestore itself** (by `hash`), so a wiped project or a missed delete is repaired automatically.
- **Only finished games are published.** Pre-game, live and post-game matches stay on the phone.
- **One device per coach for now.** If a coach's data was last published from another phone, sync pauses and Settings asks "Publish from this phone" (replaces the other phone's data). A coach who switches phones restores the backup first. Real multi-device merging is a later step if anyone needs it.
- **Safety net:** a phone with no teams never silently wipes the coach's league data; sync pauses and asks first.

### Pairing games
- In pre-game, "Opponent" gets a **pick from the league** option: the participant list (in the app or not) plus teams in the app that aren't on it. It fills in name, coach, roster (and CTV for teams in the app), and stores `opponent.pid` (participant) and/or `opponent.ref = { uid, teamId }` (team in the app) on the match.
- The match edit sheet has the same picker, so older games can be linked afterwards. Without a link, a typed opponent is matched by its team name (trimmed, case ignored), then its coach name, to the participant list, then to team names in the app (unique matches only).
- League results count a game once. When both coaches logged it, the two records are paired by team and date (within 2 days; when there are several candidates, a matching score wins, then the closest date), and a different score is flagged in Results ("Ron logged 2–1, Max logged 1–1") so the coaches can fix it. Until then, the record of the coach whose id sorts first counts, so every phone shows the same table.
- If only one coach logged the game, that record counts.
- **The participant list decides who's in the league** (decided 2026-11-17: some coaches will stay with pen and paper, or join later). The admin enters every coach once (Admin → Participants: coach, team name, roster). Games against opponents not on the list (friendlies) don't count.
- **Participants not in the app (📝)** have a row in the table from the start, built from the records of the coaches who played them. They're left out of head-to-head (no coach account).
- **When that coach joins,** they pick their entry in the join form and the admin confirms it. All games logged against the entry then count for their team in the app: their only published team, or the one named like the entry; with several teams, the League tab asks which one plays in the league (`team.leaguePid`).
  - If the new coach also logs an old game in the app afterwards (with its real date in the match edit sheet), it is paired with the other coach's record, not counted twice.
  - Removing a member together with their data frees their entry again.
- The league team page lists the team's games from the league's view, including games others logged against it.

### League view (new tab)
- Tabs: **Table · Results · Teams · Leaders** (+ **Admin** for the admin: join requests, participant list, members).
- **Teams:** every coach's teams, plus participants not in the app yet. Read-only team and player pages, built from the same components and logic as the own pages (the own pages are full of edit actions, so they aren't reused directly).
- **Table:** played / W-D-L / TD ± / CAS ± / points. Win 3, draw 1, loss 0. Ties: TD difference, then CAS difference.
- **Leaders:** the existing leaderboards across all coaches, plus coach-vs-coach head-to-head.
- Sign-in, sync status, "Sync now", conflicts and (admin) "Download league backup" live in Settings → League, next to the GitHub backup. The Home screen shows a one-line league status.

### Costs and risks
- About 190 KB more JavaScript (gzipped; the offline cache is the bigger part). It's only run on phones that signed in to the league. The PWA's offline cache still downloads it once in the background.
- Reads: the League view keeps live listeners for the session, so opening it costs one read per published document (a season of 10 coaches ≈ 250 reads); later changes cost one read each. The admin's phone listens from app start (for the backup). Well under the 50k/day free limit.
- Google sign-in uses a popup (falls back to a redirect). **Check it on an iPhone home-screen app during the two-phone test:** that's where popups have been fragile.
- Depends on Google's free terms. Data can always be exported, and every phone keeps its own copy anyway.
- **A wrong rule would be a security hole,** so the rules get emulator tests and a review.
- The `firebaseConfig` in the code is public by design. Security comes from the rules plus the authorized-domain list.

## Current status
- [x] Options compared: shared GitHub token (rejected: anyone could change or delete everything), GitHub org (clunky for non-developers), S3 / Google Drive (no per-user access rules without a server), Cloudflare Worker (possible, but a server to write and maintain), **Firebase (chosen)**
- [x] Approach and data structure drafted (this file)
- [x] Firebase project set up (you)
- [x] Implementation, steps 1–6 (2026-11-17): rules + 23 emulator tests; sign-in, join request, approval; push sync with deletes, conflicts and status; League view; opponent picker with pairing and mismatch flags; table, leaderboards, head-to-head; admin league backup
- [x] End-to-end test against the emulators (admin + coach in two browser profiles): `cd firebase && npm run e2e`
- [x] Admin id filled in (2026-11-17)
- [x] Participant list: games against listed coaches count even before they're in the app; they pick their entry when joining (2026-11-17)
- [ ] Rules deployed (you)
- [ ] Two-phone test, then roll out

## Next steps
1. **Lock the database now (2 minutes).** (Deploy again after every rules change: the participant list added one.) If Firestore was created in *test mode*, it's open to anyone until the rules are deployed. The rules in the repo are safe even before the admin id is filled in (nobody can read or write league data). Either:
   - **Console:** Firebase console → Firestore Database → **Rules** → replace everything with the contents of `firebase/firestore.rules` → **Publish**, or
   - **CLI (on the Mac):** `cd firebase && npm install && npx firebase login && npm run deploy:rules`
2. **Find your user id.** Sign in once (League tab → Sign in with Google), either on the live app after the next push to `main`, or locally (`cd app && npm run dev`, open http://localhost:5179 on the Mac; `localhost` is an authorized domain by default). The League tab then shows "user id …": tap it to copy. (It's also in the Firebase console → Authentication → Users.)
3. **Make it the admin id.** Put it in `adminUid()` in `firebase/firestore.rules` and in `LEAGUE_ADMIN_UID` in `app/src/league.config.ts` (or send it to me), deploy the rules again, push the app.
4. **Fill in the participant list:** League → Admin → Participants → *+ Add*, one entry per coach (yourself included). If you already joined, link your own entry via *In the app as*.
5. **Join as admin** (if not done yet): League tab → pick your entry → *Join as admin*. Your teams and finished games are published within seconds.
6. **Two-phone test** with a second Google account: request to join, approve it in League → Admin, play or edit a game, check Table / Results / Leaders on both phones. Also test Google sign-in from the iPhone home-screen app.
7. **Roll out:** send the league the app link. Each coach: League → Sign in → pick their name → Request to join; you approve.
