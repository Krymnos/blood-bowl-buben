# Hosting & cloud backup

## Overview
| What | Where | Visibility |
|---|---|---|
| App code | GitHub repository, e.g. `blood-bowl-buben` | **public** (needed for free GitHub Pages) |
| The app itself | GitHub Pages: `https://<user>.github.io/blood-bowl-buben/` | public URL, but it only shows the data stored on the device opening it |
| Your data (live) | the phone's browser storage (IndexedDB) | this device only |
| Your data (backup) | second GitHub repository, e.g. `blood-bowl-buben-data` | **private** |
| Backup token | the phone's browser storage (localStorage), entered in Settings | this device only; never in the code or the backup file |

No own server, no database server, nothing to patch. Cost: free.

## One-time setup
1. **GitHub account:** use a personal one (not work), with 2FA or a passkey.
2. **App repository (public):** create `blood-bowl-buben` and push this folder to it.
   Settings → Pages → Source: **GitHub Actions**. Every push to `main` builds and publishes the app (`.github/workflows/deploy.yml`).
3. **Data repository (private):** create `blood-bowl-buben-data`, empty.
4. **Token:** GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:
   - Expiration: 1 year (the app says when it has expired; then create a new one)
   - Repository access: **Only select repositories** → `blood-bowl-buben-data`
   - Permissions → Repository permissions → **Contents: Read and write** (Metadata: read-only is added automatically). Nothing else.
5. **Phone:** open the Pages URL → Share → **Add to Home Screen** (on iPhone this also stops Safari from deleting the data after 7 days without use).
   In the app: Settings → Cloud backup → user name, data repository, token → **Connect & test**.
6. **Moving data from the old test URL** (`192.168.178.98:5179`): Settings → Export backup there, then Import backup on the new app (or Restore if it has already been backed up).

## How the backup works
- Backs up automatically **after each finished game**, and about **1 minute after other changes**. Nothing is backed up while a game is live, so you get one commit per game, not one per event.
- If nothing changed, nothing is uploaded.
- Every backup is a commit in the data repository. "History" in Settings opens the list, so any earlier state can be recovered.
- **New phone:** connect with the token, then tap **Restore**.
- **Two devices:** if the backup on GitHub is newer than what this device knows about, auto-backup pauses and Settings asks: *Keep this device* or *Keep GitHub*. Nothing is overwritten silently.

## Security
- **What the token can do:** read and write files in the one private data repository. It can't touch other repositories, account settings, or anything outside GitHub.
- **If the phone or token is lost:** revoke the token on GitHub (Settings → Developer settings → Fine-grained tokens) and create a new one. The worst an attacker can do is read or change your Blood Bowl backup, and every change can be undone from the history.
- **The app** loads no third-party scripts, has no login of its own, and stores no secrets in the code.
- **If you never update it:** nothing on a server goes stale, because there is no server. The public repository holds only code.
