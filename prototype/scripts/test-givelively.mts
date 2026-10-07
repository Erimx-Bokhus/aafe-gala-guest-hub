import { normalize, classify } from '../supabase/functions/_shared/givelively.ts'
import assert from 'node:assert'
// CSV-style keys
const a = normalize({ 'Transaction ID': 'GL-1', 'Donation Date': '2026-10-01', 'First Name': 'Grace', 'Last Name': 'Yoon', Email: 'g@example.org', 'Campaign Name': 'AAFE Gala 2027', 'Ticket Level': 'Gold', 'Payment Method': 'card', 'Original Amount': '$25,000.00', 'Gross Amount': '25000', 'Transaction Fee Amount': '550.30' })
assert.equal(a.txn, 'GL-1'); assert.equal(a.original, 25000); assert.equal(a.fee, 550.3); assert.equal(classify(a, ['aafe gala 2027']), 'import')
// snake_case + nested donor + cents + epoch ms
const b = normalize({ id: 987, created_at: 1759327200000, donor: { first_name: 'Luis', email: 'l@example.org' }, campaign: { name: 'Annual Appeal' }, amount_in_cents: 25000, status: 'succeeded' })
assert.equal(b.txn, '987'); assert.equal(b.email, 'l@example.org'); assert.equal(b.gross, 250); assert.equal(b.campaign, 'Annual Appeal'); assert.ok(b.date?.startsWith('2025-'))
assert.equal(classify(b, ['AAFE Gala 2027']), 'not_gala')
assert.equal(classify({ ...a, status: 'pending' }, ['AAFE Gala 2027']), 'not_settled')
// The gala's page name matches exactly, not as a substring (docs/import-matching-spec.md, section 3)
assert.equal(classify(a, ['AAFE Gala']), 'not_gala')
assert.equal(classify(a, ['  aafe  gala 2027 ']), 'import')
assert.equal(classify(a, []), 'not_gala')
assert.equal(classify(normalize({ foo: 1 }), ['x']), 'unmapped')
console.log('normalizer tests passed')
