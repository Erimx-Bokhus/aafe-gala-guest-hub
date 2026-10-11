import { useEffect, useState } from 'react'

// AAFE logo: the house mark is ALWAYS orange. The name cycles through languages,
// like the animated logo on aafe.org (English → Español → 中文 → 한국어).
const NAMES = [
  { lang: 'en', lines: ['Asian Americans', 'for Equality'] },
  { lang: 'es', lines: ['Asiáticos Americanos', 'por la Igualdad'] },
  { lang: 'zh-Hant', lines: ['亞洲人平等會'] },
  { lang: 'ko', lines: ['아주인 평등회'] },
]

export function AafeLogo({ tone = 'dark', size = 'md', cycle = true }: { tone?: 'dark' | 'light'; size?: 'sm' | 'md'; cycle?: boolean }) {
  const reduced = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!cycle || reduced) return
    const id = setInterval(() => setI((x) => (x + 1) % NAMES.length), 2600)
    return () => clearInterval(id)
  }, [cycle, reduced])
  const mark = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9 sm:h-10 sm:w-10'
  const txt = tone === 'light' ? 'text-white' : 'text-black dark:text-[#F5F5F5]'
  return (
    <span className="flex items-center gap-2.5" role="img" aria-label="Asian Americans for Equality (AAFE)">
      <img src="./brand/aafe-mark-orange.png" alt="" className={`${mark} shrink-0`} />
      <span className={`logo-name font-sans leading-[1.15] ${txt} ${size === 'sm' ? 'text-[0.8125rem]' : 'text-[0.875rem] sm:text-[0.9375rem]'}`} aria-hidden>
        {NAMES.map((n, k) => (
          <span key={n.lang} lang={n.lang} className={`${k === i ? 'on' : ''} flex min-h-[2.3em] flex-col justify-center whitespace-nowrap ${n.lines.length === 1 ? 'text-[1.25em] font-zh' : ''}`}>
            {n.lines.map((l) => <span key={l} className="block">{l}</span>)}
          </span>
        ))}
      </span>
    </span>
  )
}
