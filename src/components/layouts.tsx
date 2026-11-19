import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bus as BusIcon,
  ClipboardCheck,
  FileSpreadsheet,
  Fuel,
  Gauge,
  KeyRound,
  LogOut,
  Menu,
  NotebookPen,
  PlusCircle,
  Receipt,
  ScanLine,
  ScrollText,
  ShieldCheck,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react'
import { currentUser, logout, setLang } from '../services/api'
import { buses, useAppState, users } from '../services/store'
import { useI18n } from '../i18n'
import { Button, Chip, Modal } from './ui'
import type { Role } from '../types'

const roleLabel: Record<Role, string> = {
  driver: 'Driver',
  transport_manager: 'Transport Manager',
  accountant: 'Accountant',
  principal: 'Principal / Approver',
  admin: 'System Administrator',
}

export function RoleBadge() {
  const s = useAppState()
  const user = currentUser(s)
  if (!user) return null
  return (
    <span className="hidden items-center gap-2 sm:flex">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">
        {user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
      </span>
      <span className="text-left leading-tight">
        <span className="block text-xs font-semibold text-navy-900">{user.name}</span>
        <span className="block text-[11px] text-slate-500">{roleLabel[user.role]}</span>
      </span>
    </span>
  )
}

export function LangToggle() {
  const s = useAppState()
  return (
    <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Language">
      {(['en', 'kn'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-md px-2 py-1 ${s.lang === l ? 'bg-primary-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          {l === 'en' ? 'EN' : 'ಕನ್ನಡ'}
        </button>
      ))}
    </div>
  )
}

const navForRole: Record<Role, { to: string; label: string; icon: React.ReactNode }[]> = {
  driver: [],
  transport_manager: [
    { to: '/app', label: 'Fleet Overview', icon: <Gauge size={18} /> },
    { to: '/app/buses', label: 'Buses & QR', icon: <BusIcon size={18} /> },
    { to: '/app/entries', label: 'Fuel Entries', icon: <Fuel size={18} /> },
    { to: '/app/flagged', label: 'Flagged Fills', icon: <NotebookPen size={18} /> },
    { to: '/app/efficiency', label: 'Bus Efficiency', icon: <BarChart3 size={18} /> },
    { to: '/app/reconciliation', label: 'Pump Statement', icon: <Receipt size={18} /> },
    { to: '/app/reports', label: 'Reports', icon: <FileSpreadsheet size={18} /> },
    { to: '/app/audit', label: 'Audit Log', icon: <ScrollText size={18} /> },
  ],
  accountant: [
    { to: '/app', label: 'Finance Overview', icon: <Gauge size={18} /> },
    { to: '/app/reconciliation', label: 'Statement Reconciliation', icon: <Receipt size={18} /> },
    { to: '/app/entries', label: 'Fuel Entries', icon: <Fuel size={18} /> },
    { to: '/app/flagged', label: 'Flagged Fills', icon: <NotebookPen size={18} /> },
    { to: '/app/reports', label: 'Financial Reports', icon: <FileSpreadsheet size={18} /> },
    { to: '/app/audit', label: 'Audit Log', icon: <ScrollText size={18} /> },
  ],
  principal: [
    { to: '/app', label: 'Executive Overview', icon: <Gauge size={18} /> },
    { to: '/app/approvals', label: 'Approval Inbox', icon: <ClipboardCheck size={18} /> },
    { to: '/app/flagged', label: 'Flagged Fills', icon: <NotebookPen size={18} /> },
    { to: '/app/entries', label: 'Fuel Entries', icon: <Fuel size={18} /> },
    { to: '/app/reports', label: 'Executive Reports', icon: <FileSpreadsheet size={18} /> },
    { to: '/app/audit', label: 'Audit Log', icon: <ScrollText size={18} /> },
  ],
  admin: [
    { to: '/app', label: 'Admin Overview', icon: <ShieldCheck size={18} /> },
    { to: '/app/admin/users', label: 'User & Auth Management', icon: <Users size={18} /> },
    { to: '/app/admin/buses', label: 'Bus Fleet & Allocation', icon: <BusIcon size={18} /> },
    { to: '/app/admin/security', label: 'Security & Access Logs', icon: <KeyRound size={18} /> },
    { to: '/app/audit', label: 'System Audit Log', icon: <ScrollText size={18} /> },
  ],
}

function SwitchRoleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  return (
    <Modal open={open} onClose={onClose} title="Sign Out of FuelGuard">
      <p className="text-sm text-slate-600">
        You will be securely signed out of your current session. You can sign back in with your
        institutional credentials at any time.
      </p>
      <button
        onClick={() => {
          logout()
          nav('/login')
        }}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 font-semibold text-white hover:bg-primary-700"
      >
        <LogOut size={16} /> Sign Out
      </button>
    </Modal>
  )
}

export function OfficeLayout() {
  const s = useAppState()
  const user = currentUser(s)
  const [menuOpen, setMenuOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const { pathname } = useLocation()
  const items = user ? navForRole[user.role] : []
  const pending = s.approvals.filter((a) => a.decision === 'pending').length
  const flags = s.flags.filter((f) => f.status === 'needs_review').length
  const title = useMemo(() => {
    if (pathname === '/app') {
      if (user?.role === 'admin') return 'System Administration & Security Hub'
      if (user?.role === 'accountant') return 'Accountant Financial Hub'
      if (user?.role === 'principal') return 'Principal Governance Hub'
      return 'Transport Fleet Dashboard'
    }
    if (pathname.startsWith('/app/admin/users')) return 'User & Authentication Management'
    if (pathname.startsWith('/app/admin/buses')) return 'Bus Fleet & Driver Allocation'
    if (pathname.startsWith('/app/admin/security')) return 'Security & Access Logs'
    if (pathname.startsWith('/app/entries')) return 'Fuel entries'
    if (pathname.startsWith('/app/flagged')) return 'Flagged fills'
    if (pathname.startsWith('/app/efficiency')) return 'Bus Fuel Efficiency'
    if (pathname.startsWith('/app/reconciliation')) return 'Pump statement reconciliation'
    if (pathname.startsWith('/app/approvals')) return 'Approval inbox'
    if (pathname.startsWith('/app/buses')) return 'Buses & QR'
    if (pathname.startsWith('/app/reports')) return 'Reports & Analytics'
    if (pathname.startsWith('/app/audit')) return 'Audit log'
    return 'Office'
  }, [pathname, user])

  const NavList = (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/app'}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${
              isActive ? 'bg-primary-600 text-white' : 'text-slate-300 hover:bg-navy-800 hover:text-white'
            }`
          }
        >
          <span className="flex items-center gap-2.5">
            {it.icon}
            {it.label}
          </span>
          {it.label.includes('Flagged') && flags > 0 && (
            <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-navy-900">{flags}</span>
          )}
          {it.label.includes('Approval') && pending > 0 && (
            <span className="rounded-full bg-primary-300 px-1.5 text-[11px] font-bold text-navy-900">{pending}</span>
          )}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy-900 p-4 lg:flex">
        <Brand dark />
        <div className="mt-6 flex-1 overflow-y-auto scrollbar-thin">{NavList}</div>
        <button
          onClick={() => setSwitchOpen(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-navy-800 hover:text-white"
        >
          <LogOut size={16} /> Log out / switch role
        </button>
        <p className="mt-2 px-3 text-[11px] text-slate-500">Prototype guard only — production must enforce permissions on the backend.</p>
      </aside>

      {/* mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-navy-900 p-4 shadow-pop">
            <div className="flex items-center justify-between">
              <Brand dark />
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-slate-400 hover:bg-navy-800">
                <X size={18} />
              </button>
            </div>
            <div className="mt-6">{NavList}</div>
            <button
              onClick={() => {
                setMenuOpen(false)
                setSwitchOpen(true)
              }}
              className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-navy-800 hover:text-white"
            >
              <LogOut size={16} /> Log out / switch role
            </button>
          </div>
        </div>
      )}

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-navy-900">{title}</h1>
          <LangToggle />
          <RoleBadge />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <Outlet context={{ user }} />
        </main>
        <footer className="border-t border-slate-200 px-4 py-3 text-center text-[11px] text-slate-400 sm:px-6">
          FuelGuard MVP · synthetic demo data (ArtIntele) · flags are review prompts, not proven findings
        </footer>
      </div>
      <SwitchRoleModal open={switchOpen} onClose={() => setSwitchOpen(false)} />
    </div>
  )
}

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
        <Fuel size={18} />
      </span>
      <span className="leading-tight">
        <span className={`block text-sm font-bold ${dark ? 'text-white' : 'text-navy-900'}`}>FuelGuard</span>
        <span className={`block text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Vidyanagara PU College</span>
      </span>
    </div>
  )
}

/** Driver mobile shell with 5-destination bottom navigation. */
export function DriverLayout({ children }: { children: React.ReactNode }) {
  const s = useAppState()
  const user = currentUser(s)
  const nav = useNavigate()
  const { t } = useI18n()
  const [quickScanOpen, setQuickScanOpen] = useState(false)
  const pendingCount = s.entries.filter((e) => e.status === 'pending_sync').length

  const handleSelectQuickBus = (code: string) => {
    setQuickScanOpen(false)
    nav('/driver/entry', { state: { preselectedBus: code, via: 'qr' } })
  }

  return (
    <div className="mx-auto flex min-h-screen min-h-dvh max-w-md flex-col bg-slate-50 sm:my-0">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          {pendingCount > 0 && (
            <Chip tone="amber" className="text-[10px]">
              {pendingCount} offline
            </Chip>
          )}
          <LangToggle />
        </div>
      </header>
      <main className="flex-1 pb-24">{children}</main>
      
      {/* 5-item mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md items-center justify-around border-t border-slate-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-lg" aria-label="Driver navigation">
        <NavLink
          to="/driver"
          end
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-medium transition-colors ${
              isActive ? 'font-bold text-primary-700' : 'text-slate-500 hover:text-navy-900'
            }`
          }
        >
          <Gauge size={19} />
          {t('dashboard')}
        </NavLink>

        <NavLink
          to="/driver/entry"
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-medium transition-colors ${
              isActive ? 'font-bold text-primary-700' : 'text-slate-500 hover:text-navy-900'
            }`
          }
        >
          <PlusCircle size={19} />
          {t('newFill')}
        </NavLink>

        {/* Quick QR Scan Action */}
        <button
          onClick={() => setQuickScanOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-medium text-slate-500 hover:text-navy-900 transition-colors"
        >
          <ScanLine size={19} className="text-primary-600" />
          {t('scanBus')}
        </button>

        <NavLink
          to="/driver/entries"
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-medium transition-colors ${
              isActive ? 'font-bold text-primary-700' : 'text-slate-500 hover:text-navy-900'
            }`
          }
        >
          <Fuel size={19} />
          {t('myEntries')}
        </NavLink>

        <NavLink
          to="/driver/profile"
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-medium transition-colors ${
              isActive ? 'font-bold text-primary-700' : 'text-slate-500 hover:text-navy-900'
            }`
          }
        >
          <UserIcon size={19} />
          {t('profile')}
        </NavLink>
      </nav>

      {/* Quick QR scan trigger modal */}
      <Modal open={quickScanOpen} onClose={() => setQuickScanOpen(false)} title="Quick Scan Bus QR">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-dashed border-primary-400 bg-primary-50">
            <ScanLine size={48} className="animate-pulse text-primary-600" />
          </div>
          <p className="text-sm font-semibold text-navy-900">Scan QR on Bus Fuel Cap</p>
          <p className="text-xs text-slate-500">
            Point camera at the QR sticker near fuel tank. Choose a bus below to simulate an immediate camera match:
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {buses.map((b) => (
              <button
                key={b.busCode}
                onClick={() => handleSelectQuickBus(b.busCode)}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-left text-xs hover:border-primary-500 hover:bg-primary-50"
              >
                <span className="font-bold text-navy-900">{b.busCode}</span>
                <span className="text-slate-500">{b.driverName.split(' ')[0]}</span>
              </button>
            ))}
          </div>
          <Button variant="secondary" className="w-full mt-2" onClick={() => setQuickScanOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      {user && <span className="sr-only">Signed in as {user.name}</span>}
    </div>
  )
}

export function usePillCounts() {
  const s = useAppState()
  return {
    pendingApprovals: s.approvals.filter((a) => a.decision === 'pending').length,
    openFlags: s.flags.filter((f) => f.status === 'needs_review' || f.status === 'escalated').length,
    demoUsers: users,
  }
}
