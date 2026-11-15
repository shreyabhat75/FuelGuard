import { useNavigate } from 'react-router-dom'
import { Bus as BusIcon, ChevronRight } from 'lucide-react'
import { useAppState, buses } from '../../services/store'
import { Card, CardHeader, DataTable } from '../../components/ui'
import { inr } from '../../utils/format'

export default function BusesPage() {
  const s = useAppState()
  const nav = useNavigate()
  const spendByBus = new Map<string, { spend: number; fills: number }>()
  buses.forEach((b) => spendByBus.set(b.busCode, { spend: 0, fills: 0 }))
  s.entries.forEach((e) => {
    const cur = spendByBus.get(e.busId)
    if (cur) {
      cur.spend += e.amount
      cur.fills += 1
    }
  })

  return (
    <Card>
      <CardHeader title="Buses & QR codes" subtitle="8 diesel buses · click a row for the printable QR" />
      <DataTable
        rows={buses}
        onRowClick={(b) => nav(`/app/buses/${b.busCode}`)}
        columns={[
          {
            key: 'code',
            label: 'Bus',
            render: (b) => (
              <span className="flex items-center gap-2 font-semibold text-navy-900">
                <BusIcon size={16} className="text-slate-400" /> {b.busCode}
              </span>
            ),
          },
          { key: 'reg', label: 'Registration', render: (b) => <span className="tnum">{b.registration}</span> },
          { key: 'driver', label: 'Assigned driver', render: (b) => b.driverName },
          { key: 'tank', label: 'Tank', className: 'text-right', render: (b) => <span className="tnum">{b.tankLitres} L</span> },
          { key: 'gps', label: 'GPS device', render: (b) => <span className="text-slate-500">{b.gpsDevice}</span> },
          { key: 'fills', label: 'Fills', className: 'text-right', render: (b) => <span className="tnum">{spendByBus.get(b.busCode)!.fills}</span> },
          {
            key: 'spend',
            label: 'Register spend',
            className: 'text-right',
            render: (b) => <span className="tnum">{inr(spendByBus.get(b.busCode)!.spend)}</span>,
          },
          { key: 'open', label: '', className: 'text-right', render: () => <ChevronRight size={16} className="inline text-slate-400" /> },
        ]}
      />
    </Card>
  )
}
