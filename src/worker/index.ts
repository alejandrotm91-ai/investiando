import { Hono } from "hono";
import type { AppEnv } from "./env";
import { legacyApp } from "./legacy/express-shim";
import { registerLegacyRoutes } from "./legacy/routes";
import { authRoutes, userRoutes } from "./auth/routes";
import { requireUser } from "./auth/session";
import { adminRoutes, smtpRoutes } from "./admin/routes";
import { secRoutes } from "./sec/routes";
import { runSecCron } from "./sec/sync";
import { runSegmentsCron } from "./sec/segmentSync";
import { runPreviewsCron } from "./sec/earnings";

// API de investiando en Cloudflare Workers. Las rutas de server.ts se migran aquí por fases;
// mientras tanto, las que faltan responden 404 en JSON.
const app = new Hono<AppEnv>();

app.get("/api/health", async (c) => {
  // Comprueba también que la base D1 responde.
  const db = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>().catch(() => null);
  return c.json({ status: "ok", d1: db?.ok === 1 });
});

// Fase 3: usuarios en D1 (registro, sesión, recuperación de contraseña y datos de la app).
app.route("/api/auth", authRoutes);
app.route("/api/user", userRoutes);

// Fase 5: administración, solo para usuarios con role = 'admin' en D1.
app.route("/api/admin", adminRoutes);
app.route("/api/smtp", smtpRoutes);

// Estados financieros oficiales de la SEC (10-K/10-Q), guardados en D1.
app.route("/api/sec", secRoutes);

// Fase 4: cada consulta a Claude cuesta dinero, así que las rutas de IA exigen sesión.
const AI_ROUTES = [
  "/api/portfolio/generate-ai",
  "/api/portfolio/extract-from-image",
  "/api/news",
  "/api/chat",
  "/api/financials-analysis",
  "/api/hedgefund-analysis",
  "/api/watchlist/scan-sector",
];
for (const path of AI_ROUTES) app.use(path, requireUser);

// Fases 2 y 4: rutas de datos de server.ts (mercado con Yahoo Finance e IA con Claude).
registerLegacyRoutes(legacyApp(app));

app.all("/api/*", (c) => c.json({ error: `API route ${c.req.method} ${c.req.path} not found` }, 404));

// Todo lo demás: la app React compilada en dist/ (la sirve Cloudflare).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  // Cron (wrangler.jsonc): mantiene al día los 10-K/10-Q de la SEC.
  async scheduled(_controller: ScheduledController, env: AppEnv["Bindings"], ctx: ExecutionContext) {
    ctx.waitUntil(
      runSecCron(env.DB, env.SEC_USER_AGENT)
        .then((r) => console.log("SEC cron", JSON.stringify(r)), (e) => console.error("SEC cron error", e))
        // Avances de resultados de los 8-K (capa 3): antes que los segmentos, que descargan mucho
        .then(() => runPreviewsCron(env.DB, env))
        .then((r) => console.log("SEC avances", JSON.stringify(r)), (e) => console.error("SEC avances error", e))
        // Segmentos (capa 2) de las empresas recargadas o pendientes
        .then(() => runSegmentsCron(env.DB, env.SEC_USER_AGENT))
        .then((r) => console.log("SEC segmentos", JSON.stringify(r)), (e) => console.error("SEC segmentos error", e))
    );
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
