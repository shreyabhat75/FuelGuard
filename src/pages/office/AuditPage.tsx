import { useMemo, useState } from 'react'
import { ScrollText, Search } from 'lucide-react'
import { useAppState, users } from '../../services/store'
import { Card, CardHeader, DataTable, EmptyState, inputCls } from '../../components/ui'
import { fmtDateTime } from '../../utils/format'

const entityTypes = [
  { key: 'all', label: 'All entity types' },
  { key: 'entry', label: 'Fuel entries' },
  { key: 'flag', label: 'Flag cases' },
  { key: 'approval', label: 'Approvals' },
  { key: 'bus', label: 'Buses / QR' },
  { key: 'reconciliation', label: 'Reconciliation' },
  { key: 'statement', label: 'Statement' },
]

export default function AuditPage() {
  const s = useAppState()
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('all')
  const [actor, setActor] = useState('all')

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return s.audit
      .filter((a) => entity === 'all' || a.entityType === entity)
      .filter((a) => actor === 'all' || a.actorId === actor)
      .filter(
        (a) =>
          !query ||
          a.entityId.toLowerCase().includes(query) ||
          a.action.toLowerCase().includes(query) ||
          (a.reason ?? '').toLowerCase().includes(query) ||
          a.actorName.toLowerCase().includes(query),
      )
  }, [s.audit, q, entity, actor])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-9`} placeholder="Search entity, action, reason…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />
        </div>
        <select className={`${inputCls} max-w-52`} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity type">
          {entityTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select className={`${inputCls} max-w-52`} value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Actor">
          <option value="all">All actors</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          <option value="system">System (auto rules)</option>
        </select>
      </div>

      <Card>
        <CardHeader
          title="Audit log & correction history"
          subtitle="Who created, viewed, changed or reviewed what, and when. Corrections keep original + new value with a reason. No hard deletes."
        />
        <DataTable
          rows={rows.slice(0, 120)}
          empty={
            <EmptyState
              icon={<ScrollText size={20} />}
              title="No audit events match"
              description="Perform an action (open a case, add a note, change a status) and it will be logged here."
            />
          }
          columns={[
            { key: 'when', label: 'When', render: (a) => <span className="tnum">{fmtDateTime(a.timestamp)}</span> },
            { key: 'actor', label: 'Actor', render: (a) => <span className="font-medium text-navy-900">{a.actorName}</span> },
            { key: 'action', label: 'Action', render: (a) => <span className="capitalize">{a.action.replace(/_/g, ' ')}</span> },
            {
              key: 'entity',
              label: 'Entity',
              render: (a) => (
                <span className="tnum">
                  {a.entityType} <span className="font-semibold text-navy-900">{a.entityId}</span>
                </span>
              ),
            },
            {
              key: 'change',
              label: 'Change / reason',
              render: (a) => (
                <span className="text-xs text-slate-600">
                  {a.before && (
                    <>
                      <span className="line-through text-slate-400">{a.before}</span> → <span className="font-semibold">{a.after}</span>
                    </>
                  )}
                  {!a.before && a.after && a.after}
                  {a.reason && <span className="block text-slate-400">Reason: {a.reason}</span>}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
