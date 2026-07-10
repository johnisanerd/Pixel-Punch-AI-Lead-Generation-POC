# LeadRadar Dashboard Setup

## Quick start (local / tests)

```bash
# From repo root
$env:LEADRADAR_AUTH_BYPASS="1"   # PowerShell
$env:SCORE_MOCK="1"
npm run dashboard
```

Open http://localhost:3000 — you are signed in as `dev@local` with no Google OAuth.

Bash:

```bash
LEADRADAR_AUTH_BYPASS=1 SCORE_MOCK=1 npm run dashboard
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LEADRADAR_AUTH_BYPASS` | for local/tests | Set to `1` to skip Google and inject `dev@local` |
| `LEADRADAR_ALLOWLIST` | for Google auth | Comma-separated emails allowed to sign in |
| `GOOGLE_CLIENT_ID` | for Google auth | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | for Google auth | OAuth client secret |
| `GOOGLE_CALLBACK_URL` | optional | Default `/auth/google/callback` (absolute URL in Google console, e.g. `http://localhost:3000/auth/google/callback`) |
| `SESSION_SECRET` | recommended in prod | Session cookie secret |
| `SCORE_MOCK` | optional | `1` = MockScorer; otherwise HermesScorer |
| `HERMES_API_BASE` | for real scoring | Default `http://127.0.0.1:8642` |
| `HERMES_API_KEY` | optional | Bearer token for Hermes |
| `LEADRADAR_DB` | optional | SQLite path (default `leadradar.db`) |
| `PORT` | optional | Default `3000` |

## Google OAuth setup

1. Create an OAuth 2.0 Client ID in Google Cloud Console (Web application).
2. Add authorized redirect URI: `http://localhost:3000/auth/google/callback` (and production URL if any).
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `LEADRADAR_ALLOWLIST=you@company.com,teammate@company.com`.
4. Do **not** set `LEADRADAR_AUTH_BYPASS` in production.
5. Visit `/login` → **Sign in with Google**. Non-allowlisted emails are rejected.

## What the dashboard can do

- Create / select projects
- View KPI strip (total leads, new this week, approval rate; reply rate is null for now)
- Filter / sort leads, open detail, Approve / Reject
- Run scoring, Export All / Export Emails, Import CSV
