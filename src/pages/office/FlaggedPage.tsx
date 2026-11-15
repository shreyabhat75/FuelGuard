import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NotebookPen, Search } from 'lucide-react'
import { useAppState } from '../../services/store'
import { Card, CardHeader, DataTable, EmptyState, StatusChip, inputCls, KpiCard } from '../../components/ui'
import { fmtDateTime, inr } from '../../utils/format'

export default function FlaggedPage() {
  const s = useAppState()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState('all')

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return s.flags
      .filter((f) => severity === 'all' || f.severity === severity)
      .filter((f) => status === 'all' || f.status === status)
      .filter(
        (f) =>
          !query ||
          f.caseTitle.toLowerCase().includes(query) ||
          f.ruleCode.toLowerCase().includes(query) ||
          f.targetIds.join(' ').toLowerCase().includes(query) ||
          (f.busCode ?? '').toLowerCase().includes(query),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [s.flags, q, severity, status])

  const bySeverity = (sev: string) => s.flags.filter((f) => f.severity === sev && f.status !== 'resolved').length
  const byStatus = (st: string) => s.flags.filter((f) => f.status === st).length
  const amountAtIssue = rows.reduce((a, f) => a + f.amountAtIssue, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Open cases" value={String(s.flags.filter((f) => f.status !== 'resolved').length)} sub="Not yet resolved by a reviewer" tone="amber" />
        <KpiCard label="High severity" value={String(bySeverity('high'))} sub="Verify with documents/GPS" tone="red" />
        <KpiCard label="Under review" value={String(byStatus('under_review'))} sub="Actively being checked" />
        <KpiCard label="Escalated" value={String(byStatus('escalated'))} sub="Waiting on the principal" tone="blue" />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search case, rule, entry IDs, bus…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search flagged cases"
          />
        </div>
        <select className={`${inputCls} max-w-44`} value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
          <option value="all">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className={`${inputCls} max-w-52`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Review status">
          <option value="all">All statuses</option>
          <option value="needs_review">Needs review</option>
          <option value="under_review">Under review</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <BannerishNote />

      <Card>
        <CardHeader
          title={`${rows.length} flagged cases`}
          subtitle={`Sum of “amount at issue” shown: ${inr(amountAtIssue)} — this is NOT a confirmed loss`}
        />
        <DataTable
          rows={rows}
          onRowClick={(f) => nav(`/app/flagged/${f.id}`)}
          empty={
            <EmptyState
              icon={<NotebookPen size={20} />}
              title="No cases match the filters"
              description="The demo seeds 9 investigation cases from findings.csv."
            />
          }
          columns={[
            {
              key: 'case',
              label: 'Case',
              render: (f) => (
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy-900">{f.caseTitle}</p>
                  <p className="truncate text-xs text-slate-500">{f.targetIds.join(', ')}</p>
                </div>
              ),
            },
            { key: 'bus', label: 'Bus', render: (f) => f.busCode ?? <span className="text-slate-400">—</span> },
            { key: 'when', label: 'Raised', render: (f) => <span className="tnum">{fmtDateTime(f.createdAt)}</span> },
            { key: 'sev', label: 'Severity', render: (f) => <StatusChip status={f.severity} /> },
            {
              key: 'amt',
              label: 'Amount at issue',
              className: 'text-right',
              render: (f) => (f.amountAtIssue > 0 ? <span className="tnum">{inr(f.amountAtIssue)}</span> : <span className="text-slate-400">—</span>),
            },
            { key: 'status', label: 'Review status', render: (f) => <StatusChip status={f.status} /> },
          ]}
        />
      </Card>
    </div>
  )
}

function BannerishNote() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-600 shadow-card">
      <strong className="text-navy-900">How to read this list.</strong> Every case pairs a rule
      trigger with independent evidence (pump statement, published price, GPS, tank capacity). The
      “amount at issue” is the money the evidence cannot yet account for — it becomes a confirmed
      loss only after a human verifies the documents.
    </div>
  )
}
