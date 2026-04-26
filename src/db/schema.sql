PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  employee_code TEXT,
  qr_token TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS punches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  punched_at_ms INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_qr_token
ON employees(qr_token);

CREATE INDEX IF NOT EXISTS idx_punches_employee_id
ON punches(employee_id);

CREATE INDEX IF NOT EXISTS idx_punches_work_date
ON punches(work_date);

CREATE INDEX IF NOT EXISTS idx_punches_employee_date
ON punches(employee_id, work_date);

CREATE INDEX IF NOT EXISTS idx_punches_punched_at
ON punches(punched_at_ms);
