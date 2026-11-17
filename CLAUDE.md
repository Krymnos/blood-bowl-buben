# Notes for Claude sessions

## Git
- Several Claude sessions may work in this repo at the same time. **Stage only the files your session changed, by path.** Never `git add -A`, `git add .` or `git commit -a`. Check `git status` first and leave changes you didn't make alone (ask if unsure).
- Commit or push only when the user asks.
- For bigger parallel work, use a git worktree (own folder and branch), merged into `main` when done.
- The dev server and the Firebase emulators use fixed ports (e2e: 5180, Firestore 8181, Auth 9099): don't run the tests from two sessions at once.
