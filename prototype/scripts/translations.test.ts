// Every language has every phrase, nothing is left in English by mistake, and the review sheet AAFE reads
// (docs/translations/) matches the portal's copy. Runs with npm test.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DICT, LANGS, LOCALE } from '../guest-portal/src/i18n'
import { buildSheet, keys, OUT, PAGE, render, REVIEW_LANGS, SAMPLES } from './translation-sheet.mts'

/** Phrases that are rightly the same in another language: proper names. */
const SAME_AS_ENGLISH_OK: Record<string, string[]> = { es: ['orgName'] }

const langs = Object.keys(DICT) as (keyof typeof DICT)[]
const dicts = DICT as unknown as Record<string, Record<string, unknown>>

describe('guest portal translations', () => {
  it('the language menu, locales and dictionaries list the same languages', () => {
    expect(LANGS.map((l) => l.id).sort()).toEqual([...langs].sort())
    expect(Object.keys(LOCALE).sort()).toEqual([...langs].sort())
    expect(langs.every((l) => REVIEW_LANGS.some((r) => r.id === l))).toBe(true)
  })

  it.each(langs)('%s has exactly the English phrases, none empty', (lang) => {
    expect(Object.keys(dicts[lang]!).sort()).toEqual(keys().sort())
    for (const k of keys()) expect(render(lang, k)!.trim(), `${lang}.${k}`).not.toBe('')
  })

  it.each(langs.filter((l) => l !== 'en'))('%s translates every phrase (only proper names stay in English)', (lang) => {
    const same = keys().filter((k) => render(lang, k) === render('en', k))
    expect(same).toEqual(SAME_AS_ENGLISH_OK[lang] ?? [])
  })

  it('every phrase that fills something in keeps it, in every language, and has an example for reviewers', () => {
    const fns = keys().filter((k) => typeof dicts.en![k] === 'function')
    expect(fns.sort()).toEqual(Object.keys(SAMPLES).sort())
    for (const lang of langs) for (const k of fns) {
      for (const v of SAMPLES[k]!) expect(render(lang, k), `${lang}.${k}`).toContain(String(v))
    }
  })

  it('the review sheet is up to date (run: npm run translations)', () => {
    expect(readFileSync(OUT + PAGE, 'utf8')).toBe(buildSheet().html)
  })

  it('the sheet has a row per phrase and English | 中文 | 한국어 | Español columns', () => {
    const { csv, html } = buildSheet()
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(keys().length + 1)
    expect(lines[0]).toContain('"English","中文 (Traditional)","한국어","Español"')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(html).toContain('lang="zh-Hant"')
    expect(html.match(/<tr><th scope="row">/g)).toHaveLength(keys().length)
    // The spreadsheet travels inside the page: the repo holds no .csv outside seed/ and fixtures/.
    const link = /<a download="guest-portal-review\.csv" href="data:text\/csv;charset=utf-8,([^"]+)">/.exec(html)
    expect(link && decodeURIComponent(link[1]!)).toBe(csv)
  })
})
