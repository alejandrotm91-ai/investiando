-- Último precio real conocido de cada valor. Si Yahoo no responde, las rutas de cotización usan
-- este dato (marcado como "cached" con su fecha) en vez de una tabla fija de precios antiguos.
CREATE TABLE quote_cache (
  ticker     TEXT PRIMARY KEY,
  data       TEXT NOT NULL, -- JSON con precio, cierre anterior, nombre y ratios
  updated_at TEXT NOT NULL  -- ISO 8601
);
