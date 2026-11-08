import { Hono } from "hono";
import type { AppEnv } from "./env";
import { getYahoo } from "./yahoo";
import { rememberPayload, recallPayload } from "./quoteCache";

// Mapa de calor por acciones (Market → Sector Performance → Stocks): las mayores empresas del
// S&P 500 de cada sector, con capitalización (tamaño de la baldosa), precio y rentabilidad 1D, 1W,
// 1M, YTD y 1Y. La lista es fija (GICS, revisar de vez en cuando); el tamaño sale de la
// capitalización en vivo, así que el orden de la lista no importa. GOOG no va (Yahoo da la
// capitalización de toda Alphabet en GOOGL y GOOG, y se contaría dos veces).
export const SECTOR_MAP_TICKERS: Record<string, string[]> = {
  XLK: ["NVDA", "AAPL", "MSFT", "AVGO", "ORCL", "AMD", "PLTR", "CSCO", "IBM", "CRM", "MU", "LRCX", "AMAT", "INTU", "NOW", "TXN", "QCOM", "KLAC", "APH", "ADI", "ANET", "INTC", "ACN", "PANW", "CRWD", "ADBE", "SNPS", "CDNS", "DELL", "MSI"],
  XLF: ["BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "C", "AXP", "SCHW", "SPGI", "BLK", "PGR", "COF", "BX", "CB", "MRSH", "ICE", "CME", "KKR", "PNC", "USB", "AON", "MCO", "PYPL", "BNY", "APO", "TRV", "AJG"],
  XLY: ["AMZN", "TSLA", "HD", "MCD", "BKNG", "TJX", "LOW", "SBUX", "NKE", "ORLY", "ABNB", "MAR", "AZO", "CMG", "GM", "HLT", "RCL", "DASH", "ROST", "F", "DHI", "YUM", "EBAY", "LULU", "TSCO", "CCL", "EXPE", "GRMN", "LEN", "PHM"],
  XLC: ["META", "GOOGL", "NFLX", "TMUS", "DIS", "T", "VZ", "CMCSA", "TTWO", "CHTR", "OMC", "LYV", "FOXA", "NWSA", "TKO", "MTCH"],
  XLV: ["LLY", "JNJ", "ABBV", "UNH", "MRK", "ABT", "TMO", "ISRG", "AMGN", "BSX", "PFE", "DHR", "GILD", "SYK", "VRTX", "MDT", "BMY", "CVS", "CI", "ELV", "MCK", "HCA", "ZTS", "REGN", "BDX", "COR", "EW", "IDXX"],
  XLI: ["GE", "CAT", "RTX", "UBER", "HON", "UNP", "ETN", "BA", "DE", "GEV", "LMT", "PH", "TT", "ADP", "WM", "MMM", "GD", "NOC", "UPS", "CTAS", "TDG", "EMR", "ITW", "CSX", "HWM", "JCI", "NSC", "FDX", "PWR", "CARR"],
  XLP: ["WMT", "COST", "PG", "KO", "PM", "PEP", "MO", "MDLZ", "CL", "MNST", "TGT", "KMB", "KDP", "KR", "SYY", "GIS", "HSY", "STZ", "ADM", "KHC", "DG", "EL", "CHD", "DLTR"],
  XLE: ["XOM", "CVX", "COP", "EOG", "WMB", "KMI", "SLB", "PSX", "MPC", "OKE", "VLO", "OXY", "BKR", "FANG", "EQT", "TRGP", "DVN", "HAL", "EXE", "TPL", "APA"],
  XLU: ["NEE", "SO", "DUK", "CEG", "VST", "AEP", "SRE", "D", "EXC", "XEL", "PEG", "ETR", "PCG", "ED", "WEC", "NRG", "DTE", "AEE", "PPL", "EIX", "ES", "CNP", "FE", "ATO", "AWK"],
  XLRE: ["PLD", "AMT", "WELL", "EQIX", "SPG", "DLR", "O", "PSA", "CCI", "CBRE", "VICI", "CSGP", "EXR", "VTR", "IRM", "SBAC", "WY", "INVH", "ESS", "MAA", "KIM", "ARE"],
  XLB: ["LIN", "SHW", "ECL", "APD", "NEM", "FCX", "CTVA", "VMC", "MLM", "DD", "NUE", "PPG", "IFF", "SW", "DOW", "LYB", "PKG", "IP", "BALL", "STLD", "AMCR", "AVY", "CF", "MOS", "ALB"],
};

type Tf = "1D" | "1W" | "1M" | "YTD" | "1Y";
interface MapStock {
  symbol: string;
  name: string;
  cap: number | null; // capitalización en dólares
  price: number | null;
  returns: Partial<Record<Tf, number>>;
}
type MapData = Record<string, MapStock[]>;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const QUOTE_TTL = 3 * 60 * 1000; // precios, 1D y capitalización
const HIST_TTL = 60 * 60 * 1000; // cierres de referencia (1W, 1M, YTD, 1Y)
const PAYLOAD_KEY = "SECTORMAP";

let cache: { data: MapData; at: number } | null = null;
// Cierres de referencia por ticker: [hace 1 semana, hace 1 mes, último del año anterior, hace 1 año, último]
let refCloses: { data: Record<string, (number | null)[]>; at: number } | null = null;
let inflight: Promise<void> | null = null;

const pct = (now: number | null | undefined, ref: number | null | undefined) =>
  now && ref && ref > 0 ? Number(((now / ref - 1) * 100).toFixed(2)) : undefined;

/** Cierres diarios de un año para hasta 20 tickers por llamada (endpoint "spark" de Yahoo). */
async function fetchRefCloses(symbols: string[]): Promise<Record<string, (number | null)[]>> {
  const out: Record<string, (number | null)[]> = {};
  const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000;
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(chunk.join(","))}&range=1y&interval=1d`;
        const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
        if (!r.ok) return;
        const j: any = await r.json();
        for (const res of j?.spark?.result ?? []) {
          const resp = res?.response?.[0];
          const ts: number[] = resp?.timestamp ?? [];
          const closes: (number | null)[] = resp?.indicators?.quote?.[0]?.close ?? [];
          const pts = ts.map((t, i) => [t, closes[i]] as [number, number | null]).filter(([, c]) => typeof c === "number" && c > 0) as [number, number][];
          if (pts.length < 2) continue;
          const n = pts.length;
          const prevYear = [...pts].reverse().find(([t]) => t < startOfYear)?.[1] ?? null;
          out[String(res.symbol).toUpperCase()] = [
            pts[Math.max(0, n - 6)][1],
            pts[Math.max(0, n - 22)][1],
            prevYear,
            pts[0][1],
            pts[n - 1][1],
          ];
        }
      } catch {
        // ese grupo se queda sin histórico; se reintenta en el siguiente refresco
      }
    })
  );
  return out;
}

async function refresh(): Promise<void> {
  const all = Object.values(SECTOR_MAP_TICKERS).flat();
  const prev = cache?.data ?? {};
  const prevBySym = new Map(Object.values(prev).flat().map((s) => [s.symbol, s]));

  // Cotizaciones en grupos de 100 (precio, 1D, capitalización, nombre)
  const quotes: Record<string, any> = {};
  const yf = getYahoo();
  await Promise.all(
    Array.from({ length: Math.ceil(all.length / 100) }, (_, i) => all.slice(i * 100, i * 100 + 100)).map(async (chunk) => {
      try {
        const res: any = await Promise.race([
          yf.quote(chunk, {}, { validateResult: false }),
          new Promise((r) => setTimeout(() => r(null), 8000)),
        ]);
        for (const q of Array.isArray(res) ? res : []) if (q?.symbol) quotes[String(q.symbol).toUpperCase()] = q;
      } catch {
        // se usan los datos anteriores de esos tickers
      }
    })
  );

  if (!refCloses || Date.now() - refCloses.at > HIST_TTL) {
    const fresh = await fetchRefCloses(all);
    if (Object.keys(fresh).length) refCloses = { data: { ...(refCloses?.data ?? {}), ...fresh }, at: Date.now() };
  }
  const refs = refCloses?.data ?? {};

  let live = 0;
  const data: MapData = {};
  for (const [etf, syms] of Object.entries(SECTOR_MAP_TICKERS)) {
    data[etf] = syms.map((sym) => {
      const q = quotes[sym];
      const old = prevBySym.get(sym);
      const ref = refs[sym];
      const price: number | null = typeof q?.regularMarketPrice === "number" && q.regularMarketPrice > 0 ? q.regularMarketPrice : (ref?.[4] ?? old?.price ?? null);
      if (q) live++;
      const r1d = typeof q?.regularMarketChangePercent === "number" ? Number(q.regularMarketChangePercent.toFixed(2)) : old?.returns["1D"];
      const returns: Partial<Record<Tf, number>> = {
        "1D": r1d,
        "1W": pct(price, ref?.[0]) ?? old?.returns["1W"],
        "1M": pct(price, ref?.[1]) ?? old?.returns["1M"],
        YTD: pct(price, ref?.[2]) ?? old?.returns.YTD,
        "1Y": pct(price, ref?.[3]) ?? (typeof q?.fiftyTwoWeekChangePercent === "number" ? Number(q.fiftyTwoWeekChangePercent.toFixed(2)) : old?.returns["1Y"]),
      };
      return {
        symbol: sym,
        name: q?.longName || q?.shortName || old?.name || sym,
        cap: typeof q?.marketCap === "number" && q.marketCap > 0 ? q.marketCap : (old?.cap ?? null),
        price: price != null ? Number(price.toFixed(2)) : null,
        returns,
      };
    });
  }
  cache = { data, at: Date.now() };
  // Solo se guarda una respuesta con la mayoría de las cotizaciones en vivo
  if (live > all.length / 2) await rememberPayload(PAYLOAD_KEY, data).catch(() => {});
}

function refreshOnce(): Promise<void> {
  if (!inflight) inflight = refresh().finally(() => (inflight = null));
  return inflight;
}

export const sectorMapRoutes = new Hono<AppEnv>();

sectorMapRoutes.get("/", async (c) => {
  if (!cache) {
    // Arranque en frío: lo último guardado en D1 y refresco en segundo plano; si no hay nada, se espera.
    const saved = await recallPayload<MapData>(PAYLOAD_KEY);
    if (saved?.data) {
      // Solo los tickers de la lista actual (lo guardado puede ser de una lista anterior)
      const data: MapData = {};
      for (const [etf, syms] of Object.entries(SECTOR_MAP_TICKERS)) {
        const ok = new Set(syms);
        data[etf] = (saved.data[etf] ?? []).filter((x) => ok.has(x.symbol));
      }
      cache = { data, at: 0 };
      c.executionCtx.waitUntil(refreshOnce());
    } else {
      await refreshOnce();
    }
  } else if (Date.now() - cache.at > QUOTE_TTL) {
    c.executionCtx.waitUntil(refreshOnce());
  }
  c.header("Cache-Control", "public, max-age=60");
  return c.json(cache?.data ?? {});
});
