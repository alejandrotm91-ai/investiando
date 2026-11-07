# Claude Code Integration Guide — investiando.app

## Migración a Cloudflare (rama `cloudflare-migration`, en curso)
La app se está pasando de Express/Cloud Run + Gemini + Firestore a Cloudflare Workers + Claude + D1,
con la misma estructura que el proyecto trackerz. Mientras dure, `server.ts` sigue siendo la versión vigente.
- `wrangler.jsonc` — Worker `investiando`, sirve `dist/` y envía `/api/*` al Worker; base D1 `investiando-db` (binding `DB`).
- `src/worker/` — API nueva con Hono. Las rutas de `server.ts` se migran aquí por fases.
  - `yahoo.ts` — instancia única de yahoo-finance2. Su cola va sin límite (`queue.concurrency`): con límite, la consulta de una petición corre dentro de otra y Cloudflare la cancela (error 1101).
  - `legacy/express-shim.ts` — adaptador que permite usar en Hono los handlers estilo Express de `server.ts` tal cual. `bg(promesa)` lanza trabajo en segundo plano con `waitUntil`; sin eso Cloudflare lo corta al responder.
  - `legacy/routes.ts` — rutas de datos copiadas de `server.ts`: mercado (Fase 2) e IA (Fase 4). Generado desde server.ts; las cachés viven en memoria y se recargan solas al recibir peticiones.
  - `llm.ts` — IA con Claude (`claude-opus-5-5`, `ANTHROPIC_API_KEY`; con una clave de organización también `ANTHROPIC_WORKSPACE_ID`). `generateContent` acepta los parámetros de la antigua función de Gemini y devuelve `{ text }`; traduce googleSearch a la búsqueda web de Claude y responseMimeType JSON a "responde solo JSON". Las rutas de IA exigen sesión (`index.ts`).
  - `auth/` — usuarios en D1 (Fase 3): `routes.ts` (`/api/auth/*` y `/api/user/*`, mismo contrato que server.ts), `password.ts` (PBKDF2, 100.000 iteraciones: el máximo de Workers), `session.ts` (JWT firmado con `SESSION_SECRET`, en cookie `investiando_session` y devuelto como `token`).
  - `admin/routes.ts` — `/api/admin/*` y `/api/smtp/*` (Fase 5). Solo para `users.role = 'admin'` según la sesión (se ignora el `adminEmail` del cuerpo). El correo se configura con secretos de Resend: guardar SMTP responde 400 y la prueba usa Resend.
  - `quoteCache.ts` — tabla D1 `quote_cache` (migración 0003): último precio real por ticker y últimas respuestas buenas completas (`STOCK:NVDA` de /api/stock, `FIN:NVDA` de los estados financieros). Si Yahoo falla (pasa a menudo desde IPs de Cloudflare), las rutas reintentan una vez renovando la sesión (`resetYahoo()` en `yahoo.ts`) y, si sigue fallando, sirven lo guardado marcado `stale` con su fecha. Nunca precios de tablas fijas.
  - `sec/` — estados financieros oficiales de la SEC (10-K/10-Q vía XBRL) en la tabla D1 `sec_companies` (migración 0004), fuente principal de los modelos; Yahoo solo rellena huecos (`merge.ts`) y da precios. `normalize.ts` pasa la API companyfacts a periodos con los nombres de campo de Yahoo (T4 = año − 9 meses, flujos trimestrales desde acumulados, etiquetas alternativas por concepto); `xbrl.ts` lee el XBRL de un informe concreto cuando companyfacts aún no lo trae (pasa: Visa, Citi, NextEra); `sync.ts` sincroniza (ticker → CIK, CIK antiguos en `universe.ts` para ExxonMobil y BlackRock) y la tarea programada cada 10 min (`wrangler.jsonc` → `scheduled` en `index.ts`) da de alta el universo (top 100 del S&P 500, `universe.ts`), revisa el índice diario de EDGAR y recarga quien presentó 10-K/10-Q. Otros tickers se cargan la primera vez que se piden. Rutas: `GET /api/sec/financials/:ticker`, `GET /api/sec/status`, `POST /api/sec/sync` (admin). Secreto opcional `SEC_USER_AGENT` (identificación ante la SEC con un contacto). Validación: `/api/sec/status` y comparar con Yahoo; las diferencias que quedan son de definición (arrendamientos en la deuda, beneficio operativo ajustado).
  - `sec/segments.ts` + `segmentSync.ts` — capa 2: ingresos (y beneficio operativo si lo hay) por segmento, producto y geografía, leídos del XBRL de los últimos 6 10-Q/10-K (tabla `sec_segments`, migración 0005; companyfacts no los trae). Ejes estándar (StatementBusinessSegmentsAxis, srt:ProductOrServiceAxis, srt:StatementGeographicalAxis). En cada periodo se elige el desglose más detallado que suma los ingresos consolidados (sin mezclar un total con sus partes, confirmado en ≥2 periodos); manda el informe más reciente de cada periodo (reorganizaciones como la de Microsoft 2026). Segmentos que no suman el total (bancos, eliminaciones) se muestran con la diferencia aparte. La tarea programada los actualiza tras recargar cada empresa (hasta 60 informes por ejecución). Ruta `GET /api/sec/segments/:ticker`; pestaña "Segmentos" de Stock Explorer (`src/components/SegmentBreakdown.tsx`). Historia anual de ~10 años: además se leen los 10-K de hace 3, 6 y 9 ejercicios (su número de registro sale de la capa 1, que guarda 11 ejercicios; los modelos siguen recibiendo 6, `MODEL_YEARS` en `legacy/routes.ts`, para no cambiar cálculos como el CAGR del BPA). Antes de 2018 los ingresos iban en `SalesRevenueNet` y los ejes de producto/geografía/consolidación con prefijo `us-gaap:`; ambos se aceptan. El miembro "segmento declarado" (`SubsegmentsConsolidationItemsAxis`, Caterpillar 2019-2022) se ignora junto al eje de segmentos y no con geografía. En periodos que no cuadran se quita la línea que suma otras (confirmado en 2 periodos y con nombre de agregado). Los países estándar con etiqueta de otro contexto ("U.S. Plans") usan nombre fijo. Sin desglose estándar: NextEra, Chubb, Progressive, Blackstone.
  - `sec/earnings.ts` — capa 3: avance de resultados de los 8-K con Item 2.02 (tabla `sec_previews`, migración 0006). Detección: feed "últimos 8-K" de la SEC en cada ejecución de la tarea programada + repaso inicial del universo (`sec_meta.previews_backfill`). El anexo 99.1 se localiza por su tipo en el índice del informe (los nombres de archivo no siguen regla) y Claude (`sec/claude.ts`, esfuerzo bajo, salida JSON por esquema; la API admite como mucho 16 campos "valor o null", así que las cifras van como campos opcionales) extrae las cifras GAAP del trimestre y del mismo trimestre del año anterior. Se valida contra la SEC (ingresos/beneficio/BPA del año anterior, BPA = beneficio ÷ acciones); si falla, queda `rejected` y no se muestra. Si el 10-Q ya está presentado se descarta sin llamar a Claude; como mucho 4 extracciones por ejecución. Ruta `GET /api/sec/preview/:ticker` (solo devuelve el avance mientras no haya 10-Q/10-K de ese trimestre) y `POST /api/sec/preview/process` (admin). Tarjeta `src/components/EarningsPreviewCard.tsx` sobre las pestañas de Stock Explorer; los modelos no usan estas cifras.
  - Renombres de miembros (mismo segmento con otro código XBRL según el informe: Texas Instruments, AMD, Palantir, UnitedHealth…) se unifican en `segments.ts` (`memberAliases`): dos miembros del mismo eje que nunca coinciden en un informe y se llaman igual o tienen las mismas cifras en un periodo común.
  - `sec/recast.ts` — capa 4: histórico rehecho tras una reorganización de segmentos (tabla `sec_recasts`, migración 0007). Se detecta al calcular la capa 2 (miembros nuevos en el último trimestre y periodos recientes con miembros que ya no existen; las ventas de negocios no cuentan). Se puntúan los 8-K (7.01/8.01/2.02) entre el último informe con la estructura antigua y 4 meses después del primero con la nueva, cada anexo por separado. Si el 8-K trae XBRL con los segmentos (Microsoft al rehacer su 10-K) se lee directamente; si no, Claude extrae las cifras con los nombres limitados a la estructura actual. Validación: total = ingresos de la SEC, líneas = total y coincidencia con lo que el 10-Q nuevo ya rehace; si falla, `rejected`. Lo aceptado entra en la capa 2 con fecha del 8-K + "R" y los periodos se marcan `recast` ("†" en la pestaña Segmentos). Rutas `GET /api/sec/recasts` y `POST /api/sec/recast/process` (admin, `{id, reset}`). Sin 8-K en la SEC: AT&T y Eaton (lo publican solo en su web o en el 10-Q); Caterpillar se rechaza porque su XBRL no cuadra con su 10-Q.
  - Límite de Cloudflare: 50 conexiones salientes por ejecución (plan gratuito de Workers; D1 cuenta aparte). La tarea programada reserva 45 (`startFetchBudget` en `index.ts`, contador en `sec/client.ts`); cada paso mira `fetchBudgetLeft()` antes de empezar otra empresa y agotarlo no se guarda como error (`isBudgetError`). Orden: capa 1 → avances (8-K) → reorganizaciones → segmentos.
  - `email.ts` — correos con la API de Resend (`RESEND_API_KEY`, `EMAIL_FROM`). Sin ellos, solo se registran en el log.
- `migrations/` — SQL de D1 (aplicar con `npx wrangler d1 migrations apply investiando-db --remote`); `0002` hace admin a alejandrotm91@gmail.com. Tabla `users`: datos de la app (carteras, watchlist, margen) como JSON en `data`; `/api/user/save-cloud-data` mezcla con `json_patch`.
- `src/utils/threeStatementModel.ts` y `src/utils/bogleEngine.ts` — motores del modelo de 3 estados + DCF y de los 3 motores de Bogle (Stock Explorer y pestaña Analysis). La metodología está en `AGENTS.md` §11 y §12; si cambias un cálculo, actualízala.
- Modo claro: clase `light` en `<html>` + reglas en `src/index.css`. Las de colores oscuros (fondos `bg-[#0…]`, `bg-slate-9xx`, bordes, degradados, textos pastel) se generan con `node scripts/gen-light-overrides.mjs` (bloque `light-overrides` de index.css): vuelve a ejecutarlo si añades colores oscuros nuevos. En los selectores escritos a mano hay que escapar `[`, `#` y `/` o el navegador descarta la regla entera.
- `src/lib/cloudData.ts` — lado navegador de los datos del usuario (sustituye a `firebase.ts`): caché local, envío al servidor con reintento y consulta cada 60 s.
- `scripts/smoke-market.ps1` y `scripts/smoke-auth.ps1` — pruebas de punta a punta contra el Worker publicado (la de auth crea y borra una cuenta @example.com). `scripts/smoke-ai.ps1` prueba las rutas de IA (cada llamada cuesta).
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
