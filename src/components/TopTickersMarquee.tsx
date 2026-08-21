import React, { useEffect, useState } from "react";

export interface TickerItem {
  symbol: string;
  price: number;
  changePct: number;
}

const DEFAULT_TOP_50: TickerItem[] = [
  { symbol: "NVDA", price: 128.50, changePct: 2.35 },
  { symbol: "AAPL", price: 224.30, changePct: -0.42 },
  { symbol: "MSFT", price: 448.90, changePct: 1.15 },
  { symbol: "GOOGL", price: 334.53, changePct: -0.65 },
  { symbol: "AMZN", price: 239.00, changePct: 5.45 },
  { symbol: "META", price: 535.05, changePct: -8.63 },
  { symbol: "TSLA", price: 309.69, changePct: 3.81 },
  { symbol: "BRK-B", price: 508.50, changePct: -0.13 },
  { symbol: "AVGO", price: 162.30, changePct: 1.85 },
  { symbol: "LLY", price: 845.20, changePct: 0.92 },
  { symbol: "JPM", price: 351.48, changePct: 1.96 },
  { symbol: "V", price: 365.68, changePct: -0.83 },
  { symbol: "UNH", price: 422.95, changePct: 0.57 },
  { symbol: "XOM", price: 157.07, changePct: 0.20 },
  { symbol: "MA", price: 462.10, changePct: -0.45 },
  { symbol: "PG", price: 168.30, changePct: 0.32 },
  { symbol: "COST", price: 852.40, changePct: 1.12 },
  { symbol: "JNJ", price: 256.16, changePct: -3.53 },
  { symbol: "HD", price: 365.80, changePct: 0.78 },
  { symbol: "ABBV", price: 174.20, changePct: 0.41 },
  { symbol: "BAC", price: 39.80, changePct: 1.25 },
  { symbol: "NFLX", price: 658.00, changePct: 2.10 },
  { symbol: "WMT", price: 68.50, changePct: 0.65 },
  { symbol: "CRM", price: 254.30, changePct: -1.15 },
  { symbol: "AMD", price: 142.60, changePct: 2.40 },
  { symbol: "CVX", price: 158.20, changePct: -0.35 },
  { symbol: "ORCL", price: 138.90, changePct: 1.62 },
  { symbol: "DIS", price: 96.40, changePct: -0.85 },
  { symbol: "PEP", price: 172.50, changePct: 0.15 },
  { symbol: "KO", price: 64.20, changePct: 0.28 },
  { symbol: "TSM", price: 168.50, changePct: 2.80 },
  { symbol: "ADBE", price: 512.30, changePct: -0.92 },
  { symbol: "ACN", price: 298.40, changePct: 0.48 },
  { symbol: "CSCO", price: 46.80, changePct: -0.22 },
  { symbol: "NKE", price: 75.40, changePct: -1.45 },
  { symbol: "MCD", price: 268.90, changePct: 0.35 },
  { symbol: "ABT", price: 105.20, changePct: 0.18 },
  { symbol: "MRK", price: 124.60, changePct: -0.62 },
  { symbol: "DHR", price: 258.40, changePct: 0.85 },
  { symbol: "TXN", price: 198.20, changePct: 1.05 },
  { symbol: "PM", price: 108.50, changePct: 0.42 },
  { symbol: "AMGN", price: 312.40, changePct: -0.38 },
  { symbol: "IBM", price: 184.60, changePct: 0.72 },
  { symbol: "GE", price: 162.50, changePct: 1.35 },
  { symbol: "INTU", price: 638.20, changePct: -0.75 },
  { symbol: "QCOM", price: 172.80, changePct: 1.95 },
  { symbol: "CAT", price: 345.60, changePct: 0.88 },
  { symbol: "NOW", price: 812.50, changePct: -0.52 },
  { symbol: "AMAT", price: 208.40, changePct: 2.15 },
  { symbol: "PLTR", price: 28.50, changePct: 4.12 },
];

export const TopTickersMarquee: React.FC = () => {
  const [tickers, setTickers] = useState<TickerItem[]>(DEFAULT_TOP_50);

  useEffect(() => {
    let isMounted = true;
    const fetchTopTickers = async () => {
      try {
        const res = await fetch("/api/market/top50");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0 && isMounted) {
            setTickers(data);
          }
        }
      } catch {
        // Fallback silently to default tickers without logging errors
      }
    };

    fetchTopTickers();
    const interval = setInterval(fetchTopTickers, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const renderTickerList = (prefix: string) => (
    <div className="flex items-center gap-6 shrink-0">
      {tickers.map((item, idx) => {
        const isUp = item.changePct >= 0;
        return (
          <div
            key={`${prefix}-${item.symbol}-${idx}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono select-none flex-shrink-0"
          >
            <span className="font-extrabold text-slate-100 tracking-tight">
              {item.symbol}
            </span>
            <span className="text-slate-300 font-medium">
              ${item.price.toFixed(2)}
            </span>
            <span
              className={`font-bold flex items-center gap-0.5 ${
                isUp ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              <span>{isUp ? "▲" : "▼"}</span>
              <span>{Math.abs(item.changePct).toFixed(2)}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="relative flex-1 overflow-hidden min-w-0 max-w-full py-1">
      {/* Marquee Wrapper */}
      <div className="flex w-max overflow-hidden">
        <div className="flex items-center gap-6 animate-ticker hover:[animation-play-state:paused]">
          {renderTickerList("set1")}
          {renderTickerList("set2")}
        </div>
      </div>
    </div>
  );
};
