import { useNavigate } from 'react-router-dom'
import {
  Bus as BusIcon,
  CheckCircle2,
  Languages,
  LogOut,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { currentUser, logout, setLang, setOnline, syncPendingEntries } from '../../services/api'
import { buses, useAppState } from '../../services/store'
import { useI18n } from '../../i18n'
import { Banner, Button, Card, CardHeader, Chip } from '../../components/ui'
import { fmtDateTime, inr, num } from '../../utils/format'

export default function DriverProfile() {
  const s = useAppState()
  const nav = useNavigate()
  const { t, lang } = useI18n()
  const user = currentUser(s)
  const busCode = user?.busCode ?? 'VB-07'
  const bus = buses.find((b) => b.busCode === busCode) ?? buses[0]

  const myEntries = s.entries.filter((e) => e.busId === bus.busCode)
  const pending = myEntries.filter((e) => e.status === 'pending_sync')
  const totalLitres = myEntries.reduce((a, e) => a + e.litres, 0)
  const totalSpend = myEntries.reduce((a, e) => a + e.amount, 0)
  const lastFill = [...myEntries].sort((a, b) => b.timestampClient.localeCompare(a.timestampClient))[0]

  const handleLogout = () => {
    logout()
    nav('/login')
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold text-navy-900">{t('profile')}</h1>
        <p className="text-xs text-slate-500">
          Driver credentials & shift overview · Vidyanagara PU College
        </p>
      </div>

      {/* Driver info card */}
      <Card>
        <div className="flex items-center gap-3.5 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-800 text-lg font-bold text-white shadow-card">
            {user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || 'DR'}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-navy-900">{user?.name || 'Driver'}</h2>
            <p className="text-xs text-slate-500">{user?.id} · {user?.username} · Assigned Driver</p>
            <div className="mt-1 flex gap-1.5">
              <Chip tone="teal">Active duty</Chip>
              <Chip tone="blue">Bus {bus.busCode}</Chip>
            </div>
          </div>
        </div>
      </Card>

      {/* Assigned bus details */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <BusIcon size={16} className="text-primary-600" /> {t('assignedBus')}
            </span>
          }
          subtitle="Fixed allocation for Vidyanagara route"
        />
        <dl className="grid grid-cols-2 gap-3 p-4 text-xs">
          <div>
            <dt className="text-slate-500">Bus code</dt>
            <dd className="mt-0.5 text-sm font-semibold text-navy-900">{bus.busCode}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Registration</dt>
            <dd className="mt-0.5 text-sm font-semibold tnum text-navy-900">{bus.registration}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Tank capacity</dt>
            <dd className="mt-0.5 text-sm font-semibold tnum text-navy-900">{bus.tankLitres} L</dd>
          </div>
          <div>
            <dt className="text-slate-500">Fuel type</dt>
            <dd className="mt-0.5 text-sm font-semibold capitalize text-navy-900">{bus.fuelType}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-slate-500">GPS Tracker</dt>
            <dd className="mt-0.5 font-medium text-slate-700">{bus.gpsDevice} (Hardware sync active)</dd>
          </div>
        </dl>
      </Card>

      {/* Shift statistics */}
      <Card>
        <CardHeader title="Shift & Fuel Summary" subtitle="Total verified entries for your bus" />
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
          <div className="p-4">
            <p className="text-xs text-slate-500">Fills logged</p>
            <p className="mt-1 text-2xl font-bold tnum text-navy-900">{myEntries.length}</p>
            <p className="text-[11px] text-slate-400">Total register records</p>
          </div>
          <div className="p-4">
            <p className="text-xs text-slate-500">Total litres</p>
            <p className="mt-1 text-2xl font-bold tnum text-navy-900">{num(totalLitres, 0)} L</p>
            <p className="text-[11px] text-slate-400">{inr(totalSpend)}</p>
          </div>
        </div>
        {lastFill && (
          <div className="p-3 text-xs text-slate-600">
            <span className="text-slate-400">Last recorded fill: </span>
            <span className="font-semibold text-navy-900">{fmtDateTime(lastFill.timestampClient)}</span> ({num(lastFill.litres)} L at {lastFill.pumpName})
          </div>
        )}
      </Card>

      {/* Connectivity & Offline sync */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {s.online ? <Wifi size={16} className="text-teal-600" /> : <WifiOff size={16} className="text-amber-600" />}
              {t('connectivity')}
            </span>
          }
          subtitle="Offline caching & cloud synchronization"
        />
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="text-sm font-semibold text-navy-900">
                {s.online ? 'Online (Connected)' : 'Offline mode'}
              </p>
              <p className="text-xs text-slate-500">
                {s.online ? 'Transactions save directly to server' : 'Transactions stored locally on phone'}
              </p>
            </div>
            <button
              onClick={() => setOnline(!s.online)}
              className={`relative h-6 w-11 rounded-full transition-colors ${s.online ? 'bg-teal-500' : 'bg-slate-300'}`}
              aria-label="Toggle network mode"
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.online ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {pending.length > 0 ? (
            <div className="space-y-2">
              <Banner tone="warning" title={`${pending.length} fill(s) waiting to sync`}>
                Entries were stored locally while offline. Click below to synchronize with college server.
              </Banner>
              <Button size="sm" className="w-full" onClick={() => syncPendingEntries()}>
                <RefreshCw size={14} /> {t('forceSync')} ({pending.length})
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-teal-700">
              <CheckCircle2 size={14} /> All entries are fully synced with server.
            </p>
          )}
        </div>
      </Card>

      {/* Language Preference */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Languages size={16} className="text-primary-600" /> Language / ಭಾಷೆ
            </span>
          }
          subtitle="Driver interface display language"
        />
        <div className="flex gap-2.5 p-4">
          <button
            onClick={() => setLang('en')}
            className={`flex-1 rounded-lg border p-3 text-center text-sm font-semibold transition-all ${
              lang === 'en' ? 'border-primary-600 bg-primary-50 text-primary-700 ring-2 ring-primary-500/20' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLang('kn')}
            className={`flex-1 rounded-lg border p-3 text-center text-sm font-semibold transition-all ${
              lang === 'kn' ? 'border-primary-600 bg-primary-50 text-primary-700 ring-2 ring-primary-500/20' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            ಕನ್ನಡ (Kannada)
          </button>
        </div>
      </Card>

      {/* Log out CTA */}
      <div className="pt-2">
        <Button variant="danger" size="lg" className="w-full" onClick={handleLogout}>
          <LogOut size={18} /> {t('logout')} & switch role
        </Button>
      </div>
    </div>
  )
}
