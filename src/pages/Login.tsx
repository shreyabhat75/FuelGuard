import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Fuel as FuelIcon,
  HelpCircle,
  KeyRound,
  Lock,
  LogIn,
  Receipt,
  ShieldCheck,
  User as UserIcon,
  Users,
} from 'lucide-react'
import { authenticate, currentUser } from '../services/api'
import { useAppState } from '../services/store'
import { Banner, Button, Card, Chip, Field, Modal, inputCls } from '../components/ui'
import { Brand } from '../components/layouts'
import { API_MODE, API_URL, checkApiHealth } from '../services/rest'

interface InstitutionalAccount {
  role: string
  name: string
  username: string
  password: string
  description: string
  badgeTone: 'violet' | 'blue' | 'teal' | 'amber' | 'slate'
}

const INSTITUTIONAL_ACCOUNTS: InstitutionalAccount[] = [
  {
    role: 'Administrator',
    name: 'System Admin',
    username: 'admin',
    password: 'demo123',
    description: 'Credential authority, user provisioning, bus allocations & security',
    badgeTone: 'violet',
  },
  {
    role: 'Transport Manager',
    name: 'Ravi S',
    username: 'manager',
    password: 'demo123',
    description: 'Fleet oversight, km/L efficiency, fuel logs & flag investigations',
    badgeTone: 'blue',
  },
  {
    role: 'Accountant',
    name: 'Lakshmi Devi',
    username: 'accountant',
    password: 'demo123',
    description: 'Financial matching, pump statement reconciliation & invoice variance',
    badgeTone: 'teal',
  },
  {
    role: 'Principal',
    name: 'Dr. Suresh Rao',
    username: 'principal',
    password: 'demo123',
    description: 'Executive governance, exception approvals & maker-checker enforcement',
    badgeTone: 'amber',
  },
  {
    role: 'Driver',
    name: 'Hanumanthappa G',
    username: 'driver',
    password: 'demo123',
    description: 'Mobile fuel entry wizard, bus QR scanner & odometer photo capture (VB-07)',
    badgeTone: 'slate',
  },
]

export default function Login() {
  const s = useAppState()
  const user = currentUser(s)
  const nav = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [forgotModalOpen, setForgotModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [apiStatus, setApiStatus] = useState<'checking' | 'ready' | 'error'>(API_MODE ? 'checking' : 'ready')

  useEffect(() => {
    if (!API_MODE) return
    let active = true
    checkApiHealth()
      .then(() => {
        if (active) setApiStatus('ready')
      })
      .catch(() => {
        if (active) setApiStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  if (user) return <Navigate to={user.role === 'driver' ? '/driver' : '/app'} replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')

    if (!username.trim()) {
      setErr('Please enter your institutional username.')
      return
    }
    if (!password) {
      setErr('Please enter your account password.')
      return
    }

    setBusy(true)
    try {
      const authenticatedUser = await authenticate(username, password)
      nav(authenticatedUser.role === 'driver' ? '/driver' : '/app')
    } catch (error: unknown) {
      if (error instanceof Error) {
        setErr(error.message)
      } else {
        setErr('Authentication failed. Please verify your credentials.')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleFillCredentials = (acc: InstitutionalAccount) => {
    setUsername(acc.username)
    setPassword(acc.password)
    setErr('')
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      {/* Left Brand Panel */}
      <div className="flex flex-col justify-between bg-navy-950 px-6 py-10 text-white lg:w-[44%] lg:px-12 lg:py-14">
        <div>
          <Brand dark />
          <div className="mt-12">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-400">
              <ShieldCheck size={14} /> Institutional Security System
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3.5xl sm:leading-tight">
              Enterprise Fleet Fuel Governance & Anomaly Detection
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Comprehensive platform for bus fleet fuel monitoring, automated pump statement reconciliation, and cryptographic audit security.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                  <FuelIcon size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Automated Rate & Tank Verification</div>
                  <div className="text-xs text-slate-400">
                    Validates fuel fills against published daily diesel benchmarks and bus tank thresholds.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                  <Receipt size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Automated Statement Reconciliation</div>
                  <div className="text-xs text-slate-400">
                    Matches petrol pump credit billing lines against digital driver register entries to the rupee.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                  <Users size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Role-Based Zero-Trust Architecture</div>
                  <div className="text-xs text-slate-400">
                    Tailored, segregated portals for Drivers, Transport Managers, Accountants, and Principals.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Immutable Audit Logging</div>
                  <div className="text-xs text-slate-400">
                    Every transaction, review note, and credential adjustment is cryptographically recorded.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-slate-800 pt-6 text-[11px] text-slate-500">
          FuelGuard Fleet Infrastructure · Protected by Institutional RBAC Governance
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md space-y-4">
          <Card className="p-7 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white">
                <Lock size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-navy-900">Sign In to FuelGuard</h2>
                <p className="text-xs text-slate-500">
                  Enter your institutional credentials to access your fleet portal
                </p>
              </div>
            </div>

            {API_MODE && apiStatus === 'checking' && (
              <div className="mt-4">
                <Banner tone="info" title="Connecting to the live API">
                  A sleeping Render service can take a few seconds to wake up.
                </Banner>
              </div>
            )}
            {API_MODE && apiStatus === 'ready' && (
              <div className="mt-4">
                <Banner tone="success" title="Live API connected">
                  Requests are using <span className="break-all">{API_URL}</span>.
                </Banner>
              </div>
            )}
            {API_MODE && apiStatus === 'error' && (
              <div className="mt-4">
                <Banner tone="warning" title="The API is still waking up">
                  Sign in normally; temporary Render errors are retried automatically.
                </Banner>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field label="Username" htmlFor="username" hint="Institutional account identifier" required>
                <div className="relative">
                  <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`${inputCls} pl-9 font-mono text-sm`}
                    required
                  />
                </div>
              </Field>

              <Field label="Password" htmlFor="password" hint="Case-sensitive account password" required>
                <div className="relative flex items-center">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pl-9 pr-10 font-mono text-sm`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              {/* Options Row */}
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span>Remember this device</span>
                </label>

                <button
                  type="button"
                  onClick={() => setForgotModalOpen(true)}
                  className="font-medium text-primary-600 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {err && <Banner tone="danger" title={err} />}

              <Button type="submit" size="lg" className="w-full justify-center" disabled={busy}>
                {busy ? (
                  'Authenticating…'
                ) : (
                  <>
                    <LogIn size={18} /> Sign In
                  </>
                )}
              </Button>
            </form>

            {/* Quick Access Directory Accordion */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setDirectoryOpen(!directoryOpen)}
                className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Users size={14} className="text-navy-700" />
                  Institutional Access Directory
                </span>
                {directoryOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {directoryOpen && (
                <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-medium text-slate-500 mb-2">
                    Click any account to populate credentials:
                  </div>
                  <div className="divide-y divide-slate-100">
                    {INSTITUTIONAL_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.username}
                        type="button"
                        onClick={() => handleFillCredentials(acc)}
                        className="flex w-full items-center justify-between py-2 text-left hover:bg-slate-50 px-1 rounded transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-navy-900">{acc.name}</span>
                            <Chip tone={acc.badgeTone}>{acc.role}</Chip>
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            Username: <strong className="text-navy-800">@{acc.username}</strong> · Password: <span className="font-mono">{acc.password}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{acc.description}</div>
                        </div>
                        <ArrowRight size={13} className="text-slate-400 shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <p className="text-center text-xs text-slate-400">
            FuelGuard Platform v1.0 · Protected by Zero-Trust Role-Based Access Control
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <Modal
          open={forgotModalOpen}
          onClose={() => setForgotModalOpen(false)}
          title="Institutional Credential Support"
        >
          <div className="space-y-4 text-sm text-slate-600">
            <div className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3 text-primary-900">
              <HelpCircle size={24} className="text-primary-600 shrink-0" />
              <div className="text-xs">
                In FuelGuard, password security and account provisioning are centrally governed by the <strong>System Administrator</strong> to ensure organizational integrity.
              </div>
            </div>

            <p className="text-xs leading-relaxed">
              To request a password reset or recover account access:
            </p>
            <ol className="list-decimal pl-5 text-xs space-y-1.5 text-slate-600">
              <li>Contact your institution’s Fleet Administrator (<strong>@admin</strong>).</li>
              <li>The Administrator will verify your identity and generate a new secure password.</li>
              <li>Your credential update will be recorded in the security audit logs for compliance.</li>
            </ol>

            <div className="pt-2 text-right">
              <Button variant="primary" onClick={() => setForgotModalOpen(false)}>
                Understood
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
