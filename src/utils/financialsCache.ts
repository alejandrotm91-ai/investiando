// Shared in-memory and persistent client-side cache for stock financials

const financialsGlobalCache: Record<string, { annual: any[]; quarterly: any[] }> = {};

/** Normalize ticker key to uppercase */
export function normalizeFinancialKey(ticker: string): string {
  return (ticker || "").trim().toUpperCase();
}

/** Retrieve cached financials for a ticker if available */
export function getCachedFinancials(ticker: string): { annual: any[]; quarterly: any[] } | null {
  const key = normalizeFinancialKey(ticker);
  return financialsGlobalCache[key] || financialsGlobalCache[ticker] || null;
}

/** Get snapshot of all currently cached financials */
export function getAllCachedFinancials(): Record<string, { annual: any[]; quarterly: any[] }> {
  return { ...financialsGlobalCache };
}

/** Store financials for a ticker in memory cache */
export function setCachedFinancials(ticker: string, data: { annual: any[]; quarterly: any[] }) {
  if (!data || (data as any).error) return;
  const key = normalizeFinancialKey(ticker);
  financialsGlobalCache[key] = data;
  financialsGlobalCache[ticker] = data;
}

/** Batch store financials into memory cache */
export function setBatchCachedFinancials(map: Record<string, { annual: any[]; quarterly: any[] }>) {
  if (!map) return;
  Object.entries(map).forEach(([key, val]) => {
    if (val && !(val as any).error) {
      setCachedFinancials(key, val);
    }
  });
}

/**
 * Fetch financials for multiple tickers efficiently, using cache where possible
 */
export async function fetchFinancialsForTickers(
  tickers: string[]
): Promise<Record<string, { annual: any[]; quarterly: any[] }>> {
  const uniqueTickers = Array.from(
    new Set(
      tickers
        .filter((t) => t && t.toUpperCase() !== "CASH" && t.toUpperCase() !== "USD")
        .map((t) => t.trim())
    )
  );

  const missingTickers = uniqueTickers.filter((t) => !getCachedFinancials(t));

  if (missingTickers.length > 0) {
    const results = await Promise.all(
      missingTickers.map(async (t) => {
        try {
          const res = await fetch("/api/portfolio/financials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: t }),
          });
          const data = await res.json();
          return { ticker: t, data };
        } catch (e) {
          return { ticker: t, data: null };
        }
      })
    );

    const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
    results.forEach((r) => {
      if (r.data && !r.data.error) {
        if (Array.isArray(r.data.annual)) r.data.annual.sort(sortFn);
        if (Array.isArray(r.data.quarterly)) r.data.quarterly.sort(sortFn);
        setCachedFinancials(r.ticker, r.data);
      }
    });
  }

  return getAllCachedFinancials();
}
