CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  quote_number TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  customer TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_date TEXT,
  hire_type TEXT NOT NULL,
  description TEXT,
  location TEXT,
  hours REAL,
  days INTEGER,
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  total REAL NOT NULL,
  notes TEXT,
  terms TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  accepted_at TEXT,
  accepted_by TEXT,
  declined_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes(token);

CREATE TABLE IF NOT EXISTS invoices (
 number INTEGER PRIMARY KEY AUTOINCREMENT,
 job_id TEXT NOT NULL UNIQUE,
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL,
 sent_at TEXT
);
