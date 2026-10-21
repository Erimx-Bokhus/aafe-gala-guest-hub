# Pull request visuals

Decided Oct 20, 2026 (`docs/decisions.md`): proposed by Aisling, scoped by Natalie as product lead, with Cornell's review notes. The aim is that a reviewer can see what changed without running the branch. AAFE isn't on this repo; AAFE sees changes in the demo apps and on the project hub.

## The rule
- **On-screen change: required.** An annotated **before** (`main`) and **after** (this PR), with the same data and the same steps on both sides.
  - When the change moves (a sync, a reload, a message that appears and goes), make it a GIF.
- **Docs, backend or scripts: not required.** A short note on what changed, and the test results, is enough. Real test or terminal output counts as the visual if you want one.
- **Where:** the pull request's description, and fix or follow-up comments. Review comments don't need a picture.
- **PR comments:** a picture only when it helps explain something.
- **When a PR has a visual, it answers four things:**
  - what happened;
  - when it was found or planned, with the date and where (issue, gate, click-through, review);
  - how the fix was chosen;
  - the gap still open.

  The pull request template has a section for each.
- **Invented data only** (hard rule 1).
  - Mask every email address in terminal output.
  - Never show a key, token, secret link, or real donor.

## Highlight legend
Every mark has a number badge. Under the image, the note with that number starts with its kind's word, e.g. **WRONG**, **FIXED** or **DO**.

**Kind (color)**

| Kind | Word | Color | Means |
| --- | --- | --- | --- |
| Wrong | WRONG | red `#D92D20` | What was wrong (before) |
| Fixed | FIXED | green `#12965A` | The fix (after) |
| Action | DO | blue `#2563EB` | What you do in this step (click, type, upload) |
| New | NEW | purple `#7C3AED` | It didn't exist before |
| Gap | GAP | amber `#D99A00` | Still open, or watch out |
| Context | NOTE | gray `#5F6672` | Unchanged, shown for reference |

**Border (scope)**

| Border | Means |
| --- | --- |
| Solid, with a glow | The exact thing this note is about |
| Dashed | Also affected by the same cause, elsewhere |
| Dotted | Related and unchanged, for orientation |
| Double, with a glow | A new element (pairs with New) |
| Hatched fill | Not resolved yet (pairs with Gap) |

**Shape**

| Shape | Use it for |
| --- | --- |
| Box | An area: a card, a panel, a table row |
| Ring | A small target: a button, an icon, a badge |
| Underline | A wording change: the text itself |
| Arrow | Where something goes next, or the order to read in |

Each image ends with a legend of only the marks it uses, and a footer: the PR number, when the problem was found or planned, and the legend version.

## Where the images live
- **The `pr-media` branch.**
  - It is an orphan branch that never merges, so `main` stays small.
  - It has one folder per pull request: `pr-<number>/`.
  - Link each image by commit, so the link never changes: `https://github.com/Erimx-Bokhus/aafe-gala-guest-hub/raw/<commit>/pr-<number>/<file>`. Anyone with access to the repo sees it.
- **Also drag the images into the comment on GitHub.** GitHub then keeps its own copy, so the comment still shows if the branch moves.
- **`docs/screenshots/`** keeps the shots of pull requests from before Oct 20. New ones go to `pr-media`.

## How to capture
Any screenshot tool works, as long as the marks follow the legend. The visuals on #206–#214 were captured live:
- with Playwright;
- against the local Supabase, reset before each side;
- annotated in HTML;
- turned into a GIF with ffmpeg.
