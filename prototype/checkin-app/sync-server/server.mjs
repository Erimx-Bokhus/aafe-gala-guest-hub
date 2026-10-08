// AAFE Gala check-in sync server (prototype — synthetic data only).
// Plain Node http, no dependencies. Persists to sync-server/data.json, first seeded from the door list's check_ins.
// The iPad check-in app and the staff app both read/write here, so an arrival on the iPad shows up in the staff app.
//
//   GET    /api/health
//   GET    /api/checkins?event_id=ev-2027      -> { check_ins, closures, server_time }
//   POST   /api/checkins                        body: CheckIn (id optional) -> { ok, check_in, duplicate }
//   DELETE /api/checkins/:id                    (undo)  -> { ok, removed }
//   POST   /api/closures                        body: { event_id, guest_ids[], closed_by } ("Close gala": remaining guests = no-show)
//   DELETE /api/closures/:event_id              (re-open gala)
//   POST   /api/reset                           restore seed check-ins (demo / tests only)
//
// PRODUCTION: replace with Supabase tables `check_ins` + `gala_closures` and RLS (see docs/WORKFLOW.md).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const DATA = process.env.DATA_FILE || path.join(DIR, 'data.json')
// Demo only: start from the check-ins already on the door list (same 553 invented guests the iPad shows).
const SEED = path.join(DIR, '..', 'src', 'doorlist.json')
const PORT = Number(process.env.PORT || 8787)

function seedState() {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'))
  return { synthetic: true, check_ins: seed.check_ins.map((c) => ({ ...c, source: 'seed' })), closures: {}, log: [] }
}
let state
try { state = JSON.parse(fs.readFileSync(DATA, 'utf8')) } catch { state = seedState(); save() }
state.closures ??= {}; state.log ??= []
function save() {
  const tmp = DATA + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, DATA)
}
const log = (action, detail) => { state.log.push({ at: new Date().toISOString(), action, ...detail }); if (state.log.length > 2000) state.log = state.log.slice(-2000) }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Device' }
function send(res, code, body) {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = ''
    req.on('data', (c) => { s += c; if (s.length > 1e6) { reject(new Error('too large')); req.destroy() } })
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}) } catch { reject(new Error('invalid JSON')) } })
  })
}
const str = (v, max = 200) => (v == null ? null : String(v).slice(0, max))
const METHODS = new Set(['qr', 'search', 'exception'])

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  // Accept both /api/... and any proxy prefix ending in /api/...
  const url = new URL(req.url, 'http://x')
  const p = url.pathname.replace(/^.*?(\/api\/)/, '/api/')
  try {
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, synthetic: true, check_ins: state.check_ins.length, server_time: new Date().toISOString() })

    if (req.method === 'GET' && p === '/api/checkins') {
      const ev = url.searchParams.get('event_id')
      const list = ev ? state.check_ins.filter((c) => c.event_id === ev) : state.check_ins
      const closures = ev ? Object.fromEntries(Object.entries(state.closures).filter(([k]) => k === ev)) : state.closures
      return send(res, 200, { check_ins: list, closures, server_time: new Date().toISOString() })
    }

    if (req.method === 'POST' && p === '/api/checkins') {
      const b = await readBody(req)
      if (!b.event_id || (!b.guest_id && !b.arrival_name)) return send(res, 400, { ok: false, error: 'event_id and guest_id (or arrival_name for exceptions) are required' })
      if (b.method && !METHODS.has(b.method)) return send(res, 400, { ok: false, error: 'bad method' })
      if (b.id) { const same = state.check_ins.find((c) => c.id === b.id); if (same) return send(res, 200, { ok: true, duplicate: true, check_in: same }) }
      if (b.guest_id) { const dup = state.check_ins.find((c) => c.event_id === b.event_id && c.guest_id === b.guest_id); if (dup) return send(res, 200, { ok: true, duplicate: true, check_in: dup }) }
      const ci = {
        id: str(b.id, 80) || 'ci-' + crypto.randomUUID().slice(0, 12), event_id: str(b.event_id, 40), guest_id: str(b.guest_id, 80), order_id: str(b.order_id, 80),
        arrival_name: str(b.arrival_name), method: b.method || (b.guest_id ? 'search' : 'exception'), type: str(b.type) || 'standard',
        checked_in_by: str(b.checked_in_by) || 'unknown', note: str(b.note, 500) || '', checked_in_at: str(b.checked_in_at, 40) || new Date().toISOString(),
        source: str(b.source, 20) || 'unknown', device: str(req.headers['x-device'], 60), received_at: new Date().toISOString(),
      }
      state.check_ins.push(ci); log('checkin.add', { id: ci.id, guest_id: ci.guest_id, by: ci.checked_in_by }); save()
      return send(res, 201, { ok: true, duplicate: false, check_in: ci })
    }

    let m
    if (req.method === 'DELETE' && (m = p.match(/^\/api\/checkins\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1])
      const before = state.check_ins.length
      state.check_ins = state.check_ins.filter((c) => c.id !== id)
      const removed = before !== state.check_ins.length
      if (removed) { log('checkin.undo', { id }); save() }
      return send(res, 200, { ok: true, removed })
    }

    if (req.method === 'POST' && p === '/api/closures') {
      const b = await readBody(req)
      if (!b.event_id || !Array.isArray(b.guest_ids)) return send(res, 400, { ok: false, error: 'event_id and guest_ids[] required' })
      state.closures[b.event_id] = { event_id: str(b.event_id, 40), guest_ids: b.guest_ids.map((x) => str(x, 80)), closed_by: str(b.closed_by) || 'unknown', closed_at: new Date().toISOString() }
      log('gala.closed', { event_id: b.event_id, no_shows: b.guest_ids.length }); save()
      return send(res, 200, { ok: true, closure: state.closures[b.event_id] })
    }
    if (req.method === 'DELETE' && (m = p.match(/^\/api\/closures\/([^/]+)$/))) {
      const ev = decodeURIComponent(m[1])
      const removed = !!state.closures[ev]
      delete state.closures[ev]
      if (removed) { log('gala.reopened', { event_id: ev }); save() }
      return send(res, 200, { ok: true, removed })
    }

    if (req.method === 'POST' && p === '/api/reset') { state = seedState(); log('demo.reset', {}); save(); return send(res, 200, { ok: true }) }

    return send(res, 404, { ok: false, error: 'not found' })
  } catch (e) {
    return send(res, 400, { ok: false, error: String(e.message || e) })
  }
})
server.listen(PORT, '0.0.0.0', () => console.log(`AAFE check-in sync server on :${PORT} (data: ${DATA})`))
