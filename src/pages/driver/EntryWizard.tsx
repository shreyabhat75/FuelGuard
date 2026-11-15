import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, MapPin, Camera, ClipboardCheck, Search, CircleCheckBig } from 'lucide-react'
import type { GeoPoint, PaidBy, PaymentMode, PhotoAttachment, User } from '../../types'
import { currentUser } from '../../services/api'
import { useAppState } from '../../services/store'
import { useI18n } from '../../i18n'
import { saveFuelEntry, type SaveResult } from '../../services/api'
import Step1Bus from './steps/Step1Bus'
import Step2Fill from './steps/Step2Fill'
import Step3Evidence from './steps/Step3Evidence'
import Step4Review from './steps/Step4Review'
import Step5Done from './steps/Step5Done'

export interface LocationState {
  status: 'idle' | 'checking' | 'granted' | 'denied' | 'unavailable'
  coords?: GeoPoint
}

export interface Draft {
  busId?: string
  busVia?: 'qr' | 'manual'
  busChangedFrom?: string
  activityNotes: string[]
  litres: string
  amount: string
  fuelType: 'diesel' | 'petrol' | 'cng'
  odometer: string
  paidBy: PaidBy
  paymentMode: PaymentMode
  pump: string
  billNo: string
  odometerPhoto?: PhotoAttachment
  odometerPhotoException?: boolean
  receiptPhoto?: PhotoAttachment
  location: LocationState
  confirmed: boolean
}

const emptyDraft: Draft = {
  activityNotes: [],
  litres: '',
  amount: '',
  fuelType: 'diesel',
  odometer: '',
  paidBy: 'driver',
  paymentMode: 'credit_account',
  pump: 'Shree Lakshmi Fuels',
  billNo: '',
  location: { status: 'idle' },
  confirmed: false,
}

export const stepMeta = [
  { key: 'bus', label: 'Bus', icon: <Search size={14} /> },
  { key: 'fill', label: 'Fill details', icon: <CircleCheckBig size={14} /> },
  { key: 'evidence', label: 'Photos', icon: <Camera size={14} /> },
  { key: 'review', label: 'Review', icon: <ClipboardCheck size={14} /> },
  { key: 'done', label: 'Saved', icon: <MapPin size={14} /> },
]

const stepMetaKn = ['ಬಸ್', 'ಭರ್ತಿ', 'ಫೋಟೊ', 'ಪರಿಶೀಲನೆ', 'ಉಳಿಸಿದ']

export default function EntryWizard() {
  const s = useAppState()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const user = currentUser(s) as User
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  const canContinue = useMemo(() => {
    switch (step) {
      case 0:
        return Boolean(draft.busId && draft.confirmed)
      case 1: {
        const litres = Number(draft.litres)
        const amount = Number(draft.amount)
        const odo = Number(draft.odometer)
        return litres > 0 && amount > 0 && draft.odometer !== '' && odo >= 0
      }
      case 2:
        return Boolean(draft.odometerPhoto || draft.odometerPhotoException)
      case 3:
        return draft.confirmed
      default:
        return false
    }
  }, [step, draft])

  const onSave = async () => {
    if (!draft.busId || !user) return
    setSaving(true)
    try {
      const res = await saveFuelEntry(
        {
          busId: draft.busId,
          timestampClient: new Date().toISOString(),
          litres: Number(draft.litres),
          amount: Number(draft.amount),
          fuelType: draft.fuelType,
          odometerKm: Number(draft.odometer),
          paidBy: draft.paidBy,
          paymentMode: draft.paymentMode,
          pumpName: draft.pump,
          billNo: draft.billNo.trim() || undefined,
          odometerPhoto: draft.odometerPhoto,
          receiptPhoto: draft.receiptPhoto,
          location:
            draft.location.status === 'granted' && draft.location.coords
              ? draft.location.coords
              : null,
          locationNote:
            draft.location.status === 'granted' ? undefined : draft.location.status === 'denied' ? 'denied' : 'unavailable',
          createdBy: user.id,
          createdByName: user.name,
          activityNotes: draft.activityNotes,
        },
        { offline: !s.online },
      )
      setResult(res)
      setStep(4)
    } finally {
      setSaving(false)
    }
  }

  const onBack = () => {
    if (step === 0) nav('/driver')
    else setStep((st) => Math.max(0, st - 1))
  }

  const onContinue = () => {
    if (step === 3) {
      onSave()
    } else {
      setStep((st) => Math.min(4, st + 1))
    }
  }

  const resetAll = () => {
    setDraft(emptyDraft)
    setResult(null)
    setStep(0)
  }

  const labels = lang === 'kn' ? stepMetaKn : stepMeta.map((m) => m.label)

  if (step === 4 && result) {
    return (
      <Step5Done
        result={result}
        offline={!s.online}
        onViewEntry={() => nav(`/app/entries/${result.entry.id}`)}
        onRecordAnother={resetAll}
      />
    )
  }

  return (
    <div className="px-4 py-5">
      {/* progress */}
      <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1}>
        {stepMeta.map((m, i) => (
          <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`flex h-8 w-full items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i === step
                  ? 'bg-primary-600 text-white'
                  : i < step
                    ? 'bg-teal-100 text-teal-700'
                    : 'bg-slate-200 text-slate-400'
              }`}
            >
              {i < step ? <Check size={14} /> : m.icon}
            </div>
            <span className={`text-[10px] font-medium ${i === step ? 'text-navy-900' : 'text-slate-400'}`}>
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">
        {t('step')} {step + 1} {t('of')} 5 — {labels[step]}
      </p>

      <div className="mt-4">
        {step === 0 && <Step1Bus draft={draft} patch={patch} />}
        {step === 1 && <Step2Fill draft={draft} patch={patch} />}
        {step === 2 && <Step3Evidence draft={draft} patch={patch} />}
        {step === 3 && <Step4Review draft={draft} patch={patch} online={s.online} user={user} />}
      </div>

      {/* controls */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-navy-800 active:bg-slate-100"
        >
          <ArrowLeft size={16} /> {t('back')}
        </button>
        {step < 4 && (
          <button
            onClick={onContinue}
            disabled={!canContinue || saving}
            className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary-600 text-sm font-bold text-white shadow-card transition-colors active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? (
              'Saving…'
            ) : step === 3 ? (
              <>{t('save')} <ArrowRight size={16} /></>
            ) : (
              <>{t('continue')} <ArrowRight size={16} /></>
            )}
          </button>
        )}
      </div>
      {step === 2 && !canContinue && (
        <p className="mt-2 text-center text-xs text-slate-500">
          {draft.odometerPhoto || draft.odometerPhotoException
            ? ''
            : 'An odometer photo is required — or tick the exception box with a reason.'}
        </p>
      )}
    </div>
  )
}
