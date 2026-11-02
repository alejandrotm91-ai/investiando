import React, { useEffect, useState } from "react";

export interface TickerItem {
  symbol: string;
  price: number;
  changePct: number;
}


export const TopTickersMarquee: React.FC = () => {
  // Empieza vacía: no se muestran precios fijos mientras llegan los reales.
  const [tickers, setTickers] = useState<TickerItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchTopTickers = async () => {
      try {
        const res = await fetch("/api/market/top50");
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0 && isMounted) {
              setTickers(data);
            }
          }
        }
      } catch {
        // Sin respuesta: se mantienen los últimos precios mostrados
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
