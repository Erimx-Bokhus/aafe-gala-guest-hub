# Keys and secrets

Every key the project uses, what it can do, where it lives, and how to replace it. Hard rule 3: secrets never in code. The rule of thumb: **a key that can bypass the database's access rules lives only in Supabase's encrypted secret store and never on a laptop or in a browser.**

## Where each key lives

| Key | What it can do | Where it lives | Who has it |
| --- | --- | --- | --- |
| Supabase project URL | Nothing on its own; tells an app which project to talk to | Each app's `.env.local` (development); the host's environment settings (a deployed app) | Team |
| Supabase anon / publishable key | Only what the access rules allow anonymous or signed-in users: the sponsor portal functions, and staff functions after a staff sign-in | Same as the URL. **Public by design:** it ships inside the app to every visitor | Team |
| Supabase service_role / secret key | **Everything.** Bypasses every access rule | Only Supabase's Edge Function secrets, injected automatically as `SUPABASE_SERVICE_ROLE_KEY`. Never in `.env.local`, a `VITE_` variable, the repo, Slack, or a chat with an AI tool | Nobody copies it |
| `RESEND_API_KEY` (email sending) | Sends email as AAFE's domain | Edge Function secrets (`npx supabase secrets set`) | Set once by the project owner |
| `GIVELIVELY_API_KEY`, `GIVELIVELY_ORG_ID` | Reads AAFE's Give Lively donations | Edge Function secrets | Set once by the project owner |
| `CRON_SECRET` | Lets the scheduled job call the sync and email functions | Edge Function secrets and the database's cron job | Set once by the project owner |
| Supabase CLI login | Runs `db:backend` and `db:advisors` against the project | The operating system's credential store (Windows Credential Manager, macOS Keychain), saved by `npx supabase login` | Whoever loads the backend |
| Database password | Direct database access | Not stored anywhere: `db query --linked` goes through the CLI login | Nobody |
| GitHub login | Pushing and merging | The OS credential store, saved by `gh auth login` | Each person |

## What enforces it

- **Build guard** (`prototype/shared/vite/envGuard.ts`, in all three apps' Vite settings: staff app, guest portal, iPad check-in app): the build stops if a `VITE_` variable holds a service_role or `sb_secret_` key, or has a secret-sounding name. Vite copies every `VITE_` variable into the browser code, so this is the one place a secret key could leak to visitors. Tested in `envGuard.test.ts` and in CI (`npm test`).
- **Demo-file guard** (`prototype/scripts/make_open_files.py`): refuses to write `OPEN-*.html` if the build contains a Supabase project address, so a build made with `.env.local` can't be committed.
- **Secret scan** (`.gitleaks.toml`, required on every pull request): gitleaks' default rules (any JWT, including the anon key) plus Supabase secret keys and service_role assignments.
- **`.gitignore`** keeps every `.env*` file out of git except `.env.example`, which holds placeholders only.
- **Access rules and role checks** in the database (`backend.sql`) are what actually protect the data behind the public anon key; `npm run test:backend` covers them, and Supabase's advisors are checked after every load.

## If a key leaks

1. **Rotate it first**, then clean up:
   - anon / publishable or secret key: Supabase dashboard → Project Settings → API Keys → create a new key, switch the apps or Edge Functions to it, then delete the old one. Projects still on the older JWT-style keys rotate by moving to the new API keys.
   - Resend or Give Lively: create a new key in that service, `npx supabase secrets set NAME=new-value`, then revoke the old one.
2. If it was committed, removing the commit is not enough: the key is in git history and in GitHub's caches. Rotation is the fix.
3. Note it in `docs/decisions.md` with the date.

## Before real data or handoff

- Rotate every key at handoff (Nov 10): team members have had the anon key and project access during the build.
- Use Supabase's new API keys (publishable and secret) so each can be rotated on its own.
- Limit the Edge Functions' allowed origins (`Access-Control-Allow-Origin`) to the deployed apps' addresses instead of `*`.
- Turn on MFA for every Supabase and GitHub account with access, and keep project access to the people who need it.
