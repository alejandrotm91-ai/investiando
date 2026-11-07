-- Capa 4 de la SEC: histórico rehecho tras una reorganización de segmentos.
-- Una fila por reorganización detectada (empresa + eje + primer informe con la estructura nueva).
-- El 8-K que trae las cifras rehechas se localiza solo y Claude las extrae; se validan contra los
-- totales oficiales (capa 1) y contra los periodos que el 10-Q nuevo ya publica rehechos.
CREATE TABLE IF NOT EXISTS sec_recasts (
  id TEXT PRIMARY KEY,              -- TICKER:eje:fecha del primer informe con la estructura nueva
  ticker TEXT NOT NULL,
  cik INTEGER NOT NULL,
  axis TEXT NOT NULL,               -- segment | product
  status TEXT NOT NULL,             -- searching | pending | done | rejected | not_found | error
  info TEXT,                        -- JSON: miembros nuevos/antiguos y ventana de búsqueda
  accn TEXT,                        -- 8-K con el histórico rehecho
  filed TEXT,                       -- fecha de ese 8-K
  doc_url TEXT,
  data TEXT,                        -- JSON con lo extraído
  facts TEXT,                       -- JSON SegFact[] listo para la capa 2 (solo si status = done)
  checks TEXT,                      -- JSON con las comprobaciones
  error TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sec_recasts_ticker ON sec_recasts(ticker, status);
CREATE INDEX IF NOT EXISTS idx_sec_recasts_status ON sec_recasts(status);
