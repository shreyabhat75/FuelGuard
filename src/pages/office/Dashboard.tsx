import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ClipboardCheck, Fuel, IndianRupee, Bus as BusIcon, Info } from 'lucide-react'
import { useAppState, buses } from '../../services/store'
import { Card, CardHeader, DataTable, KpiCard, StatusChip, inputCls, Chip } from '../../components/ui'
import { EfficiencyChart, ModeSplitBars, MonthlySpendChart, SeverityDots } from '../../components/charts'
import { fmtDateTime, inr, monthKey, monthLabel, num } from '../../utils/format'

const ranges = [
  { key: 'all', label: 'All time (Aug–Oct 2026)' },
  { key: '2026-08', label: 'August 2026' },
  { key: '2026-09', label: 'September 2026' },
  { key: '2026-10', label: 'October 2026' },
]

export default function Dashboard() {
  const s = useAppState()
  const nav = useNavigate()
  const [range, setRange] = useState('all')
  const [busFilter, setBusFilter] = useState('all')

  const scoped = useMemo(
    () =>
      s.entries.filter(
        (e) =>
          (range === 'all' || monthKey(e.timestampClient) === range) &&
          (busFilter === 'all' || e.busId === busFilter),
      ),
    [s.entries, range, busFilter],
  )

  const spend = scoped.reduce((a, e) => a + e.amount, 0)
  const credit = scoped.filter((e) => e.paymentMode === 'credit_account').reduce((a, e) => a + e.amount, 0)
  const cash = scoped.filter((e) => e.paymentMode === 'cash').reduce((a, e) => a + e.amount, 0)

  const monthly = useMemo(() => {
    const m = new Map<string, { amount: number; entries: number }>()
    for (const k of ['2026-08', '2026-09', '2026-10']) m.set(k, { amount: 0, entries: 0 })
    scoped.forEach((e) => {
      const k = monthKey(e.timestampClient)
      const cur = m.get(k) ?? { amount: 0, entries: 0 }
      m.set(k, { amount: cur.amount + e.amount, entries: cur.entries + 1 })
    })
    return [...m.entries()].map(([k, v]) => ({ month: monthLabel(k), ...v }))
  }, [scoped])

  const efficiency = useMemo(() => {
    return buses.map((b) => {
      const list = scoped
        .filter((e) => e.busId === b.busCode)
        .sort((a, c) => a.odometerKm - c.odometerKm)
      let km = 0
      let litres = 0
      for (let i = 1; i < list.length; i++) {
        const d = list[i].odometerKm - list[i - 1].odometerKm
        if (d > 0) {
          km += d
          litres += list[i].litres
        }
      }
      return { bus: b.busCode, kmPerL: litres > 0 ? km / litres : null }
    })
  }, [scoped])

  const openFlags = s.flags.filter((f) => f.status !== 'resolved')
  const pendingApprovals = s.approvals.filter((a) => a.decision === 'pending')
  const recent = [...scoped].sort((a, b) => b.timestampClient.localeCompare(a.timestampClient)).slice(0, 10)

  return (
    <div className="space-y-5">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select className={`${inputCls} max-w-64`} value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
          {ranges.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <select className={`${inputCls} max-w-52`} value={busFilter} onChange={(e) => setBusFilter(e.target.value)} aria-label="Bus filter">
          <option value="all">All buses (8)</option>
          {buses.map((b) => (
            <option key={b.busCode} value={b.busCode}>{b.busCode} · {b.registration}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          Synthetic dataset Aug–Oct 2026 · {scoped.length} entries in current filter
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Register spend" value={inr(spend)} sub="Fuel register total (synthetic)" icon={<IndianRupee size={16} />} />
        <KpiCard label="Fuel entries" value={String(scoped.length)} sub="All payment modes" icon={<Fuel size={16} />} />
        <KpiCard label="Registered buses" value={String(buses.length)} sub="Diesel fleet KA 99 VB 1001–1008" icon={<BusIcon size={16} />} />
        <KpiCard
          label="Items requiring review"
          value={String(openFlags.length + pendingApprovals.length)}
          sub={`${openFlags.length} flagged cases · ${pendingApprovals.length} pending approvals — calculated from seeded demo cases`}
          tone={(openFlags.length + pendingApprovals.length) > 0 ? 'amber' : undefined}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Monthly spend" subtitle="Register amounts by month (₹)" />
          <div className="p-3">
            <MonthlySpendChart data={monthly} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Payment modes" subtitle="Register spend split" />
          <ModeSplitBars credit={credit} cash={cash} />
          <div className="border-t border-slate-100 px-4 pb-3 pt-1 text-xs text-slate-500">
            Pump statement (credit side): {s.statementLines.length} lines · {inr(s.statementLines.reduce((a, l) => a + l.amount, 0))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Fuel efficiency by bus"
          subtitle="Derived estimate: odometer deltas ÷ litres, from the synthetic register. Not a verified figure — label accordingly."
        />
        <div className="p-3">
          <EfficiencyChart data={efficiency} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent entries"
            subtitle="Click a row to open the transaction detail"
            action={
              <Chip tone="blue">
                <Info size={12} /> demo data
              </Chip>
            }
          />
          <DataTable
            rows={recent}
            onRowClick={(e) => nav(`/app/entries/${e.id}`)}
            columns={[
              { key: 'ts', label: 'When', render: (e) => <span className="tnum">{fmtDateTime(e.timestampClient)}</span> },
              { key: 'bus', label: 'Bus', render: (e) => <span className="font-semibold">{e.busId}</span> },
              { key: 'litres', label: 'Litres', className: 'text-right', render: (e) => <span className="tnum">{num(e.litres)}</span> },
              { key: 'amt', label: 'Amount', className: 'text-right', render: (e) => <span className="tnum">{inr(e.amount)}</span> },
              { key: 'mode', label: 'Payment', render: (e) => <span className="capitalize">{e.paymentMode.replace('_', ' ')}</span> },
              { key: 'pump', label: 'Pump', render: (e) => <span className="text-slate-600">{e.pumpName}</span> },
              { key: 'status', label: 'Status', render: (e) => <StatusChip status={e.status} /> },
            ]}
          />
        </Card>
        <Card>
          <CardHeader
            title="Review workload"
            subtitle="Flag severities (open cases)"
            action={
              <button onClick={() => nav('/app/flagged')} className="text-xs font-semibold text-primary-700">
                Open flagged fills →
              </button>
            }
          />
          <SeverityDots
            high={openFlags.filter((f) => f.severity === 'high').length}
            medium={openFlags.filter((f) => f.severity === 'medium').length}
            low={openFlags.filter((f) => f.severity === 'low').length}
          />
          <div className="border-t border-slate-100 p-4">
            <button
              onClick={() => nav('/app/approvals')}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-slate-600">
                <ClipboardCheck size={16} className="text-primary-600" /> Pending approvals
              </span>
              <span className="tnum font-bold text-navy-900">{pendingApprovals.length}</span>
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Flags are independent-evidence questions. “Amount at issue” is never treated as a
              confirmed loss.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
