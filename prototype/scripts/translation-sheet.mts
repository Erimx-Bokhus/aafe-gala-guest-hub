// The guest portal's translations side by side (English | 中文 | 한국어 | Español), for AAFE staff to review
// (decided Oct 6: AAFE approves every translation before it goes live). Writes
// docs/translations/guest-portal-review.html: one row per phrase, to read or print, with a "Download as a
// spreadsheet" link carrying the same rows as a CSV (with review columns) for Excel or Google Sheets. The
// CSV lives inside the page because the repo never holds .csv files outside seed/ and fixtures/ (hard rule 1).
// Run `npm run translations` after changing guest-portal/src/i18n.ts; the tests fail if the page is stale.
// A language the portal doesn't have yet (Korean, until it is added) shows as an empty column.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DICT } from '../guest-portal/src/i18n.ts'

export const OUT = fileURLToPath(new URL('../docs/translations/', import.meta.url))

/** The review columns, in the order AAFE asked for. */
export const REVIEW_LANGS = [
  { id: 'en', label: 'English', lang: 'en' },
  { id: 'zh', label: '中文 (Traditional)', lang: 'zh-Hant' },
  { id: 'ko', label: '한국어', lang: 'ko' },
  { id: 'es', label: 'Español', lang: 'es' },
] as const

/** Example values for phrases that fill something in, so reviewers read a real sentence. */
export const SAMPLES: Record<string, unknown[]> = {
  progress: [3, 10],
  namesLeft: [3, 'May 11'],
  actAdded: ['Ana Díaz', '4'],
  actUpdated: ['Ana Díaz', '4'],
  actRemoved: ['Ana Díaz', '4'],
  actConfirmed: ['Ana Díaz'],
  actPayment: ['$5,000.00'],
  namedOf: [5, 8],
  openDue: [3, 'May 11'],
  addToSeat: [6],
  editInSeat: [3],
  removeTitle: ['Ana Díaz', 3],
  activityCount: [7],
  balanceOf: ['$15,000', '$25,000'],
  doorsAt: ['6:00 PM'],
  invitationTitle: ['AAFE Foundation'],
}

type Entry = string | ((...args: never[]) => string)
const dicts = DICT as unknown as Record<string, Record<string, Entry> | undefined>

/** One phrase in one language, as the portal shows it (with the sample values filled in). */
export function render(lang: string, key: string): string | null {
  const v = dicts[lang]?.[key]
  if (v === undefined) return null
  return typeof v === 'function' ? (v as (...a: unknown[]) => string)(...(SAMPLES[key] ?? [])) : v
}

export const keys = () => Object.keys(dicts.en!)

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const cell = (s: string) => `"${s.replace(/"/g, '""')}"`

export function buildSheet(): { csv: string; html: string } {
  const present = REVIEW_LANGS.filter((l) => dicts[l.id])
  const missing = REVIEW_LANGS.filter((l) => !dicts[l.id])

  const csvRows = [
    ['Phrase', ...REVIEW_LANGS.map((l) => l.label), 'Example values', 'Approved? (yes / no)', 'Corrections or notes'],
    ...keys().map((k) => [k, ...REVIEW_LANGS.map((l) => render(l.id, k) ?? ''), SAMPLES[k] ? SAMPLES[k]!.join(', ') : '', '', '']),
  ]
  // Byte-order mark: Excel then reads Chinese and Korean correctly.
  const csv = '\uFEFF' + csvRows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

  const rows = keys().map((k) => {
    const en = render('en', k)!
    const tds = REVIEW_LANGS.map((l) => {
      const v = render(l.id, k)
      if (v === null) return `<td class="none" lang="${l.lang}">—</td>`
      const same = l.id !== 'en' && v === en
      return `<td lang="${l.lang}"${same ? ' class="same"' : ''}>${esc(v)}</td>`
    }).join('')
    return `<tr><th scope="row"><code>${esc(k)}</code>${SAMPLES[k] ? `<small>example: ${esc(SAMPLES[k]!.join(', '))}</small>` : ''}</th>${tds}<td class="review"></td></tr>`
  }).join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guest portal translations: AAFE review</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", "Noto Sans", "Noto Sans TC", "Noto Sans KR", sans-serif; margin: 24px; color: #1f2937; background: #fff; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { max-width: 760px; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; text-align: left; }
  thead th { background: #f3f4f6; position: sticky; top: 0; }
  tbody th { font-weight: normal; white-space: nowrap; }
  tbody th small { display: block; color: #6b7280; }
  td.none { color: #9ca3af; text-align: center; }
  th[lang], td[lang] { min-width: 8em; }
  td.same { background: #fef3c7; }
  td.review { min-width: 140px; }
  .key { display: inline-block; padding: 0 6px; background: #fef3c7; }
  @media print { body { margin: 0; } thead th { position: static; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<h1>Guest portal translations: for AAFE review</h1>
<p>These are draft translations of every phrase in the sponsor guest-list portal. Before the portal goes live, an AAFE reviewer who reads each language checks each row and writes any correction in the last column, or in the spreadsheet: <a download="guest-portal-review.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(csv)}">Download as a spreadsheet</a> (opens in Excel or Google Sheets, with “Approved?” and “Corrections” columns).</p>
<p><span class="key">Highlighted</span> cells are the same as the English, which is right only for names like “Asian Americans for Equality”. Phrases with an example show it filled in as sponsors will see it.${missing.length ? ` Not in the portal yet: ${missing.map((l) => `<span lang="${l.lang}">${esc(l.label)}</span>`).join(', ')} (empty column).` : ''}</p>
<p>${keys().length} phrases · ${present.map((l) => `<span lang="${l.lang}">${esc(l.label)}</span>`).join(', ')}. Generated from <code>guest-portal/src/i18n.ts</code>; regenerate with <code>npm run translations</code>.</p>
<table>
<thead><tr><th scope="col">Phrase</th>${REVIEW_LANGS.map((l) => `<th scope="col" lang="${l.lang}">${esc(l.label)}</th>`).join('')}<th scope="col">AAFE review</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`
  return { csv, html }
}

export const PAGE = 'guest-portal-review.html'

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const { html } = buildSheet()
  if (process.argv.includes('--check')) {
    let current = ''
    try { current = readFileSync(OUT + PAGE, 'utf8') } catch { /* missing counts as stale */ }
    if (current !== html) { console.error(`Out of date: docs/translations/${PAGE}. Run: npm run translations`); process.exit(1) }
    console.log('translation sheet up to date')
  } else {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(OUT + PAGE, html)
    console.log(`Wrote docs/translations/${PAGE} (${keys().length} phrases)`)
  }
}
