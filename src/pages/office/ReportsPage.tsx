import { useMemo, useState } from 'react'
import {
  Download,
  Fuel,
  Receipt,
  ShieldAlert,
} from 'lucide-react'
import { buses, useAppState } from '../../services/store'
import { Button, Card, CardHeader, Chip, DataTable, StatusChip, inputCls } from '../../components/ui'
import { fmtDate, inr, monthKey, num } from '../../utils/format'

type ReportType = 'consumption' | 'reconciliation' | 'anomalies'

export default function ReportsPage() {
  const s = useAppState()
  const [reportType, setReportType] = useState<ReportType>('consumption')
  const [range, setRange] = useState<'all' | '2026-08' | '2026-09' | '2026-10'>('all')

  // Filtered fuel entries
  const scopedEntries = useMemo(() => {
    return s.entries.filter((e) => range === 'all' || monthKey(e.timestampClient) === range)
  }, [s.entries, range])

  // Consumption Report Data
  const consumptionRows = useMemo(() => {
    return buses.map((b) => {
      const list = scopedEntries
        .filter((e) => e.busId === b.busCode)
        .sort((a, c) => a.odometerKm - c.odometerKm)
      let km = 0
      let litres = 0
      let spend = 0
      list.forEach((e) => {
        litres += e.litres
        spend += e.amount
      })
      for (let i = 1; i < list.length; i++) {
        const d = list[i].odometerKm - list[i - 1].odometerKm
        if (d > 0) km += d
      }
      const kmPerL = litres > 0 && km > 0 ? km / litres : null
      return {
        id: b.busCode,
        busCode: b.busCode,
        registration: b.registration,
        driverName: b.driverName,
        totalKm: km,
        totalLitres: litres,
        spend,
        kmPerL: kmPerL != null ? kmPerL.toFixed(2) : '—',
        fillsCount: list.length,
      }
    })
  }, [scopedEntries])

  // Reconciliation Report Data
  const reconciliationRows = useMemo(() => {
    return s.reconciliations.map((r) => {
      const line = s.statementLines.find((l) => l.billNo === r.statementLineId)
      return {
        id: r.id,
        billNo: r.statementLineId,
        date: line?.date || '—',
        vehicleNo: line?.vehicleNo || '—',
        statementAmount: line?.amount || 0,
        statementLitres: line?.litres || 0,
        registerAmount: r.entrySide?.amount ?? 0,
        registerLitres: r.entrySide?.litres ?? 0,
        difference: r.difference,
        matchStatus: r.matchStatus,
        reviewerDecision: r.reviewerDecision,
        reviewerNote: r.reviewerNote || '—',
      }
    })
  }, [s.reconciliations, s.statementLines])

  // Anomalies Report Data
  const anomaliesRows = useMemo(() => {
    return s.flags.map((f) => ({
      id: f.id,
      caseTitle: f.caseTitle,
      busCode: f.busCode || 'Fleet',
      ruleCode: f.ruleCode,
      severity: f.severity,
      amountAtIssue: f.amountAtIssue,
      status: f.status,
      createdAt: f.createdAt,
      explanation: f.plainExplanation,
      resolutionNote: f.resolutionNote || '—',
    }))
  }, [s.flags])

  // Export CSV Handler
  const handleExportCSV = () => {
    let header = ''
    let body = ''
    let filename = `fuelguard-${reportType}-${range}.csv`

    if (reportType === 'consumption') {
      header = 'bus_code,registration,driver,total_km,total_litres,total_spend_inr,avg_km_per_litre,fills_count'
      body = consumptionRows
        .map((r) =>
          [r.busCode, r.registration, r.driverName, r.totalKm, r.totalLitres, r.spend, r.kmPerL, r.fillsCount].join(','),
        )
        .join('\n')
    } else if (reportType === 'reconciliation') {
      header =
        'bill_no,date,vehicle_no,statement_litres,statement_amount,register_litres,register_amount,difference_inr,match_status,decision,reviewer_note'
      body = reconciliationRows
        .map((r) =>
          [
            r.billNo,
            r.date,
            r.vehicleNo,
            r.statementLitres,
            r.statementAmount,
            r.registerLitres,
            r.registerAmount,
            r.difference,
            r.matchStatus,
            r.reviewerDecision,
            `"${(r.reviewerNote || '').replace(/"/g, '""')}"`,
          ].join(','),
        )
        .join('\n')
    } else {
      header = 'flag_id,title,bus_code,rule_code,severity,amount_at_issue_inr,status,created_at,resolution_note'
      body = anomaliesRows
        .map((r) =>
          [
            r.id,
            `"${r.caseTitle.replace(/"/g, '""')}"`,
            r.busCode,
            r.ruleCode,
            r.severity,
            r.amountAtIssue,
            r.status,
            r.createdAt,
            `"${(r.resolutionNote || '').replace(/"/g, '""')}"`,
          ].join(','),
        )
        .join('\n')
    }

    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Institutional Reports & Exports</h1>
          <p className="text-xs text-slate-500">
            Generate verifiable audit reports, fleet fuel efficiency logs, and vendor invoice reconciliation sheets
          </p>
        </div>
        <Button onClick={handleExportCSV} className="gap-2">
          <Download size={16} /> Export {reportType.toUpperCase()} CSV
        </Button>
      </div>

      {/* Controls & Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setReportType('consumption')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                reportType === 'consumption'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Fuel size={14} /> Fleet Fuel Consumption
            </button>
            <button
              onClick={() => setReportType('reconciliation')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                reportType === 'reconciliation'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Receipt size={14} /> Statement Reconciliation
            </button>
            <button
              onClick={() => setReportType('anomalies')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                reportType === 'anomalies'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShieldAlert size={14} /> Discrepancies & Audit Log
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Date Range:</span>
            <select
              className={`${inputCls} max-w-44 py-1 text-xs`}
              value={range}
              onChange={(e) => setRange(e.target.value as typeof range)}
            >
              <option value="all">All time (Aug–Oct 2026)</option>
              <option value="2026-08">August 2026</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-10">October 2026</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Report Data Preview Table */}
      <Card>
        <CardHeader
          title={
            reportType === 'consumption'
              ? 'Fleet Fuel Consumption & Efficiency Report'
              : reportType === 'reconciliation'
                ? 'Vendor Statement Reconciliation & Variance Report'
                : 'Exceptions, Flags & Investigation Compliance Report'
          }
          subtitle={`Live preview · ${
            reportType === 'consumption'
              ? `${consumptionRows.length} buses`
              : reportType === 'reconciliation'
                ? `${reconciliationRows.length} bills`
                : `${anomaliesRows.length} cases`
          } included`}
        />

        {reportType === 'consumption' && (
          <DataTable
            rows={consumptionRows}
            columns={[
              { key: 'code', label: 'Bus Code', render: (r) => <span className="font-bold text-navy-900">{r.busCode}</span> },
              { key: 'reg', label: 'Registration', render: (r) => <span className="tnum">{r.registration}</span> },
              { key: 'drv', label: 'Driver', render: (r) => r.driverName },
              { key: 'km', label: 'Total Distance', className: 'text-right', render: (r) => <span className="tnum">{num(r.totalKm, 0)} km</span> },
              { key: 'litres', label: 'Total Litres', className: 'text-right', render: (r) => <span className="tnum">{num(r.totalLitres, 0)} L</span> },
              { key: 'spend', label: 'Total Cost', className: 'text-right', render: (r) => <span className="tnum font-semibold">{inr(r.spend)}</span> },
              { key: 'eff', label: 'Avg km/L', className: 'text-right', render: (r) => <span className="tnum font-bold text-teal-700">{r.kmPerL} km/L</span> },
              { key: 'fills', label: 'Fills', className: 'text-right', render: (r) => <span className="tnum text-slate-500">{r.fillsCount}</span> },
            ]}
          />
        )}

        {reportType === 'reconciliation' && (
          <DataTable
            rows={reconciliationRows}
            columns={[
              { key: 'bill', label: 'Bill No', render: (r) => <span className="font-bold text-navy-900">{r.billNo}</span> },
              { key: 'date', label: 'Date', render: (r) => <span className="tnum">{fmtDate(r.date)}</span> },
              { key: 'veh', label: 'Vehicle', render: (r) => r.vehicleNo },
              { key: 'sAmt', label: 'Statement Billed', className: 'text-right', render: (r) => <span className="tnum">{inr(r.statementAmount)}</span> },
              { key: 'rAmt', label: 'Register Claimed', className: 'text-right', render: (r) => <span className="tnum">{r.registerAmount > 0 ? inr(r.registerAmount) : '—'}</span> },
              { key: 'diff', label: 'Difference', className: 'text-right', render: (r) => <span className="tnum font-bold text-amber-700">{r.difference > 0 ? inr(r.difference) : '—'}</span> },
              { key: 'st', label: 'Match Status', render: (r) => <StatusChip status={r.matchStatus} /> },
              { key: 'dec', label: 'Reviewer Decision', render: (r) => <StatusChip status={r.reviewerDecision} /> },
            ]}
          />
        )}

        {reportType === 'anomalies' && (
          <DataTable
            rows={anomaliesRows}
            columns={[
              { key: 'id', label: 'Flag ID', render: (r) => <span className="font-semibold text-navy-900">{r.id}</span> },
              { key: 'title', label: 'Case Title', render: (r) => <span className="font-medium text-navy-900">{r.caseTitle}</span> },
              { key: 'bus', label: 'Bus', render: (r) => r.busCode },
              { key: 'rule', label: 'Rule Code', render: (r) => <Chip tone="violet">{r.ruleCode}</Chip> },
              { key: 'sev', label: 'Severity', render: (r) => <StatusChip status={r.severity} /> },
              { key: 'amt', label: 'Amount at Issue', className: 'text-right', render: (r) => <span className="tnum font-bold">{r.amountAtIssue > 0 ? inr(r.amountAtIssue) : '—'}</span> },
              { key: 'st', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
            ]}
          />
        )}
      </Card>
    </div>
  )
}
