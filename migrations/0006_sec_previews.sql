-- Capa 3 de la SEC: avance de resultados de los 8-K (Item 2.02), extraído con Claude.
-- Provisional: la app solo lo muestra mientras el 10-Q/10-K de ese periodo no esté en sec_companies.
CREATE TABLE IF NOT EXISTS sec_previews (
  accn TEXT PRIMARY KEY,            -- número de registro del 8-K
  ticker TEXT NOT NULL,
  cik INTEGER NOT NULL,
  filed TEXT NOT NULL,              -- fecha de presentación del 8-K
  status TEXT NOT NULL,             -- pending | done | rejected | skipped | error
  period_end TEXT,                  -- cierre del trimestre que anuncia
  fiscal_year INTEGER,
  fiscal_quarter INTEGER,
  data TEXT,                        -- JSON con las cifras extraídas
  checks TEXT,                      -- JSON con las comprobaciones
  doc_url TEXT,                     -- comunicado (anexo 99.1)
  error TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sec_previews_ticker ON sec_previews(ticker, period_end);
CREATE INDEX IF NOT EXISTS idx_sec_previews_status ON sec_previews(status);
