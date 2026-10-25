# Releasing

How the gala tool is versioned, what has to be true before a tag, and how fixes reach the stable version after
v1.0.0. The rules were decided by Aisling with Natalie on Oct 14, 2026, after Pursuit's review of the build, and kept
until now on Aisling's own project hub; this file is where they live for the handoff.

## Two lines

| | Stable | Nightly |
| --- | --- | --- |
| What it takes | Fixes and gate work only | New features, and anything that didn't make the cut |
| Branch | `main` until v1.0.0, then `release/v1` | `nightly` until v1.0.0, then `main` |
| Supabase project | `aafe-gala-guest-list` (`abmlzjwnwpkypubpzcsn`) | `aafe-gala-nightly` (`tykckkoxuudvwdosturh`) |
| Apps | `aafe-gala-staff`, `-checkin`, `-portal` `.pages.dev`, uploaded with `--branch main` | the same with `nightly.` in front, `--branch nightly` |
| Who sees it | AAFE, Demo Day, anyone we show | The team and testers |

The rule for any change: it goes to stable only if it fixes a bug or closes a gate; everything else goes to nightly.
Until v1.0.0, every fix merged into `main` is also merged into `nightly` with a "Nightly: … (#n)" pull request from
`main` (`prototype/docs/BACKEND.md`, "Stable and nightly"), so nightly never brings a fixed bug back.

## Version numbers

- `v1.0.0-rc.1`, `rc.2`, …: release candidates, tagged on `main` as the gates pass. `v1.0.0-rc.1` was tagged on Oct 23
  (`f88db6c`, after Gate 4's two clean click-throughs).
- `v1.0.0`: Stable V1, tagged with a GitHub release and its notes.
- `v1.0.1`, …: fixes to Stable V1, on `release/v1`.

The release notes live on the GitHub release for each tag, on the repository's Releases page; there is no separate
changelog file. The releases stay with the repository if it's transferred, but a clone doesn't carry them.

## Before any tag

All of these, on the exact commit being tagged:

1. **The seven local checks pass:** `MSYS_NO_PATHCONV=1 node scripts/ci-local.mjs` (on Windows; `node scripts/ci-local.mjs`
   elsewhere), which also marks the commit for GitHub.
2. **GitHub's six required checks pass:** `gitleaks`, `real-data-guard`, `backend-tests`, `import-engine-tests`,
   `frontend-tests-build`, `edge-functions-check` (the same six `main` requires before a merge).
3. **Stable runs that commit, every layer of it:** `backend.sql` run from it (`npm run db:backend`), each changed
   server function deployed (`npx supabase functions deploy <name> --project-ref <ref>`), and each app uploaded from it.
   Check each app: `npx wrangler@4 pages deployment list --project-name aafe-gala-staff` (and `-checkin`, `-portal`)
   shows that commit as the newest Production upload.
4. **No open bug marked high or medium** for the stable line.

## Tagging

From a checkout with nothing uncommitted, signed in to GitHub (`gh auth status`):

```bash
git fetch origin
git tag -a v1.0.0-rc.2 <commit> -m "v1.0.0-rc.2: <one line on what this candidate is>"
git push origin v1.0.0-rc.2
gh release create v1.0.0-rc.2 --verify-tag --prerelease --title "v1.0.0-rc.2: <title>" --notes-file <notes.md>
```

`--prerelease` for every candidate, so GitHub's "Latest release" stays free for `v1.0.0`; `v1.0.0` itself drops it.
Never move or delete a pushed tag: a mistake gets the next number.

**The notes** (see `v1.0.0-rc.1` on GitHub for a full example):
- one line on what this version is and where it runs;
- each gate and its state;
- what changed since the last tag, by pull request, grouped by what a user would notice;
- the checks run on it (local, GitHub, click-through or load test if run);
- known issues still open, and what wasn't tested;
- what comes next.

## v1.0.0

Tagged when all of these are true:

1. **Gates 1 to 5 closed** (milestone "v1.0 Stable"), each box ticked with a link to the pull request or test that proves
   it.
2. **The team has reviewed it**, then **AAFE has signed off** (planned for the Oct 30 review).
3. **No open high or medium bug** on the stable line.
4. **Stable runs the commit being tagged**, every layer ("Before any tag", step 3).
5. **The last candidate's changes were clicked through:** each screen a pull request changed since the last full
   click-through ([click-through.md](click-through.md), on a local Supabase) works as its pull request says.

## After v1.0.0

1. **Cut `release/v1`** from the tag: `git push origin 'v1.0.0^{commit}:refs/heads/release/v1'`. The `^{commit}`
   is needed: `v1.0.0` is an annotated tag, and a branch can only point at a commit, so pushing the tag itself as a
   branch is rejected (Cornell, review of #254).
2. **Protect it like `main`** (repository settings, by the repo admin): a pull request with one approval and the same six
   checks, no force pushes, no deletion.
3. **A fix for Stable V1:** a pull request into `release/v1`; once merged, deploy stable from a checkout of `release/v1`
   (still uploading with `--branch main`: another branch name makes a preview, not the live app), then tag `v1.0.1` with
   the same checks as above.
4. **Merge each fix forward:** a pull request from `release/v1` into `main`, so the next version has it.
5. **Nightly moves to `main`:** from v1.0.0 on, new work merges into `main` and the nightly apps are built from it; the
   `nightly` branch is retired.
