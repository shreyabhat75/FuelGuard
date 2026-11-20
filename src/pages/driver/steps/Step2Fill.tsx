import type { Draft } from '../EntryWizard'
import { buses, dailyPrices, holidays } from '../../../services/store'
import { publishedPrice, holidayFor } from '../../../utils/rules'
import { dateKey, inr, num } from '../../../utils/format'
import { Banner, Field, inputCls } from '../../../components/ui'
import { AlertTriangle } from 'lucide-react'

const paidByOptions: { value: Draft['paidBy']; label: string }[] = [
  { value: 'driver', label: 'Driver (me)' },
  { value: 'transport_manager', label: 'Transport manager' },
  { value: 'college_account', label: 'College account' },
  { value: 'other', label: 'Other person' },
]

const paymentOptions: { value: Draft['paymentMode']; label: string }[] = [
  { value: 'credit_account', label: 'Credit account (billed to college)' },
  { value: 'cash', label: 'Cash (reimbursed later)' },
]

const pumpOptions = ['Shree Lakshmi Fuels', 'Highway Fuel Point', 'Other pump']

export default function Step2Fill({ draft, patch }: { draft: Draft; patch: (p: Partial<Draft>) => void }) {
  const bus = buses.find((b) => b.busCode === draft.busId)
  const litres = Number(draft.litres)
  const amount = Number(draft.amount)
  const today = dateKey(new Date().toISOString())
  const pub = publishedPrice(dailyPrices, today)
  const rate = litres > 0 ? amount / litres : 0
  const rateDiff = rate - pub.price
  const holiday = holidayFor(holidays, today)

  const litresErr = draft.litres !== '' && (!(litres > 0) || Number.isNaN(litres)) ? 'Enter litres greater than 0.' : undefined
  const amountErr = draft.amount !== '' && (!(amount > 0) || Number.isNaN(amount)) ? 'Enter an amount greater than ₹0.' : undefined
  const odoErr =
    draft.odometer !== '' && (Number.isNaN(Number(draft.odometer)) || Number(draft.odometer) < 0)
      ? 'Odometer cannot be negative.'
      : undefined
  const tankWarn = bus && litres > bus.tankLitres
  const overCapacity = bus && litres > bus.tankLitres ? litres - bus.tankLitres : 0

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-navy-900">Fill details</h2>
      <p className="text-sm text-slate-500">
        Enter the values exactly as shown at the pump. The app never silently changes what you type.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Litres filled" htmlFor="litres" required error={litresErr}>
          <div className="relative">
            <input
              id="litres"
              className={`${inputCls} h-13 pr-8 text-lg font-bold tnum`}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.0"
              value={draft.litres}
              onChange={(e) => patch({ litres: e.target.value })}
            />
            <span className="pointer-events-none absolute right-3 top-3.5 text-xs font-bold text-slate-400">L</span>
          </div>
        </Field>
        <Field label="Amount paid (₹)" htmlFor="amount" required error={amountErr}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-3.5 text-base font-bold text-slate-400">₹</span>
            <input
              id="amount"
              className={`${inputCls} h-13 pl-7 text-lg font-bold tnum`}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={draft.amount}
              onChange={(e) => patch({ amount: e.target.value })}
            />
          </div>
        </Field>
      </div>

      <Field label="Odometer reading (km)" htmlFor="odometer" required error={odoErr}>
        <div className="relative">
          <input
            id="odometer"
            className={`${inputCls} h-13 pr-10 text-lg font-bold tnum`}
            inputMode="numeric"
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 62788"
            value={draft.odometer}
            onChange={(e) => patch({ odometer: e.target.value })}
          />
          <span className="pointer-events-none absolute right-3 top-3.5 text-xs font-bold text-slate-400">KM</span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fuel type" htmlFor="fuelType">
          <select id="fuelType" className={`${inputCls} h-12 text-base font-medium`} value={draft.fuelType} onChange={(e) => patch({ fuelType: e.target.value as Draft['fuelType'] })}>
            <option value="diesel">Diesel</option>
            <option value="petrol">Petrol</option>
            <option value="cng">CNG</option>
          </select>
        </Field>
        <Field label="Who paid" htmlFor="paidBy">
          <select id="paidBy" className={`${inputCls} h-12 text-base font-medium`} value={draft.paidBy} onChange={(e) => patch({ paidBy: e.target.value as Draft['paidBy'] })}>
            {paidByOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Payment method" htmlFor="paymentMode">
        <select id="paymentMode" className={`${inputCls} h-12 text-base font-medium`} value={draft.paymentMode} onChange={(e) => patch({ paymentMode: e.target.value as Draft['paymentMode'] })}>
          {paymentOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Pump" htmlFor="pump">
        <select id="pump" className={`${inputCls} h-12 text-base font-medium`} value={draft.pump} onChange={(e) => patch({ pump: e.target.value })}>
          {pumpOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>

      <Field label="Pump bill / receipt no. (optional)" htmlFor="billNo" hint="Printed on the receipt, e.g. SLF/71251.">
        <input
          id="billNo"
          className={`${inputCls} h-12 text-base`}
          placeholder="e.g. SLF/71251"
          value={draft.billNo}
          onChange={(e) => patch({ billNo: e.target.value })}
        />
      </Field>

      {/* live rate check */}
      {litres > 0 && amount > 0 && (
        <Banner tone={Math.abs(rateDiff) >= 1 ? 'warning' : 'success'} title={`Rate: ₹${num(rate, 2)} per litre`}>
          Published diesel price for {today}: <strong>{inr(pub.price)}/L</strong>
          {!pub.exact && ' (last published price — today’s price not in the demo table)'}.
          {Math.abs(rateDiff) >= 1 && (
            <>
              {' '}Your rate differs by <strong>₹{num(Math.abs(rateDiff), 2)}/L</strong>. The entry can still be saved — it will be marked for review.
            </>
          )}
        </Banner>
      )}

      {tankWarn && bus && (
        <Banner tone="warning" title={`More than the ${bus.tankLitres} L tank of ${bus.busCode}`}>
          <span className="flex items-start gap-1.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {num(litres)} L is {num(overCapacity)} L above the stated tank capacity. Double-check the
              reading. You may still continue — the save will not be blocked, but the entry will be
              marked for review.
            </span>
          </span>
        </Banner>
      )}

      {holiday && (
        <Banner tone="info" title={`Today (${holiday.name}) is a college holiday`}>
          Fills on holidays are allowed but will be flagged for a routine check when saved.
        </Banner>
      )}
    </div>
  )
}
