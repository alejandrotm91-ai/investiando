import React from "react";

// Materias primas y criptomonedas en tarjetas agrupadas (metales, energía, cripto): precio, cambio del
// día y una barra de 0 al máximo histórico con la posición del precio actual.

export interface CommodityItem {
  nameEN: string;
  nameES: string;
  symbol: string;
  price: string;
  rawPrice?: number;
  high?: number;
  highFormatted?: string;
  pct: number;
  athScorePct?: number;
  distToHighPct?: number;
}

interface Props {
  commodities: CommodityItem[];
  cryptos: CommodityItem[];
  language: "EN" | "ES";
}

const METALS = /^(GC|SI|HG|PL|PA)=F$/;

export default function CommodityCards({ commodities, cryptos, language }: Props) {
  const isES = language === "ES";
  const groups = [
    { id: "metals", label: isES ? "Metales" : "Metals", dot: "bg-amber-400", items: commodities.filter((c) => METALS.test(c.symbol)) },
    { id: "energy", label: isES ? "Energía" : "Energy", dot: "bg-orange-500", items: commodities.filter((c) => !METALS.test(c.symbol)) },
    { id: "crypto", label: isES ? "Criptomonedas" : "Crypto", dot: "bg-blue-400", items: cryptos },
  ].filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="flex items-center gap-1.5 mb-2 px-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full ${g.dot}`} />
            {g.label}
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
            {g.items.map((it) => {
              const up = it.pct >= 0;
              const pos = Math.max(2, Math.min(100, it.athScorePct ?? 0));
              const dist = it.distToHighPct ?? (it.athScorePct !== undefined ? 100 - it.athScorePct : null);
              const dollar = g.id === "crypto" || /USD/.test(it.symbol) ? "$" : "";
              return (
                <div key={it.symbol} className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-3 hover:border-slate-700 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-100 truncate">{isES ? it.nameES : it.nameEN}</div>
                      <div className="text-[9px] font-mono text-slate-500">{it.symbol}</div>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${
                        up ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                      }`}
                    >
                      {up ? "+" : ""}
                      {it.pct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-lg font-black font-mono text-slate-100 mt-1.5 leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {dollar}
                    {it.price}
                  </div>
                  {/* Posición entre 0 y el máximo histórico */}
                  {it.athScorePct !== undefined && (
                    <div className="mt-2.5">
                      <div className="relative h-1.5 rounded-full bg-slate-800">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-slate-600 to-emerald-500" style={{ width: `${pos}%` }} />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-emerald-500 shadow"
                          style={{ left: `${pos}%` }}
                        />
                      </div>
                      <div
                        className="flex justify-between gap-2 mt-1 text-[9px] font-mono text-slate-500 whitespace-nowrap"
                        title={isES ? "Distancia al máximo de referencia" : "Distance to the reference high"}
                      >
                        <span>{dist !== null ? (dist <= 0.5 ? (isES ? "En máximos" : "At high") : `−${dist.toFixed(1)}%`) : ""}</span>
                        {it.highFormatted && (
                          <span className="truncate">
                            {isES ? "Máx." : "Max"} {dollar}
                            {it.highFormatted}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
