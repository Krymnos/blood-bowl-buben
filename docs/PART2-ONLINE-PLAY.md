# Part 2: Online play — PARKED

> **Status: parked (2026-11-05).** Not planned. It may never be built.
> Don't read this file or design for it while working on Part 1 unless the user brings Part 2 back.

Idea: async Blood Bowl Sevens games with friends, like an async chess app. 2D sprites, no rules engine, turn replay, several games at once.

## Tech ideas
| Layer | Choice | Why |
|---|---|---|
| Backend | Supabase (Postgres + Auth + Realtime) | free tier, logins for friends, realtime updates |
| Board | HTML canvas / PixiJS | 2D sprites, a few tweens |

The Part 1 event log would carry over: an async turn records the same kind of events, so "see what my opponent did" is a replay of their turn's log.

## Phase 4: Accounts, sync & league
- Log in (magic link / Google), cloud sync of teams, still works offline
- League: invite friends, fixtures, standings, league-wide leaderboards
- Friends can enter their current team by hand without tracking history
- Import / export (JSON; bbroster import if feasible)

## Phase 5: Async play (MVP)
- Sevens pitch on canvas (narrow pitch, wide zones, No Man's Land, trapdoors)
- 2D sprites per team; drag/tap to move, prone/stunned states, ball token
- Turn-based: "End turn" sends your action log to the opponent, and a push notification tells them it's their turn
- **Turn replay:** the opponent's actions are replayed step by step (move, block, dice result, ball scatter) with simple tweens
- Shared dice roller with logged results so both coaches trust the rolls
- Several games at once, game list with "your turn" badges
- Finished async games go into the Part 1 match tracker automatically

## Phase 6: Polish
- Chat / emotes per game, rematch button
- Sound, nicer sprites, team colours
- Spectator mode for the rest of the league
