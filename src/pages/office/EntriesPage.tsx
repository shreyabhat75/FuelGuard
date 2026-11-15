import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Fuel, Search } from 'lucide-react'
import { useAppState, buses } from '../../services/store'
import { Button, Card, CardHeader, DataTable, EmptyState, StatusChip, inputCls } from '../../components/ui'
import { fmtDateTime, inr, num } from '../../utils/format'

const pumps = ['Shree Lakshmi Fuels', 'Highway Fuel Point', 'Other pump']
const statuses = [
  { key: 'all', label: 'All statuses' },
  { key: 'saved', label: 'Saved' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'pending_sync', label: 'Pending sync' },
]
const modes = [
  { key: 'all', label: 'All payment modes' },
  { key: 'credit_account', label: 'Credit account' },
  { key: 'cash', label: 'Cash' },
]

export default function EntriesPage() {
  const s = useAppState()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [bus, setBus] = useState('all')
  const [pump, setPump] = useState('all')
  const [mode, setMode] = useState('all')
  const [status, setStatus] = useState('all')

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return s.entries
      .filter((e) => bus === 'all' || e.busId === bus)
      .filter((e) => pump === 'all' || e.pumpName === pump)
      .filter((e) => mode === 'all' || e.paymentMode === mode)
      .filter((e) => status === 'all' || e.status === status)
      .filter(
        (e) =>
          !query ||
          e.id.toLowerCase().includes(query) ||
          e.busId.toLowerCase().includes(query) ||
          e.pumpName.toLowerCase().includes(query) ||
          (e.billNo ?? '').toLowerCase().includes(query),
      )
      .sort((a, b) => b.timestampClient.localeCompare(a.timestampClient))
  }, [s.entries, q, bus, pump, mode, status])

  const total = rows.reduce((a, e) => a + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search entry ID, bus, pump, bill no…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search entries"
          />
        </div>
        <select className={`${inputCls} max-w-52`} value={bus} onChange={(e) => setBus(e.target.value)} aria-label="Bus">
          <option value="all">All buses</option>
          {buses.map((b) => <option key={b.busCode} value={b.busCode}>{b.busCode}</option>)}
        </select>
        <select className={`${inputCls} max-w-52`} value={pump} onChange={(e) => setPump(e.target.value)} aria-label="Pump">
          <option value="all">All pumps</option>
          {pumps.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={`${inputCls} max-w-44`} value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Payment mode">
          {modes.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select className={`${inputCls} max-w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {statuses.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
        </select>
      </div>

      <Card>
        <CardHeader
          title={`${rows.length} entries`}
          subtitle={`Filtered total ${inr(total)}`}
          action={<Button size="sm" variant="secondary" onClick={() => { setQ(''); setBus('all'); setPump('all'); setMode('all'); setStatus('all') }}>Clear filters</Button>}
        />
        <DataTable
          rows={rows.slice(0, 60)}
          onRowClick={(e) => nav(`/app/entries/${e.id}`)}
          empty={
            <EmptyState
              icon={<Fuel size={20} />}
              title="No entries match these filters"
              description="Try clearing a filter — the register has 112 seeded entries."
            />
          }
          columns={[
            { key: 'id', label: 'Entry', render: (e) => <span className="font-semibold text-navy-900">{e.id}</span> },
            { key: 'ts', label: 'When', render: (e) => <span className="tnum">{fmtDateTime(e.timestampClient)}</span> },
            { key: 'bus', label: 'Bus', render: (e) => e.busId },
            { key: 'litres', label: 'Litres', className: 'text-right', render: (e) => <span className="tnum">{num(e.litres)}</span> },
            { key: 'amt', label: 'Amount', className: 'text-right', render: (e) => <span className="tnum">{inr(e.amount)}</span> },
            { key: 'mode', label: 'Payment', render: (e) => <span className="capitalize">{e.paymentMode.replace('_', ' ')}</span> },
            { key: 'pump', label: 'Pump', render: (e) => <span className="text-slate-600">{e.pumpName}</span> },
            { key: 'status', label: 'Status', render: (e) => <StatusChip status={e.status} /> },
          ]}
        />
        {rows.length > 60 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing first 60 of {rows.length} — refine filters to narrow down.</p>}
      </Card>
    </div>
  )
}
