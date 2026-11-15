/**
 * Versioned migrations. Applied version is tracked via the `user_version`
 * pragma (SQLite) or the `_migrations` table (PostgreSQL). The schema is
 * dialect-aware: identical shape on both engines. Foreign keys, indexes and
 * timestamps throughout. Corrections/audit/flags are append-only — no hard
 * deletes anywhere.
 */

export type Dialect = 'postgres' | 'sqlite'

export interface Migration {
  version: number
  name: string
  sql: (dialect: Dialect) => string
}

const AUTO_PK = (d: Dialect) => (d === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY')
const R = (d: Dialect) => (d === 'sqlite' ? 'REAL' : 'DOUBLE PRECISION')

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    sql: (d: Dialect) => `
CREATE TABLE buses (
  bus_code    TEXT PRIMARY KEY,
  reg_no      TEXT NOT NULL UNIQUE,
  tank_litres INTEGER NOT NULL,
  fuel_type   TEXT NOT NULL CHECK (fuel_type IN ('diesel','petrol','cng')),
  seats       INTEGER NOT NULL,
  driver_name TEXT NOT NULL,
  gps_device  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('driver','transport_manager','accountant','principal','admin')),
  bus_code      TEXT REFERENCES buses(bus_code),
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE fuel_entries (
  id               TEXT PRIMARY KEY,
  bus_code         TEXT NOT NULL REFERENCES buses(bus_code),
  ts_client        TEXT NOT NULL,
  ts_server        TEXT NOT NULL,
  litres           ${R(d)} NOT NULL CHECK (litres > 0),
  amount           ${R(d)} NOT NULL CHECK (amount > 0),
  fuel_type        TEXT NOT NULL CHECK (fuel_type IN ('diesel','petrol','cng')),
  odometer_km      INTEGER NOT NULL,
  paid_by          TEXT,
  payment_mode     TEXT NOT NULL CHECK (payment_mode IN ('credit_account','cash','upi','card')),
  pump_name        TEXT NOT NULL,
  bill_no          TEXT,
  location_lat     ${R(d)},
  location_lng     ${R(d)},
  location_accuracy ${R(d)},
  location_note    TEXT,
  receipt_on_file  INTEGER,
  activity_notes   TEXT,
  created_by       TEXT NOT NULL REFERENCES users(id),
  client_ref       TEXT UNIQUE,
  source           TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('register','app','import')),
  status           TEXT NOT NULL DEFAULT 'saved'
                   CHECK (status IN ('saved','needs_review','awaiting_evidence','under_review','resolved','approved','rejected','pending_sync')),
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_entries_bus_ts ON fuel_entries (bus_code, ts_client);
CREATE INDEX idx_entries_status ON fuel_entries (status);
CREATE INDEX idx_entries_created_by ON fuel_entries (created_by);

CREATE TABLE evidence (
  id         TEXT PRIMARY KEY,
  entry_id   TEXT NOT NULL REFERENCES fuel_entries(id),
  kind       TEXT NOT NULL CHECK (kind IN ('odometer','receipt')),
  file_path  TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER,
  demo       INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_evidence_entry ON evidence (entry_id);

CREATE TABLE gps_pings (
  id       ${AUTO_PK(d)},
  bus_code TEXT NOT NULL REFERENCES buses(bus_code),
  ts       TEXT NOT NULL,
  lat      ${R(d)} NOT NULL,
  lng      ${R(d)} NOT NULL,
  UNIQUE (bus_code, ts)
);
CREATE INDEX idx_pings_bus_ts ON gps_pings (bus_code, ts);

CREATE TABLE pump_statement_files (
  id          TEXT PRIMARY KEY,
  file_name   TEXT NOT NULL,
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TEXT NOT NULL,
  line_count  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pump_statement_lines (
  bill_no   TEXT PRIMARY KEY,
  file_id   TEXT REFERENCES pump_statement_files(id),
  date      TEXT NOT NULL,
  vehicle_no TEXT NOT NULL,
  litres    ${R(d)} NOT NULL,
  rate      ${R(d)} NOT NULL,
  amount    ${R(d)} NOT NULL
);
CREATE INDEX idx_lines_vehicle_date ON pump_statement_lines (vehicle_no, date);

CREATE TABLE flags (
  id                TEXT PRIMARY KEY,
  rule_code         TEXT NOT NULL,
  title             TEXT NOT NULL,
  bus_code          TEXT,
  severity          TEXT NOT NULL CHECK (severity IN ('high','medium','low')),
  reason            TEXT NOT NULL,
  plain_explanation TEXT NOT NULL,
  evidence_summary  TEXT NOT NULL,
  entry_ids         TEXT NOT NULL DEFAULT '[]',
  bill_nos          TEXT NOT NULL DEFAULT '[]',
  amount_at_issue   ${R(d)} NOT NULL DEFAULT 0,
  confidence        TEXT NOT NULL,
  figures           TEXT NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'needs_review'
                    CHECK (status IN ('needs_review','under_review','awaiting_evidence','escalated','resolved','rejected')),
  resolution_note   TEXT,
  resolved_by       TEXT REFERENCES users(id),
  resolved_at       TEXT,
  viewed_by_office  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_flags_status ON flags (status);

CREATE TABLE flag_notes (
  id          TEXT PRIMARY KEY,
  flag_id     TEXT NOT NULL REFERENCES flags(id),
  author_id   TEXT REFERENCES users(id),
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_flag_notes_flag ON flag_notes (flag_id);

CREATE TABLE approvals (
  id              TEXT PRIMARY KEY,
  target_type     TEXT NOT NULL CHECK (target_type IN ('flag','correction')),
  target_id       TEXT NOT NULL,
  title           TEXT NOT NULL,
  bus_code        TEXT,
  amount          ${R(d)} NOT NULL DEFAULT 0,
  submitter_id    TEXT NOT NULL REFERENCES users(id),
  submitter_name  TEXT NOT NULL,
  submitter_role  TEXT NOT NULL,
  evidence_summary TEXT NOT NULL,
  review_notes    TEXT NOT NULL,
  decision        TEXT CHECK (decision IN ('approved','rejected','info_requested')),
  reason          TEXT,
  decided_by      TEXT REFERENCES users(id),
  decided_at      TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_approvals_decision ON approvals (decision);

CREATE TABLE corrections (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES fuel_entries(id),
  field          TEXT NOT NULL CHECK (field IN ('litres','amount','odometerKm')),
  original_value TEXT NOT NULL,
  proposed_value TEXT NOT NULL,
  reason         TEXT NOT NULL,
  proposed_by    TEXT NOT NULL REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by     TEXT REFERENCES users(id),
  decided_at     TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_corrections_entry ON corrections (entry_id);

CREATE TABLE audit_events (
  id          ${AUTO_PK(d)},
  entity_type TEXT NOT NULL CHECK (entity_type IN ('entry','flag','approval','bus','reconciliation','statement','evidence')),
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  before      TEXT,
  after       TEXT,
  reason      TEXT,
  actor_id    TEXT REFERENCES users(id),
  actor_name  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_events (entity_type, entity_id);

CREATE TABLE reconciliation_results (
  bill_no           TEXT PRIMARY KEY,
  file_id           TEXT REFERENCES pump_statement_files(id),
  entry_ids         TEXT NOT NULL DEFAULT '[]',
  match_status      TEXT NOT NULL CHECK (match_status IN
    ('matched','amount_mismatch','rate_mismatch','unmatched_pump_bill','register_missing','possible_duplicate')),
  difference        ${R(d)} NOT NULL DEFAULT 0,
  entry_litres      ${R(d)},
  entry_amount      ${R(d)},
  reviewer_decision TEXT NOT NULL DEFAULT 'none' CHECK (reviewer_decision IN
    ('none','resolved','needs_supplier_clarification','authorised_exception')),
  reviewer_note     TEXT,
  reviewed_by       TEXT REFERENCES users(id),
  reviewed_at       TEXT,
  reviewed_at_ts    TEXT
);

CREATE TABLE diesel_prices (
  date  TEXT PRIMARY KEY,
  price ${R(d)} NOT NULL
);

CREATE TABLE college_calendar (
  date    TEXT PRIMARY KEY,
  holiday TEXT NOT NULL
);

CREATE TABLE places (
  place TEXT PRIMARY KEY,
  lat   ${R(d)} NOT NULL,
  lng   ${R(d)} NOT NULL
);
`,
  },
]
