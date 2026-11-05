# Blood Bowl Sevens Companion — Roadmap

**Ruleset target:** the league's *Verfassung Vol. 3* (see `DECISIONS.md`), on top of the official **Sevens** rules from *Spike! Journal 22* and the *Third Season Edition* rulebook.
Only Sevens. No other formats.

## Guiding ideas

- **Mobile-first web app (PWA).** It's used at the table on a phone, so it can be installed to the home screen and works offline.
- **One event log for everything.** A match is a list of events (TD, casualty, completion, weather change, inducement bought…). Stats, records, and replays are all computed from it.
- **Rules data lives separately from app code.** Rosters, skills, inducements, and tables go in versioned JSON, so a FAQ or errata update means editing data, not code.
- **Assist, don't enforce.** The app does the arithmetic (TV, treasury, limits) and shows warnings, but the coach always has the final say, just like at the table.

## Proposed tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React + TypeScript + Vite | fast to build, typed data model |
| Styling | Tailwind CSS | quick mobile layouts |
| Local storage (prototype) | IndexedDB via Dexie | works offline, no server needed for Phase 1 |
| Hosting | GitHub Pages (public code repo) | free, HTTPS (needed for a PWA), no server to maintain |
| Backup | private GitHub repo via REST API | free, versioned, no own server |

---

## Part 1: Team management

### Phase 0: Foundations (rules data)
- Team rosters for all Third Season teams plus the Spike! 22 Sevens additions: positionals, QTY limits, cost, MA/ST/AG/PA/AV, skills, primary/secondary categories, special rules (Bribery & Corruption, Masters of Undeath…)
- Skill list with categories
- Sevens tables: injury (standard and stunty), kick-off events, weather, Prayers to Nuffle (D8), Desperate Measures (D8), inducement list and prices
- Data model: League → Team → Player → Match → Event

### Phase 1: Roster builder & team sheet ← **prototype**
- Create a team by draft: 600k budget, 7–11 players, max 4 non-Linemen, QTY limits, pick 1 Veteran (MA −1, once-per-game re-roll)
- Buy re-rolls (100k each), assistant coaches/cheerleaders (20k, max 3), apothecary (80k), and dedicated fans (start 1, +20k each, 1–5)
- Live counters for Team Value / Current Team Value, treasury, budget left, and rule warnings
- Player cards: stats, skills (base + gained), value with skill increases, injuries (MNG / Dead), number, name
- Team sheet view, printable like the paper version
- Edit anything by hand. An "override" mode covers house rules and corrections.

### Phase 2: Match tracker
- **Pre-game:** opponent, date, weather, fans/attendance, CTV of both teams, petty cash and inducements bought (Sevens list with 0–N limits)
- **Live log** with big buttons usable mid-game: TD, completion, casualty (with injury result), interception, deflection, foul, sent-off, KO, kick-off event, weather change, turn/half markers. Every entry can be undone.
- **Post-game wizard** that follows the Sevens sequence:
  1. Result & winnings → treasury
  2. Dedicated fans change
  3. MVP (coach picks) + SPP summary. **House rule: SPP progression** (Third Season costs, editable), not the official Sevens random skill
  4. Injuries from the core D16 casualty table: Seriously Hurt → miss next game, Serious Injury → niggle, Lasting → stat loss, Dead → removed
  5. Expensive Mistakes
  6. Spend treasury (new players, re-rolls, staff)
- Built-in dice roller (optional; physical dice still work)

### Phase 3: Stats & "football" layer
- Career pages for each player: games, TDs, completions, casualties caused/suffered, interceptions, MVPs, skills timeline, injury history
- Team history: results, TV over time, treasury over time
- Leaderboards and records: top scorer, most brutal player, longest TD streak, most deaths, best weather luck…
- Head-to-head records against each friend
- Season / re-draft handling: 600k + treasury + 10k per win, capped at 750k; emergency call-ups (D6, a 1 removes the player)

## Part 2: Online play — parked
Not planned and may never be built. Details are in [docs/PART2-ONLINE-PLAY.md](docs/PART2-ONLINE-PLAY.md) (kept separate so it stays out of the way).

---

## Status (2026-11-05)
Prototype in `app/` covers **Phases 0–3**, aligned with the league's **Verfassung Vol. 3** (see `DECISIONS.md`):
- draft with "finish draft" (treasury → 0)
- staff incl. Goblin lawyer and Star Player
- pre-match steps 0–5 incl. journeymen and Petty-Cash-only inducements
- live log with a re-roll tracker and tap-to-edit entries
- post-match steps 1–7 incl. concession, random MVP and buying journeymen
- scouting rolls after advancing
- the full rules reference in-app (📖 Rules tab)
- everything editable after the fact

- cloud backup to a private GitHub repository (auto after each game, conflict check, restore)

**Next up:** set up the GitHub repositories and Pages (see `docs/HOSTING.md`).
