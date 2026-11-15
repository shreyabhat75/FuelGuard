import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { inr } from '../utils/format'

const AXIS = { fontSize: 11, fill: '#64748b' }

export function MonthlySpendChart({ data }: { data: { month: string; amount: number; entries: number }[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Monthly fuel spend bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(v: number | string, name: string) =>
              name === 'amount' ? [inr(Number(v)), 'Spend'] : [v, 'Entries']
            }
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Bar dataKey="amount" fill="#264ae5" radius={[6, 6, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function EfficiencyChart({ data }: { data: { bus: string; kmPerL: number | null }[] }) {
  const clean = data.map((d) => ({ ...d, kmPerL: d.kmPerL ?? 0 }))
  return (
    <div className="h-56 w-full" role="img" aria-label="Derived fuel efficiency by bus">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={clean} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="bus" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={['dataMin - 0.5', 'dataMax + 0.5']} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip
            formatter={(v: number | string) => [`${Number(v).toFixed(2)} km/L`, 'Derived estimate']}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Line type="monotone" dataKey="kmPerL" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3.5, fill: '#0d9488' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ModeSplitBars({ credit, cash }: { credit: number; cash: number }) {
  const total = credit + cash || 1
  return (
    <div className="space-y-2 p-4">
      {[
        { label: 'Credit account', value: credit, color: '#264ae5' },
        { label: 'Cash', value: cash, color: '#d97706' },
      ].map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{r.label}</span>
            <span className="tnum font-medium text-navy-900">{inr(r.value)}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SeverityDots({ high, medium, low }: { high: number; medium: number; low: number }) {
  const rows = [
    { label: 'High severity', n: high, color: '#dc2626' },
    { label: 'Medium severity', n: medium, color: '#d97706' },
    { label: 'Informational', n: low, color: '#64748b' },
  ]
  return (
    <ul className="space-y-2 p-4">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-sm">
          <CellCircle color={r.color} />
          <span className="flex-1 text-slate-600">{r.label}</span>
          <span className="tnum font-semibold text-navy-900">{r.n}</span>
        </li>
      ))}
    </ul>
  )
}

function CellCircle({ color }: { color: string }) {
  return <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
}

export const ChartLegend = Legend
