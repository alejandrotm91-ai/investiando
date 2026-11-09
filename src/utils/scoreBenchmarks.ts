// Referencia del score de salud: métricas reales (scoreMetrics.ts) de las empresas con estados de la
// SEC guardados, agrupadas por sector. El motor (engine.ts) compara cada empresa con las de su sector.
// En el navegador se carga de /api/scores/benchmarks; en el servidor la rellena scores.ts. Sin carga,
// no hay referencia (el motor devuelve factores vacíos, nunca datos inventados).

import type { ScoreFlags, ScoreMetric } from "./scoreMetrics";

export interface BenchmarkRow {
  symbol: string;
  sector: string | null;
  metrics: Partial<Record<ScoreMetric, number | null>>;
  flags?: ScoreFlags;
  /** Cotización de Yahoo al calcular la referencia (para el generador de carteras). */
  quote?: { name: string | null; price: number | null; marketCap: number | null; divYield: number | null };
}

const store = new Map<string, BenchmarkRow>();
let version = 0;
let asOf: string | null = null;
const listeners = new Set<() => void>();

export const getScoreBenchmarkVersion = () => version;
export const getScoreBenchmarkAsOf = () => asOf;
export const getBenchmark = (symbol: string) => store.get(symbol.toUpperCase()) ?? store.get(symbol.toUpperCase().replace(".", "-")) ?? null;
export const getAllBenchmarks = () => Array.from(store.values());

export function setScoreBenchmarks(rows: BenchmarkRow[], date?: string | null) {
  store.clear();
  for (const r of rows) if (r?.symbol) store.set(r.symbol.toUpperCase(), r);
  asOf = date ?? null;
  version++;
  listeners.forEach((l) => l());
}

export function subscribeScoreBenchmarks(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let loading: Promise<void> | null = null;
/** Navegador: carga la referencia una vez por sesión. */
export function loadScoreBenchmarks(): Promise<void> {
  if (typeof (globalThis as any).document === "undefined") return Promise.resolve();
  if (!loading) {
    loading = fetch("/api/scores/benchmarks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (d && Array.isArray(d.rows)) setScoreBenchmarks(d.rows, d.asOf ?? null);
      })
      .catch(() => {
        loading = null; // se reintenta la próxima vez
      });
  }
  return loading;
}
