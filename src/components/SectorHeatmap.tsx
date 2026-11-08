import React from "react";
import { Treemap, Tooltip, ResponsiveContainer } from "recharts";

// Mapa de calor de los 11 sectores del S&P 500 (ETF SPDR): tamaño = peso aproximado del sector en el
// índice; color = rentabilidad en el periodo elegido (verde sube, rojo baja, gris ≈ 0). Clic en un
// sector → se abre su top 10 (MarketDashboard).

export interface HeatmapSector {
  key: string;
  ticker: string;
  nameEN: string;
  nameES: string;
  price?: number;
  rsi14: number;
}

// Peso aproximado de cada sector en el S&P 500 (%, se revisa de vez en cuando; solo da el tamaño)
const SP500_SECTOR_WEIGHT: Record<string, number> = {
  XLK: 32, XLF: 13.5, XLY: 10.5, XLC: 10, XLV: 9, XLI: 8.5, XLP: 5.5, XLE: 3, XLU: 2.5, XLRE: 2.2, XLB: 2,
};

interface Props {
  sectors: HeatmapSector[];
  pctOf: (s: HeatmapSector) => number;
  timeframe: string;
  selected: string | null;
  onSelect: (ticker: string | null) => void;
  language: "EN" | "ES";
}

/** Color divergente: gris neutro en 0, verde o rojo más intenso cuanto mayor el movimiento. */
function tileColor(pct: number, scale: number): string {
  const t = Math.max(-1, Math.min(1, pct / scale));
  const neutral = [87, 83, 78]; // stone-600
  const target = t >= 0 ? [21, 128, 61] : [185, 28, 28]; // green-700 / red-700
  const k = Math.pow(Math.abs(t), 0.7);
  const c = neutral.map((n, i) => Math.round(n + (target[i] - n) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function SectorHeatmap({ sectors, pctOf, timeframe, selected, onSelect, language }: Props) {
  const isES = language === "ES";
  const maxAbs = Math.max(...sectors.map((s) => Math.abs(pctOf(s))), 0.5);
  const data = sectors.map((s) => ({
    name: isES ? s.nameES : s.nameEN,
    ticker: s.ticker,
    size: SP500_SECTOR_WEIGHT[s.ticker] ?? 2,
    pct: pctOf(s),
    rsi: s.rsi14,
    price: s.price,
    fill: tileColor(pctOf(s), maxAbs),
  }));

  const Tile = (props: any) => {
    const { x, y, width, height, name, ticker, pct, fill, rsi, depth } = props;
    if (depth !== 1 || width <= 0 || height <= 0) return null;
    const sel = selected === ticker;
    const big = width > 110 && height > 70;
    const mid = width > 64 && height > 40;
    const pctText = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    const maxChars = Math.max(3, Math.floor((width - 12) / 7));
    const label = name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
    return (
      <g style={{ cursor: "pointer" }}>
        <rect x={x} y={y} width={width} height={height} rx={6} fill={fill} stroke={sel ? "#f59e0b" : "rgba(15,17,26,0.9)"} strokeWidth={sel ? 3 : 2} />
        {mid ? (
          <>
            <text x={x + 8} y={y + 18} fill="#ffffff" fontSize={big ? 13 : 11} fontWeight={700}>
              {label}
            </text>
            <text x={x + 8} y={y + (big ? 40 : 33)} fill="#ffffff" fontSize={big ? 18 : 13} fontWeight={800} style={{ fontVariantNumeric: "tabular-nums" }}>
              {pctText}
            </text>
            {big && (
              <text x={x + 8} y={y + height - 9} fill="rgba(255,255,255,0.75)" fontSize={10} fontFamily="monospace">
                {ticker} · RSI {rsi?.toFixed(0)}
              </text>
            )}
          </>
        ) : width >= 26 && height >= 26 ? (
          <>
            <text x={x + width / 2} y={y + height / 2 - 2} textAnchor="middle" fill="#ffffff" fontSize={9} fontWeight={700}>
              {ticker}
            </text>
            <text x={x + width / 2} y={y + height / 2 + 9} textAnchor="middle" fill="#ffffff" fontSize={width < 48 ? 7.5 : 9} style={{ fontVariantNumeric: "tabular-nums" }}>
              {pctText}
            </text>
          </>
        ) : width >= 64 && height >= 13 ? (
          // Baldosa baja y ancha: una sola línea
          <text x={x + width / 2} y={y + height / 2 + 3} textAnchor="middle" fill="#ffffff" fontSize={9} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>
            {ticker} {pctText}
          </text>
        ) : null}
      </g>
    );
  };

  const TipBox = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    if (!d?.ticker) return null;
    return (
      <div className="bg-theme-sidebar border border-theme-border rounded-xl px-3 py-2 shadow-xl text-xs min-w-[170px]">
        <div className="font-bold text-theme-text-bright">
          {d.name} <span className="font-mono text-theme-text-muted">· {d.ticker}</span>
        </div>
        <div className="flex justify-between gap-3 mt-1">
          <span className="text-theme-text-muted">{timeframe}</span>
          <span className="font-mono font-bold" style={{ color: d.pct >= 0 ? "#34d399" : "#fb7185" }}>
            {d.pct >= 0 ? "+" : ""}
            {d.pct.toFixed(2)}%
          </span>
        </div>
        {typeof d.price === "number" && (
          <div className="flex justify-between gap-3">
            <span className="text-theme-text-muted">{isES ? "Precio ETF" : "ETF price"}</span>
            <span className="font-mono text-theme-text-bright">${d.price.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span className="text-theme-text-muted">RSI 14D</span>
          <span className="font-mono text-theme-text-bright">{d.rsi?.toFixed(1)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-theme-text-muted">{isES ? "Peso en el S&P 500" : "S&P 500 weight"}</span>
          <span className="font-mono text-theme-text-bright">~{d.size}%</span>
        </div>
        <div className="text-[10px] text-theme-text-muted mt-1">{isES ? "Clic para ver su top 10" : "Click to see its top 10"}</div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="h-[340px] sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={4 / 3}
            isAnimationActive={false}
            content={<Tile />}
            onClick={(node: any) => node?.ticker && onSelect(selected === node.ticker ? null : node.ticker)}
          >
            <Tooltip content={<TipBox />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      {/* Escala de color */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-theme-text-muted font-mono">
        <span>{isES ? "Tamaño: peso aproximado en el S&P 500 · Color: rentabilidad" : "Size: approx. S&P 500 weight · Color: return"} ({timeframe})</span>
        <span className="flex items-center gap-1.5">
          <span>−{maxAbs.toFixed(1)}%</span>
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${tileColor(-maxAbs, maxAbs)}, ${tileColor(0, maxAbs)}, ${tileColor(maxAbs, maxAbs)})` }} />
          <span>+{maxAbs.toFixed(1)}%</span>
        </span>
      </div>
    </div>
  );
}
