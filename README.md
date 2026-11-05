# Sevens Dugout

Blood Bowl Sevens companion: team manager, live match tracker and stats. (Async online play is parked: [docs/PART2-ONLINE-PLAY.md](docs/PART2-ONLINE-PLAY.md).)
See [ROADMAP.md](ROADMAP.md) and [DECISIONS.md](DECISIONS.md).

```bash
cd app
npm install
npm run dev        # http://localhost:5179 (also on your LAN, for the phone)
npm run build      # static PWA in app/dist, host anywhere
```

Hosting (GitHub Pages) and cloud backup (private GitHub repository): see [docs/HOSTING.md](docs/HOSTING.md).

Rules data (`app/src/data/*.json`) was generated from bloodbowlbase.ru (Third Season + Spike! 22 errata). Unofficial fan tool, not affiliated with Games Workshop.
