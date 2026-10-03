# First prompt for Claude Code

Paste this into Claude Code once the repo is open (claude.ai/code with this repo selected, or `claude` in a local clone).

---

Read CLAUDE.md and everything in docs/ before doing anything. This is a capstone for a real nonprofit client (AAFE), so treat it as production-quality work with invented data.

Do not scaffold the app until docs/decisions.md records the stack. For this session:

1. Summarize the requirements back to me in under 15 lines, and flag anything in docs/ that contradicts itself or the hard rules in CLAUDE.md.
2. Add a GitHub Actions workflow that runs gitleaks on every push and pull request, and confirm .gitignore covers .env files, data exports, and node_modules.
3. Write docs/import-matching-spec.md: how Give Lively CSV rows become orders, guests, and seats; the matching order (Give Lively ID, then email, then name and organization); the review queue; how staff corrections survive re-import; and the import report. Include a table of test cases (duplicates, name variants, a guest under two sponsors, a refund, a re-import with changed data).
4. List what the synthetic seed data must contain to exercise those test cases, so it can be added to the team's seed data.

Make each step its own commit on a branch, with a clear message, and open a pull request to main.
