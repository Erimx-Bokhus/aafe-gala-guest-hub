import { useState } from 'react'
import { Download } from 'lucide-react'
import { Pill, downloadCsv, fmtDate } from '@shared/ui'
import { PageHead } from '../App'
import { useStaff } from '../store'

export default function AuditLog() {
  const { db } = useStaff()
  const [who, setWho] = useState('all')
  const rows = db.audit_log.filter((a) => who === 'all' || a.actor_type === who).slice().reverse()
  return (
    <div>
      <PageHead title="Activity log" sub="Append-only record of every change: what changed, the state before and after, who did it, and when."
        actions={<><select className="input w-44" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by actor"><option value="all">Everyone</option><option value="guest_portal">Guest portal</option><option value="staff">Staff</option><option value="system">System</option></select>
          <button className="btn-ghost" onClick={() => downloadCsv('aafe-activity-log-SYNTHETIC.csv', [['At', 'Actor type', 'Actor', 'Action', 'Entity', 'From', 'To', 'Summary'], ...rows.map((a) => [a.at, a.actor_type, a.actor, a.action, `${a.entity}:${a.entity_id}`, a.from_state, a.to_state, a.summary])])}><Download size={15} /> Export</button></>} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]"><thead className="border-b border-navy-100 bg-cream-100"><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">State</th><th className="th">Summary</th></tr></thead>
          <tbody className="divide-y divide-navy-100">
            {rows.slice(0, 300).map((a) => (
              <tr key={a.id}>
                <td className="td whitespace-nowrap text-xs">{fmtDate(a.at, 'en-US', true)}</td>
                <td className="td"><Pill tone={a.actor_type === 'guest_portal' ? 'blue' : a.actor_type === 'staff' ? 'gray' : 'brand'}>{a.actor_type.replace('_', ' ')}</Pill><div className="mt-0.5 text-xs text-navy-500">{a.actor}</div></td>
                <td className="td font-sans tabular-nums text-xs">{a.action}</td>
                <td className="td whitespace-nowrap text-xs text-navy-600">{a.from_state || a.to_state ? `${a.from_state ?? '∅'} → ${a.to_state ?? '∅'}` : ''}</td>
                <td className="td">{a.summary}</td>
              </tr>
            ))}
          </tbody></table>
      </div>
    </div>
  )
}
