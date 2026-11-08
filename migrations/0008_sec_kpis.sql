-- Capa 5 de la SEC: KPIs operativos propios de cada empresa (viajes de Uber, suscriptores de
-- Netflix…), extraídos con Claude de los comunicados de resultados (anexo 99.1 de los 8-K, Item 2.02).
-- No vienen en el XBRL. Ver src/worker/sec/kpis.ts.
CREATE TABLE IF NOT EXISTS sec_kpis (
  accn TEXT PRIMARY KEY,            -- número de registro del 8-K
  ticker TEXT NOT NULL,
  cik INTEGER NOT NULL,
  filed TEXT NOT NULL,
  status TEXT NOT NULL,             -- pending | done | rejected | error
  data TEXT,                        -- JSON: trimestres con sus KPIs (y los ingresos para validar)
  checks TEXT,                      -- JSON: comprobaciones
  doc_url TEXT,
  usage TEXT,                       -- JSON: tokens de Claude
  error TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sec_kpis_ticker ON sec_kpis(ticker, filed);
CREATE INDEX IF NOT EXISTS idx_sec_kpis_status ON sec_kpis(status);
