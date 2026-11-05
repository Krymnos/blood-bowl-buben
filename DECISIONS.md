# Decisions

**Source of truth:** the league's *Blood Bowl Sevens League — Verfassung Vol. 3 (Season 3)*. It overrides the official rules. Where it is silent, the official Sevens rules (Spike! Journal 22) and Third Season apply.

| Topic | Decision |
|---|---|
| Ruleset base | Verfassung Vol. 3 → Sevens (Spike! 22) → Third Season Edition |
| Draft | 600k, 7–11 players, 0–4 positionals, 1 Veteran Lineman, re-rolls 100k, Leader forbidden. **Left-over budget is lost: the treasury is 0 for the first game** ("Finish draft" button, or automatic at the first match). |
| Staff | 0-3 Assistant Coaches 20k, 0-6 Cheerleaders 20k, 0-1 Apothecary 80k, 0-1 Goblin lawyer 30k (keeps one scouted player per season). 1 free Dedicated Fan, not in team value. |
| Star Player | One per team roster (name + fee entered by hand; details are in a separate league document). Hired in pre-match step 0 and paid from the treasury; each Werbetrommel refunds 50k of it. |
| Inducements | Verfassung list, **Petty Cash only** (opponent TV − our TV), no treasury top-up. |
| Pre-match | 0 Star Player, 1 Fan Factor (D3 + Dedicated Fans), 2 Weather (2D6), 3 Journeymen (Lineman + Loner 5+, free), 4 Inducements, 5 Kick/receive roll-off |
| Progression | SPP (11s system). Costs, SPP awards and values editable in Settings; defaults = Verfassung Ref. C. |
| SPP | Completion 1, superb TTM throw 1, TTM landing 1, Interception 2, Casualty 2, **Casualty on a Star Player 4 (house rule)**, TD 3, MVP 4. Prayers that change SPP (Perfect Passing, Fan Interaction, Necessary Violence, Fouling Frenzy) apply automatically for that match. |
| Player value | Random primary +10k, primary +20k, secondary +40k, elite (Block, Dodge, Guard, Mighty Blow) +10k, AV +10k, MA/PA +20k, AG +30k, ST +60k |
| Characteristic | D16 table (Ref. C); may take a Primary/Secondary skill instead |
| Scouting | After spending SPP: D6 ≤ number of advancements → player leaves, team gets his position's purchase price |
| Injuries | Verfassung D16 casualty table: 1-6 BH, 7-9 SH, 10-12 SI, 13-14 LI, 15-16 Dead |
| Post-match | 1 Outcome (concession = +1 TD for winner), 2 Winnings, 3 Dedicated Fans, 4 MVP (random) & advancements, 5 Hire/fire (buy journeymen), 6 Expensive Mistakes, 7 Next team value |
| Winnings | (FF us + FF them) ÷ 2 × 10k + 10k per TD. **No stalling bonus.** Concession: winner gets all ticket sales. |
| Re-rolls in game | Team re-rolls + induced re-rolls per half, bonus re-rolls (e.g. Brilliant Coaching), Veteran once per game |
| Editing | Everything is editable afterwards: team (free edit, no gold change), players, advancements, match details, match log |
| Match entry | Live at the table |
| Storage | On device (IndexedDB), offline. Cloud backup to a **private GitHub repository** via a fine-grained token (stored on the device only), plus JSON export/import |
| Hosting | GitHub Pages from a public repository, deployed by GitHub Actions (see `docs/HOSTING.md`). No own server. |
| Language | English (Verfassung texts translated) |

## Assumptions (tell me if any are wrong)
- **Scouting count** includes the advancement just taken, so a player's first advancement is scouted on a 1.
- **Prayers to Nuffle**: the Verfassung has the D16 table but doesn't say when you get prayers. The pre-game has an optional prayer roller.
- **Desperate Measures** isn't in the Verfassung, so it's no longer offered (only referenced by the Sports Wizard inducement).
- **Star Player fee** is paid from the treasury, not from Petty Cash, because Petty Cash only buys the listed inducements.
- **Goblin lawyer** counts towards team value like other staff.
- **Dedicated Fans** have no upper limit; a D6 can't reach 7, so 6 is the practical cap.
- **Concession for us**: if we concede, we get no ticket sales, only 10k per TD.
