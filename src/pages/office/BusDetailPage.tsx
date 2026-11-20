import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, ScanLine } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useAppState, buses } from '../../services/store'
import { Banner, Button, Card, CardHeader, EmptyState, StatusChip, inputCls } from '../../components/ui'
import { fmtDateTime, inr, num } from '../../utils/format'

export default function BusDetailPage() {
  const { busCode } = useParams()
  const s = useAppState()
  const nav = useNavigate()
  const bus = buses.find((b) => b.busCode === busCode)
  const [lookup, setLookup] = useState('')

  if (!bus) {
    return (
      <Card>
        <EmptyState title="Bus not found" description={`No bus with code ${busCode}.`} action={<Link className="text-sm font-semibold text-primary-700" to="/app/buses">Back to buses</Link>} />
      </Card>
    )
  }

  const entries = s.entries
    .filter((e) => e.busId === bus.busCode)
    .sort((a, b) => b.timestampClient.localeCompare(a.timestampClient))
  const spend = entries.reduce((a, e) => a + e.amount, 0)
  const litres = entries.reduce((a, e) => a + e.litres, 0)
  const openFlags = s.flags.filter((f) => f.busCode === bus.busCode && f.status !== 'resolved')
  const qrValue = `vpc-fleetfuel:bus:${bus.busCode}`

  // Derived efficiency
  const sorted = [...entries].sort((a, b) => a.odometerKm - b.odometerKm)
  let totalKm = 0, totalL = 0
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i].odometerKm - sorted[i - 1].odometerKm
    if (d > 0) { totalKm += d; totalL += sorted[i].litres }
  }
  const kmPerL = totalL > 0 ? totalKm / totalL : null

  const handleLookup = () => {
    const code = lookup.trim().toUpperCase()
    if (buses.some((b) => b.busCode === code)) {
      nav(`/app/buses/${code}`)
      setLookup('')
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/app/buses" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
        <ArrowLeft size={15} /> All buses
      </Link>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* bus facts */}
        <Card className="lg:col-span-2">
          <CardHeader title={`${bus.busCode} · ${bus.registration}`} subtitle="Office roster record" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">Assigned driver</dt><dd className="font-semibold">{bus.driverName}</dd></div>
            <div><dt className="text-xs text-slate-500">Fuel type</dt><dd className="font-semibold capitalize">{bus.fuelType}</dd></div>
            <div><dt className="text-xs text-slate-500">Tank capacity</dt><dd className="font-semibold tnum">{bus.tankLitres} L</dd></div>
            <div><dt className="text-xs text-slate-500">GPS device</dt><dd className="font-semibold">{bus.gpsDevice}</dd></div>
            <div><dt className="text-xs text-slate-500">Fills on register</dt><dd className="font-semibold tnum">{entries.length}</dd></div>
            <div><dt className="text-xs text-slate-500">Total litres</dt><dd className="font-semibold tnum">{num(litres, 0)} L</dd></div>
            <div><dt className="text-xs text-slate-500">Register spend</dt><dd className="font-semibold tnum">{inr(spend)}</dd></div>
            <div>
              <dt className="text-xs text-slate-500">Derived efficiency</dt>
              <dd className="font-semibold tnum">
                {kmPerL != null ? `${kmPerL.toFixed(1)} km/L` : '—'}
                {kmPerL != null && <span className="ml-1 text-xs font-normal text-slate-400">(estimate)</span>}
              </dd>
            </div>
          </dl>
          {openFlags.length > 0 && (
            <div className="border-t border-slate-100 p-4">
              <p className="mb-2 text-sm font-semibold text-navy-900">Open review cases ({openFlags.length})</p>
              <ul className="space-y-2">
                {openFlags.map((f) => (
                  <li key={f.id}>
                    <Link to={`/app/flagged/${f.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <span className="truncate">{f.caseTitle}</span>
                      <StatusChip status={f.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* printable QR */}
        <Card>
          <CardHeader title="Printable bus QR" subtitle="Encodes only the stable bus ID — no personal data" />
          <div id="print-area" className="flex flex-col items-center p-5 text-center">
            <QRCodeSVG value={qrValue} size={168} level="M" includeMargin />
            <p className="mt-3 text-lg font-bold text-navy-900">{bus.busCode}</p>
            <p className="tnum text-sm text-slate-600">{bus.registration}</p>
            <p className="mt-1 text-xs text-slate-400">{qrValue}</p>
            <p className="mt-1 text-[10px] text-slate-400">FuelGuard · Vidyanagara PU College (demo)</p>
          </div>
          <div className="border-t border-slate-100 p-4">
            <Button className="w-full" onClick={() => window.print()}>
              <Printer size={15} /> Print QR
            </Button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Stick the printout near the fuel cap. Scanning it pre-fills the bus in the driver app;
              manual lookup stays available as fallback.
            </p>
          </div>
        </Card>
      </div>

      {/* manual QR lookup fallback */}
      <Card>
        <CardHeader title="Manual QR lookup (fallback)" subtitle="Type the code printed under a QR if scanning fails" />
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input
            className={`${inputCls} max-w-xs`}
            placeholder="e.g. VB-07"
            value={lookup}
            onChange={(e) => setLookup(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            aria-label="Bus code lookup"
          />
          <Button
            variant="secondary"
            disabled={!buses.some((b) => b.busCode === lookup.trim().toUpperCase())}
            onClick={handleLookup}
          >
            <ScanLine size={15} /> Look up
          </Button>
          {lookup && !buses.some((b) => b.busCode === lookup.trim().toUpperCase()) && (
            <p className="text-xs text-amber-700">No bus matches "{lookup}". Codes are VB-01…VB-08.</p>
          )}
        </div>
      </Card>

      {/* recent fills */}
      <Card>
        <CardHeader title="Recent fills" subtitle={`${entries.length} entries on the register`} />
        {entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No fills recorded for this bus.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.slice(0, 10).map((e) => (
              <li key={e.id}>
                <Link to={`/app/entries/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">{fmtDateTime(e.timestampClient)}</p>
                    <p className="text-xs text-slate-500 tnum">{num(e.litres)} L · {inr(e.amount)} · {e.pumpName}</p>
                  </div>
                  <StatusChip status={e.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Banner tone="info" title="QR contents">
        The QR contains only <code>{qrValue}</code> — a stable bus identifier. No driver names,
        registrations or amounts are encoded.
      </Banner>
    </div>
  )
}
