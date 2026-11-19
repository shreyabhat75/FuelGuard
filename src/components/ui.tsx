import React from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

/* --------------------------------- Button -------------------------------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type BtnSize = 'sm' | 'md' | 'lg'

const btnStyles: Record<BtnVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:bg-primary-300',
  secondary:
    'bg-white text-navy-800 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  ghost: 'bg-transparent text-primary-700 hover:bg-primary-50 active:bg-primary-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300',
  success: 'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 disabled:bg-teal-300',
}

const btnSizes: Record<BtnSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-14 px-6 text-base gap-2.5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${btnStyles[variant]} ${btnSizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ---------------------------------- Chip --------------------------------- */

export type ChipTone = 'teal' | 'amber' | 'red' | 'blue' | 'slate' | 'violet'

const chipTones: Record<ChipTone, string> = {
  teal: 'bg-teal-50 text-teal-800 border-teal-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-primary-50 text-primary-700 border-primary-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
}

export function Chip({
  tone = 'slate',
  children,
  className = '',
}: {
  tone?: ChipTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${chipTones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

const statusTone: Record<string, ChipTone> = {
  saved: 'teal',
  needs_review: 'amber',
  pending_sync: 'blue',
  matched: 'teal',
  amount_mismatch: 'amber',
  rate_mismatch: 'amber',
  unmatched_pump_bill: 'red',
  register_missing: 'amber',
  possible_duplicate: 'amber',
  pending: 'blue',
  approved: 'teal',
  rejected: 'red',
  info_requested: 'blue',
  under_review: 'amber',
  awaiting_evidence: 'violet',
  escalated: 'violet',
  resolved: 'teal',
  high: 'red',
  medium: 'amber',
  low: 'slate',
}

const statusLabel: Record<string, string> = {
  saved: 'Saved',
  needs_review: 'Needs review',
  pending_sync: 'Pending sync',
  matched: 'Matched',
  amount_mismatch: 'Amount mismatch',
  rate_mismatch: 'Rate mismatch',
  unmatched_pump_bill: 'Unmatched pump bill',
  register_missing: 'Register entry missing',
  possible_duplicate: 'Possible duplicate',
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  info_requested: 'Info requested',
  under_review: 'Under review',
  awaiting_evidence: 'Awaiting evidence',
  escalated: 'Escalated',
  resolved: 'Resolved',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: '—',
  resolved_note: 'Resolved',
  needs_supplier_clarification: 'Needs supplier clarification',
  authorised_exception: 'Authorised exception',
}

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const label = statusLabel[status] ?? status
  return (
    <Chip tone={statusTone[status] ?? 'slate'} className={className}>
      {statusTone[status] === 'amber' && <AlertTriangle size={12} aria-hidden />}
      {label}
    </Chip>
  )
}

/* ---------------------------------- Card --------------------------------- */

export function Card({
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-card ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <div>
        <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/* --------------------------------- Fields -------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  htmlFor?: string
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-navy-800">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600" role="alert">
          <AlertTriangle size={13} aria-hidden /> {error}
        </p>
      )}
    </div>
  )
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-navy-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200'

export function Banner({
  tone,
  title,
  children,
  icon,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success'
  title: string
  children?: React.ReactNode
  icon?: React.ReactNode
}) {
  const tones = {
    info: 'border-primary-200 bg-primary-50 text-navy-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-teal-200 bg-teal-50 text-teal-900',
  }
  const icons = {
    info: <Info size={16} className="mt-0.5 shrink-0 text-primary-600" aria-hidden />,
    warning: <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />,
    danger: <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" aria-hidden />,
    success: <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-600" aria-hidden />,
  }
  return (
    <div className={`flex gap-2.5 rounded-lg border p-3 text-sm ${tones[tone]}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {icon ?? icons[tone]}
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-[13px] leading-relaxed">{children}</div>}
      </div>
    </div>
  )
}

/* --------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${maxWidth} rounded-t-2xl bg-white shadow-pop sm:rounded-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/* ------------------------------- Empty state ------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">{icon}</div>}
      <p className="text-sm font-semibold text-navy-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export function KpiCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'amber' | 'red' | 'blue'
  icon?: React.ReactNode
}) {
  const ring = tone === 'amber' ? 'border-amber-200 bg-amber-50/60' : tone === 'red' ? 'border-red-200 bg-red-50/60' : tone === 'blue' ? 'border-primary-200 bg-primary-50/60' : 'border-slate-200 bg-white'
  return (
    <Card className={`p-4 ${ring}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold tnum text-navy-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  )
}

/** Responsive table: real table on md+, stacked cards on small screens. */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  empty,
}: {
  columns: { key: string; label: string; render: (row: T) => React.ReactNode; className?: string }[]
  rows: T[]
  onRowClick?: (row: T) => void
  empty?: React.ReactNode
}) {
  if (rows.length === 0 && empty) return <>{empty}</>
  return (
    <>
      {/* desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-2.5 font-semibold ${c.className ?? ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onRowClick?.(r)}
                className={`border-b border-slate-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-primary-50/50' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* mobile cards */}
      <div className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => onRowClick?.(r)}
            className="block w-full px-4 py-3 text-left active:bg-slate-50"
          >
            {columns.map((c, i) => (
              <div key={c.key} className={`flex items-start justify-between gap-3 py-1 ${i === 0 ? 'pb-1.5' : ''}`}>
                <span className="text-xs text-slate-500">{c.label}</span>
                <span className="text-right text-sm">{c.render(r)}</span>
              </div>
            ))}
          </button>
        ))}
      </div>
    </>
  )
}
