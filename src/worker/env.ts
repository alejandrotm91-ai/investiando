import type { SessionUser } from "./auth/session";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  // Secretos (npx wrangler secret put NOMBRE)
  SESSION_SECRET: string;
  ANTHROPIC_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  // Variables opcionales
  APP_URL?: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
