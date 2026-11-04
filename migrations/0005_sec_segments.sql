-- Capa 2 de la SEC: ingresos por segmento, producto y geografía (XBRL de cada 10-Q/10-K).
CREATE TABLE IF NOT EXISTS sec_segments (
  ticker TEXT PRIMARY KEY,
  data TEXT,        -- JSON listo para la app (ver src/worker/sec/segments.ts, SegmentData)
  facts TEXT,       -- JSON: cifras por miembro y periodo de los informes leídos (para añadir los nuevos)
  labels TEXT,      -- JSON: nombre de cada miembro según el propio informe
  accns TEXT,       -- JSON: informes ya leídos
  updated_at INTEGER,
  error TEXT
);
