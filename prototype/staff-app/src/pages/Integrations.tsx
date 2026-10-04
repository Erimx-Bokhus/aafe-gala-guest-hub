import { useRef, useState } from 'react'
import { CloudDownload, Download, RefreshCw, Upload } from 'lucide-react'
import { processorFee } from '@shared/data'
import { Pill, ago, downloadCsv, fmtDate } from '@shared/ui'
import { PageHead } from '../App'
import { importGiveLively, salesforceSyncNow, useStaff, type GLRow } from '../store'

// Column names follow Give Lively's "Line Items (All)" report. Confirm against a real AAFE export before launch.
const COLS: Record<keyof GLRow, string[]> = {
  txn: ['transaction id', 'donation id', 'id'], date: ['donation date', 'date', 'created at'], first: ['first name', 'donor first name'], last: ['last name', 'donor last name'],
  email: ['email', 'donor email'], company: ['company name', 'company', 'organization'], campaign: ['campaign name', 'campaign'], ticketLevel: ['ticket level', 'ticket name', 'item name'],
  method: ['payment method'], original: ['original amount'], covered: ['covered transaction fee amount'], gross: ['gross amount', 'amount'], fee: ['transaction fee amount'], net: ['net amount'],
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = '' } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}
function toRows(text: string): GLRow[] {
  const all = parseCsv(text)
  const hi = all.findIndex((r) => r.some((h) => h.toLowerCase().trim() === 'gross amount' || h.toLowerCase().trim() === 'transaction id'))
  if (hi < 0) throw new Error('Could not find Give Lively headers (e.g. “Gross Amount”).')
  const head = all[hi].map((h) => h.toLowerCase().trim())
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, c]) => [k, head.findIndex((h) => c.includes(h))])) as Record<keyof GLRow, number>
  const num = (s: string | undefined) => Number(String(s ?? '').replace(/[$,]/g, '')) || 0
  return all.slice(hi + 1).map((r) => {
    const g = (k: keyof GLRow) => (idx[k] >= 0 ? r[idx[k]] ?? '' : '')
    const gross = num(g('gross')), original = num(g('original')) || gross, covered = num(g('covered')), fee = num(g('fee'))
    return { txn: g('txn') || `GL-${Math.random().toString(36).slice(2, 10)}`, date: g('date') || new Date().toISOString(), first: g('first'), last: g('last'), email: g('email'), company: g('company'), campaign: g('campaign'), ticketLevel: g('ticketLevel'), method: g('method'), original, covered, gross, fee, net: num(g('net')) || gross - fee }
  }).filter((r) => r.gross > 0 && r.email)
}
const SAMPLE_HEAD = ['Donation Date', 'Transaction ID', 'First Name', 'Last Name', 'Email', 'Company Name', 'Campaign Name', 'Ticket Level', 'Payment Method', 'Original Amount', 'Covered Transaction Fee Amount', 'Gross Amount', 'Transaction Fee Amount', 'Net Amount']
const sampleRows = () => [
  ['2026-10-01T14:05:00Z', 'GL-55501234', 'Grace', 'Yoon', 'grace.yoon@brightpath.example.org', 'Brightpath Credit Union', 'AAFE Gala 2027', 'Bronze — Performance Sponsor', 'card', 10000, 0, 10000, processorFee('card', 10000), 10000 - processorFee('card', 10000)],
  ['2026-10-01T16:40:00Z', 'GL-55501299', 'Luis', 'Romero', 'luis.romero@mail.example.org', '', 'AAFE Gala 2027', 'Community Ticket', 'bank', 250, 2, 252, processorFee('givelively_ach', 252), 252 - processorFee('givelively_ach', 252)],
  ['2026-10-02T09:12:00Z', 'GL-55501342', 'Ama', 'Boateng', 'ama.boateng@mail.example.org', 'Boateng & Co.', 'AAFE Gala 2027', 'Corporate Ticket', 'card', 500, 11.3, 511.3, processorFee('card', 511.3), 511.3 - processorFee('card', 511.3)],
]

export default function Integrations() {
  const { db, update, toast } = useStaff()
  const file = useRef<HTMLInputElement>(null)
  const [lastPull, setLastPull] = useState<string | null>(null)
  const [preview, setPreview] = useState<GLRow[] | null>(null)
  const [err, setErr] = useState('')
  const pending = db.salesforce_sync.filter((s) => s.status === 'pending').length
  const synced = db.salesforce_sync.filter((s) => s.status === 'synced').length
  const lastSync = db.salesforce_sync.map((s) => s.last_synced_at).filter(Boolean).sort().at(-1)
  const emails = db.email_log.slice().reverse().slice(0, 12)

  const runImport = (rows: GLRow[]) => {
    const r = importGiveLively(db, rows)
    update(() => r.db)
    toast(`Give Lively: ${r.created} new, ${r.skipped} already imported — guest-list emails sent`)
  }
  const pullNow = () => {
    const r = sampleRows()[Math.floor(Math.random() * 3)]
    const row: GLRow = { txn: `GL-${Math.floor(1e7 + Math.random() * 9e7)}`, date: new Date().toISOString(), first: String(r[2]), last: String(r[3]), email: String(r[4]).replace('@', `+${Math.floor(Math.random() * 999)}@`), company: String(r[5]), campaign: String(r[6]), ticketLevel: String(r[7]), method: String(r[8]), original: Number(r[9]), covered: Number(r[10]), gross: Number(r[11]), fee: Number(r[12]), net: Number(r[13]) }
    runImport([row]); setLastPull(new Date().toISOString())
  }

  return (
    <div>
      <PageHead title="Integrations & email" sub="How data gets in (Give Lively), goes out (Salesforce), and reaches guests (email). Connections here are simulated in the prototype." />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-navy-900">Give Lively</h2><p className="text-sm text-navy-600">Ticket and sponsorship purchases → orders, payments, per-ticket fees, and an automatic guest-list email.</p></div><Pill tone="amber">Simulated</Pill></div>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-navy-700">
            <li>AAFE admin creates a Zapier API key in the Give Lively Nonprofit Admin Portal.</li>
            <li>Backend stores it as a secret and polls the JSON endpoint every 10–15 min with <code className="rounded bg-navy-50 px-1 text-xs">?start_time_ms=</code>.</li>
            <li>New donation → order + payment (Original, Covered fee, Gross, Transaction fee, Net) → seats → portal-link email.</li>
            <li>Backup: upload the “Line Items (All)” CSV export below. Duplicates are skipped by transaction ID.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={pullNow} data-testid="gl-pull"><CloudDownload size={16} /> Pull now (simulated)</button>
            <button className="btn-ghost" onClick={() => file.current?.click()}><Upload size={16} /> Import CSV</button>
            <button className="btn-ghost" onClick={() => downloadCsv('givelively-line-items-SAMPLE-SYNTHETIC.csv', [SAMPLE_HEAD, ...sampleRows()])}><Download size={16} /> Sample CSV</button>
            <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setErr(''); setPreview(toRows(await f.text())) } catch (x) { setErr((x as Error).message) } e.target.value = '' }} />
          </div>
          <p className="mt-2 text-xs text-navy-500">Last pull: {lastPull ? ago(lastPull) : 'not yet this session'} · Endpoint: secure.givelively.org/nonprofits/[ORG_ID]/json_dataclips/[API_KEY].json</p>
          {err && <p className="mt-2 text-sm font-medium text-rose-700">{err}</p>}
          {preview && (
            <div className="mt-4 rounded-lg border border-navy-100">
              <div className="flex items-center justify-between border-b border-navy-100 px-3 py-2 text-sm"><span className="font-semibold">{preview.length} rows ready</span><span className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => setPreview(null)}>Cancel</button><button className="btn-primary btn-sm" onClick={() => { runImport(preview); setPreview(null) }}>Import</button></span></div>
              <ul className="max-h-48 divide-y divide-navy-100 overflow-y-auto text-xs">{preview.map((r) => <li key={r.txn} className="flex justify-between px-3 py-1.5"><span>{r.company || `${r.first} ${r.last}`} · {r.ticketLevel}</span><span className="tabular-nums">${r.gross.toFixed(2)} · fee ${r.fee.toFixed(2)}</span></li>)}</ul>
            </div>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-navy-900">Salesforce (Nonprofit Success Pack)</h2><p className="text-sm text-navy-600">The year-over-year historical ledger: who gave, how much, how, and who attended.</p></div><Pill tone="gray">Not connected</Pill></div>
          <table className="mt-4 w-full text-sm"><thead><tr className="border-b border-navy-100"><th className="th pl-0">This app</th><th className="th">Salesforce object</th></tr></thead>
            <tbody className="divide-y divide-navy-100">
              {[['Sponsor', 'Account (Organization) + Contact'], ['Order (per gala)', 'Opportunity · Campaign = “AAFE Gala 2027”'], ['Payment', 'npe01__OppPayment__c (Payment)'], ['Guest', 'Contact + CampaignMember (status: Attended)'], ['Fees', 'Opportunity custom fields: Processor_Fee__c, Net_Amount__c']].map(([a, b]) => <tr key={a}><td className="py-2 pr-3 font-medium text-navy-800">{a}</td><td className="py-2 text-navy-600">{b}</td></tr>)}
            </tbody></table>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-cream-100 p-2"><div className="text-xl font-semibold tabular-nums">{synced}</div><div className="text-xs text-navy-500">synced</div></div>
            <div className="rounded-lg bg-cream-100 p-2"><div className="text-xl font-semibold tabular-nums text-amber-700" data-testid="sf-pending">{pending}</div><div className="text-xs text-navy-500">pending</div></div>
            <div className="rounded-lg bg-cream-100 p-2"><div className="text-sm font-semibold">{lastSync ? fmtDate(lastSync, 'en-US', true) : '—'}</div><div className="text-xs text-navy-500">last sync</div></div>
          </div>
          <button className="btn-ghost mt-4" onClick={() => { const r = salesforceSyncNow(db); update(() => r.db); toast(`${r.n} records pushed to Salesforce (simulated)`) }}><RefreshCw size={15} /> Sync now (simulated)</button>
          <p className="mt-2 text-xs text-navy-500">Give Lively’s own free Salesforce integration can also sync donations hourly. This app adds what Give Lively doesn’t know: checks, direct ACH, comps, seats and attendance.</p>
        </section>

        <section className="card overflow-hidden xl:col-span-2">
          <div className="border-b border-navy-100 px-5 py-3"><h2 className="font-semibold text-navy-900">Email log</h2><p className="text-xs text-navy-500">Portal links fire automatically after a Give Lively purchase or when staff record a pledge/payment. QR invitations are sent by staff.</p></div>
          <table className="w-full min-w-[700px] text-sm"><thead className="bg-cream-100"><tr><th className="th">When</th><th className="th">Template</th><th className="th">To</th><th className="th">Trigger</th><th className="th">Status</th></tr></thead>
            <tbody className="divide-y divide-navy-100">{emails.map((e) => <tr key={e.id}><td className="td whitespace-nowrap">{e.sent_at ? fmtDate(e.sent_at, 'en-US', true) : '—'}</td><td className="td">{e.template.replace(/_/g, ' ')}</td><td className="td">{e.to_name} <span className="text-xs text-navy-500">{e.to_email}</span></td><td className="td">{e.trigger.replace(/_/g, ' ')}</td><td className="td"><Pill tone={e.status === 'queued' ? 'amber' : 'green'}>{e.status}</Pill></td></tr>)}</tbody></table>
        </section>
      </div>
    </div>
  )
}
