import { AsyncLocalStorage } from "node:async_hooks";
import type { Context, Hono } from "hono";

// Adaptador para reutilizar en Hono los handlers estilo Express de server.ts sin reescribirlos.
// Solo cubre lo que usan: req.params / req.query / req.body y res.status / res.json / res.send.

export interface LegacyReq {
  method: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  headers: Record<string, string>;
}

export interface LegacyRes {
  status(code: number): LegacyRes;
  json(data: unknown): LegacyRes;
  send(data: unknown): LegacyRes;
}

export type LegacyHandler = (req: LegacyReq, res: LegacyRes) => unknown;

export interface LegacyApp {
  get(path: string, handler: LegacyHandler): void;
  post(path: string, handler: LegacyHandler): void;
  all(path: string, handler: LegacyHandler): void;
}

// Contexto de la petición en curso, para que el código copiado pueda lanzar trabajo
// en segundo plano (refrescar cachés) sin que Cloudflare lo corte al responder.
const requestCtx = new AsyncLocalStorage<{ waitUntil(p: Promise<unknown>): void }>();

/** Ejecuta una promesa en segundo plano (reemplaza a `promesa.catch(() => {})` de server.ts). */
export function bg(promise: Promise<unknown>): void {
  const safe = promise.catch(() => {});
  requestCtx.getStore()?.waitUntil(safe);
}

function wrap(handler: LegacyHandler) {
  return async (c: Context) => {
    let body: any = {};
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      body = await c.req.json().catch(() => ({}));
    }
    const req: LegacyReq = {
      method: c.req.method,
      params: c.req.param() as Record<string, string>,
      query: c.req.query(),
      body,
      headers: c.req.header(),
    };

    let status = 200;
    let payload: unknown = undefined;
    let isJson = true;
    const res: LegacyRes = {
      status(code) { status = code; return res; },
      json(data) { payload = data; isJson = true; return res; },
      send(data) {
        payload = data;
        isJson = typeof data !== "string";
        return res;
      },
    };

    await requestCtx.run(c.executionCtx, () => handler(req, res));

    if (payload === undefined) {
      return c.json({ error: "El servidor no devolvió respuesta." }, 500);
    }
    if (!isJson) return c.body(String(payload), status as any);
    return c.json(payload as any, status as any);
  };
}

export function legacyApp(app: Hono<any>): LegacyApp {
  return {
    get: (path, h) => { app.get(path, wrap(h)); },
    post: (path, h) => { app.post(path, wrap(h)); },
    all: (path, h) => { app.all(path, wrap(h)); },
  };
}
