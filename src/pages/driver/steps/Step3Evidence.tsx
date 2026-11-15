import { useState } from 'react'
import { Camera, ImageUp, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import type { PhotoAttachment } from '../../../types'
import type { Draft } from '../EntryWizard'
import { Banner, Field } from '../../../components/ui'

type UploadStatus = 'idle' | 'uploading' | 'error'

function demoPhoto(kind: 'odometer' | 'receipt'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420">
    <rect width="640" height="420" fill="#0f2440"/>
    <rect x="20" y="20" width="600" height="380" rx="16" fill="#16324f"/>
    <text x="320" y="120" font-family="monospace" font-size="30" fill="#7dd3fc" text-anchor="middle">DEMO ${kind.toUpperCase()} PHOTO</text>
    <text x="320" y="170" font-family="monospace" font-size="22" fill="#e2e8f0" text-anchor="middle">${kind === 'odometer' ? 'ODO 62788 km' : 'BILL SLF/71251'}</text>
    <text x="320" y="230" font-family="monospace" font-size="20" fill="#94a3b8" text-anchor="middle">Simulated camera image</text>
    <text x="320" y="260" font-family="monospace" font-size="16" fill="#64748b" text-anchor="middle">(prototype placeholder)</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function AttachmentBlock({
  kind,
  label,
  hint,
  attachment,
  onSet,
  onRemove,
}: {
  kind: 'odometer' | 'receipt'
  label: string
  hint?: string
  attachment?: PhotoAttachment
  onSet: (a: PhotoAttachment) => void
  onRemove: () => void
}) {
  const [status, setStatus] = useState<UploadStatus>('idle')

  const finish = (a: Omit<PhotoAttachment, 'status'>) => {
    setStatus('uploading')
    window.setTimeout(() => {
      setStatus('idle')
      onSet({ ...a, status: 'done' })
    }, 800)
  }

  const onFile = (f: File | undefined) => {
    if (!f) return
    finish({ id: `${kind}-${Date.now()}`, kind, name: f.name, url: URL.createObjectURL(f), demo: false })
  }

  const failUpload = () => {
    setStatus('uploading')
    window.setTimeout(() => setStatus('error'), 700)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-navy-900">{label}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}

      {attachment ? (
        <div className="mt-2">
          <img src={attachment.url} alt={`${label} preview`} className="h-40 w-full rounded-lg border border-slate-200 object-cover" />
          <p className="mt-1 truncate text-xs text-slate-500">
            {attachment.name} {attachment.demo && '· demo placeholder (not a real photo)'}
          </p>
          <div className="mt-2 flex gap-2">
            <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-navy-800 hover:bg-slate-50">
              <RefreshCw size={13} /> Replace
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button onClick={onRemove} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-red-600 hover:bg-red-50">
              <Trash2 size={13} /> Remove
            </button>
          </div>
          <p className="mt-1.5 text-xs font-medium text-teal-700">Uploaded ✓</p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700">
            <Camera size={16} /> {kind === 'odometer' ? 'Take / upload odometer photo' : 'Take / upload receipt photo'}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => finish({ id: `${kind}-demo`, kind, name: `demo-${kind}.svg`, url: demoPhoto(kind), demo: true })}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-navy-800 hover:bg-slate-50"
            >
              <ImageUp size={13} /> Use demo image
            </button>
            <button
              onClick={failUpload}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            >
              Simulate upload failure
            </button>
          </div>
          {status === 'uploading' && (
            <p className="text-xs font-medium text-primary-700" role="status">Uploading…</p>
          )}
          {status === 'error' && (
            <Banner tone="danger" title="Upload failed (simulated)">
              <div className="flex items-center gap-2">
                <span>Network error. You can retry{kind === 'receipt' ? ', or continue without the receipt — it is optional.' : '.'}</span>
                <button
                  onClick={() => finish({ id: `${kind}-${Date.now()}`, kind, name: `demo-${kind}.svg`, url: demoPhoto(kind), demo: true })}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-red-600 px-3 text-xs font-bold text-white"
                >
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            </Banner>
          )}
          {kind === 'receipt' && !attachment && status === 'idle' && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              No receipt photo attached — the entry will be marked “receipt missing” if paid in cash.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function Step3Evidence({ draft, patch }: { draft: Draft; patch: (p: Partial<Draft>) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-navy-900">Evidence photos</h2>
      <p className="text-sm text-slate-500">
        Photos protect you: they prove the odometer and the receipt without relying on anyone’s
        memory. Real camera works on a phone; demo images are available for desktop testing.
      </p>

      <Field label="Odometer photo" required hint="Required in production. Demo offers a placeholder or a documented exception.">
        <AttachmentBlock
          kind="odometer"
          label="Odometer photo"
          hint="Show the full odometer display after the fill."
          attachment={draft.odometerPhoto}
          onSet={(a) => patch({ odometerPhoto: a, odometerPhotoException: false })}
          onRemove={() => patch({ odometerPhoto: undefined })}
        />
      </Field>

      {!draft.odometerPhoto && (
        <label className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={Boolean(draft.odometerPhotoException)}
            onChange={(e) => patch({ odometerPhotoException: e.target.checked })}
          />
          <span>
            <strong>Exception:</strong> camera not available right now — the office may ask for the
            photo later. The saved entry will carry an “odometer photo missing” note.
          </span>
        </label>
      )}

      <Field label="Receipt photo (optional but strongly recommended)">
        <AttachmentBlock
          kind="receipt"
          label="Pump receipt photo"
          hint="Skip only if the receipt went straight to the office file."
          attachment={draft.receiptPhoto}
          onSet={(a) => patch({ receiptPhoto: a })}
          onRemove={() => patch({ receiptPhoto: undefined })}
        />
      </Field>
    </div>
  )
}
