import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bus as BusIcon, ChevronRight, Fuel, PlusCircle, Wifi, WifiOff } from 'lucide-react'
import { currentUser, setOnline, syncPendingEntries } from '../../services/api'
import { buses, useAppState } from '../../services/store'
import { useI18n } from '../../i18n'
import { Banner, Card, CardHeader, EmptyState, StatusChip } from '../../components/ui'
import { fmtDateTime, inr, num } from '../../utils/format'

export default function DriverHome() {
  const s = useAppState()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const user = currentUser(s)
  const busCode = user?.busCode ?? 'VB-07'
  const bus = buses.find((b) => b.busCode === busCode) ?? buses.find((b) => b.busCode === 'VB-07')!
  const myEntries = s.entries.filter((e) => e.busId === bus.busCode)
  const recent = [...myEntries].sort((a, b) => b.timestampClient.localeCompare(a.timestampClient)).slice(0, 5)
  const pending = myEntries.filter((e) => e.status === 'pending_sync')
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? (lang === 'kn' ? 'ಶುಭೋದಯ' : 'Good morning') : hour < 17 ? (lang === 'kn' ? 'ಶುಭ ಮಧ್ಯಾಹ್ನ' : 'Good afternoon') : (lang === 'kn' ? 'ಶುಭ ಸಂಜೆ' : 'Good evening')

  // First name from user record
  const firstName = user?.name?.split(' ')[0] ?? (lang === 'kn' ? 'ಚಾಲಕ' : 'driver')

  useEffect(() => {
    if (s.online && pending.length > 0) {
      syncPendingEntries()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.online])

  return (
    <div className="px-4 py-5">
      <section>
        <p className="text-sm text-slate-500">
          {greeting}, {firstName} {s.online ? '· ' + t('online') : ''}
        </p>
        <h1 className="mt-0.5 text-xl font-bold text-navy-900">{t('recordFill')}</h1>
      </section>

      {/* offline demo toggle */}
      <button
        onClick={() => setOnline(!s.online)}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-card"
      >
        <span className="flex items-center gap-2 text-slate-600">
          {s.online ? <Wifi size={16} className="text-teal-600" /> : <WifiOff size={16} className="text-amber-600" />}
          {s.online ? 'Connected — demo network' : 'Offline mode (demo)'}
        </span>
        <span className={`relative h-6 w-11 rounded-full transition-colors ${s.online ? 'bg-teal-500' : 'bg-slate-300'}`} aria-hidden>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.online ? 'left-[22px]' : 'left-0.5'}`} />
        </span>
        <span className="sr-only">Toggle offline mode</span>
      </button>
      {!s.online && (
        <div className="mt-3">
          <Banner tone="warning" title="You are offline (demo)">
            Fills you record are saved on this device and marked <strong>Pending sync</strong>. They
            will upload automatically when you go back online — nothing is lost, nothing is
            duplicated.
          </Banner>
        </div>
      )}

      {pending.length > 0 && (
        <Card className="mt-4 border-primary-200 bg-primary-50/50">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-navy-900">{pending.length} fill{pending.length > 1 ? 's' : ''} pending sync</p>
              <p className="text-xs text-slate-500">Saved offline. Will sync automatically when online.</p>
            </div>
            <StatusChip status="pending_sync" />
          </div>
        </Card>
      )}

      {/* bus card */}
      <Card className="mt-4">
        <div className="flex items-center gap-4 px-4 py-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-800 text-white">
            <BusIcon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{t('myBus')}</p>
            <p className="text-base font-bold text-navy-900">{bus.busCode} <span className="tnum font-medium text-slate-600">/ {bus.registration}</span></p>
            <p className="text-xs text-slate-500">Diesel · tank {bus.tankLitres} L · GPS {bus.gpsDevice}</p>
          </div>
        </div>
      </Card>

      {/* primary action */}
      <button
        onClick={() => nav('/driver/entry')}
        className="mt-4 flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-primary-600 text-lg font-bold text-white shadow-card transition-colors active:bg-primary-800"
      >
        <PlusCircle size={26} aria-hidden />
        {t('recordFill')}
      </button>

      {/* recent entries */}
      <Card className="mt-5">
        <CardHeader
          title={t('recentEntries')}
          action={
            <Link to="/driver/entries" className="flex items-center gap-0.5 text-xs font-semibold text-primary-700">
              All <ChevronRight size={14} />
            </Link>
          }
        />
        {recent.length === 0 ? (
          <EmptyState icon={<Fuel size={20} />} title="No fills recorded yet" description="Your recorded fills will appear here with their review status." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((e) => (
              <li key={e.id}>
                <Link to={`/app/entries/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-900">{fmtDateTime(e.timestampClient)}</p>
                    <p className="text-xs text-slate-500 tnum">
                      {num(e.litres)} L · {inr(e.amount)} · {e.pumpName}
                    </p>
                  </div>
                  <StatusChip status={e.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
        Demo data from the ArtIntele synthetic dataset. Flags never say "fraud confirmed" — they ask for a review.
      </p>
    </div>
  )
}
