import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bus as BusIcon,
  Calendar,
  Droplets,
  Fuel,
  Gauge,
  IndianRupee,
  NotebookPen,
} from 'lucide-react'
import { useAppState, buses } from '../../services/store'
import { Button, Card, CardHeader, DataTable, KpiCard, StatusChip, inputCls, Chip } from '../../components/ui'
import {
  ConsumptionTrendChart,
  EfficiencyChart,
  ModeSplitBars,
  MonthlySpendChart,
  SeverityDots,
} from '../../components/charts'
import { fmtDateTime, inr, monthKey, monthLabel, num } from '../../utils/format'

const ranges = [
  { key: 'all', label: 'All time (Aug–Oct 2026)' },
  { key: '2026-08', label: 'August 2026' },
  { key: '2026-09', label: 'September 2026' },
  { key: '2026-10', label: 'October 2026' },
]

const statusFilters = [
  { key: 'all', label: 'All statuses' },
  { key: 'saved', label: 'Saved' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'pending_sync', label: 'Pending sync' },
]

export default function Dashboard() {
  const s = useAppState()
  const nav = useNavigate()
  const [range, setRange] = useState('all')
  const [busFilter, setBusFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const scoped = useMemo(
    () =>
      s.entries.filter(
        (e) =>
          (range === 'all' || monthKey(e.timestampClient) === range) &&
          (busFilter === 'all' || e.busId === busFilter) &&
          (statusFilter === 'all' || e.status === statusFilter),
      ),
    [s.entries, range, busFilter, statusFilter],
  )

  const spend = scoped.reduce((a, e) => a + e.amount, 0)
  const totalLitres = scoped.reduce((a, e) => a + e.litres, 0)
  const credit = scoped.filter((e) => e.paymentMode === 'credit_account').reduce((a, e) => a + e.amount, 0)
  const cash = scoped.filter((e) => e.paymentMode === 'cash').reduce((a, e) => a + e.amount, 0)

  // Current or selected month fuel expenditure
  const currentMonthSpend = useMemo(() => {
    const targetMonth = range === 'all' ? '2026-10' : range
    return s.entries
      .filter((e) => monthKey(e.timestampClient) === targetMonth)
      .reduce((a, e) => a + e.amount, 0)
  }, [s.entries, range])

  // Fleet average km/L derived from odometer deltas
  const fleetAvgKmPerL = useMemo(() => {
    let totalKm = 0
    let totalL = 0
    buses.forEach((b) => {
      const list = scoped
        .filter((e) => e.busId === b.busCode)
        .sort((a, c) => a.odometerKm - c.odometerKm)
      for (let i = 1; i < list.length; i++) {
        const d = list[i].odometerKm - list[i - 1].odometerKm
        if (d > 0) {
          totalKm += d
          totalL += list[i].litres
        }
      }
    })
    return totalL > 0 ? totalKm / totalL : null
  }, [scoped])

  // Monthly expenditure & consumption breakdown
  const { monthlySpendData, monthlyLitresData } = useMemo(() => {
    const m = new Map<string, { amount: number; entries: number; litres: number }>()
    for (const k of ['2026-08', '2026-09', '2026-10']) m.set(k, { amount: 0, entries: 0, litres: 0 })
    scoped.forEach((e) => {
      const k = monthKey(e.timestampClient)
      const cur = m.get(k) ?? { amount: 0, entries: 0, litres: 0 }
      m.set(k, {
        amount: cur.amount + e.amount,
        entries: cur.entries + 1,
        litres: cur.litres + e.litres,
      })
    })
    const spendArr = [...m.entries()].map(([k, v]) => ({ month: monthLabel(k), amount: v.amount, entries: v.entries }))
    const litresArr = [...m.entries()].map(([k, v]) => ({ month: monthLabel(k), litres: v.litres }))
    return { monthlySpendData: spendArr, monthlyLitresData: litresArr }
  }, [scoped])

  // Bus-wise efficiency estimates
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

  // Bus performance overview table data
  const busPerformance = useMemo(() => {
    return buses.map((b) => {
      const list = scoped
        .filter((e) => e.busId === b.busCode)
        .sort((a, c) => a.odometerKm - c.odometerKm)
      let km = 0
      let ltrs = 0
      let busSpend = 0
      list.forEach((e) => {
        ltrs += e.litres
        busSpend += e.amount
      })
      for (let i = 1; i < list.length; i++) {
        const d = list[i].odometerKm - list[i - 1].odometerKm
        if (d > 0) km += d
      }
      const lastFill = list[list.length - 1]?.timestampClient
      return {
        id: b.busCode,
        busCode: b.busCode,
        registration: b.registration,
        driver: b.driverName,
        totalKm: km,
        totalLitres: ltrs,
        spend: busSpend,
        kmPerL: ltrs > 0 && km > 0 ? km / ltrs : null,
        lastFill: lastFill ? fmtDateTime(lastFill) : 'No fills',
      }
    })
  }, [scoped])

  const openFlags = s.flags.filter((f) => f.status !== 'resolved')
  const pendingApprovals = s.approvals.filter((a) => a.decision === 'pending')
  const recent = [...scoped].sort((a, b) => b.timestampClient.localeCompare(a.timestampClient)).slice(0, 8)

  return (
    <div className="space-y-6">
      {/* 8. Filters by Date, Bus, and Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <select className={`${inputCls} max-w-56 text-sm`} value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
            {ranges.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <select className={`${inputCls} max-w-48 text-sm`} value={busFilter} onChange={(e) => setBusFilter(e.target.value)} aria-label="Bus filter">
            <option value="all">All buses (8)</option>
            {buses.map((b) => (
              <option key={b.busCode} value={b.busCode}>{b.busCode} · {b.registration}</option>
            ))}
          </select>
          <select className={`${inputCls} max-w-44 text-sm`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
            {statusFilters.map((st) => (
              <option key={st.key} value={st.key}>{st.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          Showing <strong>{scoped.length}</strong> matching fuel transactions
        </p>
      </div>

      {/* KPI Cards — 7 Key Operational Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <KpiCard label="Total Fuel Expenditure" value={inr(spend)} sub="Filtered register total" icon={<IndianRupee size={16} />} />
        <KpiCard label="Monthly Fuel Expenditure" value={inr(currentMonthSpend)} sub={range === 'all' ? 'October 2026 total' : `${monthLabel(range)} spend`} icon={<Calendar size={16} />} />
        <KpiCard label="Total Litres Consumed" value={`${num(totalLitres, 0)} L`} sub="Diesel dispensed to fleet" icon={<Droplets size={16} />} />
        <KpiCard label="Fuel Entries" value={String(scoped.length)} sub="Verified transaction records" icon={<Fuel size={16} />} />
        <KpiCard label="Fleet Buses" value={String(buses.length)} sub="Active transport roster" icon={<BusIcon size={16} />} />
        <KpiCard
          label="Fleet Avg Efficiency"
          value={fleetAvgKmPerL != null ? `${fleetAvgKmPerL.toFixed(1)} km/L` : '—'}
          sub="Odometer delta estimate"
          icon={<Gauge size={16} />}
        />
        <KpiCard
          label="Transactions Requiring Review"
          value={String(openFlags.length + pendingApprovals.length)}
          sub={`${openFlags.length} flags · ${pendingApprovals.length} approvals pending`}
          tone={(openFlags.length + pendingApprovals.length) > 0 ? 'amber' : undefined}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      {/* 1. Monthly Fuel Expenditure & 2. Fuel Consumption Trend Charts */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="1. Monthly Fuel Expenditure" subtitle="Register expenditure by month (₹)" />
          <div className="p-3">
            <MonthlySpendChart data={monthlySpendData} />
          </div>
        </Card>
        <Card>
          <CardHeader title="2. Fuel Consumption Trend" subtitle="Total litres consumed across fleet (L)" />
          <div className="p-3">
            <ConsumptionTrendChart data={monthlyLitresData} />
          </div>
        </Card>
      </div>

      {/* 3. Bus-wise Fuel Efficiency Comparison & 7. Expenditure Breakdown */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="3. Bus-wise Fuel Efficiency Comparison"
            subtitle="Derived km/L estimates from odometer movements. Not lab certified."
            action={
              <Button size="sm" variant="ghost" onClick={() => nav('/app/efficiency')}>
                Detailed Hub <ArrowRight size={14} />
              </Button>
            }
          />
          <div className="p-3">
            <EfficiencyChart data={efficiency} />
          </div>
        </Card>
        <Card>
          <CardHeader title="7. Expenditure Breakdown" subtitle="Payment mode distribution" />
          <ModeSplitBars credit={credit} cash={cash} />
          <div className="border-t border-slate-100 p-4">
            <SeverityDots
              high={openFlags.filter((f) => f.severity === 'high').length}
              medium={openFlags.filter((f) => f.severity === 'medium').length}
              low={openFlags.filter((f) => f.severity === 'low').length}
            />
          </div>
        </Card>
      </div>

      {/* 5. Flagged Transactions Section */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <NotebookPen size={18} className="text-amber-600" />
              5. Flagged Transactions & Discrepancies
            </span>
          }
          subtitle={`${openFlags.length} items requiring investigation · An anomaly is not confirmed fraud`}
          action={
            <Button size="sm" variant="secondary" onClick={() => nav('/app/flagged')}>
              View All Flags ({openFlags.length})
            </Button>
          }
        />
        {openFlags.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No active flags requiring review.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {openFlags.slice(0, 4).map((f) => (
              <div
                key={f.id}
                onClick={() => nav(`/app/flagged/${f.id}`)}
                className="flex cursor-pointer items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-navy-900">{f.caseTitle}</span>
                    <Chip tone="violet">{f.ruleCode.replace(/_/g, ' ')}</Chip>
                    <StatusChip status={f.severity} />
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500">{f.plainExplanation}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tnum text-navy-900">{f.amountAtIssue > 0 ? inr(f.amountAtIssue) : '—'}</p>
                  <StatusChip status={f.status} className="mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 6. Bus Performance Overview Table */}
      <Card>
        <CardHeader
          title="6. Fleet Bus Performance Overview"
          subtitle="Fleet status, distance covered, total fuel consumed, and derived efficiency"
          action={
            <Button size="sm" variant="ghost" onClick={() => nav('/app/buses')}>
              Manage Buses & QR <ArrowRight size={14} />
            </Button>
          }
        />
        <DataTable
          rows={busPerformance}
          onRowClick={(b) => nav(`/app/buses/${b.busCode}`)}
          columns={[
            { key: 'code', label: 'Bus', render: (b) => <span className="font-bold text-navy-900">{b.busCode}</span> },
            { key: 'reg', label: 'Registration', render: (b) => <span className="tnum">{b.registration}</span> },
            { key: 'drv', label: 'Driver', render: (b) => b.driver },
            { key: 'km', label: 'Total Distance', className: 'text-right', render: (b) => <span className="tnum">{b.totalKm > 0 ? `${num(b.totalKm, 0)} km` : '—'}</span> },
            { key: 'ltrs', label: 'Total Litres', className: 'text-right', render: (b) => <span className="tnum">{num(b.totalLitres, 0)} L</span> },
            { key: 'eff', label: 'Avg km/L', className: 'text-right', render: (b) => <span className="tnum font-semibold text-teal-700">{b.kmPerL != null ? `${b.kmPerL.toFixed(1)} km/L` : '—'}</span> },
            { key: 'spend', label: 'Fuel Spend', className: 'text-right', render: (b) => <span className="tnum font-medium text-navy-900">{inr(b.spend)}</span> },
            { key: 'last', label: 'Last Fill', render: (b) => <span className="text-xs text-slate-500">{b.lastFill}</span> },
          ]}
        />
      </Card>

      {/* 4. Recent Fuel Entries Table */}
      <Card>
        <CardHeader
          title="4. Recent Fuel Entries"
          subtitle="Showing latest transactions in selected filter"
          action={
            <Button size="sm" variant="secondary" onClick={() => nav('/app/entries')}>
              Browse All ({scoped.length})
            </Button>
          }
        />
        <DataTable
          rows={recent}
          onRowClick={(e) => nav(`/app/entries/${e.id}`)}
          columns={[
            { key: 'id', label: 'ID', render: (e) => <span className="font-semibold text-primary-700">{e.id}</span> },
            { key: 'ts', label: 'Date & Time', render: (e) => <span className="tnum">{fmtDateTime(e.timestampClient)}</span> },
            { key: 'bus', label: 'Bus', render: (e) => <span className="font-semibold">{e.busId}</span> },
            { key: 'driver', label: 'Driver', render: (e) => <span className="text-slate-600">{e.createdByName}</span> },
            { key: 'litres', label: 'Litres', className: 'text-right', render: (e) => <span className="tnum">{num(e.litres)}</span> },
            { key: 'amt', label: 'Amount', className: 'text-right', render: (e) => <span className="tnum">{inr(e.amount)}</span> },
            { key: 'odo', label: 'Odometer', className: 'text-right', render: (e) => <span className="tnum">{num(e.odometerKm, 0)} km</span> },
            { key: 'status', label: 'Status', render: (e) => <StatusChip status={e.status} /> },
          ]}
        />
      </Card>
    </div>
  )
}
