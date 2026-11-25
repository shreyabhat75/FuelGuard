import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  FileWarning,
  Gauge,
  IndianRupee,
  MapPin,
  MessageSquare,
  Receipt,
  Route,
  Scale,
  Send,
  Tag,
} from 'lucide-react'
import { addFlagNote, markFlagViewed, setFlagStatus } from '../../services/api'
import { useAppState, buses, dailyPrices } from '../../services/store'
import { Banner, Button, Card, CardHeader, Chip, EmptyState, Field, Modal, StatusChip, inputCls } from '../../components/ui'
import { dateKey, fmtDate, fmtDateTime, inr, num } from '../../utils/format'
import { publishedPrice } from '../../utils/rules'
import { currentUser } from '../../services/api'

interface SideRow {
  label: string
  value: React.ReactNode
  warn?: boolean
}

function CompareCard({
  title,
  subtitle,
  icon,
  leftHeading,
  rightHeading,
  leftRows,
  rightRows,
  note,
}: {
  title: string
  subtitle?: string
  icon: React.ReactNode
  leftHeading: string
  rightHeading: string
  leftRows: SideRow[]
  rightRows: SideRow[]
  note?: string
}) {
  const col = (heading: string, rows: SideRow[]) => (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{heading}</p>
      <dl className="space-y-2">
        {rows.map((r, i) => (
          <div key={i}>
            <dt className="text-xs text-slate-500">{r.label}</dt>
            <dd className={`text-sm font-semibold tnum ${r.warn ? 'text-amber-700' : 'text-navy-900'}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2">{icon} {title}</span>} subtitle={subtitle} />
      <div className="flex gap-6 p-4">
        {col(leftHeading, leftRows)}
        <div className="w-px shrink-0 bg-slate-100" aria-hidden />
        {col(rightHeading, rightRows)}
      </div>
      {note && <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">{note}</p>}
    </Card>
  )
}

export default function FlagDetailPage() {
  const { flagId } = useParams()
  const s = useAppState()
  const nav = useNavigate()
  const user = currentUser(s)
  const flag = s.flags.find((f) => f.id === flagId)

  const [note, setNote] = useState('')
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveKind, setResolveKind] = useState<'under_review' | 'resolved' | 'escalated' | 'awaiting_evidence'>('under_review')
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState('')

  useEffect(() => {
    if (flagId) markFlagViewed(flagId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagId])

  const entries = useMemo(
    () => (flag ? flag.targetIds.map((id) => s.entries.find((e) => e.id === id)).filter(Boolean) : []),
    [flag, s.entries],
  ) as typeof s.entries

  const lines = useMemo(
    () => (flag?.relatedBillNos ? flag.relatedBillNos.map((b) => s.statementLines.find((l) => l.billNo === b)).filter(Boolean) : []),
    [flag, s.statementLines],
  ) as typeof s.statementLines

  const notes = s.notes.filter((n) => n.flagId === flagId)

  if (!flag) {
    return (
      <Card>
        <EmptyState
          icon={<FileWarning size={20} />}
          title="Case not found"
          description={`No flag with ID ${flagId}.`}
          action={<Button variant="secondary" onClick={() => nav('/app/flagged')}>Back to flagged fills</Button>}
        />
      </Card>
    )
  }

  const isManager = user?.role === 'transport_manager' || user?.role === 'admin'
  const bus = buses.find((b) => b.busCode === flag.busCode)

  const doAction = (kind: 'under_review' | 'resolved' | 'escalated' | 'awaiting_evidence') => {
    if (!reason.trim()) {
      setReasonErr('A reason is required for every status change.')
      return
    }
    setFlagStatus(flag.id, kind, reason.trim(), kind === 'escalated' ? 'principal' : undefined)
    setResolveOpen(false)
    setReason('')
    setReasonErr('')
  }

  const addNote = () => {
    if (!note.trim()) return
    addFlagNote(flag.id, note.trim())
    setNote('')
  }

  /* ----- dynamic evidence cards ----- */
  const cards: React.ReactNode[] = []

  if (lines.length > 0) {
    lines.forEach((line) => {
      const regEntry = entries.find(
        (e) => e.busId === bus?.busCode && dateKey(e.timestampClient) === line.date,
      )
      const pub = publishedPrice(dailyPrices, line.date)
      const rateDiff = Math.round((line.rate - pub.price) * 100) / 100
      const amountDiff = regEntry ? Math.round((regEntry.amount - line.amount) * 100) / 100 : null
      cards.push(
        <CompareCard
          key={line.billNo}
          icon={<Receipt size={16} className="text-primary-600" />}
          title={`Fuel register vs pump statement — ${line.billNo}`}
          subtitle={`Bill date ${fmtDate(line.date)} · vehicle as printed: ${line.vehicleNo}`}
          leftHeading="Fuel register (college)"
          rightHeading="Pump statement (Shree Lakshmi Fuels)"
          leftRows={[
            { label: 'Entry', value: regEntry ? regEntry.id : 'No matching entry', warn: !regEntry },
            { label: 'Litres', value: regEntry ? `${num(regEntry.litres)} L` : '—' },
            { label: 'Amount', value: regEntry ? inr(regEntry.amount) : '—', warn: amountDiff !== null && Math.abs(amountDiff) > 0.5 },
            { label: 'Rate / L', value: regEntry ? `₹${num(regEntry.amount / regEntry.litres, 2)}` : '—' },
          ]}
          rightRows={[
            { label: 'Bill no.', value: line.billNo },
            { label: 'Litres', value: `${num(line.litres)} L` },
            { label: 'Amount', value: inr(line.amount) },
            { label: 'Rate / L', value: `₹${num(line.rate, 2)}`, warn: Math.abs(rateDiff) > 0.05 },
          ]}
          note={`Published price on ${fmtDate(line.date)}: ₹${num(pub.price, 2)}/L${!pub.exact ? ' (last known)' : ''}.${
            Math.abs(rateDiff) > 0.05 ? ` Charged rate differs by ₹${num(rateDiff, 2)}/L.` : ''
          }${amountDiff !== null && Math.abs(amountDiff) > 0.5 ? ` Amount differs by ₹${num(Math.abs(amountDiff), 2)}.` : ''} Both records are preserved exactly as written.`}
        />,
      )
    })
  }

  if (bus && entries.some((e) => e.litres > bus.tankLitres)) {
    const e = entries.find((x) => x.litres > bus.tankLitres)!
    cards.push(
      <CompareCard
        key="tank"
        icon={<Gauge size={16} className="text-amber-600" />}
        title="Tank capacity vs recorded litres"
        subtitle="Verify the tank specification before concluding anything"
        leftHeading="Roster tank record"
        rightHeading="Recorded fill"
        leftRows={[
          { label: 'Bus', value: bus.busCode },
          { label: 'Stated tank', value: `${bus.tankLitres} L` },
          { label: 'Source', value: 'buses.csv (office roster)' },
        ]}
        rightRows={[
          { label: 'Entry', value: e.id },
          { label: 'Recorded litres', value: `${num(e.litres)} L`, warn: true },
          { label: 'Excess over capacity', value: `${num(e.litres - bus.tankLitres)} L (+${Math.round(((e.litres - bus.tankLitres) / bus.tankLitres) * 100)}%)`, warn: true },
        ]}
        note="The pump statement matches the recorded litres, so the question is whether the roster tank size is outdated or the recorded volume is wrong."
      />,
    )
  }

  if (flag.ruleCode === 'DUPLICATE_ENTRY' && entries.length >= 2) {
    const [a, b] = entries
    cards.push(
      <CompareCard
        key="dup"
        icon={<Scale size={16} className="text-amber-600" />}
        title="Register line vs register line"
        subtitle="Same values entered twice — the pump statement holds only one bill"
        leftHeading={`Register ${a.id}`}
        rightHeading={`Register ${b.id}`}
        leftRows={[
          { label: 'Time', value: fmtDateTime(a.timestampClient) },
          { label: 'Litres', value: `${num(a.litres)} L` },
          { label: 'Amount', value: inr(a.amount) },
          { label: 'Odometer', value: `${num(a.odometerKm, 0)} km` },
          { label: 'Written by', value: a.createdByName },
        ]}
        rightRows={[
          { label: 'Time', value: fmtDateTime(b.timestampClient) },
          { label: 'Litres', value: `${num(b.litres)} L` },
          { label: 'Amount', value: inr(b.amount) },
          { label: 'Odometer', value: `${num(b.odometerKm, 0)} km` },
          { label: 'Written by', value: b.createdByName },
        ]}
        note="Identical litres, amount and odometer within the same morning. One matching pump bill exists, so this pattern points to a double-entry rather than fuel taken twice."
      />,
    )
  }

  if (flag.ruleCode === 'SHORT_INTERVAL' && entries.length >= 2) {
    const sorted = [...entries].sort((a, b) => a.timestampClient.localeCompare(b.timestampClient))
    const [a, b] = sorted
    cards.push(
      <CompareCard
        key="short"
        icon={<Route size={16} className="text-amber-600" />}
        title="Refill pattern on the same day"
        subtitle="Small distance between two large fills"
        leftHeading={`Morning fill ${a.id}`}
        rightHeading={`Evening fill ${b.id}`}
        leftRows={[
          { label: 'Time', value: fmtDateTime(a.timestampClient) },
          { label: 'Litres', value: `${num(a.litres)} L` },
          { label: 'Odometer', value: `${num(a.odometerKm, 0)} km` },
        ]}
        rightRows={[
          { label: 'Time', value: fmtDateTime(b.timestampClient) },
          { label: 'Litres', value: `${num(b.litres)} L` },
          { label: 'Odometer', value: `${num(b.odometerKm, 0)} km`, warn: true },
        ]}
        note={`Between the two fills the odometer moved only ${num(b.odometerKm - a.odometerKm, 0)} km, while the pump statement does bill the second fill. Tank state and purpose are unknown.`}
      />,
    )
  }

  const confidenceTone = flag.confidence.toLowerCase().includes('high confidence in') ? 'amber' : 'slate'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/app/flagged" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
          <ArrowLeft size={15} /> Flagged fills
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">{flag.caseTitle}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{flag.id}</span>
            <Chip tone="violet">{flag.ruleCode.replace(/_/g, ' ')}</Chip>
            <StatusChip status={flag.severity} />
            <StatusChip status={flag.status} />
            <span>raised {fmtDateTime(flag.createdAt)}</span>
          </p>
        </div>
      </div>

      <Banner tone="info" title="What this page is — and is not">
        This page shows an <strong>independent-evidence discrepancy</strong>. It is a prompt to check
        documents and ask people — never a conclusion that fraud happened. All original values are
        preserved exactly as recorded.
      </Banner>

      {/* entry values */}
      {entries.length > 0 && (
        <Card>
          <CardHeader title="Entered transaction values" subtitle="Exactly as saved (no edits shown here)" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tnum">
              <thead className="text-xs uppercase text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 font-semibold">Entry</th>
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-4 py-2 text-right font-semibold">Litres</th>
                  <th className="px-4 py-2 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2 text-right font-semibold">Rate/L</th>
                  <th className="px-4 py-2 text-right font-semibold">Odometer</th>
                  <th className="px-4 py-2 font-semibold">Mode</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-navy-900">
                      <Link to={`/app/entries/${e.id}`} className="text-primary-700 hover:underline">{e.id}</Link>
                    </td>
                    <td className="px-4 py-2.5">{fmtDateTime(e.timestampClient)}</td>
                    <td className="px-4 py-2.5 text-right">{num(e.litres)}</td>
                    <td className="px-4 py-2.5 text-right">{inr(e.amount)}</td>
                    <td className="px-4 py-2.5 text-right">₹{num(e.amount / e.litres, 2)}</td>
                    <td className="px-4 py-2.5 text-right">{num(e.odometerKm, 0)}</td>
                    <td className="px-4 py-2.5 capitalize">{e.paymentMode.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* rule + explanation */}
      <Card>
        <CardHeader title="Rule triggered" subtitle={`Threshold used by the demo rule: ${flag.ruleCode.replace(/_/g, ' ')}`} />
        <div className="space-y-3 p-4 text-sm">
          <p className="font-semibold text-navy-900">{flag.reason}</p>
          <p className="leading-relaxed text-slate-600">{flag.plainExplanation}</p>
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <p className="font-semibold text-navy-900">Evidence summary</p>
            {flag.evidenceSummary}
          </div>
        </div>
      </Card>

      {/* evidence cards */}
      <div className="space-y-4">{cards.length > 0 ? cards : null}</div>

      {/* device figures */}
      {flag.figures && flag.figures.length > 0 && (
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><MapPin size={16} className="text-primary-600" /> Device & document evidence</span>} subtitle="From the seeded GPS ping log, college calendar and office roster (synthetic data)" />
          <dl className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            {flag.figures.map((fig) => (
              <div key={fig.label} className={`rounded-lg border p-3 ${fig.highlight ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                <dt className="text-xs text-slate-500">{fig.label}</dt>
                <dd className={`mt-0.5 text-sm font-bold tnum ${fig.highlight ? 'text-amber-800' : 'text-navy-900'}`}>{fig.value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            GPS is shown as a coordinate/summary card on purpose — the prototype does not draw an
            invented route map. Bus {bus ? `${bus.busCode} (${bus.gpsDevice})` : '—'}; statement lines keep the vehicle number exactly as the pump printed it.
          </p>
        </Card>
      )}

      {/* amount at issue + confidence */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><IndianRupee size={16} className="text-primary-600" /> Amount at issue</span>} />
          <div className="p-4">
            <p className="text-2xl font-bold tnum text-navy-900">{flag.amountAtIssue > 0 ? inr(flag.amountAtIssue) : 'Not quantified'}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              The money the evidence cannot yet account for. It is <strong>not</strong> a confirmed
              loss: the case becomes a loss only after documents (receipt, ledger, tank spec) verify it.
            </p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Discrepancy confidence" subtitle="Confidence in the evidence gap — never a verdict on a person" />
          <div className="p-4">
            <Chip tone={confidenceTone === 'amber' ? 'amber' : 'slate'}>{flag.confidence}</Chip>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Confidence labels describe how solid the <em>discrepancy</em> is, not anyone’s guilt.
            </p>
          </div>
        </Card>
      </div>

      {/* photos if present on entries */}
      {entries.some((e) => e.odometerPhoto || e.receiptPhoto) && (
        <Card>
          <CardHeader title="Attached evidence photos" />
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
            {entries.flatMap((e) =>
              [e.odometerPhoto, e.receiptPhoto]
                .filter(Boolean)
                .map((p) => (
                  <figure key={p!.id} className="overflow-hidden rounded-lg border border-slate-200">
                    <img src={p!.url} alt={p!.kind} className="h-28 w-full object-cover" />
                    <figcaption className="px-2 py-1 text-xs text-slate-500">{e.id} · {p!.kind}</figcaption>
                  </figure>
                )),
            )}
          </div>
        </Card>
      )}

      {/* manager actions */}
      {isManager && (
        <Card>
          <CardHeader title="Investigation actions" subtitle="Every action needs a reason and is recorded in the audit log" />
          <div className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <Button
              variant="secondary"
              onClick={() => {
                setResolveKind('under_review')
                setReason('Marked under review for document check.')
                setResolveOpen(true)
              }}
              disabled={flag.status === 'under_review'}
            >
              <Tag size={15} /> Mark under review
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setResolveKind('awaiting_evidence')
                setReason('Requesting: original printed fuel receipt + college ledger entry page for verification.')
                setResolveOpen(true)
              }}
              disabled={flag.status === 'awaiting_evidence'}
            >
              <Send size={15} /> Request more evidence
            </Button>
            <Button variant="secondary" onClick={() => nav(entries[0] ? `/app/entries/${entries[0].id}` : '/app/entries')} disabled={entries.length === 0}>
              <FileWarning size={15} /> Propose correction
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setResolveKind('resolved')
                setReason('Verified documents confirm discrepancy was a clerical data-entry error.')
                setResolveOpen(true)
              }}
              disabled={flag.status === 'resolved'}
            >
              <CheckCircle2 size={15} /> Resolve as clerical error
            </Button>
            <Button
              className="sm:col-span-2 xl:col-span-4"
              onClick={() => {
                setResolveKind('escalated')
                setReason('Significant variance requires Principal approval & financial write-off review.')
                setResolveOpen(true)
              }}
              disabled={flag.status === 'escalated'}
            >
              Escalate to accountant / principal (adds to approval queue)
            </Button>
          </div>
        </Card>
      )}

      {/* notes */}
      <Card>
        <CardHeader title={`Investigation notes (${notes.length})`} subtitle="Visible to office users; add context for the next reviewer" />
        <div className="space-y-3 p-4">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm text-navy-900">{n.text}</p>
              <p className="mt-1 text-xs text-slate-400">{n.authorName} · {fmtDateTime(n.timestamp)}</p>
            </div>
          ))}
          {notes.length === 0 && <p className="text-sm text-slate-500">No notes yet.</p>}
          {(isManager || user?.role === 'accountant' || user?.role === 'principal') && (
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Add a note…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()}
                aria-label="New investigation note"
              />
              <Button onClick={addNote} disabled={!note.trim()}>
                <MessageSquare size={15} /> Add
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* timeline */}
      <Card>
        <CardHeader title="Case timeline" subtitle="Created, viewed, status changes, escalations" />
        <ol className="p-4">
          {s.audit
            .filter((a) => a.entityId === flag.id)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .map((a) => (
              <li key={a.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
                <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-primary-500" aria-hidden />
                <p className="text-sm font-medium text-navy-900">
                  {a.action.replace(/_/g, ' ')}
                  {a.before && <span className="text-slate-400"> ({a.before} → {a.after})</span>}
                  {!a.before && a.after && <span className="text-slate-400"> — {a.after}</span>}
                </p>
                {a.reason && <p className="text-xs text-slate-500">Reason: {a.reason}</p>}
                <p className="text-xs text-slate-400">{a.actorName} · {fmtDateTime(a.timestamp)}</p>
              </li>
            ))}
        </ol>
      </Card>

      {/* resolution modal */}
      <Modal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title={
          resolveKind === 'resolved'
            ? 'Resolve as data-entry error'
            : resolveKind === 'escalated'
              ? 'Escalate to principal'
              : resolveKind === 'awaiting_evidence'
                ? 'Request additional evidence'
                : 'Mark under review'
        }
      >
        <div className="space-y-3">
          {resolveKind === 'resolved' && (
            <p className="text-sm text-slate-600">
              Resolving indicates that independent records verify the error (e.g. keying mistake or corrected billing) — it does <strong>not</strong>{' '}
              declare anyone guilty of anything. The original entry stays visible with the reason.
            </p>
          )}
          {resolveKind === 'awaiting_evidence' && (
            <p className="text-sm text-slate-600">
              This updates the case status to <strong>Awaiting Evidence</strong> and records your specific documentation request in the audit timeline.
            </p>
          )}
          {resolveKind === 'escalated' && (
            <p className="text-sm text-slate-600">
              This adds the case to the principal’s approval inbox. Escalation is not an accusation —
              it requests a decision from someone with authority.
            </p>
          )}
          <Field label="Reason (required)" htmlFor="reason" error={reasonErr}>
            <textarea
              id="reason"
              className={inputCls}
              rows={3}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonErr('') }}
              placeholder="e.g. Original receipt shows ₹9,001.69; register line keyed with a typo."
            />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button
              variant={resolveKind === 'resolved' ? 'danger' : 'primary'}
              className="flex-1"
              onClick={() => doAction(resolveKind)}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
