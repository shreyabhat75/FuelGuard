import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Receipt,
  Scale,
  UploadCloud,
} from 'lucide-react'
import { useAppState } from '../../services/store'
import { Button, Card, CardHeader, DataTable, KpiCard, StatusChip } from '../../components/ui'
import { fmtDate, inr } from '../../utils/format'

export default function AccountantDashboard() {
  const s = useAppState()
  const nav = useNavigate()

  // Financial totals
  const totalStatement = s.statementLines.reduce((a, l) => a + l.amount, 0)
  const creditRegister = s.entries.filter((e) => e.paymentMode === 'credit_account').reduce((a, e) => a + e.amount, 0)
  const cashRegister = s.entries.filter((e) => e.paymentMode === 'cash').reduce((a, e) => a + e.amount, 0)

  // Reconciliation match counts
  const recs = s.reconciliations
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    recs.forEach((r) => (c[r.matchStatus] = (c[r.matchStatus] ?? 0) + 1))
    return c
  }, [recs])

  const totalDiff = recs.filter((r) => r.matchStatus !== 'matched').reduce((a, r) => a + r.difference, 0)
  const resolvedCount = recs.filter((r) => r.reviewerDecision !== 'none').length
  const unresolvedMismatches = recs.filter((r) => r.matchStatus !== 'matched' && r.reviewerDecision === 'none')

  // Top financial mismatches for accountant attention
  const topMismatches = useMemo(() => {
    return recs
      .filter((r) => r.matchStatus !== 'matched')
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 5)
  }, [recs])

  return (
    <div className="space-y-6">
      {/* Title & context */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Financial Reconciliation & Audit Hub</h1>
          <p className="text-xs text-slate-500">
            Accountant oversight: monthly vendor invoice verification, ledger reconciliation, and payment clearance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => nav('/app/reports')}>
            <Download size={14} /> Financial Reports
          </Button>
          <Button size="sm" onClick={() => nav('/app/reconciliation')}>
            <Receipt size={14} /> Open Reconciliation
          </Button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          label="Statement Billed (Credit)"
          value={inr(totalStatement)}
          sub={`Shree Lakshmi Fuels (${s.statementLines.length} bills)`}
          icon={<Receipt size={16} />}
        />
        <KpiCard
          label="Register Claimed (Credit)"
          value={inr(creditRegister)}
          sub="College bus drivers logged"
          icon={<IndianRupee size={16} />}
        />
        <KpiCard
          label="Cash Purchases (Out of Pocket)"
          value={inr(cashRegister)}
          sub="31 cash receipts to reimburse"
          icon={<IndianRupee size={16} />}
        />
        <KpiCard
          label="Net Statement Variance"
          value={inr(Math.abs(creditRegister - totalStatement))}
          sub="Difference between bills & log"
          tone={Math.abs(creditRegister - totalStatement) > 1000 ? 'amber' : undefined}
          icon={<Scale size={16} />}
        />
        <KpiCard
          label="Reconciliation Progress"
          value={recs.length > 0 ? `${Math.round(((counts.matched ?? 0) / recs.length) * 100)}%` : '0%'}
          sub={`${counts.matched ?? 0} of ${recs.length} bills matched clean`}
          icon={<CheckCircle2 size={16} />}
        />
        <KpiCard
          label="Discrepancies Requiring Note"
          value={String(unresolvedMismatches.length)}
          sub={`${resolvedCount} decisions already recorded`}
          tone={unresolvedMismatches.length > 0 ? 'amber' : undefined}
          icon={<AlertTriangle size={16} />}
        />
        <KpiCard
          label="Total Variance at Issue"
          value={inr(totalDiff)}
          sub="Sum of differences across mismatched lines"
          tone={totalDiff > 0 ? 'red' : undefined}
          icon={<IndianRupee size={16} />}
        />
      </div>

      {/* Reconciliation breakdown cards */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Reconciliation Match Breakdown"
            subtitle="Categorisation of Shree Lakshmi Fuels statement lines against college fuel register"
            action={
              <Button size="sm" variant="ghost" onClick={() => nav('/app/reconciliation')}>
                Inspect Table <ArrowRight size={14} />
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3">
              <p className="text-xs font-semibold text-teal-800">Matched Clean</p>
              <p className="mt-1 text-2xl font-bold tnum text-teal-900">{counts.matched ?? 0}</p>
              <p className="text-[11px] text-teal-700">Identical litres & amounts</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-semibold text-amber-800">Rate Mismatches</p>
              <p className="mt-1 text-2xl font-bold tnum text-amber-900">{counts.rate_mismatch ?? 0}</p>
              <p className="text-[11px] text-amber-700">₹0.50–₹2.00/L above published</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-semibold text-amber-800">Amount Mismatches</p>
              <p className="mt-1 text-2xl font-bold tnum text-amber-900">{counts.amount_mismatch ?? 0}</p>
              <p className="text-[11px] text-amber-700">e.g. SLF/71185 (₹1,250 diff)</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
              <p className="text-xs font-semibold text-red-800">Unmatched Pump Bills</p>
              <p className="mt-1 text-2xl font-bold tnum text-red-900">{counts.unmatched_pump_bill ?? 0}</p>
              <p className="text-[11px] text-red-700">Vehicle KA 99 MX 4417 not on roster</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-semibold text-amber-800">Register Missing</p>
              <p className="mt-1 text-2xl font-bold tnum text-amber-900">{counts.register_missing ?? 0}</p>
              <p className="text-[11px] text-amber-700">Billed on invoice, not in driver log</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">Possible Duplicates</p>
              <p className="mt-1 text-2xl font-bold tnum text-navy-900">{counts.possible_duplicate ?? 0}</p>
              <p className="text-[11px] text-slate-500">Same morning pair on register</p>
            </div>
          </div>
        </Card>

        {/* Quick Actions & Statement Source */}
        <Card>
          <CardHeader title="Statement Batch Source" subtitle="Currently imported pump statement" />
          <div className="space-y-3 p-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-navy-900">{s.statementFileName || 'pump_statement_shree_lakshmi.csv'}</p>
              <p className="mt-1 text-slate-500">Vendor: Shree Lakshmi Fuels (Credit A/c)</p>
              <p className="text-slate-500">Lines: {s.statementLines.length} verified rows</p>
              <p className="text-slate-500">Billing: 01-Aug-2026 to 31-Oct-2026</p>
              <p className="mt-1 font-semibold text-teal-700">Import Status: Active & Parsed</p>
            </div>
            <Button className="w-full" onClick={() => nav('/app/reconciliation')}>
              <UploadCloud size={16} /> Import New Statement CSV
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => nav('/app/reports')}>
              <FileSpreadsheet size={16} /> Export Reconciliation Pack
            </Button>
          </div>
        </Card>
      </div>

      {/* Top Discrepancies Table */}
      <Card>
        <CardHeader
          title="Priority Discrepancies for Settlement Clearance"
          subtitle="Top differences between statement billing and fuel register records"
          action={
            <Button size="sm" variant="secondary" onClick={() => nav('/app/reconciliation')}>
              View All Mismatches ({recs.filter((r) => r.matchStatus !== 'matched').length})
            </Button>
          }
        />
        <DataTable
          rows={topMismatches}
          onRowClick={() => nav('/app/reconciliation')}
          columns={[
            {
              key: 'bill',
              label: 'Bill No & Vehicle',
              render: (r) => {
                const line = s.statementLines.find((l) => l.billNo === r.statementLineId)
                return (
                  <div>
                    <span className="font-bold text-navy-900">{r.statementLineId}</span>
                    <p className="text-xs text-slate-500">{line?.vehicleNo} · {line ? fmtDate(line.date) : ''}</p>
                  </div>
                )
              },
            },
            {
              key: 'stmtAmt',
              label: 'Statement Billed',
              className: 'text-right',
              render: (r) => {
                const line = s.statementLines.find((l) => l.billNo === r.statementLineId)
                return <span className="tnum font-semibold">{line ? inr(line.amount) : '—'}</span>
              },
            },
            {
              key: 'regAmt',
              label: 'Register Claimed',
              className: 'text-right',
              render: (r) => <span className="tnum">{r.entrySide ? inr(r.entrySide.amount) : <span className="text-slate-400">None</span>}</span>,
            },
            {
              key: 'diff',
              label: 'Variance',
              className: 'text-right',
              render: (r) => <span className="tnum font-bold text-amber-700">{r.difference > 0 ? inr(r.difference) : '—'}</span>,
            },
            {
              key: 'status',
              label: 'Anomaly Category',
              render: (r) => <StatusChip status={r.matchStatus} />,
            },
            {
              key: 'decision',
              label: 'Settlement Decision',
              render: (r) => (
                <div className="min-w-0">
                  <StatusChip status={r.reviewerDecision === 'none' ? 'pending' : r.reviewerDecision} />
                  {r.reviewerNote && <p className="mt-0.5 truncate text-[11px] text-slate-500">{r.reviewerNote}</p>}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
