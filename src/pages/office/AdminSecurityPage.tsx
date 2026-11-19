import { useMemo, useState } from 'react'
import {
  Bus as BusIcon,
  CheckCircle2,
  Download,
  KeyRound,
  Lock,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { useAppState } from '../../services/store'
import { Button, Card, Chip, DataTable, EmptyState, inputCls } from '../../components/ui'
import { fmtDateTime } from '../../utils/format'

type CategoryFilter = 'all' | 'auth' | 'credentials' | 'user' | 'bus'

export default function AdminSecurityPage() {
  const s = useAppState()
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')

  // Filter security events
  const securityEvents = useMemo(() => {
    return s.audit.filter((ev) => {
      const isAuth = ev.entityId === 'session' || ev.action === 'viewed'
      const isCreds = ev.entityType === 'user' && ev.action === 'updated'
      const isUser = ev.entityType === 'user' && ev.action === 'created'
      const isBus = ev.entityType === 'bus'

      if (category === 'auth' && !isAuth) return false
      if (category === 'credentials' && !isCreds) return false
      if (category === 'user' && !isUser) return false
      if (category === 'bus' && !isBus) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesActor = ev.actorName.toLowerCase().includes(q)
        const matchesAction = ev.action.toLowerCase().includes(q)
        const matchesTarget = (ev.entityId || '').toLowerCase().includes(q)
        const matchesAfter = (ev.after || '').toLowerCase().includes(q)
        const matchesReason = (ev.reason || '').toLowerCase().includes(q)
        if (!matchesActor && !matchesAction && !matchesTarget && !matchesAfter && !matchesReason) return false
      }
      return true
    })
  }, [s.audit, category, search])

  // Security KPIs
  const totalEvents = s.audit.length
  const loginEvents = s.audit.filter((ev) => ev.entityId === 'session').length
  const credentialEvents = s.audit.filter((ev) => ev.entityType === 'user' && ev.action === 'updated').length
  const allocationEvents = s.audit.filter((ev) => ev.entityType === 'bus').length

  // Export CSV
  const exportCsv = () => {
    const headers = ['Timestamp', 'Actor ID', 'Actor Name', 'Entity Type', 'Entity ID', 'Action', 'Before', 'After', 'Reason']
    const rows = securityEvents.map((ev) => [
      ev.timestamp,
      ev.actorId,
      ev.actorName,
      ev.entityType,
      ev.entityId,
      ev.action,
      ev.before || '',
      ev.after || '',
      ev.reason || '',
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `FuelGuard-Security-Logs-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">
              Security & Access Audit Logs
            </h1>
            <Chip tone="teal">Protected</Chip>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Immutable organizational protection trail: authentication, password changes, and fleet allocations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <Download size={16} /> Export Security CSV
          </Button>
        </div>
      </div>

      {/* Security Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Logged Events</span>
            <Lock size={16} className="text-navy-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-navy-900">{totalEvents}</div>
          <div className="mt-0.5 text-xs text-slate-400">System-wide audit trail</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Sign-in Events</span>
            <KeyRound size={16} className="text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700">{loginEvents}</div>
          <div className="mt-0.5 text-xs text-slate-400">Authenticated sessions</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Credential Modifications</span>
            <ShieldAlert size={16} className="text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{credentialEvents}</div>
          <div className="mt-0.5 text-xs text-slate-400">Password / status updates</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Asset Allocations</span>
            <BusIcon size={16} className="text-primary-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-navy-900">{allocationEvents}</div>
          <div className="mt-0.5 text-xs text-slate-400">Buses & driver bindings</div>
        </Card>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-1">
          {(
            [
              { key: 'all', label: `All Events (${totalEvents})` },
              { key: 'auth', label: `Sign-ins (${loginEvents})` },
              { key: 'credentials', label: `Credential & Password Updates (${credentialEvents})` },
              { key: 'user', label: `User Provisioning` },
              { key: 'bus', label: `Bus & Driver Allocation (${allocationEvents})` },
            ] as const
          ).map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                category === c.key
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search actor, action, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} w-60 pl-8 text-xs`}
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <Card>
        {securityEvents.length === 0 ? (
          <EmptyState
            icon={<Lock size={28} />}
            title="No events found"
            description="No security events match your current filter and search criteria."
          />
        ) : (
          <DataTable
            rows={securityEvents}
            columns={[
              {
                key: 'timestamp',
                label: 'Timestamp',
                render: (ev) => (
                  <span className="font-mono text-xs text-slate-600">
                    {fmtDateTime(ev.timestamp)}
                  </span>
                ),
              },
              {
                key: 'actor',
                label: 'Security Actor',
                render: (ev) => (
                  <div>
                    <div className="text-xs font-bold text-navy-900">{ev.actorName}</div>
                    <div className="font-mono text-[11px] text-slate-400">ID: {ev.actorId}</div>
                  </div>
                ),
              },
              {
                key: 'category',
                label: 'Category',
                render: (ev) => {
                  let tone: 'teal' | 'amber' | 'blue' | 'slate' | 'violet' = 'slate'
                  if (ev.entityId === 'session') tone = 'teal'
                  else if (ev.entityType === 'user') tone = 'violet'
                  else if (ev.entityType === 'bus') tone = 'blue'
                  return (
                    <Chip tone={tone}>
                      {ev.entityType} · {ev.action}
                    </Chip>
                  )
                },
              },
              {
                key: 'details',
                label: 'Audit Details & Changes',
                render: (ev) => (
                  <div className="max-w-md text-xs">
                    <div className="font-medium text-slate-800">{ev.after || ev.before || 'System state inspected'}</div>
                    {ev.reason && (
                      <div className="mt-0.5 text-[11px] text-slate-500 italic">
                        Reason: {ev.reason}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'securityStatus',
                label: 'Verification',
                render: () => (
                  <span className="inline-flex items-center gap-1 text-xs text-teal-700 font-medium">
                    <CheckCircle2 size={13} className="text-teal-600" /> Audited
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  )
}
