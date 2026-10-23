# Security review (Gate 2, v1.0 Stable)

October 15, 2026. GitHub issue #148. Reviewed against `main` at 627fcbd, the stable and nightly Supabase projects, and
the built apps. Each box of the gate, what was checked, what it found, and the test or fix that proves it. Fixes are in
the pull request that adds this file.

| Box | Status |
| --- | --- |
| 1. Roles on every page and server function | Done: 4 findings fixed |
| 2. Sponsor links and QR e-tickets (hard rule 6) | Done: 2 findings fixed |
| 3. Sign-in limits | Done: stable's settings confirmed Oct 16; guide written |
| 4. Dependency scan | Done: nothing the apps ship; 8 build-tool findings explained |
| 5. Supabase security advisors | Done: 3 notices, each explained |
| 6. No secrets in code or built apps | Done: clean |
| 7. Data-handling promises | 5 fixed in code or wording; **retention waits for AAFE's answer on the 60-day window** |

## 1. Roles

Checked: every `staff_*` database function's role check (48 functions), the row-level access rules on all 19 tables, the
grants per API role, the staff app's role list against each function it calls (0 mismatches across 48 actions), the pages
of the three apps, and every Edge Function's caller check (`caller()` in `_shared/supabase.ts`; no path skips it).
Proof: `prototype/scripts/test-access.mjs` (656 checks).

Fixed:
- **Relationship managers read every year's guest emails and food and access answers** straight from the database
  (decided Oct 15: the gala being run only). Guests, the email log and import review items: relationship managers read
  the current gala's; gala admins read every year. Give Lively's raw records: gala admins only. The change log's old and
  new values: no API role (the app shows summaries). Tests: `test-access.mjs`, "a past gala's guests", "the change log's
  details".
- **Relationship managers read the whole change log** (found Oct 22, in Aisling's review of the story video): every
  staff member's app was sent who did what, though the log is gala admins' (Oct 20). Relationship managers now read only
  the sponsor portal's and Give Lively's entries, in the database's read rule, which also decides what `staff_sync` sends.
  Tests: `test-access.mjs`, "a relationship manager reads only the portal's and Give Lively's entries" (and "is sent by
  staff_sync"); `ActivityTab.test.tsx`.
- **Gala admins could edit the gala, tables and staff list directly**, with no line in the change log (a role change, a
  gala date that link expiries follow). Direct edits are gone for everyone; the staff app already saved through logged
  functions (decision of Oct 15 in `docs/decisions.md`). Test: `test-access.mjs`, "gala admin cannot update staff_users".
- **The sign-in-free (anon) role could call 50 non-portal functions** on Supabase. Every call failed one layer down, but
  Supabase grants new functions to anon and signed-in users by default, and the test database didn't. The wrappers are
  now revoked from both, and the test database grants functions as Supabase does. Test: `test-access.mjs`, "anon can
  call only the portal functions" (fails on the old code with the Supabase-like test database).
- **A page was allowed by prefix**: a volunteer at `#/checkinx` got the dashboard (with only their door list's data).
  Test: `staff-app/src/App.demo.test.tsx`.

Also: `current_event_id()` now runs with the caller's rights (the access rules call it); `staff_role()` stays the one
function with elevated rights that signed-in users call directly (box 5).

## 2. Sponsor links and QR e-tickets

Checked: links carry 192 random bits and QR codes 128, from `crypto.getRandomValues`; only a SHA-256 hash is stored and
lookups compare hashes; the plaintext is never logged or shown to staff (it exists only in the email); each link opens one
order and each code one seat; links expire at the guest-list deadline and codes after gala night; a resent link, a
renamed guest, a released or cancelled seat void the old one. Proof: `test-access.mjs`, `test-backend.mjs`,
`test-audit-fixes.mjs`, `test-gala-event.mjs`, `offlineCheckin.test.ts`.

Fixed:
- **A QR invitation still waiting to go out survived a change of guest.** Sending it later issued a working code to the
  old address for the seat the new person holds. It's now discarded (and logged) when the guest's name or email changes,
  as when a seat is released. Test: `test-emails.mjs`, "the queued invitation is discarded".
- **A missing expiry date counted as "never expires"** for links and QR codes (no code path writes one today). Now it
  counts as expired. Tests: `test-emails.mjs`, "no expiry date".
- Test gap closed: the old link stops working once a reminder carries a new one (`test-emails.mjs`).

Note: the demo seeds' links are readable (`qt-…`) and their codes come from a fixed random seed. They are demo-only: a
project holds demo galas or real ones, never both (`gala_events_no_mixing`).

## 3. Sign-in limits

Supabase's built-in email sender sends only a few emails an hour, and only to the project team's addresses: on gala
night, staff and volunteers couldn't get their codes. The guide now says what to set (`prototype/docs/BACKEND.md`, Setup
step 2, "Sign-in on gala night"): custom SMTP (Resend with AAFE's own domain for AAFE's project; without a verified
domain Resend delivers only to its account owner, which is why stable uses a team Gmail account), an hourly email limit
above the number of people signing in, codes that expire within an hour, and iPads signed in before doors open.

Stable's settings, read from the Supabase dashboard on Oct 16:

| Setting | Stable | Enough for gala night? |
| --- | --- | --- |
| Email sender | Custom SMTP on, through a team Gmail account (sender "AAFE Gala (test)") | Yes for the prototype: codes reach any address. Gmail is a personal sender (about 500 emails a day, and Supabase warns about deliverability), so AAFE's project uses Resend with AAFE's own domain |
| Emails per hour | 30 | Yes: fewer staff and volunteers than that sign in within an hour |
| Sign-ins, and code checks | 30 per 5 minutes per IP address, each | Yes, but every iPad at the venue shares one address: sign them in before doors open |
| Time between emails to one person | 60 seconds | Yes: a second "send me a code" waits a minute |
| Code expiry | 3600 seconds (an hour), 6 digits | Yes |

Nightly's sign-in emails were set up on Oct 21 to match stable: the same Gmail sender with its own app password, the
same templates and rate limits. Since Oct 21 both projects have sign-ups on, for sign-in by email domain
(`BACKEND.md`, Setup step 2): Supabase's Before User Created hook (`hook_staff_signup`) makes a new login only for an
email on the staff list or at a domain in `staff_join_domains`, so nobody else can have sign-in emails sent, and a
joined row stops working at its date.

## 4. Dependencies

`npm audit`: the repo root and the import engine are clean. `prototype` has 8 findings (6 high, 2 moderate), and **none in
anything the apps ship** (`npm audit --omit=dev`: 0). All are build tools pulled in by Tailwind CSS 3 and the single-file
bundler:

| Package | Advisory | Why it's accepted for now |
| --- | --- | --- |
| `braces` 3.0.3 (via `micromatch`, `chokidar`, `fast-glob`) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested patterns exhaust the stack | No fixed version exists. Only the build's own file patterns reach it; the worst case is a failed build |
| `postcss-selector-parser` 6.1.4 | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf): slow on crafted selectors | Fixed in 7.1.6, which Tailwind 3 can't use. Only our own CSS reaches it |

The fix for both is Tailwind CSS 4, a larger change than a stability run allows; revisit after v1.0. The Edge Functions
load `@supabase/supabase-js` from npm through Deno, outside `npm audit`.

## 5. Supabase security advisors

The same three notices on stable and nightly:

| Notice | Why it stays |
| --- | --- |
| `staff_role()` can be called by signed-in users (WARN) | Expected: the access rules call it (`BACKEND.md`) |
| `demo_givelively_donations`, `demo_salesforce_records`: access rules on, none defined (INFO) | By design: no API role reads these demo stand-ins; only the server functions do |
| Leaked password protection off (WARN) | Staff sign in with an emailed code, not a password; on the free plan the check isn't offered |

## 6. Secrets

Gitleaks over the whole git history (277 MB): no leaks. The secret scan runs on every pull request (a required check).
The built apps (`dist`, which git ignores, and the `OPEN-*.html` demo files): every hit is either an invented token in the
bundled demo data (818) or the public sign-in key that every Supabase app ships (1). No service-role key, secret key or
email-service key in any build; the one `sb_secret_` match is Supabase's own code checking a key's prefix.

## 7. Data-handling promises (`docs/data-handling.md`)

Matches: no payment processing or card and bank details; synthetic data only; no AI anywhere; staff approve every email;
food and access details never reach Salesforce; door lists show only a yes/no access flag; Give Lively credentials kept
out of storage and error messages; staff corrections survive the next import.

Fixed:
- **The check-in iPad kept the door list after the gala closed**: the server answers "no gala", and the app kept its saved
  list. It's now cleared. Test: `checkin-app/src/liveDoor.test.ts`.
- **The Give Lively sync stored donations' raw records with phone numbers and addresses**, and some other campaigns'
  donations. Another campaign's donation is never kept now; phone and address fields are dropped (the others stay, so
  staff can see what Give Lively sends). Test: `test-givelively-sync.mts`.
- Wording now matches the code: sign-in by emailed code (not Google), who sees food and access answers (staff, and the
  sponsor contact through their link), relationship managers' access, the iPad's list, the services that receive data
  (Resend, and Salesforce's guest push), Give Lively's records.

Open:
- **Retention is built (Oct 18).** Food and access answers are deleted after the gala, only the totals kept (#194). Guests'
  contact details are deleted 60 days after the gala by a daily job (`retention_sweep`), or earlier by a gala admin,
  copies included: the change log's old values, the email log's addresses, review items, Give Lively's guest lists and raw
  records. Names and sponsors' own details stay. The 60 days are the proposed default, built ahead of AAFE's answer on
  Oct 19 (`decisions.md`); another answer changes `retention_days()`.
- **Guest email: optional or required?** The sponsor portal requires it; the promise says optional. A team decision, not
  AAFE's (off the Oct 19 list, Oct 17); it goes in `decisions.md` when written.
- Low: a guest keeps "last updated by"; where a guest first came from is in the change log, not on the guest.
