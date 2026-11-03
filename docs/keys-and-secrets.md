# Keys and secrets

Every key the project uses, what it can do, where it lives, and how to replace it. Hard rule 3: secrets never in code. The rule of thumb: **a key that can bypass the database's access rules lives only in Supabase's encrypted secret store and never on a laptop or in a browser.**

## Where each key lives

| Key | What it can do | Where it lives | Who has it |
| --- | --- | --- | --- |
| Supabase project URL | Nothing on its own; tells an app which project to talk to | Each app's `.env.local` (development); the host's environment settings (a deployed app) | Team |
| Supabase anon / publishable key | Only what the access rules allow anonymous or signed-in users: the sponsor portal functions, and staff functions after a staff sign-in | Same as the URL. **Public by design:** it ships inside the app to every visitor | Team |
| Supabase service_role / secret key | **Everything.** Bypasses every access rule | Only Supabase's Edge Function secrets, injected automatically as `SUPABASE_SERVICE_ROLE_KEY`. Never in `.env.local`, a `VITE_` variable, the repo, Slack, or a chat with an AI tool. **One exception during the build:** the repo admin's `prototype/.env.admin.local` (gitignored) holds stable's, for admin scripts such as adding a sign-in account; it goes at handoff (below) | Nobody copies it |
| `RESEND_API_KEY` (email sending) | Sends email from one Resend account. A sending-only key: it can't read or change the account | Edge Function secrets. Stable's (`aafe-gala-stable-send`) was made with Resend's CLI and piped straight into the secrets, never shown. A teammate's own key for local tests: `supabase/functions/.env` (gitignored, `npm run email:local`) | The Resend account's owner (Aisling's Pursuit account until handoff; with no verified domain it delivers only to her) |
| Gmail app password (sign-in codes) | Sends email as the team Gmail account | Supabase dashboard → Authentication → SMTP Settings, per project. Stops working when the Google password changes | The team Gmail account's owner |
| `GIVELIVELY_API_KEY`, `GIVELIVELY_ORG_ID` | Reads AAFE's Give Lively donations | Edge Function secrets | Set once by the project owner. Stable holds made-up values for the stand-in |
| `SALESFORCE_TOKEN` | Writes to the Salesforce org at `SALESFORCE_BASE_URL` | Edge Function secrets | AAFE's Salesforce admin, from a connected app. Stable holds a made-up value for the stand-in |
| `CRON_SECRET` | Lets the schedules call the edge functions | Edge Function secrets and the database's Vault (`cron_secret`), both written by `prototype/scripts/setup-cron.mjs`, which never shows it | Nobody: run a function now with `select call_edge_function('…');` in the SQL editor |
| Cloudflare API token | Changes who can open the apps (Zero Trust Access) and reads its login log | `prototype/.env.admin.local` (gitignored), with the account id; read by `prototype/scripts/cloudflare-access.mjs` | The Cloudflare account's owner |
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
   - Resend, Give Lively or Salesforce: create a new key in that service, `npx supabase secrets set NAME=new-value`, then revoke the old one.
   - Gmail app password: make a new one in the Google account, paste it in Supabase → Authentication → SMTP Settings, then delete the old one.
   - Cloudflare API token: roll it in the Cloudflare dashboard (My Profile → API Tokens) and update `.env.admin.local`.
   - `CRON_SECRET`: run `node scripts/setup-cron.mjs <PROJECT-REF>` again.
2. If it was committed, removing the commit is not enough: the key is in git history and in GitHub's caches. Rotation is the fix.
3. Note it in `docs/decisions.md` with the date.

## Before real data or handoff

- Rotate every key at handoff (Nov 10): team members have had the anon key and project access during the build. The list:
  - Supabase: the anon/publishable and secret keys (then delete `SUPABASE_SECRET_KEY` from every `.env.admin.local`);
  - Resend: AAFE's own account and domain, with a new sending-only key; the team's keys deleted;
  - the Gmail app password, or AAFE's own sender instead (Resend as custom SMTP);
  - `CRON_SECRET` (`setup-cron.mjs`), the Cloudflare API token, and Give Lively's and Salesforce's once they're real.
- Remove the team: from the Supabase organization, the `staff_users` table and Authentication → Users, the Cloudflare
  Access policy (`CLOUDFLARE_ACCESS_DOMAINS` without pursuit.org, then `cloudflare-access.mjs --apply`), the Cloudflare
  account and the GitHub repository, keeping only who AAFE names.
- Use Supabase's new API keys (publishable and secret) so each can be rotated on its own.
- Limit the Edge Functions' allowed origins (`Access-Control-Allow-Origin`) to the deployed apps' addresses instead of `*`.
- Turn on MFA for every Supabase and GitHub account with access, and keep project access to the people who need it.
