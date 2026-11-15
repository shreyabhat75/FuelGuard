import { useEffect, useState } from 'react'
import { Check, Loader2, LocateFixed, MapPinOff } from 'lucide-react'
import type { User } from '../../../types'
import { buses, dailyPrices, holidays } from '../../../services/store'
import { publishedPrice, holidayFor } from '../../../utils/rules'
import { dateKey, fmtTime, inr, num } from '../../../utils/format'
import { Banner, StatusChip } from '../../../components/ui'
import type { Draft, LocationState } from '../EntryWizard'

function requestLocation(): Promise<LocationState> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ status: 'unavailable' })
      return
    }
    let done = false
    const to = window.setTimeout(() => {
      if (!done) {
        done = true
        resolve({ status: 'unavailable' })
      }
    }, 8000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return
        done = true
        clearTimeout(to)
        resolve({
          status: 'granted',
          coords: {
            lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
            lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
            accuracyM: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined,
          },
        })
      },
      () => {
        if (done) return
        done = true
        clearTimeout(to)
        resolve({ status: 'denied' })
      },
      { timeout: 7000, maximumAge: 0 },
    )
  })
}

export default function Step4Review({
  draft,
  patch,
  online,
  user,
}: {
  draft: Draft
  patch: (p: Partial<Draft>) => void
  online: boolean
  user: User
}) {
  const [locBusy, setLocBusy] = useState(false)
  const bus = buses.find((b) => b.busCode === draft.busId)
  const litres = Number(draft.litres)
  const amount = Number(draft.amount)
  const rate = litres > 0 ? amount / litres : 0
  const day = dateKey(new Date().toISOString())
  const pub = publishedPrice(dailyPrices, day)
  const holiday = holidayFor(holidays, day)

  useEffect(() => {
    // auto-attempt once when the step opens; user can retry
    if (draft.location.status === 'idle') void checkLoc()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkLoc = async () => {
    setLocBusy(true)
    const res = await requestLocation()
    patch({ location: res })
    setLocBusy(false)
  }

  const rows: [string, React.ReactNode][] = [
    ['Bus', bus ? `${bus.busCode} · ${bus.registration}` : '—'],
    ['Litres', `${num(litres)} L`],
    ['Amount', inr(amount)],
    ['Rate / litre', `₹${num(rate, 2)} (published ${inr(pub.price)}${pub.exact ? '' : ', last known'})`],
    ['Odometer', `${num(Number(draft.odometer), 0)} km`],
    ['Fuel type', draft.fuelType],
    ['Paid by', draft.paidBy === 'driver' ? 'Driver (me)' : draft.paidBy.replace('_', ' ')],
    ['Payment', draft.paymentMode === 'credit_account' ? 'Credit account' : 'Cash'],
    ['Pump', draft.pump],
    ['Bill no.', draft.billNo.trim() || '— not noted —'],
    [
      'Odometer photo',
      draft.odometerPhoto ? (draft.odometerPhoto.demo ? 'Demo placeholder attached' : 'Attached') : draft.odometerPhotoException ? 'Exception noted — office follow-up' : 'Not attached',
    ],
    ['Receipt photo', draft.receiptPhoto ? (draft.receiptPhoto.demo ? 'Demo placeholder attached' : 'Attached') : 'Not attached'],
    ['Recorded by', `${user.name} (driver app)`],
  ]

  const now = new Date()

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-navy-900">Location & review</h2>

      {/* location */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy-900">Device location</p>
            {draft.location.status === 'granted' && draft.location.coords && (
              <p className="mt-0.5 text-xs text-slate-500 tnum">
                {draft.location.coords.lat}, {draft.location.coords.lng}
                {draft.location.coords.accuracyM ? ` · ±${draft.location.coords.accuracyM} m` : ''} — from this device only
              </p>
            )}
            {draft.location.status === 'denied' && (
              <p className="mt-0.5 text-xs text-amber-700">Permission denied — no coordinates will be stored.</p>
            )}
            {draft.location.status === 'unavailable' && (
              <p className="mt-0.5 text-xs text-amber-700">GPS unavailable — no coordinates will be stored.</p>
            )}
            {draft.location.status === 'idle' && <p className="mt-0.5 text-xs text-slate-500">Checking…</p>}
            {locBusy && <p className="mt-0.5 text-xs text-slate-500">Reading GPS…</p>}
          </div>
          {draft.location.status === 'granted' ? (
            <StatusChip status="saved" />
          ) : draft.location.status === 'denied' || draft.location.status === 'unavailable' ? (
            <button onClick={checkLoc} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-navy-800">
              <LocateFixed size={14} /> Try again
            </button>
          ) : (
            (locBusy && <Loader2 size={18} className="animate-spin text-slate-400" />)
          )}
        </div>
        {(draft.location.status === 'denied' || draft.location.status === 'unavailable') && (
          <div className="mt-3">
            <Banner tone="info" title="You can still save">
              The entry will be visibly marked <strong>“Location unavailable”</strong>. No coordinates
              will be invented — the office can verify the pump from the receipt.
            </Banner>
          </div>
        )}
      </div>

      {/* summary */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-navy-900">Transaction summary</p>
        <dl className="divide-y divide-slate-100">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <dt className="shrink-0 text-slate-500">{k}</dt>
              <dd className="text-right font-medium text-navy-900">{v}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="shrink-0 text-slate-500">Your time stamp</dt>
            <dd className="text-right font-medium text-navy-900">
              {dateKey(now.toISOString())} {fmtTime(now.toISOString())} (device)
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="shrink-0 text-slate-500">Server time</dt>
            <dd className="text-right font-medium text-navy-900">Demo server time — assigned when the entry reaches the server</dd>
          </div>
        </dl>
      </div>

      {holiday && (
        <Banner tone="warning" title={`College holiday today — ${holiday.name}`}>
          This fill will be marked for a routine check. If it was a special trip, say so when the
          office asks.
        </Banner>
      )}

      {online ? (
        <Banner tone="success" title="Online — entry will sync immediately">
          <span className="flex items-center gap-1.5"><Check size={13} /> Saved entries upload at once and are compared against the pump statement and published prices.</span>
        </Banner>
      ) : (
        <Banner tone="warning" title="Offline — saved on this device">
          The entry is stored locally as <strong>Pending sync</strong> and uploads automatically when
          you are back online. Nothing is duplicated.
        </Banner>
      )}

      {draft.activityNotes.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-semibold text-navy-900">Activity recorded with this entry</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {draft.activityNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* confirmation */}
      <label className="flex items-start gap-2.5 rounded-xl border border-navy-800/20 bg-white p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5"
          checked={draft.confirmed}
          onChange={(e) => patch({ confirmed: e.target.checked })}
        />
        <span className="font-medium text-navy-900">
          I confirm these details match the pump receipt. I understand the entry cannot be edited
          after saving — corrections go through the office with a reason.
        </span>
      </label>
      {draft.location.status === 'unavailable' && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <MapPinOff size={13} /> Location unavailable will be shown on the entry.
        </p>
      )}
    </div>
  )
}
