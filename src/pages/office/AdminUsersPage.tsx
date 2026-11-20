import { useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  PlusCircle,
  RefreshCw,
  Search,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAppState } from '../../services/store'
import { createUser, toggleUserStatus, updateUserCredentials } from '../../services/api'
import { Banner, Button, Card, Chip, DataTable, EmptyState, Field, Modal, inputCls } from '../../components/ui'
import { fmtDateTime } from '../../utils/format'
import type { Role, User } from '../../types'

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

type TabType = 'all' | 'driver' | 'transport_manager' | 'accountant' | 'principal' | 'admin'

export default function AdminUsersPage() {
  const s = useAppState()
  const [tab, setTab] = useState<TabType>('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [suspendUser, setSuspendUser] = useState<User | null>(null)

  // Add user form state
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<Role>('driver')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newBusCode, setNewBusCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [addError, setAddError] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  // Edit credentials form state
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active')
  const [editBusCode, setEditBusCode] = useState('')
  const [editReason, setEditReason] = useState('')
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editError, setEditError] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  // Suspend dialog reason
  const [suspendReason, setSuspendReason] = useState('')
  const [suspendBusy, setSuspendBusy] = useState(false)

  // Generate random strong password
  const generatePassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*'
    let pwd = ''
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return pwd
  }

  // Filter users
  const filteredUsers = useMemo(() => {
    return s.users.filter((u) => {
      if (tab !== 'all' && u.role !== tab) return false
      if (statusFilter !== 'all') {
        const uStatus = u.status ?? 'active'
        if (uStatus !== statusFilter) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = u.name.toLowerCase().includes(q)
        const matchesUser = u.username.toLowerCase().includes(q)
        const matchesPhone = u.phone?.toLowerCase().includes(q)
        const matchesBus = u.busCode?.toLowerCase().includes(q)
        if (!matchesName && !matchesUser && !matchesPhone && !matchesBus) return false
      }
      return true
    })
  }, [s.users, tab, search, statusFilter])

  // Open Add Modal
  const openAddModal = (presetRole: Role = 'driver') => {
    setNewRole(presetRole)
    setNewName('')
    setNewUsername('')
    setNewPassword(generatePassword())
    setNewPhone('')
    setNewBusCode('')
    setAddError('')
    setAddModalOpen(true)
  }

  // Open Edit Modal
  const openEditModal = (u: User) => {
    setEditUser(u)
    setEditUsername(u.username)
    setEditPassword(u.password || '')
    setEditPhone(u.phone || '')
    setEditStatus(u.status || 'active')
    setEditBusCode(u.busCode || '')
    setEditReason('')
    setEditError('')
    setCopied(false)
  }

  // Submit Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')

    if (!newName.trim()) {
      setAddError('Full name is required.')
      return
    }
    if (!newUsername.trim()) {
      setAddError('Username is required.')
      return
    }
    const cleanUsername = newUsername.trim().toLowerCase()
    if (s.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      setAddError(`Username @${cleanUsername} is already registered.`)
      return
    }
    if (!newPassword.trim()) {
      setAddError('Password is required.')
      return
    }

    setAddBusy(true)
    try {
      await createUser({
        name: newName,
        role: newRole,
        username: cleanUsername,
        password: newPassword,
        phone: newPhone,
        busCode: newRole === 'driver' ? newBusCode : undefined,
      })
      setAddModalOpen(false)
    } catch {
      setAddError('Failed to create account. Please try again.')
    } finally {
      setAddBusy(false)
    }
  }

  // Submit Edit Credentials
  const handleEditCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUser) return
    setEditError('')

    if (!editUsername.trim()) {
      setEditError('Username cannot be empty.')
      return
    }
    const cleanUsername = editUsername.trim().toLowerCase()
    if (
      cleanUsername !== editUser.username.toLowerCase() &&
      s.users.some((u) => u.username.toLowerCase() === cleanUsername && u.id !== editUser.id)
    ) {
      setEditError(`Username @${cleanUsername} is already in use.`)
      return
    }
    if (!editPassword.trim()) {
      setEditError('Password cannot be empty.')
      return
    }
    if (!editReason.trim()) {
      setEditError('Mandatory justification reason required for credential updates.')
      return
    }

    setEditBusy(true)
    try {
      await updateUserCredentials({
        userId: editUser.id,
        username: cleanUsername,
        password: editPassword,
        status: editStatus,
        phone: editPhone,
        busCode: editUser.role === 'driver' ? editBusCode : undefined,
        reason: editReason,
      })
      setEditUser(null)
    } catch {
      setEditError('Failed to update credentials. Try again.')
    } finally {
      setEditBusy(false)
    }
  }

  // Submit Suspend / Reactivate
  const handleToggleSuspend = async () => {
    if (!suspendUser) return
    if (!suspendReason.trim()) return
    setSuspendBusy(true)
    try {
      await toggleUserStatus(suspendUser.id, suspendReason)
      setSuspendUser(null)
      setSuspendReason('')
    } finally {
      setSuspendBusy(false)
    }
  }

  // Copy credentials helper
  const copyCredentials = () => {
    if (!editUser) return
    const text = `FuelGuard Credentials:\nName: ${editUser.name}\nRole: ${roleNames[editUser.role]}\nUsername: ${editUsername}\nPassword: ${editPassword}\nPortal: ${window.location.origin}/login`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">
              User & Authentication Management
            </h1>
            <Chip tone="teal">Protected</Chip>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Sole authority to provision accounts, manage passwords, and configure access for all roles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => openAddModal('transport_manager')}>
            <PlusCircle size={16} /> Add Staff Account
          </Button>
          <Button variant="primary" onClick={() => openAddModal('driver')}>
            <UserPlus size={16} /> + Add Driver
          </Button>
        </div>
      </div>

      {/* Role Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-1">
          {(
            [
              { key: 'all', label: `All Users (${s.users.length})` },
              { key: 'driver', label: `Drivers (${s.users.filter((u) => u.role === 'driver').length})` },
              {
                key: 'transport_manager',
                label: `Transport Managers (${s.users.filter((u) => u.role === 'transport_manager').length})`,
              },
              {
                key: 'accountant',
                label: `Accountants (${s.users.filter((u) => u.role === 'accountant').length})`,
              },
              {
                key: 'principal',
                label: `Principals (${s.users.filter((u) => u.role === 'principal').length})`,
              },
              {
                key: 'admin',
                label: `Admins (${s.users.filter((u) => u.role === 'admin').length})`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, username, bus..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} w-52 pl-8 text-xs`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
            className={`${inputCls} w-32 text-xs`}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>
        </div>
      </div>

      {/* Users Data Table */}
      <Card>
        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title="No matching users found"
            description="Adjust your search query or role filter, or provision a new user."
          />
        ) : (
          <DataTable
            rows={filteredUsers}
            columns={[
              {
                key: 'user',
                label: 'Name & Role',
                render: (u) => (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">
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
                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded">
                    @{u.username}
                  </span>
                ),
              },
              {
                key: 'password',
                label: 'Password Governance',
                render: (u) => (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Lock size={12} className="text-slate-400" />
                    <span className="font-mono text-slate-500">
                      {u.password ? '••••••••' : 'Default password'}
                    </span>
                  </div>
                ),
              },
              {
                key: 'bus',
                label: 'Bus Allocation',
                render: (u) => {
                  if (u.role !== 'driver') return <span className="text-xs text-slate-400">—</span>
                  if (!u.busCode) {
                    return (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        Unallocated
                      </span>
                    )
                  }
                  const b = s.buses.find((bus) => bus.busCode === u.busCode)
                  return (
                    <div className="text-xs">
                      <span className="font-bold text-navy-900">{u.busCode}</span>
                      {b && <span className="text-slate-500"> ({b.registration})</span>}
                    </div>
                  )
                },
              },
              {
                key: 'status',
                label: 'Status',
                render: (u) => (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      u.status === 'suspended'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-teal-50 text-teal-700 border border-teal-200'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        u.status === 'suspended' ? 'bg-red-500' : 'bg-teal-500'
                      }`}
                    />
                    {u.status === 'suspended' ? 'Suspended' : 'Active'}
                  </span>
                ),
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (u) => (
                  <div className="flex items-center justify-end gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => openEditModal(u)}>
                      <KeyRound size={13} /> Manage Credentials
                    </Button>
                    {u.role !== 'admin' && (
                      <Button
                        size="sm"
                        variant={u.status === 'suspended' ? 'secondary' : 'ghost'}
                        onClick={() => setSuspendUser(u)}
                      >
                        {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* MODAL: ADD USER / DRIVER */}
      {addModalOpen && (
        <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Provision New User Account">
          <form onSubmit={handleAddUser} className="space-y-4">
            <p className="text-xs text-slate-500">
              Create credentials for drivers, transport managers, accountants, or principals. Passwords can be shared directly with staff.
            </p>

            <Field label="Role" htmlFor="new-role" required>
              <select
                id="new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className={inputCls}
              >
                <option value="driver">Driver (Mobile Fuel Entry)</option>
                <option value="transport_manager">Transport Manager (Fleet Operations)</option>
                <option value="accountant">Accountant (Financial Reconciliation)</option>
                <option value="principal">Principal (Executive Approver)</option>
                <option value="admin">System Administrator (Full Authority)</option>
              </select>
            </Field>

            <Field label="Full Name" htmlFor="new-name" required>
              <input
                id="new-name"
                type="text"
                placeholder="e.g. Anand Murthy"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  if (!newUsername) {
                    setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12))
                  }
                }}
                className={inputCls}
                required
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Username" htmlFor="new-username" hint="Login identifier" required>
                <input
                  id="new-username"
                  type="text"
                  placeholder="e.g. anand"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className={`${inputCls} font-mono`}
                  required
                />
              </Field>

              <Field label="Phone Number" htmlFor="new-phone" hint="Optional mobile contact">
                <input
                  id="new-phone"
                  type="text"
                  placeholder="+91 98450 00000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field
              label="Password"
              htmlFor="new-password"
              hint="Provide this password to the employee"
              required
            >
              <div className="relative flex items-center">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${inputCls} pr-24 font-mono`}
                  required
                />
                <div className="absolute right-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setNewPassword(generatePassword())}
                    className="text-[11px] py-1 px-1.5"
                  >
                    <RefreshCw size={11} /> Generate
                  </Button>
                </div>
              </div>
            </Field>

            {/* If Driver: Bus Assignment */}
            {newRole === 'driver' && (
              <Field label="Allocate Bus (Optional)" htmlFor="new-bus" hint="Assign driver to a fleet bus now or later">
                <select
                  id="new-bus"
                  value={newBusCode}
                  onChange={(e) => setNewBusCode(e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- No Bus Allocated (Bench Driver) --</option>
                  {s.buses.map((b) => (
                    <option key={b.busCode} value={b.busCode}>
                      {b.busCode} ({b.registration}) {b.driverName ? `[Current: ${b.driverName}]` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {addError && <Banner tone="danger" title={addError} />}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={addBusy}>
                {addBusy ? 'Creating account…' : 'Create Account'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: MANAGE CREDENTIALS / PASSWORD */}
      {editUser && (
        <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Manage Credentials: ${editUser.name}`}>
          <form onSubmit={handleEditCredentials} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-navy-900">{editUser.name}</span>
                <Chip tone={roleBadgeColor[editUser.role]}>{roleNames[editUser.role]}</Chip>
              </div>
              <div className="mt-1 text-slate-500">
                User ID: {editUser.id} · Created: {editUser.createdAt ? fmtDateTime(editUser.createdAt) : 'Initial Seed'}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Username" htmlFor="edit-username" hint="Login username" required>
                <input
                  id="edit-username"
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className={`${inputCls} font-mono`}
                  required
                />
              </Field>

              <Field label="Account Status" htmlFor="edit-status">
                <select
                  id="edit-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'active' | 'suspended')}
                  className={inputCls}
                >
                  <option value="active">Active (Access Allowed)</option>
                  <option value="suspended">Suspended (Access Blocked)</option>
                </select>
              </Field>
            </div>

            <Field label="Reset / Change Password" htmlFor="edit-password" hint="Set a new password for this user" required>
              <div className="relative flex items-center">
                <input
                  id="edit-password"
                  type={showEditPassword ? 'text' : 'password'}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className={`${inputCls} pr-24 font-mono`}
                  required
                />
                <div className="absolute right-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600"
                    title={showEditPassword ? 'Hide password' : 'Show password'}
                  >
                    {showEditPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditPassword(generatePassword())}
                    className="text-[11px] py-1 px-1.5"
                  >
                    <RefreshCw size={11} /> Generate
                  </Button>
                </div>
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone Number" htmlFor="edit-phone">
                <input
                  id="edit-phone"
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className={inputCls}
                  placeholder="+91 98450 00000"
                />
              </Field>

              {editUser.role === 'driver' && (
                <Field label="Assigned Bus" htmlFor="edit-bus">
                  <select
                    id="edit-bus"
                    value={editBusCode}
                    onChange={(e) => setEditBusCode(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-- No Bus (Unassigned) --</option>
                    {s.buses.map((b) => (
                      <option key={b.busCode} value={b.busCode}>
                        {b.busCode} ({b.registration})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <Field
              label="Mandatory Justification / Reason"
              htmlFor="edit-reason"
              hint="Required for audit and security compliance"
              required
            >
              <textarea
                id="edit-reason"
                rows={2}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Scheduled password rotation / Driver assigned to new bus route"
                className={inputCls}
                required
              />
            </Field>

            {editError && <Banner tone="danger" title={editError} />}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={copyCredentials}>
                {copied ? <Check size={14} className="text-teal-600" /> : <Copy size={14} />}
                {copied ? 'Copied to Clipboard!' : 'Copy Credentials'}
              </Button>

              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={editBusy}>
                  {editBusy ? 'Saving changes…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: CONFIRM SUSPEND / REACTIVATE */}
      {suspendUser && (
        <Modal
          open={!!suspendUser}
          onClose={() => setSuspendUser(null)}
          title={`${suspendUser.status === 'suspended' ? 'Reactivate' : 'Suspend'} User Account: ${suspendUser.name}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {suspendUser.status === 'suspended'
                ? `Reactivating will restore sign-in privileges for @${suspendUser.username}.`
                : `Suspending will immediately block sign-in access for @${suspendUser.username}. Any active sessions will be terminated.`}
            </p>

            <Field label="Mandatory Reason" htmlFor="suspend-reason" required>
              <textarea
                id="suspend-reason"
                rows={2}
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Enter justification for this access modification..."
                className={inputCls}
                required
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSuspendUser(null)}>
                Cancel
              </Button>
              <Button
                variant={suspendUser.status === 'suspended' ? 'primary' : 'danger'}
                disabled={!suspendReason.trim() || suspendBusy}
                onClick={handleToggleSuspend}
              >
                {suspendBusy
                  ? 'Updating…'
                  : suspendUser.status === 'suspended'
                  ? 'Confirm Reactivation'
                  : 'Confirm Suspension'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
