import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { DisplayControls, type Prefs } from '@shared/ui'
import { AafeLogo } from '@shared/Logo'
import type { DB, StaffUser } from '@shared/types'
import { sendSignInLink, supabase } from '../supabase'

// LIVE (Supabase configured): staff get a one-time sign-in link by email; the role comes from staff_users via
// staff_me() and is enforced by RLS. DEMO (no Supabase): picks a synthetic staff user, no real sign-in.
export default function Login({ db, prefs, notice, onLogin }: { db: DB; prefs: Prefs; notice?: string; onLogin: (u: StaffUser) => void }) {
  const live = !!supabase
  const [email, setEmail] = useState(live ? '' : db.staff_users[0].email)
  const [pw, setPw] = useState('demo-password')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr('')
    if (live) {
      if (!email.trim()) return setErr('Enter your work email.')
      setBusy(true)
      try { await sendSignInLink(email); setSent(true) }
      // Same message whether or not the email is invited, so the form doesn't reveal who is on the staff list.
      catch { setErr('We couldn’t send a sign-in link. Check the email, or ask the gala admin to invite you.') }
      finally { setBusy(false) }
      return
    }
    const u = db.staff_users.find((s) => s.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || !pw) return setErr('That email is not on the AAFE staff list for this demo.')
    onLogin(u)
  }
  return (
    <div className="grid min-h-[calc(100vh-28px)] lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img src="./photos/gala-50th-panel.jpg" alt="Speakers on stage at AAFE’s 50th anniversary gala" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 40%' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#313131]/85 via-[#313131]/20 to-transparent" />
        <div className="absolute bottom-0 p-10 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F0C3AD]">AAFE Gala Operations</p>
          <p className="mt-2 max-w-md font-serif text-3xl leading-tight">One place for every sponsor, seat, payment and badge.</p>
        </div>
      </div>
      <div className="flex flex-col bg-cream-50">
        <div className="flex items-center justify-between px-6 py-4">
          <AafeLogo />
          <DisplayControls prefs={prefs} />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <form className="w-full max-w-sm" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <h1 className="text-2xl font-semibold text-navy-900">Staff sign in</h1>
            <p className="mt-1 text-sm text-navy-600">AAFE gala team, relationship managers and check-in volunteers.</p>
            {notice && <p className="mt-4 text-sm font-medium text-rose-700" role="alert">{notice}</p>}
            <label className="label mt-6" htmlFor="em">Work email</label>
            <input id="em" type="email" className="input" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false) }} autoComplete="username" />
            {!live && <>
              <label className="label mt-4" htmlFor="pw">Password</label>
              <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            </>}
            {err && <p className="mt-2 text-sm font-medium text-rose-700">{err}</p>}
            {sent
              ? <p className="mt-5 rounded-lg bg-surface p-3 text-sm text-navy-700" role="status" data-testid="link-sent">Check your inbox for a sign-in link from AAFE Gala. It works once and expires in an hour.</p>
              : live
                ? <button className="btn-primary mt-5 w-full" type="submit" disabled={busy} data-testid="send-link"><Mail size={15} /> {busy ? 'Sending…' : 'Email me a sign-in link'}</button>
                : <button className="btn-primary mt-5 w-full" type="submit" data-testid="sign-in"><Lock size={15} /> Sign in</button>}
            {!live && <div className="mt-8 rounded-xl border border-navy-100 bg-surface p-4">
              <div className="label">Demo accounts (synthetic)</div>
              <ul className="mt-2 space-y-1.5">
                {db.staff_users.filter((u, i) => i < 2 || u.role === 'check_in_volunteer').map((u) => (
                  <li key={u.id}><button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-navy-50" onClick={() => onLogin(u)} data-testid={`login-${u.role}`}>
                    <span className="font-semibold text-navy-900">{u.name}</span> <span className="text-navy-500">— {u.role.replace(/_/g, ' ')}</span>
                  </button></li>
                ))}
              </ul>
            </div>}
          </form>
        </div>
      </div>
    </div>
  )
}
