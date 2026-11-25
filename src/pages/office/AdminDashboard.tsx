import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bus as BusIcon,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAppState } from '../../services/store'
import { currentUser } from '../../services/api'
import { Button, Card, CardHeader, Chip, DataTable, KpiCard } from '../../components/ui'
import { fmtDateTime } from '../../utils/format'
import type { Role } from '../../types'

const roleBadgeColor: Record<Role, 'blue' | 'teal' | 'amber' | 'slate' | 'violet'> = {
  admin: 'violet',
  principal: 'amber',
  transport_manager: 'blue',
  accountant: 'teal',
  driver: 'slate',
}

const roleNames: Record<Role, string> = {
  admin: 'Administrator',
  principal: 'Principal / Approver',
  transport_manager: 'Transport Manager',
  accountant: 'Accountant',
  driver: 'Driver',
}

export default function AdminDashboard() {
  const s = useAppState()
  const user = currentUser(s)
  const nav = useNavigate()

  // User metrics
  const totalUsers = s.users.length
  const activeUsers = s.users.filter((u) => u.status !== 'suspended').length
  const suspendedUsers = s.users.filter((u) => u.status === 'suspended').length
  const drivers = s.users.filter((u) => u.role === 'driver')

  // Bus metrics
  const totalBuses = s.buses.length
  const allocatedBuses = s.buses.filter((b) => b.driverName && b.driverName !== 'Unassigned').length
  const allocationRate = totalBuses > 0 ? Math.round((allocatedBuses / totalBuses) * 100) : 0

  // Security audit events (logins, password updates, user creation, bus allocation)
  const securityEvents = useMemo(() => {
    return s.audit.filter(
      (ev) =>
        ev.entityType === 'user' ||
        ev.entityType === 'bus' ||
        ev.entityId === 'session'
    )
  }, [s.audit])

  return (
    <div className="space-y-6">
      {/* Executive Security & Organization Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">
              System Administration & Security Hub
            </h1>
            <Chip tone="teal">Protected</Chip>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Sole authority for authentication, user credential provisioning, and bus fleet allocation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => nav('/app/admin/security')}>
            <KeyRound size={16} /> Security Logs
          </Button>
          <Button variant="secondary" onClick={() => nav('/app/admin/buses')}>
            <BusIcon size={16} /> Manage Buses
          </Button>
          <Button variant="primary" onClick={() => nav('/app/admin/users')}>
            <UserPlus size={16} /> Manage Users & Passwords
          </Button>
        </div>
      </div>

      {/* Security Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="text-sm font-semibold">Zero-Trust Authentication Active</div>
            <div className="text-xs text-teal-700">
              Signed in as {user?.name} (Administrator) · Credential modifications and vehicle allocations are recorded in the audit trail.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-teal-800">
          <span className="flex h-2 w-2 rounded-full bg-teal-500" />
          Role-Based Access Control: Active
        </div>
      </div>

      {/* Top Security & Fleet KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Managed Accounts"
          value={String(totalUsers)}
          sub={`${activeUsers} active · ${suspendedUsers} suspended`}
          icon={<Users size={18} className="text-primary-600" />}
          tone="blue"
        />
        <KpiCard
          label="Active Drivers"
          value={String(drivers.length)}
          sub={`${drivers.filter((d) => d.busCode).length} assigned to buses`}
          icon={<UserCheck size={18} className="text-teal-600" />}
        />
        <KpiCard
          label="Fleet Bus Allocation"
          value={`${allocationRate}%`}
          sub={`${allocatedBuses} of ${totalBuses} buses allocated`}
          icon={<BusIcon size={18} className="text-amber-600" />}
          tone="amber"
        />
        <KpiCard
          label="Account Status"
          value={suspendedUsers === 0 ? 'Healthy' : `${suspendedUsers} Suspended`}
          sub="No unauthorized breaches"
          icon={suspendedUsers === 0 ? <CheckCircle2 size={18} className="text-teal-600" /> : <AlertTriangle size={18} className="text-red-600" />}
          tone={suspendedUsers === 0 ? undefined : 'red'}
        />
        <KpiCard
          label="Security Events"
          value={String(securityEvents.length)}
          sub="Append-only audit trail"
          icon={<Lock size={18} className="text-navy-600" />}
        />
      </div>

      {/* Centralized User Directory Preview */}
      <Card>
        <CardHeader
          title="Organization Credential Authority Directory"
          subtitle="Drivers, Transport Managers, Accountants, Principals, and Administrators"
          action={
            <Button size="sm" variant="secondary" onClick={() => nav('/app/admin/users')}>
              Manage All Credentials <ArrowRight size={14} />
            </Button>
          }
        />
        <DataTable
          rows={s.users}
          onRowClick={() => nav('/app/admin/users')}
          columns={[
            {
              key: 'user',
              label: 'User Name & Role',
              render: (u) => (
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">
                    {u.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <div className="font-semibold text-navy-900">{u.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Chip tone={roleBadgeColor[u.role]}>{roleNames[u.role]}</Chip>
                      {u.phone && <span>· {u.phone}</span>}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'username',
              label: 'Username',
              render: (u) => (
                <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  @{u.username}
                </span>
              ),
            },
            {
              key: 'bus',
              label: 'Bus Allocation',
              render: (u) => {
                if (u.role !== 'driver') return <span className="text-xs text-slate-400">N/A</span>
                if (!u.busCode) {
                  return <Chip tone="amber">Unassigned</Chip>
                }
                const bus = s.buses.find((b) => b.busCode === u.busCode)
                return (
                  <div className="text-xs">
                    <span className="font-semibold text-navy-800">{u.busCode}</span>
                    {bus && <span className="text-slate-500"> ({bus.registration})</span>}
                  </div>
                )
              },
            },
            {
              key: 'status',
              label: 'Account Status',
              render: (u) => (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    u.status === 'suspended'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-teal-50 text-teal-700 border border-teal-200'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${u.status === 'suspended' ? 'bg-red-500' : 'bg-teal-500'}`} />
                  {u.status === 'suspended' ? 'Suspended' : 'Active'}
                </span>
              ),
            },
            {
              key: 'lastLogin',
              label: 'Last Sign-in',
              render: (u) => (
                <span className="text-xs text-slate-500">
                  {u.lastLogin ? fmtDateTime(u.lastLogin) : 'Not recorded'}
                </span>
              ),
            },
            {
              key: 'action',
              label: 'Action',
              render: () => (
                <Button size="sm" variant="ghost" onClick={() => nav('/app/admin/users')}>
                  Edit Credentials
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Bus Fleet & Driver Allocation Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bus Fleet Summary */}
        <Card>
          <CardHeader
            title="Fleet Bus Allocation Matrix"
            subtitle={`${allocatedBuses} of ${totalBuses} buses assigned to licensed drivers`}
            action={
              <Button size="sm" variant="secondary" onClick={() => nav('/app/admin/buses')}>
                Allocate Buses <ArrowRight size={14} />
              </Button>
            }
          />
          <div className="divide-y divide-slate-100">
            {s.buses.slice(0, 6).map((b) => {
              const driver = s.users.find((u) => u.role === 'driver' && u.busCode === b.busCode)
              return (
                <div key={b.busCode} className="flex items-center justify-between p-3.5 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-navy-800">
                      <BusIcon size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-navy-900">{b.busCode}</span>
                        <span className="font-mono text-xs text-slate-500">{b.registration}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {b.tankLitres}L Tank · {b.fuelType.toUpperCase()} · GPS: {b.gpsDevice}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {driver ? (
                      <div>
                        <div className="text-xs font-semibold text-navy-900">{driver.name}</div>
                        <div className="text-[11px] text-teal-600 font-medium">Assigned Driver</div>
                      </div>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        Unallocated
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {s.buses.length > 6 && (
            <div className="border-t border-slate-100 p-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => nav('/app/admin/buses')}>
                View all {s.buses.length} buses <ArrowRight size={14} />
              </Button>
            </div>
          )}
        </Card>

        {/* Recent Security & Authentication Activity Feed */}
        <Card>
          <CardHeader
            title="Recent Security & Access Logs"
            subtitle="Append-only record of user provisioning, password resets, and allocations"
            action={
              <Button size="sm" variant="secondary" onClick={() => nav('/app/admin/security')}>
                Full Audit <ArrowRight size={14} />
              </Button>
            }
          />
          <div className="divide-y divide-slate-100">
            {securityEvents.slice(0, 6).map((ev) => (
              <div key={ev.id} className="p-3.5 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <KeyRound size={12} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-navy-900">
                        {ev.actorName} ({ev.action})
                      </div>
                      <div className="text-xs text-slate-600">
                        {ev.after || ev.before || ev.reason || 'Security event logged'}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {fmtDateTime(ev.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
