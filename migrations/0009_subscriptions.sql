-- Suscripciones de Paddle (una fila por suscripción; la mantiene el webhook /api/billing/webhook)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                 TEXT PRIMARY KEY,   -- id de Paddle (sub_...)
  user_id            TEXT,               -- users.id (custom_data del checkout)
  email              TEXT,
  customer_id        TEXT,               -- ctm_... (para el portal de cliente)
  status             TEXT NOT NULL,      -- trialing | active | past_due | paused | canceled
  price_id           TEXT,
  interval           TEXT,               -- month | year
  trial_ends_at      TEXT,
  current_period_end TEXT,
  next_billed_at     TEXT,
  cancel_at          TEXT,               -- cancelación programada al final del periodo
  canceled_at        TEXT,
  occurred_at        TEXT,               -- fecha del último evento aplicado (los eventos pueden llegar desordenados)
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON subscriptions(email);
