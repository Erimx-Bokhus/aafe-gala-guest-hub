// Reports (decided Oct 14): CSV downloads AAFE opens in Excel or Google Sheets and charts itself; no charts in the app.
// Each download checks the role and is logged (staff_report_* in database/backend.sql; demo builders in ../reports.ts).
import { Download } from 'lucide-react'
import { downloadCsv } from '@shared/ui'
import type { DB } from '@shared/types'
import { PageHead } from '../App'
import { canDo, type StaffApi } from '../api'
import { attendanceCsv, guestsCsv, needsCsv, paymentsCsv, sponsorsCsv } from '../reports'
import { useStaff } from '../store'

type Action = 'reportAttendance' | 'reportSponsors' | 'reportNeeds' | 'reportPayments' | 'reportGuests'

/** "AAFE-Gala-2027-who-came-2027-05-20.csv"; demo files say so in the name. */
export function reportFile(db: DB, slug: string) {
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  return `AAFE-Gala-${ev.year}-${slug}-${day}${ev.is_synthetic ? '-DEMO' : ''}.csv`
}

/** Downloads one report: rows from the server (or demo data), then the CSV. Shared with the iPad check-in page's button. */
export function downloadReport(db: DB, api: StaffApi, action: Action) {
  const synthetic = db.gala_events.find((e) => e.id === db.meta.current_event_id)?.is_synthetic ?? true
  const r = REPORTS.find((x) => x.action === action)!
  return r.rows(api).then((rows) => downloadCsv(reportFile(db, r.slug), r.csv(rows as never, synthetic)))
}

const REPORTS: { action: Action; slug: string; title: string; perRow: string; what: string; who: string
  rows: (api: StaffApi) => Promise<unknown[]>; csv: (rows: never, synthetic: boolean) => (string | number | null | undefined)[][] }[] = [
  { action: 'reportAttendance', slug: 'who-came', title: 'Who came', perRow: 'Guest, and each walk-in',
    what: "Name, email, organization, category, sponsor or \"Individual\", level, the sponsor's commitment and payments, came yes or no, check-in time, iPad and who checked them in",
    who: 'Gala admins (it has guests’ emails)', rows: (api) => api.reportAttendance(), csv: attendanceCsv as never },
  { action: 'reportSponsors', slug: 'sponsors-and-money', title: 'Sponsors and money', perRow: 'Sponsorship or ticket purchase',
    what: 'Sponsor or buyer, contact, relationship manager, level, how they paid, status (pledged, invoice sent, paid), committed, paid, balance, guests included, named and who came, logo and ad',
    who: 'Gala admins and relationship managers', rows: (api) => api.reportSponsors(), csv: sponsorsCsv as never },
  { action: 'reportNeeds', slug: 'food-and-access', title: 'Food and access', perRow: 'Guest',
    what: 'One column per food and accessibility choice (Vegan, Halal, Nut allergy… Wheelchair access…), the "Other" notes, and who hasn’t answered yet. For the caterer and the venue',
    who: 'Gala admins and relationship managers', rows: (api) => api.reportNeeds(), csv: needsCsv as never },
  { action: 'reportPayments', slug: 'payments', title: 'Payments', perRow: 'Payment',
    what: 'Date, sponsor, level, method, check number, amount, fees, refunds, net to AAFE, Give Lively transaction',
    who: 'Gala admins and relationship managers', rows: (api) => api.reportPayments(), csv: paymentsCsv as never },
  { action: 'reportGuests', slug: 'guest-list', title: 'Full guest list', perRow: 'Guest',
    what: 'Everything staff can see about each guest: name, title, organization, email, sponsor, level, table, badge, food, accessibility, note, came',
    who: 'Gala admins (it has guests’ emails)', rows: (api) => api.reportGuests(), csv: guestsCsv as never },
]

export default function Reports() {
  const { db, api, user, act } = useStaff()
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  return (
    <div>
      <PageHead title="Reports" sub={`Spreadsheet downloads (CSV) for ${ev.name}. They open in Excel or Google Sheets, one row per guest, purchase or payment, ready for your own charts. Every download is logged.`} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm" data-testid="reports">
          <thead><tr><th className="th">Report</th><th className="th">One row per</th><th className="th">What's in it</th><th className="th">Who can download</th><th className="th"><span className="sr-only">Download</span></th></tr></thead>
          <tbody>
            {REPORTS.map((r) => {
              const may = canDo(user.role, r.action)
              return (
                <tr key={r.action}>
                  <td className="td font-semibold text-navy-900">{r.title}</td>
                  <td className="td">{r.perRow}</td>
                  <td className="td text-navy-700">{r.what}</td>
                  <td className="td text-navy-700">{r.who}</td>
                  <td className="td text-right">
                    {may
                      ? <button className="btn-primary btn-sm whitespace-nowrap" data-testid={`report-${r.slug}`} onClick={() => void act(downloadReport(db, api, r.action), `${r.title} downloaded`)}><Download size={14} /> Download CSV</button>
                      : <span className="text-xs text-navy-500">Gala admins only</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-navy-600">Also: badges and the printed door list (Badges, iPad check-in) and the Salesforce attendee file (Integrations). Food and access details are staff-only and are never sent to Salesforce. Files with guests’ emails or needs: download them on a staff computer, not a shared iPad, keep them in AAFE’s drive, and delete them under the same rule as the tool’s data.</p>
    </div>
  )
}
