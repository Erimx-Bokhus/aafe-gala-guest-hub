import { useState } from 'react'
import { Lock } from 'lucide-react'
import { DisplayControls, type Prefs } from '@shared/ui'
import { AafeLogo } from '@shared/Logo'
import type { DB, StaffUser } from '@shared/types'

// PROTOTYPE login: picks a synthetic staff user. PRODUCTION: Supabase Auth (email magic link or
// password + MFA) and the role comes from the staff_users / profiles row, enforced by RLS.
export default function Login({ db, prefs, onLogin }: { db: DB; prefs: Prefs; onLogin: (u: StaffUser) => void }) {
  const [email, setEmail] = useState(db.staff_users[0].email)
  const [pw, setPw] = useState('demo-password')
  const [err, setErr] = useState('')
  const submit = () => {
    const u = db.staff_users.find((s) => s.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || !pw) return setErr('That email is not on the AAFE staff list for this demo.')
    onLogin(u)
  }
  return (
    <div className="grid min-h-[calc(100vh-28px)] lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img src="./photos/gala-50th-panel.jpg" alt="Speakers on stage at AAFE’s 50th anniversary gala" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 40%' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101A2C]/85 via-[#101A2C]/20 to-transparent" />
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
            <label className="label mt-6" htmlFor="em">Work email</label>
            <input id="em" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <label className="label mt-4" htmlFor="pw">Password</label>
            <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            {err && <p className="mt-2 text-sm font-medium text-rose-700">{err}</p>}
            <button className="btn-primary mt-5 w-full" type="submit" data-testid="sign-in"><Lock size={15} /> Sign in</button>
            <div className="mt-8 rounded-xl border border-navy-100 bg-surface p-4">
              <div className="label">Demo accounts (synthetic)</div>
              <ul className="mt-2 space-y-1.5">
                {db.staff_users.filter((u, i) => i < 2 || u.role === 'check_in_volunteer').map((u) => (
                  <li key={u.id}><button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-navy-50" onClick={() => onLogin(u)} data-testid={`login-${u.role}`}>
                    <span className="font-semibold text-navy-900">{u.name}</span> <span className="text-navy-500">— {u.role.replace(/_/g, ' ')}</span>
                  </button></li>
                ))}
              </ul>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
