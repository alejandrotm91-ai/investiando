import { Hono } from "hono";
import type { AppEnv } from "./env";
import { legacyApp } from "./legacy/express-shim";
import { registerMarketRoutes } from "./legacy/market";
import { authRoutes, userRoutes } from "./auth/routes";

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

// Fase 2: rutas de mercado de server.ts (búsqueda, índices, sectores, cotizaciones, gráficos,
// estados financieros, superinversores, calendario de resultados, FX).
registerMarketRoutes(legacyApp(app));

app.all("/api/*", (c) => c.json({ error: `API route ${c.req.method} ${c.req.path} not found` }, 404));

// Todo lo demás: la app React compilada en dist/ (la sirve Cloudflare).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
