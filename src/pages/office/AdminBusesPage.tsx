import { useMemo, useState } from 'react'
import {
  Bus as BusIcon,
  Droplets,
  Navigation,
  PlusCircle,
  Search,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useAppState } from '../../services/store'
import { allocateBusDriver, createBus } from '../../services/api'
import { Banner, Button, Card, Chip, DataTable, EmptyState, Field, Modal, inputCls } from '../../components/ui'
import type { Bus } from '../../types'

export default function AdminBusesPage() {
  const s = useAppState()
  const [search, setSearch] = useState('')
  const [filterAllocation, setFilterAllocation] = useState<'all' | 'allocated' | 'unallocated'>('all')

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [allocateBus, setAllocateBus] = useState<Bus | null>(null)

  // Add Bus Form State
  const [newCode, setNewCode] = useState('')
  const [newReg, setNewReg] = useState('')
  const [newCapacity, setNewCapacity] = useState('180')
  const [newFuelType, setNewFuelType] = useState<'diesel' | 'petrol' | 'cng'>('diesel')
  const [newGps, setNewGps] = useState('')
  const [newDriverId, setNewDriverId] = useState('')
  const [addError, setAddError] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  // Allocate Driver Form State
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [allocateReason, setAllocateReason] = useState('')
  const [allocateError, setAllocateError] = useState('')
  const [allocateBusy, setAllocateBusy] = useState(false)

  // Drivers list
  const drivers = useMemo(() => {
    return s.users.filter((u) => u.role === 'driver')
  }, [s.users])

  // Fleet KPIs
  const totalBuses = s.buses.length
  const allocatedBuses = s.buses.filter((b) => b.driverName && b.driverName !== 'Unassigned').length
  const unallocatedBuses = totalBuses - allocatedBuses
  const totalCapacity = s.buses.reduce((acc, b) => acc + b.tankLitres, 0)

  // Filtered Buses
  const filteredBuses = useMemo(() => {
    return s.buses.filter((b) => {
      const isAllocated = b.driverName && b.driverName !== 'Unassigned'
      if (filterAllocation === 'allocated' && !isAllocated) return false
      if (filterAllocation === 'unallocated' && isAllocated) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesCode = b.busCode.toLowerCase().includes(q)
        const matchesReg = b.registration.toLowerCase().includes(q)
        const matchesDriver = b.driverName.toLowerCase().includes(q)
        const matchesGps = b.gpsDevice.toLowerCase().includes(q)
        if (!matchesCode && !matchesReg && !matchesDriver && !matchesGps) return false
      }
      return true
    })
  }, [s.buses, filterAllocation, search])

  // Open Allocate Modal
  const openAllocateModal = (bus: Bus) => {
    setAllocateBus(bus)
    const currentDriver = drivers.find((d) => d.busCode === bus.busCode)
    setSelectedDriverId(currentDriver ? currentDriver.id : '')
    setAllocateReason('')
    setAllocateError('')
  }

  // Handle Add Bus Submit
  const handleAddBus = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')

    const code = newCode.trim().toUpperCase()
    const reg = newReg.trim().toUpperCase()
    const capacity = Number(newCapacity)

    if (!code) {
      setAddError('Bus code is required (e.g. VB-09).')
      return
    }
    if (s.buses.some((b) => b.busCode.toUpperCase() === code)) {
      setAddError(`Bus code ${code} is already registered.`)
      return
    }
    if (!reg) {
      setAddError('Registration number is required (e.g. KA-19-F-9901).')
      return
    }
    if (s.buses.some((b) => b.registration.toUpperCase() === reg)) {
      setAddError(`Registration number ${reg} is already in the fleet.`)
      return
    }
    if (isNaN(capacity) || capacity <= 0) {
      setAddError('Tank capacity must be a positive number in litres.')
      return
    }

    setAddBusy(true)
    try {
      await createBus({
        busCode: code,
        registration: reg,
        tankLitres: capacity,
        fuelType: newFuelType,
        driverId: newDriverId || undefined,
        gpsDevice: newGps || `GPS-${code}`,
      })
      setAddModalOpen(false)
      setNewCode('')
      setNewReg('')
      setNewCapacity('180')
      setNewGps('')
      setNewDriverId('')
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Failed to create bus. Please try again.')
    } finally {
      setAddBusy(false)
    }
  }

  // Handle Allocate Submit
  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allocateBus) return
    setAllocateError('')

    setAllocateBusy(true)
    try {
      await allocateBusDriver({
        busCode: allocateBus.busCode,
        driverId: selectedDriverId || null,
        reason: allocateReason.trim() || 'Admin fleet reallocation',
      })
      setAllocateBus(null)
    } catch (error) {
      setAllocateError(error instanceof Error ? error.message : 'Failed to allocate driver. Please try again.')
    } finally {
      setAllocateBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">
              Bus Fleet & Driver Allocation
            </h1>
            <Chip tone="teal">Protected</Chip>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Register new vehicles, configure fuel tank thresholds, and allocate drivers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => setAddModalOpen(true)}>
            <PlusCircle size={16} /> + Add New Bus
          </Button>
        </div>
      </div>

      {/* Fleet KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Fleet Buses</span>
            <BusIcon size={16} className="text-navy-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-navy-900">{totalBuses}</div>
          <div className="mt-0.5 text-xs text-slate-400">All registered buses</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Allocated Buses</span>
            <UserCheck size={16} className="text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700">{allocatedBuses}</div>
          <div className="mt-0.5 text-xs text-teal-600 font-medium">
            {totalBuses > 0 ? Math.round((allocatedBuses / totalBuses) * 100) : 0}% coverage
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Unallocated Buses</span>
            <UserX size={16} className="text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{unallocatedBuses}</div>
          <div className="mt-0.5 text-xs text-slate-400">Requires driver allocation</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Tank Capacity</span>
            <Droplets size={16} className="text-primary-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-navy-900">{totalCapacity} L</div>
          <div className="mt-0.5 text-xs text-slate-400">Across entire fleet</div>
        </Card>
      </div>

      {/* Controls: Search & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1">
          {(
            [
              { key: 'all', label: `All Buses (${totalBuses})` },
              { key: 'allocated', label: `Allocated (${allocatedBuses})` },
              { key: 'unallocated', label: `Unallocated (${unallocatedBuses})` },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterAllocation(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterAllocation === f.key
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search code, reg no, driver, GPS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} w-64 pl-8 text-xs`}
          />
        </div>
      </div>

      {/* Fleet Table */}
      <Card>
        {filteredBuses.length === 0 ? (
          <EmptyState
            icon={<BusIcon size={28} />}
            title="No buses match your filter"
            description="Adjust your search query or add a new bus to the fleet."
          />
        ) : (
          <DataTable
            rows={filteredBuses}
            columns={[
              {
                key: 'bus',
                label: 'Bus Code & Registration',
                render: (b) => (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-navy-800">
                      <BusIcon size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-navy-900">{b.busCode}</div>
                      <div className="font-mono text-xs text-slate-500">{b.registration}</div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'capacity',
                label: 'Tank Capacity',
                render: (b) => (
                  <div className="text-xs">
                    <span className="font-bold text-navy-900">{b.tankLitres} Litres</span>
                    <span className="block text-slate-400 capitalize">{b.fuelType}</span>
                  </div>
                ),
              },
              {
                key: 'driver',
                label: 'Allocated Driver',
                render: (b) => {
                  const driver = drivers.find((d) => d.busCode === b.busCode)
                  if (!driver) {
                    return (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        Unallocated
                      </span>
                    )
                  }
                  return (
                    <div>
                      <div className="text-xs font-semibold text-navy-900">{driver.name}</div>
                      <div className="text-[11px] text-slate-500">
                        @{driver.username} {driver.phone && `· ${driver.phone}`}
                      </div>
                    </div>
                  )
                },
              },
              {
                key: 'gps',
                label: 'GPS Telemetry Device',
                render: (b) => (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Navigation size={13} className="text-primary-600" />
                    <span className="font-mono">{b.gpsDevice}</span>
                  </div>
                ),
              },
              {
                key: 'status',
                label: 'Allocation Status',
                render: (b) => {
                  const isAssigned = b.driverName && b.driverName !== 'Unassigned'
                  return (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isAssigned
                          ? 'bg-teal-50 text-teal-700 border border-teal-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isAssigned ? 'bg-teal-500' : 'bg-amber-500'}`} />
                      {isAssigned ? 'Assigned' : 'Unallocated'}
                    </span>
                  )
                },
              },
              {
                key: 'action',
                label: 'Action',
                render: (b) => (
                  <Button size="sm" variant="secondary" onClick={() => openAllocateModal(b)}>
                    <UserCheck size={13} /> Allocate Driver
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* MODAL: ADD BUS */}
      {addModalOpen && (
        <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Register New Fleet Bus">
          <form onSubmit={handleAddBus} className="space-y-4">
            <p className="text-xs text-slate-500">
              Add a new bus to FuelGuard. The vehicle will immediately be available for driver allocation and fuel log reconciliation.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Bus Code" htmlFor="new-bus-code" hint="Unique fleet code" required>
                <input
                  id="new-bus-code"
                  type="text"
                  placeholder="e.g. VB-09"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  className={`${inputCls} font-mono`}
                  required
                />
              </Field>

              <Field label="Registration Number" htmlFor="new-bus-reg" hint="RTO Vehicle Plate" required>
                <input
                  id="new-bus-reg"
                  type="text"
                  placeholder="e.g. KA-19-F-9901"
                  value={newReg}
                  onChange={(e) => setNewReg(e.target.value.toUpperCase())}
                  className={`${inputCls} font-mono`}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fuel Tank Capacity (Litres)" htmlFor="new-bus-capacity" hint="Maximum fuel capacity" required>
                <input
                  id="new-bus-capacity"
                  type="number"
                  min="50"
                  max="500"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  className={inputCls}
                  required
                />
              </Field>

              <Field label="Fuel Type" htmlFor="new-bus-fuel">
                <select
                  id="new-bus-fuel"
                  value={newFuelType}
                  onChange={(e) => setNewFuelType(e.target.value as 'diesel' | 'petrol' | 'cng')}
                  className={inputCls}
                >
                  <option value="diesel">Diesel</option>
                  <option value="petrol">Petrol</option>
                  <option value="cng">CNG</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="GPS Device Identifier" htmlFor="new-bus-gps" hint="Telemetry device ID">
                <input
                  id="new-bus-gps"
                  type="text"
                  placeholder={`GPS-${newCode || 'VB-XX'}`}
                  value={newGps}
                  onChange={(e) => setNewGps(e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Initial Driver Allocation (Optional)" htmlFor="new-bus-driver">
                <select
                  id="new-bus-driver"
                  value={newDriverId}
                  onChange={(e) => setNewDriverId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- Leave Unallocated --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (@{d.username}) {d.busCode ? `[Current: ${d.busCode}]` : '[Unassigned]'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {addError && <Banner tone="danger" title={addError} />}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={addBusy}>
                {addBusy ? 'Registering Bus…' : 'Register Bus'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: ALLOCATE DRIVER */}
      {allocateBus && (
        <Modal
          open={!!allocateBus}
          onClose={() => setAllocateBus(null)}
          title={`Allocate Driver: Bus ${allocateBus.busCode} (${allocateBus.registration})`}
        >
          <form onSubmit={handleAllocate} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-navy-900">{allocateBus.busCode}</span>
                <span className="font-mono text-slate-600">{allocateBus.registration}</span>
              </div>
              <div className="mt-1 text-slate-500">
                Capacity: {allocateBus.tankLitres}L · Current Driver: {allocateBus.driverName}
              </div>
            </div>

            <Field label="Select Driver" htmlFor="allocate-driver" hint="Assign an official driver to this vehicle" required>
              <select
                id="allocate-driver"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className={inputCls}
              >
                <option value="">-- No Driver (Mark Unallocated) --</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (@{d.username}) {d.busCode ? `— currently assigned to ${d.busCode}` : '— [Unassigned]'}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Mandatory Reason / Note"
              htmlFor="allocate-reason"
              hint="Required for audit and fleet dispatch compliance"
              required
            >
              <textarea
                id="allocate-reason"
                rows={2}
                value={allocateReason}
                onChange={(e) => setAllocateReason(e.target.value)}
                placeholder="e.g. Regular driver rotation / Route schedule adjustment"
                className={inputCls}
                required
              />
            </Field>

            {allocateError && <Banner tone="danger" title={allocateError} />}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAllocateBus(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={allocateBusy}>
                {allocateBusy ? 'Saving Allocation…' : 'Confirm Allocation'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
