// AAFE GUEST PORTAL (sponsors + ticket buyers)
// Entry: the private link AAFE emails after a Give Lively purchase or a recorded check/ACH pledge:
//   https://<guest-portal-host>/#/s/<token>
// This app has no navigation to, or knowledge of, the staff app.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AafeLogo } from '@shared/Logo'
import { loadDB } from '@shared/data'
import { DisplayControls, LanguageSelect, PrototypeBanner, useDisplayPrefs, useRoute } from '@shared/ui'
import type { DB } from '@shared/types'
import { DICT, LANGS, type Lang } from './i18n'
import Portal from './Portal'
import Landing from './Landing'

// English only for v1. AAFE can turn this on after a native speaker reviews the draft translations (Natalie's review of #240, Oct 24).
const SHOW_LANGUAGES = false

export default function App() {
  const path = useRoute()
  const [db, setDb] = useState<DB>(loadDB)
  const [lang, setLang] = useState<Lang>('en')
  const prefs = useDisplayPrefs()
  const t = DICT[lang]
  const update = useCallback((fn: (d: DB) => DB) => setDb((d) => fn(d)), [])
  // AAFE brand palette (orange + cream + white) for the guest-facing app
  useEffect(() => { document.documentElement.classList.add('brand-warm') }, [])
  // Screen readers and browser translation read the page language from <html lang>
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang }, [lang])
  const token = useMemo(() => path.match(/^\/s\/([^/]+)/)?.[1] ?? null, [path])

  return (
    <div lang={lang === 'zh' ? 'zh-Hant' : lang} className={`min-h-screen bg-cream-50 ${lang === 'zh' ? 'font-zh' : lang === 'ko' ? 'font-ko' : ''}`}>
      {/* Skip link: only visible when reached with Tab. Not a plain #hash link, because the hash router would treat it as a page. */}
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-600 focus:shadow-lg">{t.skipToContent}</a>
      <PrototypeBanner dataSwitch />
      <header className="no-print sticky top-0 z-30 border-b border-cream-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5">
          <a href="#/" aria-label="Asian Americans for Equality — home"><AafeLogo /></a>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {SHOW_LANGUAGES && <LanguageSelect value={lang} onChange={setLang} options={LANGS} label={t.langLabel} />}
            <DisplayControls prefs={prefs} labels={{ smaller: t.smaller, larger: t.larger, theme: prefs.dark ? t.toLight : t.toDark }} />
          </div>
        </div>
      </header>
      <div id="main" tabIndex={-1} className="outline-none">
        {token ? <Portal db={db} update={update} token={token} lang={lang} /> : <Landing db={db} lang={lang} />}
      </div>
    </div>
  )
}
