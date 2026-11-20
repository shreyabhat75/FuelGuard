import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardCheck,
  ExternalLink,
  History,
  Lock,
} from 'lucide-react'
import { createApprovalForFlag, decideApproval } from '../../services/api'
import { useAppState } from '../../services/store'
import {
  Banner,
  Button,
  Card,
  CardHeader,
  Chip,
  DataTable,
  EmptyState,
  Field,
  Modal,
  StatusChip,
  inputCls,
} from '../../components/ui'
import { fmtDateTime, inr } from '../../utils/format'
import { currentUser } from '../../services/api'
import type { Approval } from '../../types'

export default function ApprovalsPage() {
  const s = useAppState()
  const user = currentUser(s)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [active, setActive] = useState<Approval | null>(null)
  const [decideOpen, setDecideOpen] = useState(false)
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'info_requested'>('approved')
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pending = s.approvals.filter((a) => a.decision === 'pending')
  const decided = s.approvals.filter((a) => a.decision !== 'pending')

  const openDecide = (a: Approval, d: typeof decision) => {
    setActive(a)
    setDecision(d)
    setDecideOpen(true)
    setReason('')
    setReasonErr('')
  }

  const submitDecide = () => {
    if (!active) return
    if (!reason.trim()) {
      setReasonErr('A mandatory justification comment is required for all administrative decisions (approvals, rejections, or information requests).')
      return
    }
    if (active.submitterId === user?.id) {
      setReasonErr('Maker-Checker Violation: Institutional policy prohibits approving your own submission.')
      return
    }
    if (decision === 'approved') {
      setConfirmOpen(true)
      return
    }
    decideApproval(active.id, decision, reason.trim())
    setDecideOpen(false)
    setActive(null)
  }

  const confirmFinal = () => {
    if (!active) return
    decideApproval(active.id, 'approved', reason.trim())
    setConfirmOpen(false)
    setDecideOpen(false)
    setActive(null)
  }

  return (
    <div className="space-y-5">
      {/* Title & Governance Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Principal Approval Inbox</h1>
          <p className="text-xs text-slate-500">
            Maker-checker governance, financial approval queue, and compliance review
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1 text-xs">
          <button
            onClick={() => setTab('pending')}
            className={`rounded-md px-3 py-1 font-semibold transition-colors ${
              tab === 'pending' ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Pending Approvals ({pending.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`rounded-md px-3 py-1 font-semibold transition-colors ${
              tab === 'history' ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Decision History ({decided.length})
          </button>
        </div>
      </div>

      <Banner tone="info" title="Maker-Checker Policy & Mandatory Justification">
        Every decision requires a written justification for the audit trail. In accordance with organizational controls, you cannot approve transactions or claims you originally submitted.
      </Banner>

      {tab === 'pending' ? (
        <Card>
          <CardHeader
            title={`Pending Requests (${pending.length})`}
            subtitle="Escalated fuel anomalies, rate premiums, or correction requests requiring executive approval"
          />
          {pending.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck size={24} />}
              title="No Pending Approvals"
              description="Your administrative queue is completely clear. Any cases escalated by the Transport Manager will appear here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((a) => {
                const isSelf = a.submitterId === user?.id
                return (
                  <li key={a.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-navy-900 text-base">{a.title}</p>
                          <Chip tone="blue">{a.targetType.toUpperCase()}</Chip>
                          {a.busCode && <Chip tone="slate">Bus {a.busCode}</Chip>}
                          {isSelf && (
                            <Chip tone="red">
                              <Lock size={11} /> Self-Submission (Maker-Checker Locked)
                            </Chip>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {a.id} · Submitted by <strong>{a.submitterName}</strong> ({a.submitterRole.replace('_', ' ')}) on {fmtDateTime(a.createdAt)}
                        </p>
                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
                          <p><strong>Evidence Summary:</strong> {a.evidenceSummary}</p>
                          {a.reviewNotes && <p><strong>Submitter Notes:</strong> {a.reviewNotes}</p>}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="font-medium text-navy-900">
                            Amount at Issue: {a.amount > 0 ? inr(a.amount) : 'Non-monetary correction'}
                          </span>
                          {a.targetType === 'flag' && (
                            <Link
                              to={`/app/flagged/${a.targetId}`}
                              className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:underline"
                            >
                              Inspect evidence dossier <ExternalLink size={12} />
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex w-full flex-col gap-2 sm:w-44 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => openDecide(a, 'approved')}
                          disabled={isSelf}
                          title={isSelf ? 'Cannot approve own submission' : 'Approve case'}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => openDecide(a, 'rejected')}
                          disabled={isSelf}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openDecide(a, 'info_requested')}
                        >
                          Request Info
                        </Button>
                        {isSelf && (
                          <p className="text-[10px] text-center text-red-600 font-medium">
                            Maker-checker lock: another officer must approve.
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={`Administrative Decision History (${decided.length})`}
            subtitle="Immutable record of approved, rejected, and clarified transactions"
          />
          {decided.length === 0 ? (
            <EmptyState
              icon={<History size={20} />}
              title="No Decided Requests"
              description="Past decisions made by the Principal will be logged here."
            />
          ) : (
            <DataTable
              rows={decided}
              columns={[
                {
                  key: 'req',
                  label: 'Request / Case',
                  render: (a) => (
                    <div>
                      <p className="font-bold text-navy-900">{a.title}</p>
                      <p className="text-xs text-slate-500">{a.id} · Bus {a.busCode || 'Fleet'}</p>
                    </div>
                  ),
                },
                {
                  key: 'amt',
                  label: 'Amount',
                  className: 'text-right',
                  render: (a) => <span className="tnum font-semibold">{a.amount > 0 ? inr(a.amount) : '—'}</span>,
                },
                {
                  key: 'dec',
                  label: 'Decision',
                  render: (a) => <StatusChip status={a.decision} />,
                },
                {
                  key: 'just',
                  label: 'Mandatory Rationale Note',
                  render: (a) => (
                    <div className="max-w-md">
                      <p className="text-xs text-slate-700 italic">"{a.reason || 'None'}"</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">By {a.decidedByName} on {a.decidedAt ? fmtDateTime(a.decidedAt) : ''}</p>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Card>
      )}

      {/* Escalate shortcut for testing convenience */}
      {user?.role === 'principal' && s.flags.some((f) => f.status === 'needs_review' && !s.approvals.some((a) => a.targetId === f.id && a.decision === 'pending')) && (
        <Card>
          <CardHeader
            title="Flagged Cases Awaiting Principal Queue"
            subtitle="Pull an open flagged case directly into the approval inbox (prototype convenience)"
          />
          <ul className="divide-y divide-slate-100">
            {s.flags
              .filter((f) => f.status === 'needs_review' && !s.approvals.some((a) => a.targetId === f.id && a.decision === 'pending'))
              .slice(0, 3)
              .map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-900 truncate">{f.caseTitle}</p>
                    <p className="text-slate-500">{f.id} · Severity: {f.severity} · Amount: {inr(f.amountAtIssue)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      createApprovalForFlag(
                        f.id,
                        'Pulled directly into approval queue by the Principal for administrative review.',
                        { id: 'system', name: 'Rule Engine (Auto Flag)', role: 'transport_manager', username: 'system' },
                      )
                    }
                  >
                    Pull to Inbox
                  </Button>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {/* Decision Modal with MANDATORY Justification */}
      <Modal
        open={decideOpen}
        onClose={() => setDecideOpen(false)}
        title={decision === 'approved' ? 'Approve Request' : decision === 'rejected' ? 'Reject Request' : 'Request Further Evidence'}
      >
        {active && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-bold text-navy-900">{active.title}</p>
              <p className="mt-1 text-slate-500">Submitted by: {active.submitterName} ({active.submitterRole.replace('_', ' ')})</p>
              <p className="text-slate-500">Amount: {active.amount > 0 ? inr(active.amount) : 'Non-monetary'}</p>
            </div>

            <Field
              label="Administrative Justification (Mandatory)"
              htmlFor="aprReason"
              error={reasonErr}
              required
              hint="Document the basis of your decision. This comment is permanently preserved in the audit log."
            >
              <textarea
                id="aprReason"
                className={inputCls}
                rows={3}
                value={reason}
                onChange={(e) => { setReason(e.target.value); setReasonErr('') }}
                placeholder="e.g. Reviewed pump statement and odometer slip; approve write-off of ₹1,250 billing discrepancy."
              />
            </Field>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDecideOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={decision === 'approved' ? 'success' : decision === 'rejected' ? 'danger' : 'primary'}
                className="flex-1"
                onClick={submitDecide}
              >
                {decision === 'approved' ? 'Review & Sign-off' : 'Confirm Decision'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Final Confirmation Modal for Approvals */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Administrative Approval">
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            You are about to authorize: <strong>{active?.title}</strong>
          </p>
          <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-xs text-teal-900">
            <strong>Recorded Justification:</strong>
            <p className="mt-1 italic">"{reason}"</p>
          </div>
          <p className="text-xs text-slate-500">
            Approved by: {user?.name} · This will update the case status to Resolved in the master ledger.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Back
            </Button>
            <Button variant="success" className="flex-1" onClick={confirmFinal}>
              Authorize & Sign
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
