# Claude Code Integration Guide — investiando.app

## Migración a Cloudflare (rama `cloudflare-migration`, en curso)
La app se está pasando de Express/Cloud Run + Gemini + Firestore a Cloudflare Workers + Claude + D1,
con la misma estructura que el proyecto trackerz. Mientras dure, `server.ts` sigue siendo la versión vigente.
- `wrangler.jsonc` — Worker `investiando`, sirve `dist/` y envía `/api/*` al Worker; base D1 `investiando-db` (binding `DB`).
- `src/worker/` — API nueva con Hono. Las rutas de `server.ts` se migran aquí por fases.
  - `yahoo.ts` — instancia única de yahoo-finance2. Su cola va sin límite (`queue.concurrency`): con límite, la consulta de una petición corre dentro de otra y Cloudflare la cancela (error 1101).
  - `legacy/express-shim.ts` — adaptador que permite usar en Hono los handlers estilo Express de `server.ts` tal cual. `bg(promesa)` lanza trabajo en segundo plano con `waitUntil`; sin eso Cloudflare lo corta al responder.
  - `legacy/market.ts` — rutas de mercado copiadas de `server.ts` (Fase 2). Las cachés viven en memoria y se recargan solas al recibir peticiones.
  - `auth/` — usuarios en D1 (Fase 3): `routes.ts` (`/api/auth/*` y `/api/user/*`, mismo contrato que server.ts), `password.ts` (PBKDF2, 100.000 iteraciones: el máximo de Workers), `session.ts` (JWT firmado con `SESSION_SECRET`, en cookie `investiando_session` y devuelto como `token`).
  - `email.ts` — correos con la API de Resend (`RESEND_API_KEY`, `EMAIL_FROM`). Sin ellos, solo se registran en el log.
- `migrations/` — SQL de D1. Tabla `users`: datos de la app (carteras, watchlist, margen) como JSON en `data`; `/api/user/save-cloud-data` mezcla con `json_patch`.
- `src/lib/cloudData.ts` — lado navegador de los datos del usuario (sustituye a `firebase.ts`): caché local, envío al servidor con reintento y consulta cada 60 s.
- `scripts/smoke-market.ps1` y `scripts/smoke-auth.ps1` — pruebas de punta a punta contra el Worker publicado (la de auth crea y borra una cuenta @example.com).
- `scripts/import-firestore-users.mjs` — importa usuarios de Firestore a D1 cifrando sus contraseñas. Firestore no deja listar: se le pasa un archivo con los correos.
- Comandos: `npm run cf:dev` (local en http://localhost:8787), `npm run cf:lint`, `npm run cf:deploy` (publica en https://investiando.alejandrotm91.workers.dev).
- Secretos: `npx wrangler secret put NOMBRE`; en local van en `.dev.vars` (ver `.dev.vars.example`). Nunca en el repositorio.
- npm bloquea scripts de instalación: los permitidos están en `allowScripts` de `package.json` (esbuild, workerd).

## Project Overview
**investiando.app** is an institutional financial terminal and investment analysis platform.
- **Frontend**: React 18+ with Vite, Tailwind CSS, Lucide React, Recharts.
- **Backend**: Express server running on port 3000 (`server.ts`) with Yahoo Finance integration (`yahoo-finance2`), Gemini API integration (`@google/genai`), Nodemailer SMTP authentication, and Firebase Admin.
- **Database & Auth**: Firebase Firestore and Firebase Authentication (`src/lib/firebase.ts`).

---

## Key Architecture & File Map

### Frontend (`src/`)
- `src/App.tsx`: Main application shell, state management, routing, navigation, modals, and user session.
- `src/components/LandingPage.tsx`: Authentication flows (Sign in, Sign up, Forgot Password, Reset Password modal, verification codes).
- `src/lib/firebase.ts`: Firebase client initialization and data sync (users, portfolios, watchlists, shared state).
- `src/types.ts`: TypeScript interfaces and shared financial types.

### Backend (`server.ts`)
- `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/verify-code`, `/api/auth/reset-password`: User authentication & password recovery via SMTP.
- `/api/quote/:symbol`, `/api/quotes`, `/api/stock/:symbol`: Real-time and historical market data from Yahoo Finance.
- `/api/portfolio/financials`, `/api/portfolio/generate-ai`: Financial statements and institutional AI portfolio creation.
- `/api/hedgefund-analysis`, `/api/watchlist/scan-sector`: Institutional investment memos and sector scanning.

### Security (`firestore.rules`)
- Firestore security rules governing access to `users`, `portfolios`, `ai_analyses`, and `superinvestor_insights`.

---

## Build & Test Commands
```bash
# Check code syntax & lint
npm run lint

# Compile and build production bundle
npm run build
```

---

## Bug Analysis & Security Audit Checklist
1. **Firestore Security**: `firestore.rules` currently allows open read/write (`allow read, write: if true`). Review and restrict rules to authenticated users where appropriate.
2. **Authentication Flow**: Verify token validation, password reset timeouts, and error handling in `server.ts` and `src/components/LandingPage.tsx`.
3. **Data Fallbacks**: Confirm resilient fallbacks for Yahoo Finance rate limits and missing financial data.
4. **DCF Engine & Bogle Engine**: Ensure formulas in financial analysis modules match the calculation guidelines specified in `AGENTS.md`.
