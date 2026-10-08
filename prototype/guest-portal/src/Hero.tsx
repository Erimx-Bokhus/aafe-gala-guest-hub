import { useEffect, useState, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import { DICT, type Lang } from './i18n'

// Hero slideshow — gala scenes from AAFE's 50th anniversary (images pending AAFE approval).
export const SLIDES = [
  { src: './photos/gala-rooftop-skyline.jpg', alt: 'An AAFE elder in a black jacket greets guests on the rooftop terrace, One World Trade Center behind', pos: 'center bottom' },
  { src: './photos/gala-50th-panel.jpg', alt: 'Speakers on stage at AAFE’s 50th anniversary gala', pos: 'center' },
  { src: './photos/gala-panelist-pioneer.jpg', alt: 'A pioneer panelist speaking during the AAFE gala program', pos: 'center 30%' },
  { src: './photos/gala-reception.jpg', alt: 'Gala reception detail with guests mingling', pos: 'center 40%' },
  { src: './photos/gala-panelist-honoree.jpg', alt: 'An honoree sharing remarks at the AAFE gala', pos: 'center 30%' },
]

export function useReducedMotion() {
  const [r] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  return r
}

export default function Hero({ lang, eyebrow, title, body, children }: { lang: Lang; eyebrow: string; title: string; body: string; children?: ReactNode }) {
  const t = DICT[lang]
  const reduced = useReducedMotion()
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(!reduced)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 6000)
    return () => clearInterval(id)
  }, [playing])

  return (
    <section className="border-b border-cream-200 bg-cream-100">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-10 md:grid-cols-[1.05fr_1fr] md:gap-12 md:py-14">
        <div>
          <div className="mb-5 h-1 w-16 rounded-full bg-brand-500" aria-hidden />
          <p className="type-nav text-brand-600">{eyebrow}</p>
          <h1 className="type-display mt-3 text-navy-900">{title}</h1>
          <p className="type-lead mt-4 max-w-xl text-navy-600">{body}</p>
          {children}
        </div>
        <div className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-cream-200 shadow-xl md:aspect-[4/5]">
            {SLIDES.map((s, k) => (
              <img key={s.src} src={s.src} alt={k === i ? s.alt : ''} aria-hidden={k !== i}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-out ${k === i ? 'opacity-100' : 'opacity-0'}`}
                style={{ objectPosition: s.pos }} loading={k === 0 ? 'eager' : 'lazy'} />
            ))}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-4 pb-3">
              <div className="flex gap-1.5">
                {SLIDES.map((s, k) => (
                  <button key={s.src} onClick={() => setI(k)} aria-label={`${t.slide} ${k + 1}`} aria-current={k === i}
                    className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-white' : 'w-2.5 bg-white/50 hover:bg-white/80'}`} />
                ))}
              </div>
              <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? t.pause : t.play} title={playing ? t.pause : t.play}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60">
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function MissionStrip({ lang }: { lang: Lang }) {
  const t = DICT[lang]
  const photos = [
    { src: './photos/community-youth-delivery.jpg', alt: 'Young AAFE volunteers delivering supplies to neighbors', pos: 'center 30%' },
    { src: './photos/community-older-adults.jpg', alt: 'Older adults at an AAFE community program holding framed artwork', pos: 'center 30%' },
    { src: './photos/community-small-business.jpg', alt: 'A small-business owner supported by AAFE’s small-business programs', pos: 'center 25%' },
  ]
  return (
    <section className="border-y border-cream-200 bg-cream-100">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <p className="type-lead max-w-3xl text-navy-800">{t.mission}</p>
        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          {photos.map((p) => (
            <img key={p.src} src={p.src} alt={p.alt} loading="lazy" className="aspect-[4/5] w-full rounded-xl object-cover" style={{ objectPosition: p.pos }} />
          ))}
        </div>
        <p className="mt-3 text-xs text-navy-500">{t.photoCredit}</p>
      </div>
    </section>
  )
}
