import busesCsv from './buses.csv?raw'
import registerCsv from './fuel_register.csv?raw'
import statementCsv from './pump_statement_shree_lakshmi.csv?raw'
import priceCsv from './diesel_price.csv?raw'
import calendarCsv from './college_calendar.csv?raw'
import placesCsv from './places.csv?raw'
import type {
  Bus,
  DailyPrice,
  FuelEntry,
  Holiday,
  PumpStatementLine,
  PaidBy,
} from '../types'

/** Minimal CSV parser (handles plain comma rows; dataset contains no quoted commas). */
function parseCsv(raw: string): string[][] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => l.split(',').map((c) => c.trim()))
}

function rowsOf(raw: string): Record<string, string>[] {
  const rows = parseCsv(raw)
  const header = rows[0]
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

export const RAW = {
  buses: busesCsv,
  register: registerCsv,
  statement: statementCsv,
  prices: priceCsv,
  calendar: calendarCsv,
  places: placesCsv,
}

export const buses: Bus[] = rowsOf(busesCsv).map((r) => ({
  id: r.bus_code,
  busCode: r.bus_code,
  registration: r.reg_no,
  tankLitres: Number(r.tank_litres),
  fuelType: 'diesel',
  driverName: r.driver_name,
  gpsDevice: r.gps_device,
}))

export const dailyPrices: DailyPrice[] = rowsOf(priceCsv).map((r) => ({
  date: r.date,
  price: Number(r.diesel_rs_per_litre),
}))

export const holidays: Holiday[] = rowsOf(calendarCsv).map((r) => ({
  date: r.date,
  name: r.holiday,
}))

export const places = rowsOf(placesCsv).map((r) => ({
  name: r.place,
  lat: Number(r.lat),
  lng: Number(r.lng),
}))

function mapPaidBy(raw: string): PaidBy {
  if (raw === 'College account') return 'college_account'
  if (raw === 'Ravi (transport manager)') return 'transport_manager'
  return 'driver'
}

/** Fuel register exactly as typed from the paper logbook (112 rows). */
export const registerEntries: FuelEntry[] = rowsOf(registerCsv).map((r) => ({
  id: r.entry_id,
  busId: r.bus_code,
  timestampClient: `${r.timestamp}:00+05:30`,
  timestampServer: `${r.timestamp}:00+05:30`,
  litres: Number(r.litres),
  amount: Number(r.amount_rs),
  fuelType: r.fuel_type as FuelEntry['fuelType'],
  odometerKm: Number(r.odometer_km),
  paidBy: mapPaidBy(r.paid_by),
  paymentMode: r.payment_mode as FuelEntry['paymentMode'],
  pumpName: r.pump_name,
  odometerPhoto: undefined,
  receiptPhoto: undefined,
  receiptOnFile: r.receipt_on_file === 'Y',
  location: null,
  createdBy: r.written_by,
  createdByName: r.written_by,
  status: 'saved' as const,
  registerRef: r.entry_id,
}))

export const statementLines: PumpStatementLine[] = rowsOf(statementCsv).map((r) => {
  // statement dates print as DD-MM-YYYY
  const [d, m, y] = r.date.split('-')
  return {
    id: r.bill_no,
    billNo: r.bill_no,
    date: `${y}-${m}-${d}`,
    vehicleNo: r.vehicle_no,
    litres: Number(r.litres),
    rate: Number(r.rate),
    amount: Number(r.amount),
  }
})
