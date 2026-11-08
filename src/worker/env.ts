import type { SessionUser } from "./auth/session";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CLAUDE_PROXY?: Fetcher; // proxy de la API de Claude ubicado en EE. UU. (workers/claude-proxy)
  // Secretos (npx wrangler secret put NOMBRE)
  SESSION_SECRET: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_WORKSPACE_ID?: string; // solo si la clave es de organización, no de un workspace
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SEC_USER_AGENT?: string; // identificación ante la SEC, p. ej. "investiando.app contacto@dominio.com"
  // Variables opcionales
  APP_URL?: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
