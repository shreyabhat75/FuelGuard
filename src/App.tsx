import React from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { OfficeLayout, DriverLayout } from './components/layouts'
import { currentUser } from './services/api'
import { useAppState } from './services/store'
import type { Role } from './types'
import Login from './pages/Login'
import DriverHome from './pages/driver/DriverHome'
import EntryWizard from './pages/driver/EntryWizard'
import DriverEntries from './pages/driver/DriverEntries'
import Dashboard from './pages/office/Dashboard'
import EntriesPage from './pages/office/EntriesPage'
import EntryDetailPage from './pages/office/EntryDetailPage'
import FlaggedPage from './pages/office/FlaggedPage'
import FlagDetailPage from './pages/office/FlagDetailPage'
import ReconciliationPage from './pages/office/ReconciliationPage'
import ApprovalsPage from './pages/office/ApprovalsPage'
import BusesPage from './pages/office/BusesPage'
import BusDetailPage from './pages/office/BusDetailPage'
import AuditPage from './pages/office/AuditPage'
import { Card, EmptyState } from './components/ui'
import { ShieldAlert } from 'lucide-react'

function homeFor(role: Role | undefined) {
  if (role === 'driver') return '/driver'
  if (role) return '/app'
  return '/login'
}

/** Prototype-only guard. Production must enforce the same rules server-side. */
function Guard({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const s = useAppState()
  const user = currentUser(s)
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!allow.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md p-2">
          <EmptyState
            icon={<ShieldAlert size={24} />}
            title="This screen is not available for your demo role"
            description={`Signed in as ${user.name}. ${user.role === 'driver' ? 'Drivers see the fuel-entry app only.' : 'Use the sidebar to reach the screens assigned to your role.'}`}
          />
        </Card>
      </div>
    )
  }
  return <>{children}</>
}

function RootRedirect() {
  const s = useAppState()
  const user = currentUser(s)
  return <Navigate to={homeFor(user?.role)} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/driver"
          element={
            <Guard allow={['driver']}>
              <DriverLayout>
                <DriverHome />
              </DriverLayout>
            </Guard>
          }
        />
        <Route
          path="/driver/entry"
          element={
            <Guard allow={['driver', 'transport_manager']}>
              <DriverLayout>
                <EntryWizard />
              </DriverLayout>
            </Guard>
          }
        />
        <Route
          path="/driver/entries"
          element={
            <Guard allow={['driver', 'transport_manager']}>
              <DriverLayout>
                <DriverEntries />
              </DriverLayout>
            </Guard>
          }
        />
        <Route
          path="/driver/entries/:entryId"
          element={
            <Guard allow={['driver', 'transport_manager']}>
              <DriverLayout>
                <EntryDetailPage />
              </DriverLayout>
            </Guard>
          }
        />

        <Route
          path="/app"
          element={
            <Guard allow={['transport_manager', 'accountant', 'principal']}>
              <OfficeLayout />
            </Guard>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="entries" element={<EntriesPage />} />
          <Route path="entries/:entryId" element={<EntryDetailPage />} />
          <Route path="flagged" element={<FlaggedPage />} />
          <Route path="flagged/:flagId" element={<FlagDetailPage />} />
          <Route
            path="reconciliation"
            element={
              <Guard allow={['accountant', 'transport_manager']}>
                <ReconciliationPage />
              </Guard>
            }
          />
          <Route
            path="approvals"
            element={
              <Guard allow={['principal']}>
                <ApprovalsPage />
              </Guard>
            }
          />
          <Route
            path="buses"
            element={
              <Guard allow={['transport_manager']}>
                <BusesPage />
              </Guard>
            }
          />
          <Route
            path="buses/:busCode"
            element={
              <Guard allow={['transport_manager']}>
                <BusDetailPage />
              </Guard>
            }
          />
          <Route path="audit" element={<AuditPage />} />
        </Route>

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  )
}
