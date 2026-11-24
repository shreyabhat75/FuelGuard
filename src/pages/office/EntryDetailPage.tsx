import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ImageOff,
  MapPinOff,
  NotebookPen,
  ScrollText,
  ShieldQuestion,
} from 'lucide-react'
import { proposeCorrection } from '../../services/api'
import { useAppState } from '../../services/store'
import { Banner, Button, Card, CardHeader, EmptyState, Field, Modal, StatusChip, inputCls } from '../../components/ui'
import { fmtDateTime, inr, num } from '../../utils/format'
import { currentUser } from '../../services/api'
import type { CorrectionProposal } from '../../types'

export default function EntryDetailPage() {
  const { entryId } = useParams()
  const s = useAppState()
  const nav = useNavigate()
  const user = currentUser(s)
  const entry = s.entries.find((e) => e.id === entryId)
  const [corrOpen, setCorrOpen] = useState(false)
  const [corrField, setCorrField] = useState<CorrectionProposal['field']>('amount')
  const [corrValue, setCorrValue] = useState('')
  const [corrReason, setCorrReason] = useState('')
  const [corrErr, setCorrErr] = useState('')

  const flags = useMemo(
    () => s.flags.filter((f) => entry && f.targetIds.includes(entry.id)),
    [s.flags, entry],
  )
  const timeline = useMemo(() => {
    if (!entry) return []
    const flagIds = s.flags.filter((f) => f.targetIds.includes(entry.id)).map((f) => f.id)
    return s.audit
      .filter(
        (a) =>
          a.entityId === entry.id ||
          (a.entityType === 'flag' && flagIds.includes(a.entityId)) ||
          (a.entityType === 'entry' && a.entityId === entry.id && a.action === 'correction_proposed'),
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [s.audit, s.flags, entry])

  const corrections = s.corrections.filter((c) => c.entryId === entryId)

  if (!entry) {
    return (
      <Card>
        <EmptyState
          icon={<ScrollText size={20} />}
          title="Entry not found"
          description={`No fuel entry with ID ${entryId}.`}
          action={<Button variant="secondary" onClick={() => nav(-1)}>Go back</Button>}
        />
      </Card>
    )
  }

  const isManager = user?.role === 'transport_manager' || user?.role === 'admin'
  const isDriver = user?.role === 'driver'

  const submitCorrection = () => {
    const v = Number(corrValue)
    if (!corrReason.trim() || Number.isNaN(v) || corrValue === '') {
      setCorrErr('A reason and a valid new value are required. The original value is always preserved.')
      return
    }
    proposeCorrection(entry.id, corrField, entry[corrField], v, corrReason.trim())
    setCorrOpen(false)
    setCorrValue('')
    setCorrReason('')
    setCorrErr('')
  }

  const fieldLabel: Record<CorrectionProposal['field'], string> = {
    litres: 'Litres',
    amount: 'Amount (₹)',
    odometerKm: 'Odometer (km)',
  }

  return (
    <div className="space-y-4">
      {isDriver && (
        <Link to="/driver/entries" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
          <ArrowLeft size={15} /> My entries
        </Link>
      )}
      {!isDriver && (
        <Link to="/app/entries" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
          <ArrowLeft size={15} /> All entries
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-navy-900">{entry.id}</h2>
        <StatusChip status={entry.status} />
        {entry.registerRef && (
          <span className="text-xs text-slate-500">from paper register (imported)</span>
        )}
      </div>

      {/* facts */}
      <Card>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Bus</dt><dd className="font-semibold text-navy-900">{entry.busId}</dd></div>
          <div><dt className="text-xs text-slate-500">Recorded (device)</dt><dd className="font-semibold text-navy-900">{fmtDateTime(entry.timestampClient)}</dd></div>
          <div><dt className="text-xs text-slate-500">Server time</dt><dd className="font-semibold text-navy-900">{fmtDateTime(entry.timestampServer)} <span className="font-normal text-slate-400">(demo)</span></dd></div>
          <div><dt className="text-xs text-slate-500">Litres</dt><dd className="font-semibold tnum">{num(entry.litres)} L</dd></div>
          <div><dt className="text-xs text-slate-500">Amount</dt><dd className="font-semibold tnum">{inr(entry.amount)}</dd></div>
          <div><dt className="text-xs text-slate-500">Rate / L</dt><dd className="font-semibold tnum">₹{num(entry.amount / entry.litres, 2)}</dd></div>
          <div><dt className="text-xs text-slate-500">Odometer</dt><dd className="font-semibold tnum">{num(entry.odometerKm, 0)} km</dd></div>
          <div><dt className="text-xs text-slate-500">Payment</dt><dd className="font-semibold capitalize">{entry.paymentMode.replace('_', ' ')}</dd></div>
          <div><dt className="text-xs text-slate-500">Pump</dt><dd className="font-semibold">{entry.pumpName}</dd></div>
          <div><dt className="text-xs text-slate-500">Bill no.</dt><dd className="font-semibold">{entry.billNo ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Recorded by</dt><dd className="font-semibold">{entry.createdByName}</dd></div>
          <div><dt className="text-xs text-slate-500">Receipt on file</dt><dd className="font-semibold">{entry.receiptOnFile ? 'Yes (paper file)' : 'No'}</dd></div>
        </dl>
      </Card>

      {/* location */}
      <Card>
        <CardHeader title="Location evidence" subtitle="Stored only when the device actually provides GPS" />
        <div className="p-4">
          {entry.location ? (
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <ShieldQuestion size={20} />
              </span>
              <div className="tnum text-sm">
                <p className="font-semibold text-navy-900">{entry.location.lat}, {entry.location.lng}</p>
                {entry.location.accuracyM && <p className="text-xs text-slate-500">±{entry.location.accuracyM} m accuracy</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <MapPinOff size={20} />
              </span>
              <div className="text-sm">
                <p className="font-semibold text-navy-900">Location unavailable</p>
                <p className="text-xs text-slate-500">
                  {entry.locationNote === 'denied' ? 'Permission denied on the device.' : 'GPS unavailable at save time.'}{' '}
                  No coordinates were invented. Verify the pump from the receipt.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* photos */}
      <Card>
        <CardHeader title="Photos" subtitle="Originals are kept; they can be replaced but not deleted" />
        <div className="grid grid-cols-2 gap-3 p-4">
          {[entry.odometerPhoto, entry.receiptPhoto].map((p, i) =>
            p ? (
              <figure key={i} className="overflow-hidden rounded-lg border border-slate-200">
                <img src={p.url} alt={p.kind} className="h-32 w-full object-cover" />
                <figcaption className="flex items-center justify-between px-2 py-1.5 text-xs text-slate-500">
                  <span className="capitalize">{p.kind}</span>
                  {p.demo && <span className="font-semibold text-amber-600">demo placeholder</span>}
                </figcaption>
              </figure>
            ) : (
              <div key={i} className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400">
                <ImageOff size={18} />
                <span className="mt-1 text-xs">{i === 0 ? 'No odometer photo' : 'No receipt photo'}</span>
              </div>
            ),
          )}
        </div>
      </Card>

      {/* flags */}
      {flags.length > 0 && (
        <Card>
          <CardHeader title="Linked review cases" subtitle="Flags are questions for a human — not verdicts" />
          <ul className="divide-y divide-slate-100">
            {flags.map((f) => (
              <li key={f.id}>
                <Link to={`/app/flagged/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-900">{f.caseTitle}</p>
                    <p className="text-xs text-slate-500">{f.ruleCode} · amount at issue {inr(f.amountAtIssue)}</p>
                  </div>
                  <StatusChip status={f.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* corrections */}
      <Card>
        <CardHeader
          title="Corrections"
          subtitle="Original values are always preserved — corrections are separate events"
          action={isManager ? <Button size="sm" variant="secondary" onClick={() => setCorrOpen(true)}><NotebookPen size={14} /> Propose correction</Button> : undefined}
        />
        <div className="p-4 text-sm">
          {corrections.length === 0 ? (
            <p className="text-slate-500">
              No corrections proposed. {isDriver && 'If something is wrong, tell the office — a manager can propose a correction with a reason.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {corrections.map((c) => (
                <li key={c.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-navy-900">{fieldLabel[c.field]}</p>
                    <StatusChip status={c.status === 'pending' ? 'pending' : c.status === 'approved' ? 'approved' : 'rejected'} />
                  </div>
                  <p className="mt-1 tnum text-sm">
                    <span className="text-slate-400 line-through">{num(c.originalValue, 2)}</span>
                    <span className="mx-2">→</span>
                    <span className="font-semibold">{num(c.proposedValue, 2)}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Reason: {c.reason} — {c.proposedByName}, {fmtDateTime(c.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* activity notes */}
      {entry.activityNotes && entry.activityNotes.length > 0 && (
        <Banner tone="info" title="Activity recorded at entry time">
          <ul className="list-disc pl-4">{entry.activityNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Banner>
      )}

      {/* timeline */}
      <Card>
        <CardHeader title="Timeline" subtitle="Every view, note and decision is logged" />
        <ol className="space-y-0 p-4">
          {timeline.map((a) => (
            <li key={a.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
              <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-primary-500" aria-hidden />
              <p className="text-sm font-medium text-navy-900">
                {a.action.replace(/_/g, ' ')} {a.before && <span className="text-slate-400">({a.before} → {a.after})</span>}
                {!a.before && a.after && <span className="text-slate-400"> — {a.after}</span>}
              </p>
              {a.reason && <p className="text-xs text-slate-500">Reason: {a.reason}</p>}
              <p className="text-xs text-slate-400">{a.actorName} · {fmtDateTime(a.timestamp)}</p>
            </li>
          ))}
          {timeline.length === 0 && (
            <li className="text-sm text-slate-500">
              <ImageOff size={14} className="mr-1 inline" /> No recorded activity yet.
            </li>
          )}
        </ol>
      </Card>

      {isDriver && (
        <Banner tone="info" title="Can’t edit a saved entry">
          Submitted records cannot be changed by the driver. Ask the office; corrections keep the
          original value visible with a reason.
        </Banner>
      )}

      {/* correction modal */}
      <Modal open={corrOpen} onClose={() => setCorrOpen(false)} title="Propose correction">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            This does <strong>not</strong> overwrite {entry.id}. A correction event with the original
            value, the new value and your reason will be added for approval.
          </p>
          <Field label="Field" htmlFor="corrField">
            <select id="corrField" className={inputCls} value={corrField} onChange={(e) => setCorrField(e.target.value as CorrectionProposal['field'])}>
              <option value="amount">Amount (₹)</option>
              <option value="litres">Litres</option>
              <option value="odometerKm">Odometer (km)</option>
            </select>
          </Field>
          <Field label={`Original value`} hint="Locked — cannot be changed here.">
            <input className={`${inputCls} bg-slate-100 text-slate-500`} value={num(entry[corrField], 2)} readOnly />
          </Field>
          <Field label="Proposed value" htmlFor="corrValue" required>
            <input id="corrValue" type="number" className={inputCls} value={corrValue} onChange={(e) => setCorrValue(e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="corrReason" required>
            <textarea id="corrReason" className={inputCls} rows={3} value={corrReason} onChange={(e) => setCorrReason(e.target.value)} placeholder="e.g. Receipt SLF/71185 shows ₹9,001.69 — register amount keyed wrong." />
          </Field>
          {corrErr && <Banner tone="danger" title={corrErr} />}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setCorrOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={submitCorrection}>Propose correction</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
