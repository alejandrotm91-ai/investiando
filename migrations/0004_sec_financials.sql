-- Estados financieros oficiales de la SEC (10-K y 10-Q vía XBRL), ya normalizados.
-- Una fila por empresa; los periodos van como JSON con los mismos campos que Yahoo.
CREATE TABLE IF NOT EXISTS sec_companies (
  ticker TEXT PRIMARY KEY,
  cik INTEGER NOT NULL,
  name TEXT,
  in_universe INTEGER NOT NULL DEFAULT 0, -- 1: top 100 del S&P 500 (se mantiene sola)
  annual TEXT,                            -- JSON: ejercicios, del más reciente al más antiguo
  quarterly TEXT,                         -- JSON: trimestres, del más reciente al más antiguo
  last_filed TEXT,                        -- fecha del 10-K/10-Q más reciente incluido
  last_form TEXT,
  last_period TEXT,                       -- cierre del último periodo
  synced_at INTEGER,                      -- ms
  error TEXT,                             -- último error de sincronización
  requested_at INTEGER                    -- última vez que alguien pidió sus datos
);
CREATE INDEX IF NOT EXISTS idx_sec_companies_cik ON sec_companies(cik);

-- Estado de la sincronización (índices diarios de EDGAR ya revisados, mapa ticker → CIK…)
CREATE TABLE IF NOT EXISTS sec_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER
);
