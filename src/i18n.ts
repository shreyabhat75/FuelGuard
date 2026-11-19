import { useAppState } from './services/store'

type Dict = Record<string, { en: string; kn: string }>

/** English is complete; Kannada covers the driver-facing labels. */
const dict: Dict = {
  appName: { en: 'FuelGuard', kn: 'ಫ್ಯೂಯೆಲ್‌ಗಾರ್ಡ್' },
  appSub: {
    en: 'Fuel accountability for Vidyanagara PU College',
    kn: 'ವಿದ್ಯಾನಗರ ಪಿಯು ಕಾಲೇಜಿನ ಇಂಧನ ಜವಾಬ್ದಾರಿ',
  },
  greeting: { en: 'Good day', kn: 'ಶುಭ ದಿನ' },
  myBus: { en: 'My bus', kn: 'ನನ್ನ ಬಸ್' },
  recordFill: { en: 'Record a fuel fill', kn: 'ಇಂಧನ ಭರ್ತಿ ದಾಖಲಿಸಿ' },
  recentEntries: { en: 'Recent entries', kn: 'ಇತ್ತೀಚಿನ ನಮೂದುಗಳು' },
  online: { en: 'Online', kn: 'ಆನ್‌ಲೈನ್' },
  offline: { en: 'Offline (demo)', kn: 'ಆಫ್‌ಲೈನ್ (ಡೆಮೊ)' },
  pendingSync: { en: 'Pending sync', kn: 'ಸಿಂಕ್ ಬಾಕಿ' },
  saved: { en: 'Saved', kn: 'ಉಳಿಸಲಾಗಿದೆ' },
  needsReview: { en: 'Needs review', kn: 'ಪರಿಶೀಲನೆ ಬೇಕು' },
  step: { en: 'Step', kn: 'ಹಂತ' },
  of: { en: 'of', kn: '/' },
  continue: { en: 'Continue', kn: 'ಮುಂದುವರಿಸಿ' },
  back: { en: 'Back', kn: 'ಹಿಂದೆ' },
  save: { en: 'Save entry', kn: 'ನಮೂದು ಉಳಿಸಿ' },
  litres: { en: 'Litres filled', kn: 'ಲೀಟರ್ ಭರ್ತಿ' },
  amount: { en: 'Amount paid (₹)', kn: 'ಪಾವತಿಸಿದ ಮೊತ್ತ (₹)' },
  odometer: { en: 'Odometer (km)', kn: 'ಓಡೋಮೀಟರ್ (ಕಿ.ಮೀ.)' },
  fuelType: { en: 'Fuel type', kn: 'ಇಂಧನ ವಿಧ' },
  paidBy: { en: 'Who paid', kn: 'ಯಾರು ಪಾವತಿಸಿದರು' },
  paymentMethod: { en: 'Payment method', kn: 'ಪಾವತಿ ವಿಧಾನ' },
  pump: { en: 'Pump', kn: 'ಪೆಟ್ರೋಲ್ ಬಂಕ್' },
  billNo: { en: 'Pump bill / receipt no. (optional)', kn: 'ಬಿಲ್ / ರಸೀದಿ ಸಂ. (ಐಚ್ಛಿಕ)' },
  scanQr: { en: 'Scan bus QR', kn: 'ಬಸ್ QR ಸ್ಕ್ಯಾನ್' },
  manualSearch: { en: 'Search by bus code or registration', kn: 'ಬಸ್ ಸಂಕೇತ ಅಥವಾ ನೋಂದಣಿಯಿಂದ ಹುಡುಕಿ' },
  confirmBus: { en: 'Confirm this bus', kn: 'ಈ ಬಸ್ ಖಚಿತಪಡಿಸಿ' },
  photos: { en: 'Evidence photos', kn: 'ಸಾಕ್ಷಿ ಫೋಟೊಗಳು' },
  odometerPhoto: { en: 'Odometer photo', kn: 'ಓಡೋಮೀಟರ್ ಫೋಟೊ' },
  receiptPhoto: { en: 'Receipt photo (recommended)', kn: 'ರಸೀದಿ ಫೋಟೊ (ಶಿಫಾರಸು)' },
  location: { en: 'Location', kn: 'ಸ್ಥಳ' },
  review: { en: 'Review & confirm', kn: 'ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಖಚಿತಪಡಿಸಿ' },
  entrySaved: { en: 'Fuel entry saved', kn: 'ಇಂಧನ ನಮೂದು ಉಳಿಸಲಾಗಿದೆ' },
  savedNeedsReview: { en: 'Saved — needs review', kn: 'ಉಳಿಸಲಾಗಿದೆ — ಪರಿಶೀಲನೆ ಬೇಕು' },
  viewEntry: { en: 'View entry', kn: 'ನಮೂದು ನೋಡಿ' },
  recordAnother: { en: 'Record another fill', kn: 'ಇನ್ನೊಂದು ಭರ್ತಿ ದಾಖಲಿಸಿ' },
  logout: { en: 'Log out', kn: 'ಹೊರನಡೆ' },
  switchRole: { en: 'Switch role', kn: 'ಪಾತ್ರ ಬದಲಿಸಿ' },
  dashboard: { en: 'Home', kn: 'ಮುಖಪುಟ' },
  flagged: { en: 'Flagged fills', kn: 'ಗುರುತಿಸಿದ ಭರ್ತಿಗಳು' },
  reconciliation: { en: 'Pump statement', kn: 'ಪಂಪ್ ಹೇಳಿಕೆ' },
  approvals: { en: 'Approvals', kn: 'ಅನುಮೋದನೆಗಳು' },
  buses: { en: 'Buses & QR', kn: 'ಬಸ್‌ಗಳು & QR' },
  audit: { en: 'Audit log', kn: 'ಆಡಿಟ್ ದಾಖಲೆ' },
  myEntries: { en: 'History', kn: 'ಇತಿಹಾಸ' },
  confirmed: { en: 'I confirm these details are correct', kn: 'ಈ ಮಾಹಿತಿ ಸರಿ ಎಂದು ಖಚಿತಪಡಿಸುತ್ತೇನೆ' },
  profile: { en: 'Profile', kn: 'ಪ್ರೊಫೈಲ್' },
  assignedBus: { en: 'Assigned Bus', kn: 'ನಿಯೋಜಿತ ಬಸ್' },
  scanBus: { en: 'Scan QR', kn: 'QR ಸ್ಕ್ಯಾನ್' },
  newFill: { en: 'New Fill', kn: 'ಹೊಸ ಭರ್ತಿ' },
  driverInfo: { en: 'Driver Information', kn: 'ಚಾಲಕರ ಮಾಹಿತಿ' },
  connectivity: { en: 'Connectivity & Sync', kn: 'ಸಂಪರ್ಕ ಮತ್ತು ಸಿಂಕ್' },
  forceSync: { en: 'Force Sync Now', kn: 'ಈಗಲೇ ಸಿಂಕ್ ಮಾಡಿ' },
}

export function useI18n() {
  const s = useAppState()
  const t = (key: keyof typeof dict): string => dict[key]?.[s.lang] ?? (key as string)
  return { t, lang: s.lang }
}

export type Lang = 'en' | 'kn'
