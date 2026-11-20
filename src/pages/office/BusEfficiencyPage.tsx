import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bus as BusIcon,
  ChevronRight,
  Droplets,
  Gauge,
  IndianRupee,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { buses, useAppState } from '../../services/store'
import { Card, CardHeader, Chip, DataTable, KpiCard, inputCls } from '../../components/ui'
import { EfficiencyChart } from '../../components/charts'
import { inr, num } from '../../utils/format'

export default function BusEfficiencyPage() {
  const s = useAppState()
  const nav = useNavigate()
  const [sortField, setSortField] = useState<'kmPerL' | 'totalKm' | 'spend'>('kmPerL')

  const busMetrics = useMemo(() => {
    return buses.map((b) => {
      const list = s.entries
        .filter((e) => e.busId === b.busCode)
        .sort((a, c) => a.odometerKm - c.odometerKm)
      let km = 0
      let litres = 0
      let spend = 0
      list.forEach((e) => {
        litres += e.litres
        spend += e.amount
      })
      for (let i = 1; i < list.length; i++) {
        const d = list[i].odometerKm - list[i - 1].odometerKm
        if (d > 0) km += d
      }
      const kmPerL = litres > 0 && km > 0 ? km / litres : null
      const costPerKm = km > 0 && spend > 0 ? spend / km : null
      return {
        id: b.busCode,
        busCode: b.busCode,
        registration: b.registration,
        driverName: b.driverName,
        tankLitres: b.tankLitres,
        totalKm: km,
        totalLitres: litres,
        spend,
        kmPerL,
        costPerKm,
        fillsCount: list.length,
      }
    })
  }, [s.entries])

  // Fleet wide totals
  const totalFleetKm = busMetrics.reduce((a, b) => a + b.totalKm, 0)
  const totalFleetLitres = busMetrics.reduce((a, b) => a + b.totalLitres, 0)
  const totalFleetSpend = busMetrics.reduce((a, b) => a + b.spend, 0)
  const fleetAvgKmPerL = totalFleetLitres > 0 && totalFleetKm > 0 ? totalFleetKm / totalFleetLitres : null

  // Sorted rankings
  const validBuses = busMetrics.filter((b) => b.kmPerL != null)
  const bestBus = [...validBuses].sort((a, b) => (b.kmPerL ?? 0) - (a.kmPerL ?? 0))[0]
  const worstBus = [...validBuses].sort((a, b) => (a.kmPerL ?? 0) - (b.kmPerL ?? 0))[0]

  const sortedRows = useMemo(() => {
    return [...busMetrics].sort((a, b) => {
      if (sortField === 'kmPerL') return (b.kmPerL ?? 0) - (a.kmPerL ?? 0)
      if (sortField === 'totalKm') return b.totalKm - a.totalKm
      return b.spend - a.spend
    })
  }, [busMetrics, sortField])

  const chartData = useMemo(() => {
    return busMetrics.map((b) => ({ bus: b.busCode, kmPerL: b.kmPerL }))
  }, [busMetrics])

  return (
    <div className="space-y-6">
      {/* Title banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-900">Fleet Fuel Efficiency Hub</h1>
          <p className="text-xs text-slate-500">
            Comparative analysis of bus fuel economy, distance covered, and fuel consumption trends
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="slate">Aug–Oct 2026 dataset</Chip>
          <Chip tone="teal">8 Active Buses</Chip>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Fleet Avg Efficiency"
          value={fleetAvgKmPerL != null ? `${fleetAvgKmPerL.toFixed(2)} km/L` : '—'}
          sub="Overall fleet benchmark"
          icon={<Gauge size={16} />}
        />
        <KpiCard
          label="Total Fleet Distance"
          value={`${num(totalFleetKm, 0)} km`}
          sub="Recorded odometer delta"
          icon={<BusIcon size={16} />}
        />
        <KpiCard
          label="Total Fuel Consumed"
          value={`${num(totalFleetLitres, 0)} L`}
          sub={inr(totalFleetSpend)}
          icon={<Droplets size={16} />}
        />
        <KpiCard
          label="Avg Cost Per Km"
          value={totalFleetKm > 0 ? `₹${(totalFleetSpend / totalFleetKm).toFixed(2)} / km` : '—'}
          sub="Operational fuel rate"
          icon={<IndianRupee size={16} />}
        />
      </div>

      {/* Best & Lowest performer highlights */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-teal-200 bg-teal-50/50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
                <TrendingUp size={13} /> Most Efficient Bus
              </span>
              <h3 className="mt-2 text-xl font-bold text-navy-900">
                {bestBus?.busCode} · {bestBus?.registration}
              </h3>
              <p className="text-xs text-slate-600">Assigned: {bestBus?.driverName}</p>
            </div>
            <p className="text-2xl font-bold tnum text-teal-800">
              {bestBus?.kmPerL?.toFixed(2)} <span className="text-xs font-normal">km/L</span>
            </p>
          </div>
          <p className="mt-3 text-xs text-teal-900 border-t border-teal-200/60 pt-2">
            Delivering {((((bestBus?.kmPerL ?? 0) - (fleetAvgKmPerL ?? 0)) / (fleetAvgKmPerL || 1)) * 100).toFixed(0)}% better mileage than fleet average.
          </p>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                <TrendingDown size={13} /> Highest Consumption Bus
              </span>
              <h3 className="mt-2 text-xl font-bold text-navy-900">
                {worstBus?.busCode} · {worstBus?.registration}
              </h3>
              <p className="text-xs text-slate-600">Assigned: {worstBus?.driverName}</p>
            </div>
            <p className="text-2xl font-bold tnum text-amber-800">
              {worstBus?.kmPerL?.toFixed(2)} <span className="text-xs font-normal">km/L</span>
            </p>
          </div>
          <p className="mt-3 text-xs text-amber-900 border-t border-amber-200/60 pt-2">
            Requires engine tuning or route inspection — consumes {inr(worstBus?.costPerKm ?? 0)}/km.
          </p>
        </Card>
      </div>

      {/* Comparative chart */}
      <Card>
        <CardHeader
          title="Comparative Mileage by Bus (km/L)"
          subtitle="Derived from consecutive odometer logs divided by fuel filled. Fluctuations indicate terrain, route load, or tank anomalies."
        />
        <div className="p-4">
          <EfficiencyChart data={chartData} />
        </div>
      </Card>

      {/* Detailed bus economy table */}
      <Card>
        <CardHeader
          title="Bus Fuel Economy Breakdown"
          subtitle="Click any bus to inspect individual fill timeline, GPS device logs, and printable QR code"
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Sort by:</span>
              <select
                className={`${inputCls} max-w-40 py-1 text-xs`}
                value={sortField}
                onChange={(e) => setSortField(e.target.value as typeof sortField)}
              >
                <option value="kmPerL">Efficiency (km/L)</option>
                <option value="totalKm">Distance (km)</option>
                <option value="spend">Total Spend (₹)</option>
              </select>
            </div>
          }
        />
        <DataTable
          rows={sortedRows}
          onRowClick={(b) => nav(`/app/buses/${b.busCode}`)}
          columns={[
            {
              key: 'code',
              label: 'Bus',
              render: (b) => (
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-800 text-xs font-bold text-white">
                    {b.busCode.replace('VB-', '')}
                  </span>
                  <div>
                    <p className="font-bold text-navy-900">{b.busCode}</p>
                    <p className="text-xs text-slate-500 tnum">{b.registration}</p>
                  </div>
                </div>
              ),
            },
            { key: 'driver', label: 'Driver', render: (b) => b.driverName },
            {
              key: 'dist',
              label: 'Distance',
              className: 'text-right',
              render: (b) => <span className="tnum font-medium">{num(b.totalKm, 0)} km</span>,
            },
            {
              key: 'litres',
              label: 'Litres',
              className: 'text-right',
              render: (b) => <span className="tnum">{num(b.totalLitres, 0)} L</span>,
            },
            {
              key: 'eff',
              label: 'Avg km/L',
              className: 'text-right',
              render: (b) => (
                <span className={`tnum font-bold ${b.kmPerL && b.kmPerL >= (fleetAvgKmPerL || 0) ? 'text-teal-700' : 'text-amber-700'}`}>
                  {b.kmPerL ? `${b.kmPerL.toFixed(2)} km/L` : '—'}
                </span>
              ),
            },
            {
              key: 'cost',
              label: 'Cost / Km',
              className: 'text-right',
              render: (b) => (
                <span className="tnum text-slate-600">
                  {b.costPerKm ? inr(b.costPerKm) : '—'}
                </span>
              ),
            },
            {
              key: 'spend',
              label: 'Total Spend',
              className: 'text-right',
              render: (b) => <span className="tnum font-semibold text-navy-900">{inr(b.spend)}</span>,
            },
            {
              key: 'fills',
              label: 'Fills',
              className: 'text-right',
              render: (b) => <span className="tnum text-slate-500">{b.fillsCount}</span>,
            },
            {
              key: 'action',
              label: '',
              className: 'text-right',
              render: () => <ChevronRight size={16} className="inline text-slate-400" />,
            },
          ]}
        />
      </Card>
    </div>
  )
}
