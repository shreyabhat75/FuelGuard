import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  IndianRupee,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useAppState } from '../../services/store'
import { Button, Card, CardHeader, Chip, DataTable, KpiCard, StatusChip } from '../../components/ui'
import { fmtDateTime, inr } from '../../utils/format'
import { currentUser } from '../../services/api'

export default function PrincipalDashboard() {
  const s = useAppState()
  const user = currentUser(s)
  const nav = useNavigate()

  const pendingApprovals = s.approvals.filter((a) => a.decision === 'pending')
  const decidedApprovals = s.approvals.filter((a) => a.decision !== 'pending')
  const highSeverityFlags = s.flags.filter((f) => f.severity === 'high' && f.status !== 'resolved')
  const totalAmountAtIssue = s.flags.filter((f) => f.status !== 'resolved').reduce((a, f) => a + f.amountAtIssue, 0)

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Principal Governance & Approvals Hub</h1>
          <p className="text-xs text-slate-500">
            Executive oversight, maker-checker governance, financial approval queue, and compliance review
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => nav('/app/reports')}>
            <FileSpreadsheet size={14} /> Executive Reports
          </Button>
          <Button size="sm" onClick={() => nav('/app/approvals')}>
            <ClipboardCheck size={14} /> View Approval Inbox ({pendingApprovals.length})
          </Button>
        </div>
      </div>

      {/* Governance KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Pending Approvals"
          value={String(pendingApprovals.length)}
          sub="Items awaiting your sign-off"
          tone={pendingApprovals.length > 0 ? 'amber' : undefined}
          icon={<ClipboardCheck size={16} />}
        />
        <KpiCard
          label="Financial Amount at Issue"
          value={inr(totalAmountAtIssue)}
          sub="Disputed variance under review"
          tone={totalAmountAtIssue > 0 ? 'red' : undefined}
          icon={<IndianRupee size={16} />}
        />
        <KpiCard
          label="High Severity Anomalies"
          value={String(highSeverityFlags.length)}
          sub="Requires document verification"
          tone={highSeverityFlags.length > 0 ? 'red' : undefined}
          icon={<AlertTriangle size={16} />}
        />
        <KpiCard
          label="Decisions Completed"
          value={String(decidedApprovals.length)}
          sub="Approved, rejected or questioned"
          icon={<ShieldCheck size={16} className="text-teal-600" />}
        />
      </div>

      {/* Governance Notice & Maker-Checker rule */}
      <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert size={20} className="mt-0.5 shrink-0 text-primary-600" />
          <div className="text-xs leading-relaxed text-slate-700">
            <p className="font-bold text-navy-900">Institutional Governance & Maker-Checker Policy</p>
            <p className="mt-1">
              As Principal, you provide independent second-level authorization. Every approval or rejection strictly requires a mandatory rationale note. Under the maker-checker protocol, a user can never approve claims or submissions they created.
            </p>
          </div>
        </div>
      </div>

      {/* Pending Approvals Priority Queue */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ClipboardCheck size={18} className="text-primary-600" /> Pending Approval Queue ({pendingApprovals.length})
            </span>
          }
          subtitle="Requests escalated by Transport Manager or Accountant for administrative sign-off"
          action={
            <Button size="sm" variant="ghost" onClick={() => nav('/app/approvals')}>
              Full Inbox <ArrowRight size={14} />
            </Button>
          }
        />
        {pendingApprovals.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <CheckCircle2 size={28} className="mx-auto mb-2 text-teal-600" />
            <p className="font-semibold text-navy-900">Approval Inbox Clear</p>
            <p className="text-xs text-slate-400">All escalated cases have been decided.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingApprovals.map((a) => {
              const isSelf = a.submitterId === user?.id
              return (
                <div key={a.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-navy-900">{a.title}</span>
                        <Chip tone="blue">{a.targetType.toUpperCase()}</Chip>
                        {a.busCode && <Chip tone="slate">{a.busCode}</Chip>}
                        {isSelf && (
                          <Chip tone="red">
                            <Lock size={11} /> Self-submission (Maker-Checker Block)
                          </Chip>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Submitted by <strong>{a.submitterName}</strong> ({a.submitterRole.replace('_', ' ')}) on {fmtDateTime(a.createdAt)}
                      </p>
                      <p className="mt-2 text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">
                        <strong>Evidence:</strong> {a.evidenceSummary}
                      </p>
                      {a.reviewNotes && (
                        <p className="mt-1.5 text-xs text-slate-600">
                          <strong>Manager Notes:</strong> {a.reviewNotes}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold tnum text-navy-900">{a.amount > 0 ? inr(a.amount) : 'Non-monetary'}</p>
                      <Button size="sm" className="mt-2" onClick={() => nav('/app/approvals')}>
                        Review & Decide
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Recent Governance Decisions */}
      <Card>
        <CardHeader
          title="Recent Administrative Decisions Log"
          subtitle="Audit log of cases approved, rejected, or sent back for clarification"
          action={
            <Button size="sm" variant="ghost" onClick={() => nav('/app/audit')}>
              Full Audit Trail <ArrowRight size={14} />
            </Button>
          }
        />
        {decidedApprovals.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No decisions recorded yet.</div>
        ) : (
          <DataTable
            rows={decidedApprovals.slice(0, 6)}
            onRowClick={() => nav('/app/approvals')}
            columns={[
              { key: 'title', label: 'Case / Request', render: (a) => <span className="font-semibold text-navy-900">{a.title}</span> },
              { key: 'bus', label: 'Bus', render: (a) => a.busCode || 'Fleet' },
              { key: 'amt', label: 'Amount', className: 'text-right', render: (a) => <span className="tnum font-medium">{a.amount > 0 ? inr(a.amount) : '—'}</span> },
              { key: 'dec', label: 'Decision', render: (a) => <StatusChip status={a.decision} /> },
              { key: 'by', label: 'Decided By', render: (a) => <span className="text-xs text-slate-600">{a.decidedByName}</span> },
              { key: 'reason', label: 'Justification Note', render: (a) => <p className="max-w-xs truncate text-xs text-slate-500">{a.reason || 'None'}</p> },
              { key: 'when', label: 'Timestamp', render: (a) => <span className="text-xs text-slate-400 tnum">{a.decidedAt ? fmtDateTime(a.decidedAt) : '—'}</span> },
            ]}
          />
        )}
      </Card>
    </div>
  )
}
