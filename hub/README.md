# Project hub

A browsable, presentable view of the project docs. Each page is a markdown file in `docs/`; `index.html` renders them with AAFE's palette and the team deck's typefaces.

Published version: https://claude.ai/artifact/QVViUNx6SWRBZYKCfrAmp6

## View it locally

Browsers block a page opened straight from your files from reading other files, so serve the folder:

    cd hub
    npx serve

Then open the address it prints. Locally, task checkmarks save in your browser only; on the published version they're shared with the team.

## Edit a page

Edit the markdown file in `hub/docs/`. To add a page, add the file and one line to the `PAGES` list near the top of the script in `index.html` (`team: true` hides it in client view).

Put `<!-- team -->` on the line after a `##` heading to hide that section in client view.

## Custom blocks

Write these as fenced code blocks with the name after the backticks.

| Block | One line per | Format |
| --- | --- | --- |
| `steps` | step | `Title | detail` (numbered 一二三…) |
| `layers` | layer | `Layer | Item — detail; Item — detail` |
| `timeline` | component | `ID | Name | start | end | owner | AI days | by-hand days`, plus `start:`/`end:` and `milestone | Name | date` (`milestone*` = accent) |
| `workload` | — | Adds up the timeline above it by owner; `note: Name | text` adds a row |
| `costbars` | option | `Label | low | high | group | note`, plus `title:` and `scale: log 100 30000` or `scale: linear 0 600`. Groups: today, ours, gala, enterprise, other |
| `ranges` | estimate | `Label | low | high | hand/ai | note`, plus `title:`, `max:`, `band: Name | low | high` |
| `walkthrough` | step | `Title | detail | pay=…; named=…; flag=1; link=1; fix=…; arrived=…; table=…; dash=…`, plus `sponsor:` and `guests:` |
| `decision` | check | `Question? | outcome | update/review/new/reject`; `!` before the question means the outcome is on "No"; `else | outcome | kind` ends it; `start:` sets the entry |
| `erd` | table | `name @col,row | field; field → target`; tables after a `--- Label` line show below without lines |
| `risks` | risk | `Title | likelihood 1–3 | impact 1–3 | mitigation | owner` |
| `glossary` | term | `Term | definition` |
| `wireframe dashboard`, `wireframe sponsor`, `wireframe checkin` | — | Rough sketches, hard-coded in `index.html` |
| `notes` | — | Speaker notes for the section (hidden in client view; N in present mode) |

## Present

Click Present (or press P). Each section shows on its own; arrow keys or the space bar move through sections and pages, and step through the sponsorship walkthrough. N shows speaker notes, Esc exits.

## Client view

Hides team-only pages and sections and speaker notes, and adds `~client` to copied links. It hides; it doesn't lock. Anyone with the link can switch back.

Prepared by team ERIMX BOKHUS, Pursuit AI Native Fellowship. Not an official AAFE website.
