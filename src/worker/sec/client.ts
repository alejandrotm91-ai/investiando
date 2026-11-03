// Acceso a EDGAR (SEC). Reglas de la SEC: User-Agent que identifique a quien consulta y como
// mucho 10 peticiones por segundo. Aquí se va a ~6/s por instancia del Worker.
// User-Agent: secreto SEC_USER_AGENT (p. ej. "investiando.app contacto@tudominio.com"); sin él se
// usa uno genérico con la dirección de la app.

const DEFAULT_UA = "investiando.app research bot (https://investiando.alejandrotm91.workers.dev)";
const GAP_MS = 160;
let nextSlot = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function secFetch(url: string, userAgent?: string): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + GAP_MS;
    if (wait) await sleep(wait);
    const r = await fetch(url, { headers: { "User-Agent": userAgent || DEFAULT_UA, Accept: "application/json, text/plain, */*" } });
    if (r.ok || r.status === 404) return r;
    lastStatus = r.status;
    // 403/429: la SEC limita; 5xx: fallo pasajero. Se espera y se repite.
    await r.body?.cancel();
    await sleep(1000 * (attempt + 1) * (r.status === 429 || r.status === 403 ? 3 : 1));
  }
  throw new Error(`SEC ${lastStatus} en ${url}`);
}

export const cik10 = (cik: number) => String(cik).padStart(10, "0");
