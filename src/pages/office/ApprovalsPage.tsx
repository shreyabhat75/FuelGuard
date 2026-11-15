import { useState } from 'react'
import { ClipboardCheck, Info } from 'lucide-react'
import { createApprovalForFlag, decideApproval } from '../../services/api'
import { useAppState } from '../../services/store'
import { Banner, Button, Card, CardHeader, EmptyState, Field, Modal, StatusChip, inputCls } from '../../components/ui'
import { fmtDateTime, inr } from '../../utils/format'
import { currentUser } from '../../services/api'
import type { Approval, ApprovalDecision } from '../../types'

export default function ApprovalsPage() {
  const s = useAppState()
  const user = currentUser(s)
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
      setReasonErr('A reason/comment is mandatory for rejection and information requests (and good practice for approvals).')
      return
    }
    if (active.submitterId === user?.id) {
      setReasonErr('You cannot decide on your own submission.')
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
      <Banner tone="info" title="Approval inbox — principal decisions">
        Approve, reject or request more information. Rejections and information requests need a
        written reason; approvals get a confirmation dialog. You cannot decide on your own
        submission.
      </Banner>

      <Card>
        <CardHeader title={`Pending (${pending.length})`} subtitle="Serious cases and corrections escalated to you" />
        {pending.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={20} />} title="Inbox clear" description="No pending approvals. Escalated cases will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((a) => (
              <li key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-900">{a.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.id} · {a.busCode ?? 'fleet'} · submitted by {a.submitterName} ({a.submitterRole.replace('_', ' ')}) · {fmtDateTime(a.createdAt)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{a.evidenceSummary}</p>
                    <p className="mt-1 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                      <strong className="text-navy-900">Review notes:</strong> {a.reviewNotes}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <Info size={12} /> Evidence completeness: {a.amount > 0 ? 'statement + register side-by-side' : 'documents pending'} · amount at issue {a.amount > 0 ? inr(a.amount) : 'not quantified'}
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-44">
                    <Button size="sm" onClick={() => openDecide(a, 'approved')}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => openDecide(a, 'rejected')}>Reject</Button>
                    <Button size="sm" variant="secondary" onClick={() => openDecide(a, 'info_requested')}>Request info</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={`Decision history (${decided.length})`} />
        {decided.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No decisions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900">{a.title}</p>
                  <p className="text-xs text-slate-500">
                    {a.decidedByName} · {a.decidedAt ? fmtDateTime(a.decidedAt) : ''} · reason: {a.reason}
                  </p>
                </div>
                <StatusChip status={a.decision} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* escalate-shortcut for cases not yet queued */}
      {user?.role === 'principal' && s.flags.some((f) => f.status === 'needs_review' && !s.approvals.some((a) => a.targetId === f.id && a.decision === 'pending')) && (
        <Card>
          <CardHeader title="Flagged cases not yet escalated" subtitle="As principal you can pull a case into your inbox directly (prototype convenience)" />
          <ul className="divide-y divide-slate-100">
            {s.flags
              .filter((f) => f.status === 'needs_review' && !s.approvals.some((a) => a.targetId === f.id && a.decision === 'pending'))
              .map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-900">{f.caseTitle}</p>
                    <p className="text-xs text-slate-500">{f.id} · severity {f.severity}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      createApprovalForFlag(
                        f.id,
                        'Pulled into approval inbox by the principal for a decision.',
                        { id: 'system', name: 'Rule engine (auto flag)', role: 'transport_manager', username: 'system' },
                      )
                    }
                  >
                    Add to inbox
                  </Button>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {/* decide modal */}
      <Modal
        open={decideOpen}
        onClose={() => setDecideOpen(false)}
        title={decision === 'approved' ? 'Approve case' : decision === 'rejected' ? 'Reject case' : 'Request more information'}
      >
        {active && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{active.title}</p>
            {decision === 'approved' && (
              <p className="text-sm text-slate-600">
                Approval records your decision and reason. It does <strong>not</strong> change any
                original transaction value.
              </p>
            )}
            <Field
              label={decision === 'approved' ? 'Reason (recorded with the decision)' : 'Reason (mandatory)'}
              htmlFor="aprReason"
              error={reasonErr}
              required={decision !== 'approved'}
            >
              <textarea id="aprReason" className={inputCls} rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr('') }} placeholder="e.g. Ledger page photographed; approve booking the ₹1,250 as pump billing error." />
            </Field>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => setDecideOpen(false)}>Cancel</Button>
              <Button variant={decision === 'approved' ? 'success' : decision === 'rejected' ? 'danger' : 'primary'} className="flex-1" onClick={submitDecide}>
                {decision === 'approved' ? 'Continue' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* final confirm for approval */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm approval">
        <p className="text-sm text-slate-600">
          You are about to give a final approval for <strong>{active?.title}</strong> with reason:
        </p>
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">“{reason}”</p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>Go back</Button>
          <Button variant="success" className="flex-1" onClick={confirmFinal}>Approve finally</Button>
        </div>
      </Modal>
    </div>
  )
}

export type { ApprovalDecision }
