import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { DisplayControls, type Prefs } from '@shared/ui'
import { AafeLogo } from '@shared/Logo'
import type { DB, StaffUser } from '@shared/types'
import { sendSignInLink, supabase, verifySignInCode } from '@shared/supabase'

// LIVE (Supabase configured): staff get one email with a sign-in link and a 6-digit code (either works); the role
// comes from staff_users via staff_me() and is enforced by RLS. DEMO (no Supabase): picks a synthetic staff user.
export default function Login({ db, prefs, notice, onLogin }: { db: DB; prefs: Prefs; notice?: string; onLogin: (u: StaffUser) => void }) {
  const live = !!supabase
  const [email, setEmail] = useState(live ? '' : db.staff_users[0].email)
  const [pw, setPw] = useState('demo-password')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr('')
    if (live) {
      if (!email.trim()) return setErr('Enter your work email.')
      setBusy(true)
      if (sent) {
        // The 6-digit code from the same email: signs in here even if the link would open in another browser.
        try { await verifySignInCode(email, code) }
        catch { setErr('That code didn’t work. Codes work once and expire after an hour: send a new one.') }
        finally { setBusy(false) }
        return
      }
      try { await sendSignInLink(email); setSent(true) }
      // Same message whether or not the email is invited, so the form doesn't reveal who is on the staff list.
      catch { setErr('We couldn’t send a sign-in email. Check the internet connection and the email address; if both are right, ask the gala admin to invite you.') }
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute bottom-0 p-10 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white">AAFE Gala Operations</p>
          <p className="mt-2 max-w-md font-sans text-3xl leading-tight">One place for every sponsor, seat, payment and badge.</p>
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
            <input id="em" type="email" className="input" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false); setCode('') }} autoComplete="username" />
            {!live && <>
              <label className="label mt-4" htmlFor="pw">Password</label>
              <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            </>}
            {err && <p className="mt-2 text-sm font-medium text-rose-700">{err}</p>}
            {sent
              ? <>
                <p className="mt-5 rounded-lg bg-surface p-3 text-sm text-navy-700" role="status" data-testid="link-sent">Check your inbox for a message from AAFE Gala. Type its 6-digit code here, or open its link in this browser. Both work once and expire in an hour.</p>
                <label className="label mt-4" htmlFor="code">6-digit code</label>
                <input id="code" className="input text-center text-lg tracking-[0.3em] tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric" autoComplete="one-time-code" data-testid="code" />
                <button className="btn-primary mt-4 w-full" type="submit" disabled={busy || code.length < 6} data-testid="verify-code"><Lock size={15} /> {busy ? 'Signing in…' : 'Sign in'}</button>
                <button type="button" className="btn-ghost mt-2 w-full" onClick={() => { setSent(false); setCode(''); setErr('') }} data-testid="new-code">Send a new email</button>
              </>
              : live
                ? <button className="btn-primary mt-5 w-full" type="submit" disabled={busy} data-testid="send-link"><Mail size={15} /> {busy ? 'Sending…' : 'Email me a sign-in code'}</button>
                : <button className="btn-primary mt-5 w-full uppercase tracking-wide" type="submit" data-testid="sign-in"><Lock size={15} /> Sign in</button>}
            {!live && <div className="mt-8 rounded-xl border border-navy-100 bg-surface p-4">
              <div className="label">Demo accounts (synthetic)</div>
              <ul className="mt-2 space-y-1.5">
                {db.staff_users.filter((u, i) => i < 2 || u.role === 'check_in_volunteer').map((u) => (
                  <li key={u.id}><button type="button" className="flex min-h-[44px] w-full items-center gap-1.5 rounded-full px-4 text-left text-sm hover:bg-navy-50" onClick={() => onLogin(u)} data-testid={`login-${u.role}`}>
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
