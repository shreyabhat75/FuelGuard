import { useEffect, useRef, useState } from 'react'
import { Bus as BusIcon, CameraOff, RefreshCw, ScanLine, SearchX } from 'lucide-react'
import type { Bus } from '../../../types'
import { buses } from '../../../services/store'
import { recordBusLookup, recordBusChange } from '../../../services/api'
import { Banner, Button, Modal, inputCls } from '../../../components/ui'
import type { Draft } from '../EntryWizard'

type ScanState = 'idle' | 'opening' | 'scanning' | 'detected' | 'error'

export default function Step1Bus({ draft, patch }: { draft: Draft; patch: (p: Partial<Draft>) => void }) {
  const [scanOpen, setScanOpen] = useState(false)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [query, setQuery] = useState('')
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const selected = buses.find((b) => b.busCode === draft.busId)

  const selectBus = (bus: Bus, via: 'qr' | 'manual') => {
    if (draft.busId && draft.busId !== bus.busCode) {
      patch({
        busId: bus.busCode,
        busVia: via,
        busChangedFrom: draft.busId,
        confirmed: false,
        activityNotes: [
          ...draft.activityNotes,
          `Bus changed from ${draft.busId} to ${bus.busCode} after ${via === 'qr' ? 'a new QR scan' : 'manual search'} (recorded before submission).`,
        ],
      })
      recordBusChange(draft.busId, bus.busCode)
    } else {
      patch({ busId: bus.busCode, busVia: via, confirmed: false })
    }
    setScanOpen(false)
    recordBusLookup(bus.busCode, via)
  }

  const startScan = () => {
    setScanOpen(true)
    setScanState('opening')
    timers.current.push(
      window.setTimeout(() => setScanState('scanning'), 600),
      window.setTimeout(() => setScanState('detected'), 1800),
    )
  }

  const simulateError = () => {
    setScanState('error')
    timers.current.forEach(clearTimeout)
  }

  const q = query.trim().toLowerCase()
  const results = q
    ? buses.filter(
        (b) => b.busCode.toLowerCase().includes(q) || b.registration.toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, '')),
      )
    : buses

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-navy-900">Which bus did you fill?</h2>

      {/* scan */}
      <button
        onClick={startScan}
        className="flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-navy-800 text-base font-bold text-white shadow-card active:bg-navy-900"
      >
        <ScanLine size={22} /> Scan bus QR
      </button>
      <p className="text-center text-xs text-slate-500">
        Prototype camera simulation — picks a bus from the seeded fleet. Manual search is always available.
      </p>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {/* manual search */}
      <div>
        <input
          className={inputCls}
          placeholder="Search by bus code or registration (e.g. VB-07, KA 99 VB 1007)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search buses"
        />
        <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto scrollbar-thin">
          {results.map((b) => (
            <li key={b.busCode}>
              <button
                onClick={() => selectBus(b, 'manual')}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                  draft.busId === b.busCode ? 'border-primary-500 bg-primary-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <BusIcon size={18} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-navy-900">
                    {b.busCode} · {b.registration}
                  </span>
                  <span className="block text-xs text-slate-500">{b.driverName} · tank {b.tankLitres} L</span>
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
              <SearchX size={18} className="mx-auto mb-1 text-slate-400" />
              No bus matches “{query}”. Check the code or try the QR scan.
            </li>
          )}
        </ul>
      </div>

      {/* selected bus confirmation */}
      {selected && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            {draft.busVia === 'qr' ? 'From QR scan' : 'Selected manually'}
          </p>
          <p className="mt-1 text-lg font-bold text-navy-900">{selected.busCode}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Registration</dt>
            <dd className="font-medium text-navy-900 tnum">{selected.registration}</dd>
            <dt className="text-slate-500">Assigned driver</dt>
            <dd className="font-medium text-navy-900">{selected.driverName}</dd>
            <dt className="text-slate-500">Tank capacity</dt>
            <dd className="font-medium text-navy-900 tnum">{selected.tankLitres} L</dd>
            <dt className="text-slate-500">Fuel type</dt>
            <dd className="font-medium text-navy-900 capitalize">{selected.fuelType}</dd>
          </dl>
          {draft.busChangedFrom && (
            <div className="mt-3">
              <Banner tone="warning" title={`Bus changed from ${draft.busChangedFrom} to ${selected.busCode}`}>
                This change is recorded in the entry’s activity notes before you submit.
              </Banner>
            </div>
          )}
          <button
            onClick={() => patch({ confirmed: true })}
            className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold ${
              draft.confirmed ? 'bg-teal-600 text-white' : 'bg-navy-800 text-white'
            }`}
          >
            {draft.confirmed ? 'Bus confirmed ✓' : 'Confirm this bus'}
          </button>
        </div>
      )}

      {/* QR simulation modal */}
      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="Scan bus QR">
        {scanState !== 'error' ? (
          <div className="py-2 text-center">
            <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-2xl border-4 border-slate-200 bg-slate-900">
              {scanState === 'detected' ? (
                <BusIcon size={44} className="text-teal-400" />
              ) : (
                <ScanLine size={44} className={`text-slate-500 ${scanState === 'scanning' ? 'animate-pulse' : ''}`} />
              )}
            </div>
            <p className="mt-3 text-sm font-medium text-navy-900">
              {scanState === 'opening'
                ? 'Opening camera…'
                : scanState === 'scanning'
                  ? 'Scanning for QR code…'
                  : 'QR code detected'}
            </p>
            <p className="text-xs text-slate-500">Simulated camera (demo prototype)</p>
            {scanState === 'detected' && (
              <div className="mt-4 space-y-2 text-left">
                <p className="text-xs font-semibold text-slate-500">Codes in frame:</p>
                {buses.slice(0, 4).map((b) => (
                  <button
                    key={b.busCode}
                    onClick={() => selectBus(b, 'qr')}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50"
                  >
                    <span className="font-semibold text-navy-900">{b.busCode} · {b.registration}</span>
                    <span className="text-xs text-primary-700 font-semibold">Select</span>
                  </button>
                ))}
                <button onClick={simulateError} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50">
                  Simulate unreadable / invalid QR
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-2">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
              <CameraOff size={28} className="mx-auto text-red-500" />
              <p className="mt-2 text-sm font-bold text-red-800">QR could not be read</p>
              <p className="mt-1 text-xs text-red-700">
                The code may be dirty, damaged or not a valid bus QR. Nothing was selected.
              </p>
            </div>
            <div className="mt-4 space-y-2">
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => {
                  setScanState('scanning')
                  timers.current.push(
                    window.setTimeout(() => setScanState('detected'), 1200),
                  )
                }}
              >
                <RefreshCw size={15} /> Try scanning again
              </Button>
              <p className="text-center text-xs text-slate-500">
                Or continue with <strong>manual search</strong> below the scan button on the previous screen.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
