import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus as BusIcon, ChevronRight } from 'lucide-react'
import { useAppState, buses } from '../../services/store'
import { Card, CardHeader, DataTable } from '../../components/ui'
import { inr, num } from '../../utils/format'

export default function BusesPage() {
  const s = useAppState()
  const nav = useNavigate()

  const busStats = useMemo(() => {
    return buses.map((b) => {
      let spend = 0, fills = 0, totalL = 0, totalKm = 0
      const list = s.entries
        .filter((e) => e.busId === b.busCode)
        .sort((a, c) => a.odometerKm - c.odometerKm)
      list.forEach((e) => { spend += e.amount; fills += 1; totalL += e.litres })
      for (let i = 1; i < list.length; i++) {
        const d = list[i].odometerKm - list[i - 1].odometerKm
        if (d > 0) totalKm += d
      }
      const kmPerL = totalKm > 0 && totalL > 0 ? totalKm / totalL : null
      const lastFill = list.length > 0 ? list[list.length - 1].timestampClient : null
      return { ...b, spend, fills, totalL, kmPerL, lastFill }
    })
  }, [s.entries])

  return (
    <Card>
      <CardHeader title="Buses & QR codes" subtitle="8 diesel buses · click a row for bus detail and printable QR · efficiency is a derived estimate from odometer deltas" />
      <DataTable
        rows={busStats}
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
          { key: 'fills', label: 'Fills', className: 'text-right', render: (b) => <span className="tnum">{b.fills}</span> },
          { key: 'litres', label: 'Litres', className: 'text-right', render: (b) => <span className="tnum">{num(b.totalL, 0)} L</span> },
          {
            key: 'spend',
            label: 'Register spend',
            className: 'text-right',
            render: (b) => <span className="tnum">{inr(b.spend)}</span>,
          },
          {
            key: 'eff',
            label: 'Avg km/L',
            className: 'text-right',
            render: (b) => (
              <span className="tnum">
                {b.kmPerL != null ? b.kmPerL.toFixed(1) : <span className="text-slate-400">—</span>}
              </span>
            ),
          },
          { key: 'open', label: '', className: 'text-right', render: () => <ChevronRight size={16} className="inline text-slate-400" /> },
        ]}
      />
    </Card>
  )
}
