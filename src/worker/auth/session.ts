import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import type { AppEnv, Env } from "../env";

// Sesión firmada (JWT HS256 con SESSION_SECRET). Viaja en una cookie httpOnly y también se
// devuelve como "token" porque el frontend lo guarda y lo envía a /api/auth/me.
const COOKIE = "investiando_session";
const SESSION_DAYS = 30;

export interface SessionUser { email: string; id: string }

function secretKey(env: Env) {
  if (!env.SESSION_SECRET) throw new Error("Falta el secreto SESSION_SECRET.");
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function createSession(c: Context<AppEnv>, user: SessionUser): Promise<string> {
  const token = await new SignJWT({ uid: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey(c.env));
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return token;
}

export function clearSession(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE, { path: "/", secure: true });
}

export async function verifyToken(env: Env, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(env));
    if (typeof payload.sub !== "string" || typeof payload.uid !== "string") return null;
    return { email: payload.sub, id: payload.uid };
  } catch {
    return null;
  }
}

/** Sesión de la cookie o, si no hay, de la cabecera Authorization: Bearer. */
export async function readSession(c: Context<AppEnv>): Promise<SessionUser | null> {
  const fromCookie = await verifyToken(c.env, getCookie(c, COOKIE));
  if (fromCookie) return fromCookie;
  const auth = c.req.header("Authorization");
  return auth?.startsWith("Bearer ") ? verifyToken(c.env, auth.slice(7)) : null;
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await readSession(c);
  if (!user) return c.json({ error: "Sesión no iniciada o vencida." }, 401);
  c.set("user", user);
  await next();
};
