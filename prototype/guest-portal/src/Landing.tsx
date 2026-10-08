import { ArrowRight, Mail } from 'lucide-react'
import { sponsorOf, tierOf } from '@shared/data'
import type { DB } from '@shared/types'
import { DICT, type Lang } from './i18n'
import Hero, { MissionStrip } from './Hero'

// Root page. In production a guest only ever arrives via the emailed private link,
// so this page simply explains that. Demo links are listed for the capstone review.
export default function Landing({ db, lang }: { db: DB; lang: Lang }) {
  const t = DICT[lang]
  const demo = db.orders.filter((o) => o.portal_token && o.event_id === db.meta.current_event_id)
  // The sample email links to the Silver sponsor with open seats (Acme Community Partners). Found by order,
  // since the demo data sets give Acme different links.
  const primary = demo.find((o) => o.id === 'ord-acme') ?? demo[0]
  const primarySponsor = primary ? sponsorOf(db, primary.sponsor_id) : undefined
  return (
    <main>
      <Hero lang={lang} eyebrow={t.eyebrow} title={t.landingTitle} body={t.landingBody}>
        <div className="mt-6 flex flex-wrap gap-3">
          {primary && (
            <a href={`#/s/${primary.portal_token}`} className="btn-primary inline-flex items-center gap-2 text-base" data-testid="hero-open-list">
              {t.openList} <ArrowRight size={18} />
            </a>
          )}
          <button type="button" onClick={() => document.getElementById('email')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="btn-ghost inline-flex items-center gap-2" data-testid="see-email"><Mail size={16} /> {t.emailSample}</button>
        </div>
      </Hero>
      <section id="email" className="mx-auto max-w-3xl scroll-mt-20 px-5 pt-10">
        <h2 className="type-h2 text-navy-900">{t.emailSample}</h2>
        <div className="card mt-4 overflow-hidden" data-testid="sample-email">
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 border-b border-cream-200 bg-cream-100 px-5 py-3 text-sm">
            <dt className="text-navy-500">{t.emailFrom}</dt><dd className="text-navy-900">AAFE Gala Team &lt;gala-team@aafe-demo.example.org&gt;</dd>
            <dt className="text-navy-500">{t.emailTo}</dt><dd className="text-navy-900">{primarySponsor?.organization_name ?? 'Sponsor'}</dd>
            <dt className="text-navy-500">{t.emailSubject}</dt><dd className="font-semibold text-navy-900">{t.emailSubjectText}</dd>
          </dl>
          <div className="type-body-small px-5 py-5 text-navy-700">
            <img src="./brand/aafe-mark-orange.png" alt="" className="mb-4 h-9 w-9" />
            <p>{t.emailHi}</p>
            <p className="mt-3">{t.emailBody}</p>
            {primary && (
              <a href={`#/s/${primary.portal_token}`} className="btn-primary mt-5 inline-flex items-center gap-2 text-base" data-testid="email-cta">
                {t.emailCta} <ArrowRight size={18} />
              </a>
            )}
            <p className="mt-5 text-navy-600">{t.emailSign}</p>
          </div>
          <p className="border-t border-cream-200 bg-brand-50 px-5 py-2.5 text-xs text-brand-600">{t.emailNote}</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="type-h2 text-navy-900">{t.demoLinks}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {demo.slice(0, 15).map((o) => (   // the Full data sets have ~140 sponsors; the first 15 are enough to try
            <li key={o.id}>
              <a href={`#/s/${o.portal_token}`} className="card block p-4 transition-colors hover:border-brand-400" data-testid={`demo-${o.portal_token}`}>
                <div className="type-h6 text-navy-900">{sponsorOf(db, o.sponsor_id).organization_name}</div>
                <div className="mt-0.5 text-sm text-navy-500">{tierOf(db, o.tier_id).name}</div>
                <div className="mt-2 truncate text-xs text-brand-600">#/s/{o.portal_token}</div>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <MissionStrip lang={lang} />
    </main>
  )
}
