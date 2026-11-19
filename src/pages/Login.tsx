import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Fuel as FuelIcon, LogIn, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import { currentUser, login } from '../services/api'
import { useAppState, users } from '../services/store'
import { Banner, Button, Card, Field, inputCls } from '../components/ui'
import { Brand } from '../components/layouts'
import type { Role } from '../types'

const roleDemo: { role: Role; label: string; desc: string }[] = [
  { role: 'driver', label: 'Driver — fuel entry', desc: 'Hanumanthappa G · bus VB-07' },
  { role: 'transport_manager', label: 'Transport Manager', desc: 'Ravi S · all buses, flags, QR' },
  { role: 'accountant', label: 'Accountant', desc: 'Lakshmi Devi · pump statement' },
  { role: 'principal', label: 'Principal / Approver', desc: 'Dr. Suresh Rao · approvals' },
  { role: 'admin', label: 'Administrator — Security & Auth', desc: 'Anand Kumar · credentials, buses & protection' },
]

export default function Login() {
  const s = useAppState()
  const user = currentUser(s)
  const nav = useNavigate()
  const [roleIdx, setRoleIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (user) return <Navigate to={user.role === 'driver' ? '/driver' : '/app'} replace />

  const selected = users.find((u) => u.role === roleDemo[roleIdx].role)!

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await login(selected.id)
      nav(selected.role === 'driver' ? '/driver' : '/app')
    } catch {
      setErr('Demo sign-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 lg:flex-row">
      {/* left / top brand panel */}
      <div className="flex flex-col justify-between bg-navy-900 px-6 py-10 text-white lg:w-[42%] lg:px-12 lg:py-12">
        <Brand dark />
        <div className="mt-10 lg:mt-0">
          <h1 className="text-2xl font-bold sm:text-3xl">
            Replace the paper fuel register.
            <span className="block text-primary-300">Make suspicious fills visible — together with the evidence.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
            Diesel fills for the college’s 8 buses are compared against the pump statement, the
            published price and GPS data. Anything unusual is saved and marked <strong>Needs
            review</strong> — never “fraud confirmed”. Humans decide.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-teal-400" /> Every correction keeps the original value</li>
            <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-teal-400" /> Works offline; drafts sync when back online</li>
            <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-teal-400" /> Audit trail for every view, note and decision</li>
            <li className="flex items-center gap-2"><FuelIcon size={16} className="text-teal-400" /> 8 buses, 112 register fills, 82 pump lines (synthetic)</li>
          </ul>
        </div>
        <p className="mt-10 text-[11px] text-slate-500">
          ArtIntele internship project · synthetic dataset (fictional college, buses and people)
        </p>
      </div>

      {/* right form */}
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <Card className="w-full max-w-md p-6">
          <h2 className="text-lg font-bold text-navy-900">Demo sign-in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick a role, then press sign in. Mock authentication for the prototype.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-navy-800">Demo role</legend>
              <div className="space-y-2" role="radiogroup" aria-label="Demo role">
                {roleDemo.map((r, i) => (
                  <button
                    type="button"
                    key={r.role}
                    role="radio"
                    aria-checked={roleIdx === i}
                    onClick={() => setRoleIdx(i)}
                    className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                      roleIdx === i ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-slate-300 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-navy-900">{r.label}</span>
                      <span className="block text-xs text-slate-500">{r.desc}</span>
                    </span>
                    <span
                      className={`h-4 w-4 rounded-full border-2 ${roleIdx === i ? 'border-primary-600 bg-primary-600' : 'border-slate-300'}`}
                      aria-hidden
                    />
                  </button>
                ))}
              </div>
            </fieldset>

            <Field label="Username" htmlFor="username" required>
              <input id="username" className={inputCls} value={selected.username} readOnly />
            </Field>
            <Field label="Password" htmlFor="password" hint="Any value works in the demo." required>
              <input id="password" type="password" className={inputCls} defaultValue="demo" autoComplete="off" />
            </Field>

            {err && <Banner tone="danger" title={err} />}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : <><LogIn size={18} /> Sign in</>}
            </Button>
            <p className="text-center text-xs text-slate-400">
              Prototype only: no password check, no server. <span className="inline-flex items-center gap-1"><Wifi size={12} />/ <WifiOff size={12} /> offline toggle lives in the driver app.</span>
            </p>
          </form>
        </Card>
      </div>
    </div>
  )
}
