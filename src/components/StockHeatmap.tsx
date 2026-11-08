import React, { useEffect, useMemo, useRef, useState } from "react";
import { SP500_SECTOR_WEIGHT, tileColor } from "./SectorHeatmap";

// Mapa de calor por acciones, al estilo Finviz: cada sector es un bloque (tamaño = su peso aproximado
// en el S&P 500) con sus 10 mayores posiciones dentro (tamaño = su peso en el ETF del sector; color =
// rentabilidad de la acción en el periodo). Distribución "squarified" propia: la de Recharts no deja
// sitio para el nombre del sector encima de su bloque.

type Timeframe = "1D" | "1W" | "1M" | "YTD" | "1Y";

export interface StockHeatmapSector {
  ticker: string; // ETF del sector
  nameEN: string;
  nameES: string;
  pct?: number; // rentabilidad del ETF del sector en el periodo
  rsi?: number; // RSI 14 días del ETF
  holdings: { symbol: string; name: string; weight: number; price: number; returns: Partial<Record<Timeframe, number>> }[];
}

interface Props {
  sectors: StockHeatmapSector[];
  timeframe: Timeframe;
  language: "EN" | "ES";
}

interface Rect { x: number; y: number; w: number; h: number }

/** Distribución "squarified" (Bruls et al.): rectángulos lo más cuadrados posible, de mayor a menor. */
function squarify<T>(items: { value: number; item: T }[], r: Rect): (Rect & { item: T })[] {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total || r.w <= 0 || r.h <= 0) return [];
  const scale = (r.w * r.h) / total;
  const nodes = [...items].sort((a, b) => b.value - a.value).map((i) => ({ area: i.value * scale, item: i.item }));
  const out: (Rect & { item: T })[] = [];
  let rect = { ...r };
  let row: typeof nodes = [];
  const worst = (rw: typeof nodes, side: number) => {
    const sum = rw.reduce((a, n) => a + n.area, 0);
    const max = Math.max(...rw.map((n) => n.area)), min = Math.min(...rw.map((n) => n.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const layoutRow = (rw: typeof nodes) => {
    const sum = rw.reduce((a, n) => a + n.area, 0);
    if (rect.w >= rect.h) {
      const w = sum / rect.h;
      let y = rect.y;
      for (const n of rw) {
        const h = n.area / w;
        out.push({ x: rect.x, y, w, h, item: n.item });
        y += h;
      }
      rect = { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h };
    } else {
      const h = sum / rect.w;
      let x = rect.x;
      for (const n of rw) {
        const w = n.area / h;
        out.push({ x, y: rect.y, w, h, item: n.item });
        x += w;
      }
      rect = { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h };
    }
  };
  for (const n of nodes) {
    const side = Math.min(rect.w, rect.h);
    if (row.length === 0 || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else {
      layoutRow(row);
      row = [n];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

const HEADER = 16; // alto de la franja con el nombre del sector
const GAP = 2;

export default function StockHeatmap({ sectors, timeframe, language }: Props) {
  const isES = language === "ES";
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ x: number; y: number; d: any } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Escala de color: el percentil 90 de los movimientos (unas pocas acciones extremas no apagan el resto)
  const scale = useMemo(() => {
    const vals = sectors.flatMap((s) => s.holdings.map((h) => Math.abs(h.returns[timeframe] ?? 0))).sort((a, b) => a - b);
    return Math.max(vals[Math.floor(vals.length * 0.9)] ?? 1, 0.5);
  }, [sectors, timeframe]);

  const layout = useMemo(() => {
    if (!size.w || !size.h) return [];
    const blocks = squarify(
      sectors.filter((s) => s.holdings.length).map((s) => ({ value: SP500_SECTOR_WEIGHT[s.ticker] ?? 2, item: s })),
      { x: 0, y: 0, w: size.w, h: size.h }
    );
    return blocks.map((b) => {
      const inner = { x: b.x + GAP, y: b.y + HEADER, w: Math.max(0, b.w - 2 * GAP), h: Math.max(0, b.h - HEADER - GAP) };
      const tiles = squarify(
        b.item.holdings.slice(0, 10).map((h) => ({ value: Math.max(h.weight, 0.1), item: h })),
        inner
      );
      return { ...b, tiles };
    });
  }, [sectors, size]);

  return (
    <div className="space-y-2">
      <div ref={box} className="relative h-[560px] sm:h-[540px] select-none" onMouseLeave={() => setHover(null)}>
        <svg width={size.w} height={size.h} className="block">
          {layout.map((b) => (
            <g key={b.item.ticker}>
              <rect x={b.x + 0.5} y={b.y + 0.5} width={Math.max(0, b.w - 1)} height={Math.max(0, b.h - 1)} rx={4} fill="#0f111a" stroke="#0b0d14" />
              {b.w > 40 && (() => {
                // Nombre del sector + rentabilidad + (RSI). Si no cabe: (RSI n) → (n) → sin RSI → nombre
                // acortado → solo el nombre. Anchos aproximados a 9.5 px en negrita.
                const avail = b.w - 10;
                const name = (isES ? b.item.nameES : b.item.nameEN).toUpperCase();
                const p = b.item.pct;
                const pctFull = typeof p === "number" ? `${p >= 0 ? "+" : ""}${p.toFixed(2)}%` : "";
                const rsiVal = typeof b.item.rsi === "number" ? b.item.rsi.toFixed(0) : "";
                const wName = (t: string) => t.length * 7.1;
                const wPct = (t: string) => (t ? t.length * 6.1 + 5 : 0);
                const wRsi = (t: string) => (t ? t.length * 5.7 + 4 : 0);
                const cut = (n: number) => (n >= name.length ? name : n >= 4 ? `${name.slice(0, n - 1)}…` : "");
                let shown = name, pctTxt = pctFull, rsiTxt = "";
                const opts = rsiVal ? [`(RSI ${rsiVal})`, `(${rsiVal})`, ""] : [""];
                const fit = opts.find((r) => wName(name) + wPct(pctFull) + wRsi(r) <= avail);
                if (fit !== undefined) rsiTxt = fit;
                else {
                  const n = Math.floor((avail - wPct(pctFull)) / 7.1);
                  if (n >= 4) shown = cut(n);
                  else {
                    pctTxt = "";
                    shown = cut(Math.floor(avail / 7.1));
                  }
                }
                return (
                  <text x={b.x + 5} y={b.y + 11.5} fontSize={9.5} fontWeight={800} style={{ letterSpacing: "0.04em" }}>
                    {shown && <tspan fill="#cbd5e1">{shown}</tspan>}
                    {pctTxt && (
                      <tspan dx={shown ? 5 : 0} fill={(p ?? 0) >= 0 ? "#34d399" : "#fb7185"} style={{ fontVariantNumeric: "tabular-nums" }}>
                        {pctTxt}
                      </tspan>
                    )}
                    {rsiTxt && (
                      <tspan dx={4} fill="#94a3b8" fontWeight={600}>
                        {rsiTxt}
                      </tspan>
                    )}
                  </text>
                );
              })()}
              {b.tiles.map((t) => {
                const r = t.item.returns[timeframe] ?? 0;
                const showTicker = t.w > 26 && t.h > 14;
                const showPct = t.w > 34 && t.h > 30;
                const fs = Math.max(8, Math.min(18, Math.min(t.w / 4.2, t.h / 2.8)));
                return (
                  <g
                    key={t.item.symbol}
                    onMouseMove={(e) => {
                      const bb = box.current!.getBoundingClientRect();
                      setHover({ x: e.clientX - bb.left, y: e.clientY - bb.top, d: { ...t.item, r, sector: isES ? b.item.nameES : b.item.nameEN } });
                    }}
                    style={{ cursor: "default" }}
                  >
                    <rect x={t.x + 1} y={t.y + 1} width={Math.max(0, t.w - 2)} height={Math.max(0, t.h - 2)} rx={2} fill={tileColor(r, scale)} />
                    {showTicker && (
                      <text x={t.x + t.w / 2} y={t.y + t.h / 2 + (showPct ? -fs * 0.15 : fs * 0.35)} textAnchor="middle" fill="#ffffff" fontSize={fs} fontWeight={800}>
                        {t.item.symbol}
                      </text>
                    )}
                    {showPct && (
                      <text x={t.x + t.w / 2} y={t.y + t.h / 2 + fs * 0.85} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={Math.max(8, fs * 0.62)} style={{ fontVariantNumeric: "tabular-nums" }}>
                        {r >= 0 ? "+" : ""}
                        {r.toFixed(2)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        {hover && (
          <div
            className="absolute z-10 pointer-events-none bg-theme-sidebar border border-theme-border rounded-xl px-3 py-2 shadow-xl text-xs min-w-[170px]"
            style={{ left: Math.min(hover.x + 12, Math.max(0, size.w - 190)), top: Math.min(hover.y + 12, Math.max(0, size.h - 110)) }}
          >
            <div className="font-bold text-theme-text-bright">
              {hover.d.symbol} <span className="font-normal text-theme-text-muted">· {hover.d.sector}</span>
            </div>
            <div className="text-[10px] text-theme-text-muted truncate max-w-[220px]">{hover.d.name}</div>
            <div className="flex justify-between gap-3 mt-1">
              <span className="text-theme-text-muted">{timeframe}</span>
              <span className="font-mono font-bold" style={{ color: hover.d.r >= 0 ? "#34d399" : "#fb7185" }}>
                {hover.d.r >= 0 ? "+" : ""}
                {hover.d.r.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-theme-text-muted">{isES ? "Precio" : "Price"}</span>
              <span className="font-mono text-theme-text-bright">${Number(hover.d.price).toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-theme-text-muted">{isES ? "Peso en su sector" : "Weight in sector"}</span>
              <span className="font-mono text-theme-text-bright">{Number(hover.d.weight).toFixed(1)}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-theme-text-muted font-mono">
        <span>
          {isES
            ? "Las 10 mayores acciones de cada sector · Tamaño: peso · Color: rentabilidad"
            : "Top 10 stocks of each sector · Size: weight · Color: return"}{" "}
          ({timeframe})
        </span>
        <span className="flex items-center gap-1.5">
          <span>−{scale.toFixed(1)}%</span>
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${tileColor(-scale, scale)}, ${tileColor(0, scale)}, ${tileColor(scale, scale)})` }} />
          <span>+{scale.toFixed(1)}%</span>
        </span>
      </div>
    </div>
  );
}
