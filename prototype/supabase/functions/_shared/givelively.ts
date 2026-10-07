// Give Lively donation -> the normalized row gl_import() expects.
//
// Give Lively documents the Zapier JSON endpoints but not the field names in
// each donation object, so fields are found by name, ignoring case, spaces,
// underscores and nesting ("Transaction ID", "transaction_id", donor.email all match).
// The names follow the "Line Items (All)" CSV report. Before launch, run one
// poll against AAFE's account and check givelively_raw: rows marked 'unmapped'
// mean a name below needs adding.
// Docs: https://www.givelively.org/resources/understand-zapiers-json-endpoints

export interface GLRow {
  txn: string; date: string | null; first: string; last: string; email: string; company: string; campaign: string
  ticket_level: string; method: string; status: string; quantity: number | null
  original: number | null; covered: number | null; gross: number | null; fee: number | null; net: number | null; refunded: number | null
}

const FIELDS: Record<keyof GLRow, string[]> = {
  txn: ['transactionid', 'donationid', 'id'],
  date: ['donationdate', 'createdat', 'date', 'donatedat'],
  first: ['firstname', 'donorfirstname'],
  last: ['lastname', 'donorlastname'],
  email: ['email', 'donoremail', 'emailaddress'],
  company: ['companyname', 'company', 'organizationname', 'organization'],
  campaign: ['campaignname', 'campaign', 'campaigntitle', 'eventname'],
  ticket_level: ['ticketlevel', 'ticketname', 'tickettype', 'itemname'],
  method: ['paymentmethod', 'paymenttype', 'paymentmethodtype'],
  status: ['donationstatus', 'status', 'paymentstatus'],
  quantity: ['quantity', 'ticketquantity'],
  original: ['originalamount'],
  covered: ['coveredtransactionfeeamount', 'coveredfeeamount', 'coveredfee'],
  gross: ['grossamount', 'amount', 'totalamount'],
  fee: ['transactionfeeamount', 'transactionfee', 'processingfee', 'fee'],
  net: ['netamount'],
  refunded: ['totalrefundedamount', 'refundedamount'],
}
const MONEY = new Set<keyof GLRow>(['original', 'covered', 'gross', 'fee', 'net', 'refunded'])

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Flatten nested objects: both the full path (donor.email -> "donoremail") and the leaf ("email") are indexed. */
function flatten(obj: unknown, prefix = '', out = new Map<string, unknown>()): Map<string, unknown> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, prefix + norm(k), out)
      else {
        out.set(prefix + norm(k), v)
        if (prefix && !out.has(norm(k))) out.set(norm(k), v)
      }
    }
  }
  return out
}

function find(f: Map<string, unknown>, field: keyof GLRow): unknown {
  for (const name of FIELDS[field]) {
    if (f.get(name) != null && f.get(name) !== '') return f.get(name)
    // Amounts sent in cents, e.g. "gross_amount_in_cents" / "amountCents"
    if (MONEY.has(field)) for (const c of [name + 'incents', name + 'cents']) if (f.get(c) != null) return Number(f.get(c)) / 100
  }
  return null
}

const money = (v: unknown) => (v == null || v === '' ? null : Number(String(v).replace(/[$,]/g, '')))
const text = (v: unknown) => (v == null ? '' : String(v).trim())

export function normalize(raw: unknown): GLRow {
  const f = flatten(raw)
  const get = (k: keyof GLRow) => find(f, k)
  const date = get('date')
  return {
    txn: text(get('txn')), first: text(get('first')), last: text(get('last')), email: text(get('email')),
    company: text(get('company')), campaign: text(get('campaign')), ticket_level: text(get('ticket_level')),
    method: text(get('method')), status: text(get('status')),
    // epoch milliseconds or an ISO string
    date: date == null ? null : typeof date === 'number' ? new Date(date).toISOString() : text(date),
    quantity: money(get('quantity')),
    original: money(get('original')), covered: money(get('covered')), gross: money(get('gross')),
    fee: money(get('fee')), net: money(get('net')), refunded: money(get('refunded')),
  }
}

export type Verdict = 'import' | 'not_gala' | 'not_settled' | 'unmapped'

// The endpoint returns ALL of AAFE's donations, not just the gala; classify() keeps this gala's page only.

/** Page names compare NFKC, case-folded, trimmed, inner spaces collapsed (same as name_key() in backend.sql). */
const pageKey = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * `pageNames`: this gala's Give Lively page name (gala_events.givelively_page_name). Matched exactly,
 * not as a substring, so "AAFE's 52nd Annual Gala Auction" or another year's page isn't imported.
 */
export function classify(row: GLRow, pageNames: string[]): Verdict {
  if (!row.txn || !row.email || !(row.gross ?? row.original)) return 'unmapped'
  const keys = pageNames.map(pageKey).filter(Boolean)
  if (!keys.includes(pageKey(row.campaign))) return 'not_gala'
  // Bank (ACH) payments settle over days; Give Lively re-sends the donation when its status changes.
  if (/fail|declin|cancel|pending|processing|incomplete/i.test(row.status)) return 'not_settled'
  return 'import'
}
