import { Link } from 'react-router-dom'
import { useAppState } from '../../services/store'
import { EmptyState, Card, CardHeader, StatusChip } from '../../components/ui'
import { fmtDateTime, inr, num } from '../../utils/format'
import { ChevronRight, Fuel } from 'lucide-react'
import { currentUser } from '../../services/api'

export default function DriverEntries() {
  const s = useAppState()
  const user = currentUser(s)
  const busCode = user?.busCode ?? 'VB-07'
  const mine = s.entries
    .filter((e) => e.busId === busCode)
    .sort((a, b) => b.timestampClient.localeCompare(a.timestampClient))
    .slice(0, 40)

  return (
    <div className="px-4 py-5">
      <h1 className="text-xl font-bold text-navy-900">My entries — {busCode}</h1>
      <p className="mt-1 text-sm text-slate-500">Newest first. Saved entries cannot be edited — corrections go through the office.</p>
      <Card className="mt-4">
        <CardHeader title={`${mine.length} entries`} subtitle="Last 40 fills" />
        {mine.length === 0 ? (
          <EmptyState icon={<Fuel size={20} />} title="No entries yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {mine.map((e) => (
              <li key={e.id}>
                <Link to={`/driver/entries/${e.id}`} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3.5 transition-colors active:bg-slate-100">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy-900">{fmtDateTime(e.timestampClient)}</p>
                    <p className="text-xs text-slate-500 tnum">
                      {num(e.litres)} L · {inr(e.amount)} · {e.pumpName}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip status={e.status} />
                    <ChevronRight size={16} className="text-slate-400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
