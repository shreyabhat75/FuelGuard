import { CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { SaveResult } from '../../../services/api'
import { Button, Card, StatusChip, Banner } from '../../../components/ui'
import { fmtDateTime, inr, num } from '../../../utils/format'

export default function Step5Done({
  result,
  offline,
  onViewEntry,
  onRecordAnother,
}: {
  result: SaveResult
  offline: boolean
  onViewEntry: () => void
  onRecordAnother: () => void
}) {
  const nav = useNavigate()
  const { entry, ruleHits } = result
  const flagged = ruleHits.length > 0

  return (
    <div className="px-4 py-6">
      <div className="text-center">
        <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${flagged ? 'bg-amber-100 text-amber-600' : 'bg-teal-100 text-teal-600'}`}>
          {flagged ? <ClipboardList size={30} /> : <CheckCircle2 size={30} />}
        </span>
        <h1 className="mt-3 text-xl font-bold text-navy-900">
          {offline ? 'Saved on this device' : flagged ? 'Saved — needs review' : 'Fuel entry saved'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {entry.id} · {fmtDateTime(entry.timestampClient)}
        </p>
        {offline && (
          <p className="mx-auto mt-3 max-w-xs">
            <StatusChip status="pending_sync" />
          </p>
        )}
      </div>

      <Card className="mt-5">
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">Litres</p>
            <p className="text-lg font-bold tnum text-navy-900">{num(entry.litres)} L</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">Amount</p>
            <p className="text-lg font-bold tnum text-navy-900">{inr(entry.amount)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs text-slate-500">Review status</p>
            <p className="mt-0.5">
              <StatusChip status={entry.status} />
            </p>
          </div>
          <p className="text-xs text-slate-500">{entry.pumpName}</p>
        </div>
      </Card>

      {flagged && (
        <div className="mt-4 space-y-2.5">
          <Banner tone="warning" title={`Saved — ${ruleHits.length} check${ruleHits.length > 1 ? 's' : ''} need a look`}>
            Nothing was blocked or deleted. The office will review these with you. A check is a
            question, not an accusation.
          </Banner>
          {ruleHits.map((h, i) => (
            <Card key={i} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-navy-900">{h.reason}</p>
                <StatusChip status={h.severity} />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{h.explanation}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-2.5">
        <Button size="lg" className="w-full" onClick={onViewEntry}>
          View entry <ChevronRight size={16} />
        </Button>
        <Button size="lg" variant="secondary" className="w-full" onClick={onRecordAnother}>
          Record another fill
        </Button>
        <Button size="lg" variant="ghost" className="w-full" onClick={() => nav('/driver')}>
          Back to home
        </Button>
      </div>
    </div>
  )
}
