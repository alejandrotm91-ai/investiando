-- Usuarios de investiando (Fase 3). Reemplaza la colección "users" de Firestore y users_db.json.
-- Las contraseñas se guardan cifradas con PBKDF2 (nunca en texto plano).
-- Los datos de la app (carteras, posiciones, watchlist, margen...) van como JSON en `data`.
CREATE TABLE users (
  email             TEXT PRIMARY KEY,           -- en minúsculas
  id                TEXT NOT NULL UNIQUE,       -- "user_xxxxx", el mismo que tenía en Firestore
  name              TEXT NOT NULL DEFAULT '',
  password_hash     TEXT,                       -- "pbkdf2-sha256$iteraciones$sal$hash"
  email_verified    INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active', -- active | suspended
  role              TEXT NOT NULL DEFAULT 'user',   -- user | admin
  verification_code TEXT,
  reset_code        TEXT,
  reset_expires     INTEGER,                    -- milisegundos (Date.now())
  code_attempts     INTEGER NOT NULL DEFAULT 0, -- intentos fallidos con el código vigente
  data              TEXT NOT NULL DEFAULT '{}', -- JSON
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  verified_at       TEXT,
  last_login        TEXT
);
