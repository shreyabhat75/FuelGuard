import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Search,
  UploadCloud,
} from 'lucide-react'
import { loadDemoStatement, reviewReconciliation } from '../../services/api'
import { useAppState } from '../../services/store'
import {
  Banner,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  KpiCard,
  Modal,
  StatusChip,
  inputCls,
} from '../../components/ui'
import { fmtDate, inr, num } from '../../utils/format'
import type { ReconciliationResult, ReviewerDecision } from '../../types'
import { currentUser } from '../../services/api'

type CategoryFilter =
  | 'all'
  | 'mismatches'
  | 'matched'
  | 'amount_mismatch'
  | 'rate_mismatch'
  | 'unmatched_pump_bill'
  | 'register_missing'
  | 'possible_duplicate'

export default function ReconciliationPage() {
  const s = useAppState()
  const user = currentUser(s)
  const [dragOver, setDragOver] = useState(false)
  const [decideRec, setDecideRec] = useState<ReconciliationResult | null>(null)
  const [decision, setDecision] = useState<Exclude<ReviewerDecision, 'none'>>('resolved')
  const [note, setNote] = useState('')
  const [noteErr, setNoteErr] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')

  const recs = s.reconciliations
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    recs.forEach((r) => (c[r.matchStatus] = (c[r.matchStatus] ?? 0) + 1))
    return c
  }, [recs])

  const mismatchesCount = (recs.length - (counts.matched ?? 0))
  const totalDiff = recs.filter((r) => r.matchStatus !== 'matched').reduce((a, r) => a + r.difference, 0)
  const resolvedCount = recs.filter((r) => r.reviewerDecision !== 'none').length

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void loadDemoStatement()
  }

  const exportCsv = () => {
    const header = 'bill_no,date,vehicle_no,litres,statement_amount,register_amount,difference,match_status,reviewer_decision,reviewer_note'
    const body = recs
      .map((r) => {
        const line = s.statementLines.find((l) => l.billNo === r.statementLineId)!
        const reg = r.entrySide
        return [
          line.billNo,
          line.date,
          line.vehicleNo,
          line.litres,
          line.amount,
          reg?.amount ?? '',
          r.difference,
          r.matchStatus,
          r.reviewerDecision,
          (r.reviewerNote ?? '').replace(/[\n,]/g, ' '),
        ].join(',')
      })
      .join('\n')
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'reconciliation-export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const submitDecision = () => {
    if (!decideRec) return
    if (!note.trim()) {
      setNoteErr('A note is mandatory for every reviewer decision.')
      return
    }
    reviewReconciliation(decideRec.id, decision, note.trim())
    setDecideRec(null)
    setNote('')
    setNoteErr('')
  }

  const lineOf = (id: string) => s.statementLines.find((l) => l.billNo === id)

  // Filter and search
  const filteredRecs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return recs.filter((r) => {
      const line = lineOf(r.statementLineId)
      // Category filter
      if (category === 'mismatches' && r.matchStatus === 'matched') return false
      if (category !== 'all' && category !== 'mismatches' && r.matchStatus !== category) return false

      // Text search
      if (!q) return true
      const billNo = (line?.billNo || '').toLowerCase()
      const vehicle = (line?.vehicleNo || '').toLowerCase()
      const date = (line?.date || '').toLowerCase()
      const statusStr = r.matchStatus.toLowerCase()
      return billNo.includes(q) || vehicle.includes(q) || date.includes(q) || statusStr.includes(q)
    })
  }, [recs, category, search, s.statementLines])

  return (
    <div className="space-y-5">
      {/* Upload card */}
      <Card>
        <CardHeader
          title="Pump Statement Import"
          subtitle={`Source: ${s.statementFileName || 'Shree Lakshmi Fuels'} (${s.statementLines.length} line items)`}
          action={
            <Button size="sm" onClick={() => void loadDemoStatement()}>
              Re-parse Demo Statement
            </Button>
          }
        />
        <div className="p-4">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
              dragOver ? 'border-primary-400 bg-primary-50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            <UploadCloud size={28} className="text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-navy-900">Drag & drop monthly petrol pump statement CSV</p>
            <p className="text-xs text-slate-500">Supports standard oil company billing formats (IOCL / BPCL / HPCL / Private)</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-navy-800 hover:bg-slate-100">
                <FileSpreadsheet size={15} /> Browse CSV…
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={() => {
                    void loadDemoStatement()
                  }}
                />
              </label>
              <Button size="sm" variant="secondary" onClick={() => void loadDemoStatement()}>
                Load Bundled Aug–Oct Statement
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary KPI Cards */}
      {recs.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard
              label="Matched Clean"
              value={String(counts.matched ?? 0)}
              sub="Statement ↔ register within tolerance"
              icon={<CheckCircle2 size={16} className="text-teal-600" />}
            />
            <KpiCard
              label="Mismatches to Audit"
              value={String(mismatchesCount)}
              sub="Rate, amount, missing or unknown vehicles"
              tone={mismatchesCount > 0 ? 'amber' : undefined}
              icon={<AlertTriangle size={16} />}
            />
            <KpiCard
              label="Total Discrepancy Amount"
              value={inr(totalDiff)}
              sub="Financial variance outside matched lines"
              tone={totalDiff > 0 ? 'amber' : undefined}
            />
            <KpiCard
              label="Accountant Decisions"
              value={`${resolvedCount} / ${recs.length}`}
              sub="Audited & approved exception lines"
            />
          </div>

          <Banner tone="info" title={`${recs.length} statement lines reconciled`}>
            Matched clean {counts.matched ?? 0} · rate mismatch {counts.rate_mismatch ?? 0} · amount mismatch {counts.amount_mismatch ?? 0} ·
            unmatched pump bill {counts.unmatched_pump_bill ?? 0} · register missing {counts.register_missing ?? 0} · possible duplicate {counts.possible_duplicate ?? 0}.
            Total absolute variance: <strong>{inr(totalDiff)}</strong>.
          </Banner>
        </>
      )}

      {/* Reconciliation Table Card */}
      <Card>
        <CardHeader
          title="Reconciliation Results Ledger"
          subtitle="Both sides shown exactly as recorded; the accountant reviews and records settlement decisions"
          action={
            recs.length > 0 ? (
              <Button size="sm" variant="secondary" onClick={exportCsv}>
                <Download size={14} /> Export CSV Ledger
              </Button>
            ) : undefined
          }
        />

        {/* Category Filter Tabs & Real-time Search */}
        <div className="border-b border-slate-100 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative min-w-64 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputCls} pl-9 py-1.5 text-xs`}
                placeholder="Search bill no, vehicle reg, date, status…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && (
              <Button size="sm" variant="ghost" onClick={() => setSearch('')}>
                Clear search
              </Button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
            <button
              onClick={() => setCategory('all')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                category === 'all' ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({recs.length})
            </button>
            <button
              onClick={() => setCategory('mismatches')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                category === 'mismatches' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Mismatches Only ({mismatchesCount})
            </button>
            <button
              onClick={() => setCategory('matched')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                category === 'matched' ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
              }`}
            >
              Matched ({counts.matched ?? 0})
            </button>
            <button
              onClick={() => setCategory('rate_mismatch')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                category === 'rate_mismatch' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Rate Mismatch ({counts.rate_mismatch ?? 0})
            </button>
            <button
              onClick={() => setCategory('amount_mismatch')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                category === 'amount_mismatch' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Amount Mismatch ({counts.amount_mismatch ?? 0})
            </button>
            <button
              onClick={() => setCategory('unmatched_pump_bill')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                category === 'unmatched_pump_bill' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Unknown Vehicle ({counts.unmatched_pump_bill ?? 0})
            </button>
            <button
              onClick={() => setCategory('register_missing')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                category === 'register_missing' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Missing on Register ({counts.register_missing ?? 0})
            </button>
            <button
              onClick={() => setCategory('possible_duplicate')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                category === 'possible_duplicate' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Duplicate Pair ({counts.possible_duplicate ?? 0})
            </button>
          </div>
        </div>

        {recs.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet size={20} />}
            title="No reconciliation data"
            description="Load the demo statement above to run the matching engine against the fuel register."
          />
        ) : filteredRecs.length === 0 ? (
          <EmptyState
            icon={<Filter size={20} />}
            title="No lines match current filter"
            description="Try changing the category tab or clearing the search text."
            action={
              <Button size="sm" variant="secondary" onClick={() => { setCategory('all'); setSearch('') }}>
                Reset Filters
              </Button>
            }
          />
        ) : (
          <DataTable
            rows={filteredRecs.slice(0, 100)}
            onRowClick={(r) => {
              setDecideRec(r)
              setDecision(r.reviewerDecision === 'none' ? 'resolved' : (r.reviewerDecision as Exclude<ReviewerDecision, 'none'>))
            }}
            columns={[
              {
                key: 'bill',
                label: 'Pump Bill',
                render: (r) => {
                  const line = lineOf(r.statementLineId)!
                  return (
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900">{line.billNo}</p>
                      <p className="text-xs text-slate-500">{fmtDate(line.date)} · {line.vehicleNo}</p>
                    </div>
                  )
                },
              },
              {
                key: 'stmt',
                label: 'Statement (Pump)',
                className: 'text-right',
                render: (r) => {
                  const line = lineOf(r.statementLineId)!
                  return (
                    <div className="tnum">
                      <p>{num(line.litres)} L</p>
                      <p className="text-slate-500">{inr(line.amount)}</p>
                      <p className="text-[10px] text-slate-400">@ ₹{num(line.rate, 2)}/L</p>
                    </div>
                  )
                },
              },
              {
                key: 'reg',
                label: 'Register (College)',
                className: 'text-right',
                render: (r) => (
                  <div className="tnum">
                    {r.entrySide ? (
                      <>
                        <p>{num(r.entrySide.litres)} L</p>
                        <p className={Math.abs(r.difference) > 0.5 && r.matchStatus === 'amount_mismatch' ? 'font-semibold text-amber-700' : 'text-slate-500'}>
                          {inr(r.entrySide.amount)}
                        </p>
                        {r.entrySide.rate && <p className="text-[10px] text-slate-400">@ ₹{num(r.entrySide.rate, 2)}/L</p>}
                      </>
                    ) : (
                      <span className="text-slate-400 text-xs italic">No driver log</span>
                    )}
                  </div>
                ),
              },
              {
                key: 'diff',
                label: 'Variance (₹)',
                className: 'text-right',
                render: (r) => (r.difference > 0 ? <span className="tnum font-bold text-amber-700">{inr(r.difference)}</span> : <span className="text-slate-400">—</span>),
              },
              { key: 'status', label: 'Match Status', render: (r) => <StatusChip status={r.matchStatus} /> },
              {
                key: 'rev',
                label: 'Accountant Action',
                render: (r) => (
                  <div className="min-w-0">
                    <StatusChip status={r.reviewerDecision === 'none' ? 'pending' : r.reviewerDecision} />
                    {r.reviewerNote && <p className="mt-1 truncate text-xs text-slate-500">{r.reviewerNote}</p>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Decision Modal */}
      <Modal open={Boolean(decideRec)} onClose={() => setDecideRec(null)} title="Accountant Reconciliation Decision">
        {decideRec && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Bill: <strong>{decideRec.statementLineId}</strong> · Match status: <strong>{decideRec.matchStatus.replace(/_/g, ' ')}</strong>
              {decideRec.difference > 0 && <> · Variance: <strong>{inr(decideRec.difference)}</strong></>}
            </p>
            <Field label="Resolution decision" htmlFor="recDecision">
              <select id="recDecision" className={inputCls} value={decision} onChange={(e) => setDecision(e.target.value as Exclude<ReviewerDecision, 'none'>)}>
                <option value="resolved">Resolved — verified with invoice & physical slips</option>
                <option value="needs_supplier_clarification">Needs supplier clarification (query sent to pump)</option>
                <option value="authorised_exception">Authorised exception (approved variance with note)</option>
              </select>
            </Field>
            <Field label="Audit & Resolution note (mandatory)" htmlFor="recNote" error={noteErr}>
              <textarea
                id="recNote"
                className={inputCls}
                rows={3}
                value={note}
                onChange={(e) => { setNote(e.target.value); setNoteErr('') }}
                placeholder="e.g. Pump confirmed billing machine slip matches register; ₹1,250 credit note issued."
              />
            </Field>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => setDecideRec(null)}>Cancel</Button>
              <Button className="flex-1" onClick={submitDecision}>Save Decision</Button>
            </div>
            <p className="text-xs text-slate-400">Reviewer: {user?.name} · All decisions are recorded in the audit trail.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
