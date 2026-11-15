import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react'
import { loadDemoStatement, reviewReconciliation } from '../../services/api'
import { useAppState } from '../../services/store'
import { Banner, Button, Card, CardHeader, DataTable, EmptyState, Field, Modal, StatusChip, inputCls } from '../../components/ui'
import { fmtDate, inr, num } from '../../utils/format'
import type { ReconciliationResult, ReviewerDecision } from '../../types'
import { currentUser } from '../../services/api'

export default function ReconciliationPage() {
  const s = useAppState()
  const user = currentUser(s)
  const [dragOver, setDragOver] = useState(false)
  const [decideRec, setDecideRec] = useState<ReconciliationResult | null>(null)
  const [decision, setDecision] = useState<Exclude<ReviewerDecision, 'none'>>('resolved')
  const [note, setNote] = useState('')
  const [noteErr, setNoteErr] = useState('')

  const recs = s.reconciliations
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    recs.forEach((r) => (c[r.matchStatus] = (c[r.matchStatus] ?? 0) + 1))
    return c
  }, [recs])
  const totalDiff = recs.filter((r) => r.matchStatus !== 'matched').reduce((a, r) => a + r.difference, 0)

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

  return (
    <div className="space-y-5">
      {/* upload */}
      <Card>
        <CardHeader title="Pump statement" subtitle={`Source file preserved in demo state: ${s.statementFileName}`} />
        <div className="p-4">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragOver ? 'border-primary-400 bg-primary-50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            <UploadCloud size={28} className="text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-navy-900">Drag & drop the monthly pump CSV here</p>
            <p className="text-xs text-slate-500">or</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-navy-800 hover:bg-slate-100">
                <FileSpreadsheet size={16} /> Browse file…
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={() => {
                    void loadDemoStatement()
                  }}
                />
              </label>
              <Button onClick={() => void loadDemoStatement()}>Load demo statement</Button>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Prototype: any dropped file is represented by the seeded Shree Lakshmi Fuels statement (Aug–Oct 2026, {s.statementLines.length} lines). Parsing runs locally in the demo store.
            </p>
          </div>

          {recs.length > 0 && (
            <div className="mt-4">
              <Banner tone="info" title={`${recs.length} statement lines reconciled`}>
                Matched {counts.matched ?? 0} · amount mismatch {counts.amount_mismatch ?? 0} · rate mismatch {counts.rate_mismatch ?? 0} ·
                unmatched pump bill {counts.unmatched_pump_bill ?? 0} · register missing {counts.register_missing ?? 0} · possible duplicate {counts.possible_duplicate ?? 0}.
                Total absolute difference outside matched lines: <strong>{inr(totalDiff)}</strong> (not a confirmed loss).
              </Banner>
            </div>
          )}
        </div>
      </Card>

      {/* table */}
      <Card>
        <CardHeader
          title="Reconciliation results"
          subtitle="Both sides shown exactly as recorded; the reviewer decides, the app does not"
          action={
            recs.length > 0 ? (
              <Button size="sm" variant="secondary" onClick={exportCsv}>
                <Download size={14} /> Export CSV
              </Button>
            ) : undefined
          }
        />
        {recs.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet size={20} />}
            title="No reconciliation yet"
            description="Load the demo statement to match the 82 pump lines against the fuel register."
          />
        ) : (
          <DataTable
            rows={recs.slice(0, 100)}
            onRowClick={(r) => {
              setDecideRec(r)
              setDecision(r.reviewerDecision === 'none' ? 'resolved' : (r.reviewerDecision as Exclude<ReviewerDecision, 'none'>))
            }}
            columns={[
              {
                key: 'bill',
                label: 'Pump bill',
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
                label: 'Statement',
                className: 'text-right',
                render: (r) => {
                  const line = lineOf(r.statementLineId)!
                  return (
                    <div className="tnum">
                      <p>{num(line.litres)} L</p>
                      <p className="text-slate-500">{inr(line.amount)}</p>
                    </div>
                  )
                },
              },
              {
                key: 'reg',
                label: 'Register',
                className: 'text-right',
                render: (r) => (
                  <div className="tnum">
                    {r.entrySide ? (
                      <>
                        <p>{num(r.entrySide.litres)} L</p>
                        <p className={Math.abs(r.difference) > 0.5 && r.matchStatus === 'amount_mismatch' ? 'font-semibold text-amber-700' : 'text-slate-500'}>
                          {inr(r.entrySide.amount)}
                        </p>
                      </>
                    ) : (
                      <span className="text-slate-400">no entry</span>
                    )}
                  </div>
                ),
              },
              {
                key: 'diff',
                label: 'Difference',
                className: 'text-right',
                render: (r) => (r.difference > 0 ? <span className="tnum font-semibold text-amber-700">{inr(r.difference)}</span> : <span className="text-slate-400">—</span>),
              },
              { key: 'status', label: 'Match', render: (r) => <StatusChip status={r.matchStatus} /> },
              {
                key: 'rev',
                label: 'Reviewer',
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

      {/* decision modal */}
      <Modal open={Boolean(decideRec)} onClose={() => setDecideRec(null)} title="Reviewer decision">
        {decideRec && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Line <strong>{decideRec.statementLineId}</strong> · match <strong>{decideRec.matchStatus.replace(/_/g, ' ')}</strong>
              {decideRec.difference > 0 && <> · difference <strong>{inr(decideRec.difference)}</strong></>}
            </p>
            <Field label="Decision" htmlFor="recDecision">
              <select id="recDecision" className={inputCls} value={decision} onChange={(e) => setDecision(e.target.value as Exclude<ReviewerDecision, 'none'>)}>
                <option value="resolved">Resolved — verified with documents</option>
                <option value="needs_supplier_clarification">Needs supplier clarification</option>
                <option value="authorised_exception">Authorised exception (accepted with reason)</option>
              </select>
            </Field>
            <Field label="Note (mandatory)" htmlFor="recNote" error={noteErr}>
              <textarea id="recNote" className={inputCls} rows={3} value={note} onChange={(e) => { setNote(e.target.value); setNoteErr('') }} placeholder="e.g. Pump confirmed the lower amount was a printer error; ledger updated." />
            </Field>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => setDecideRec(null)}>Cancel</Button>
              <Button className="flex-1" onClick={submitDecision}>Save decision</Button>
            </div>
            <p className="text-xs text-slate-400">Reviewer: {user?.name} · decisions are logged in the audit trail.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
