import React, { useState, useMemo, useEffect, useRef } from "react";
import { getAnalystData } from "../utils/analystData";
import { motion } from "motion/react";
import { Position } from "../types";
import { getRawFeatures, buildScores, overrideFeaturesWithFinancials } from "../utils/engine";
import { getStockScore, calculatePortfolioScoreFromMatrix } from "../utils/stockScoresMatrix";
import { useScoreBenchmarks } from "../utils/useScoreBenchmarks";
import { dcfPerShare, epsFairValue, FV_RANGES, type DcfScenario, type FvRange } from "../utils/holdingsValuation";
import { expectedAnnualReturn, type ExpectedReturn } from "../utils/expectedReturn";
import { getCachedFinancials, getAllCachedFinancials, setCachedFinancials } from "../utils/financialsCache";
import { CompanyFinancials } from "./CompanyFinancials";
import { Table, LayoutGrid, Edit, Plus, Trash2, Search, Loader2, Briefcase, PieChart, PieChart as PieChartIcon, TrendingUp, TrendingDown, Sparkles, Activity, Rocket, Target, ChevronDown, ChevronRight, Info, Award, BarChart3, FileText, Percent, Layers } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, ReferenceLine, ComposedChart, BarChart, Bar, Cell } from "recharts";

import { TICKER_CLASSIFICATION, SECTOR_SUBSECTORS } from "../data/tickerClassification";
export { TICKER_CLASSIFICATION, SECTOR_SUBSECTORS };

// Company Logo Component with CDN fallback
export const CompanyLogo = ({
  ticker,
  name,
  isCash,
  size = "md"
}: {
  ticker: string;
  name?: string;
  isCash?: boolean;
  size?: "sm" | "md" | "lg";
}) => {
  const [imgError, setImgError] = useState(false);
  const cleanTicker = ticker ? ticker.toUpperCase() : "";

  const dimClasses =
    size === "sm"
      ? "w-6 h-6 text-[10px]"
      : size === "lg"
      ? "w-9 h-9 text-xs"
      : "w-7 h-7 text-[11px]";

  if (isCash || cleanTicker === "CASH" || cleanTicker === "USD") {
    return (
      <div
        className={`${dimClasses} rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0 shadow-sm`}
        title="Efectivo / Cash"
      >
        $
      </div>
    );
  }

  const primarySrc = `https://assets.parqet.com/logos/symbol/${cleanTicker}`;
  const secondarySrc = `https://financialmodelingprep.com/image-stock/${cleanTicker}.png`;

  const [currentSrc, setCurrentSrc] = useState(primarySrc);

  useEffect(() => {
    setCurrentSrc(`https://assets.parqet.com/logos/symbol/${cleanTicker}`);
    setImgError(false);
  }, [cleanTicker]);

  const handleError = () => {
    if (currentSrc === primarySrc) {
      setCurrentSrc(secondarySrc);
    } else {
      setImgError(true);
    }
  };

  if (imgError) {
    const initial = cleanTicker.slice(0, 2);
    return (
      <div
        className={`${dimClasses} rounded-full bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center font-bold font-mono tracking-tighter flex-shrink-0 shadow-sm`}
        title={name || cleanTicker}
      >
        {initial}
      </div>
    );
  }

  return (
    <div
      className={`${dimClasses} rounded-full bg-white border border-slate-700/60 p-0.5 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm transition-transform hover:scale-105`}
      title={name || cleanTicker}
    >
      <img
        src={currentSrc}
        alt={`${cleanTicker} logo`}
        className="w-full h-full object-contain rounded-full"
        onError={handleError}
        loading="lazy"
      />
    </div>
  );
};

// Sector de Yahoo → nombre de sector que usa la app (S&P 500 / clasificación fija)
const YAHOO_SECTOR: Record<string, string> = {
  "Technology": "Technology",
  "Communication Services": "Communication Services",
  "Consumer Cyclical": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples",
  "Financial Services": "Financials",
  "Healthcare": "Healthcare",
  "Industrials": "Industrials",
  "Energy": "Energy",
  "Utilities": "Utilities",
  "Real Estate": "Real Estate",
  "Basic Materials": "Materials",
};

// Perfiles reales (sector e industria de Yahoo) de los tickers que no están en la clasificación fija.
// Se rellenan al llegar las cotizaciones de la cartera (/api/portfolio/quotes), Stock Explorer y la
// simulación. Antes, a esos tickers se les asignaba un sector al azar con un hash del ticker.
const liveProfiles = new Map<string, { sector: string | null; industry: string | null }>();
export const registerTickerProfiles = (items: { ticker?: string; sector?: string | null; industry?: string | null }[]) => {
  for (const it of items || []) {
    if (!it?.ticker || (!it.sector && !it.industry)) continue;
    liveProfiles.set(it.ticker.toUpperCase(), { sector: it.sector ?? null, industry: it.industry ?? null });
  }
};
export const OTHER_SECTOR = "Other";

export const getTickerSector = (ticker: string, isCash: boolean): string => {
  if (isCash) return "Cash / USD";
  const upper = ticker.toUpperCase();
  if (TICKER_CLASSIFICATION[upper]) {
    return TICKER_CLASSIFICATION[upper].sector;
  }
  const live = liveProfiles.get(upper);
  if (live?.sector) return YAHOO_SECTOR[live.sector] ?? live.sector;
  return OTHER_SECTOR;
};

export const getTickerSubsector = (ticker: string, isCash: boolean, language: "EN" | "ES" = "ES"): string => {
  if (isCash) return language === "EN" ? "Cash" : "Efectivo";
  const upper = ticker.toUpperCase();
  if (TICKER_CLASSIFICATION[upper]) {
    return language === "EN"
      ? (TICKER_CLASSIFICATION[upper].subsector || TICKER_CLASSIFICATION[upper].subsector_es)
      : (TICKER_CLASSIFICATION[upper].subsector_es || TICKER_CLASSIFICATION[upper].subsector);
  }
  // Industria de Yahoo (en inglés) si la hay; si no, "Otros"
  const live = liveProfiles.get(upper);
  if (live?.industry) return live.industry;
  return language === "EN" ? "Other" : "Otros";
};

export const getSectorSpanish = (sector: string): string => {
  const map: Record<string, string> = {
    "Technology": "Tecnología",
    "Communication Services": "Servicios de Comunicación",
    "Consumer Discretionary": "Consumo Discrecional",
    "Healthcare": "Salud",
    "Financials": "Finanzas",
    "Industrials": "Industria",
    "Consumer Staples": "Consumo Básico",
    "Energy": "Energía",
    "Utilities": "Servicios Públicos",
    "Materials": "Materiales",
    "Real Estate": "Bienes Raíces",
    "Cash / USD": "Efectivo / USD",
    "Other": "Otros",
  };
  return map[sector] || sector;
};

export const getSectorColor = (sector: string): string => {
  switch (sector) {
    case "Technology":
      return "bg-emerald-500";
    case "Communication Services":
      return "bg-blue-500";
    case "Consumer Discretionary":
      return "bg-amber-500";
    case "Healthcare":
      return "bg-rose-500";
    case "Financials":
      return "bg-indigo-500";
    case "Industrials":
      return "bg-cyan-500";
    case "Consumer Staples":
      return "bg-pink-500";
    case "Energy":
      return "bg-orange-500";
    case "Utilities":
      return "bg-purple-500";
    case "Materials":
      return "bg-teal-500";
    case "Cash / USD":
      return "bg-slate-500";
    default:
      return "bg-emerald-500";
  }
};

export const getTypeBadgeConfig = (type: string | undefined | null) => {
  if (!type) return { icon: "❓", className: "badge-type-unknown" };
  switch (type) {
    case "Mature Compounder": return { icon: "🏛️", className: "badge-type-mature" };
    case "Growth Compounder": return { icon: "🌱", className: "badge-type-growth" };
    case "Infrastructure / Utility": return { icon: "🏗️", className: "badge-type-infra" };
    case "Cyclical": return { icon: "🔄", className: "badge-type-cyclical" };
    case "Speculative": return { icon: "⚠️", className: "badge-type-speculative" };
    case "Financial / Fintech": return { icon: "🏦", className: "badge-type-financial" };
    case "Hypergrowth": return { icon: "🚀", className: "badge-type-hypergrowth" };
    case "Turnaround": return { icon: "🛠️", className: "badge-type-turnaround" };
    default: return { icon: "❓", className: "badge-type-unknown" };
  }
};

const getSectorTextClass = (sector: string): string => {
  switch (sector) {
    case "Technology":
      return "text-emerald-400";
    case "Communication Services":
      return "text-blue-400";
    case "Consumer Discretionary":
      return "text-amber-400";
    case "Healthcare":
      return "text-rose-400";
    case "Financials":
      return "text-indigo-400";
    case "Industrials":
      return "text-cyan-400";
    case "Consumer Staples":
      return "text-pink-400";
    case "Energy":
      return "text-orange-400";
    case "Utilities":
      return "text-purple-400";
    case "Materials":
      return "text-teal-400";
    case "Cash / USD":
      return "text-slate-400";
    default:
      return "text-emerald-400";
  }
};


/** Beta de Yahoo de la posición (efectivo = 0); null si no hay dato. Antes, tabla fija o un hash. */
export const getTickerBeta = (pos: Pick<Position, "isCash"> & { beta?: number | null }): number | null => {
  if (pos.isCash) return 0;
  return typeof pos.beta === "number" && Number.isFinite(pos.beta) ? pos.beta : null;
};

/** Beta ponderada por peso con las posiciones que tienen dato (null si ninguna). */
export const weightedBetaOf = (positions: Position[]): number | null => {
  const withBeta = positions.filter((p) => getTickerBeta(p) !== null && p.weight > 0);
  const w = withBeta.reduce((s, p) => s + p.weight, 0);
  if (!withBeta.some((p) => !p.isCash) || w <= 0) return null;
  return withBeta.reduce((s, p) => s + (getTickerBeta(p) as number) * p.weight, 0) / w;
};




export const getDividendPerShare = (pos: Position): number | null => {
  if (pos.isCash) return null;
  if (pos.dividendRate !== undefined && pos.dividendRate !== null) {
    return pos.dividendRate;
  }
  // Sin dato de Yahoo: desconocido ("—"). Antes, una tabla fija o un rendimiento inventado con un hash.
  return null;
};


type BasisSortKey = "ticker" | "price" | "shares" | "avgCost" | "mktValue" | "weight" | "dailyPnL" | "chgPct" | "returnAmt" | "returnPct" | "dividend";

/** Valor de una posición para ordenar la tabla Basis. */
const basisSortValue = (p: Position, k: BasisSortKey): number | string => {
  if (k === "ticker") return p.ticker;
  if (k === "dividend") return (getDividendPerShare(p) ?? 0) * p.shares;
  const v = (p as any)[k];
  return typeof v === "number" && Number.isFinite(v) ? v : -Infinity;
};

/** Fila de la tabla Basis: posición o cabecera de grupo (sector / subsector) con sus sumas. */
type BasisRow =
  | { kind: "pos"; pos: Position; idx: number }
  | { kind: "group"; level: "sector" | "subsector"; label: string; count: number; mktValue: number; weight: number; dailyPnL: number; returnAmt: number; cost: number; dividend: number };

const formatTotalDividend = (pos: Position, isReadOnly?: boolean): string => {
  if (pos.isCash) return "—";
  const rate = getDividendPerShare(pos);
  if (rate === null) return "—";
  const total = rate * pos.shares;
  if (total === 0) return "$0.00";
  if (isReadOnly || total >= 1000000) {
    if (total >= 1000000000) {
      const billions = total / 1000000000;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(billions) + "Bn";
    }
    const millions = total / 1000000;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(millions) + "M";
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total);
};

// ---------------------------------------------------------------- ficha de la posición (datos reales)
// Resumen de /api/stock (Yahoo), BPA anual de la SEC (/api/portfolio/financials) con el precio real al
// cierre de cada ejercicio (/api/chart 10Y mensual) y BPA trimestral ajustado frente al consenso (Yahoo).
// Sin dato → "—". Antes casi todo salía de un hash del ticker (apertura, 52 semanas, volumen, cap.,
// dividendo, fecha de resultados, precios por año) o de tablas fijas (MSFT, NVDA).

type StockInfo = {
  previousClose?: number | null; open?: number | null; fiftyTwoWeekLow?: number | null; fiftyTwoWeekHigh?: number | null;
  volume?: number | null; avgVolume?: number | null; marketCap?: number | null; beta?: number | null;
  trailingPE?: number | null; forwardPE?: number | null; pegRatio?: number | null; trailingEps?: number | null; forwardEps?: number | null;
  targetMeanPrice?: number | null; dividendRate?: number | null; dividendYield?: number | null; nextEarningsDate?: string | null;
  earningsQuarterly?: { quarter: string; actual: number | null; estimate: number | null }[];
  earningsNext?: { quarter: string; estimate: number } | null;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const getStockDetails = (
  position: Position,
  stock: StockInfo | null,
  financialsData: { annual: any[]; quarterly: any[] } | null | undefined,
  priceHistory: { date: string; close: number }[],
  language: "EN" | "ES" = "ES"
) => {
  const upper = position.ticker.toUpperCase();
  const fmtC = (v: number | null | undefined) =>
    isNum(v) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v) : "—";
  const fmtX = (v: number | null | undefined, d = 2) => (isNum(v) ? v.toFixed(d) : "—");
  const fmtBig = (v: number | null | undefined) =>
    !isNum(v) || v <= 0 ? "—" : v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toLocaleString("en-US");
  const getYoY = (curr: number | null, prev: number | null) => {
    if (!isNum(curr) || !isNum(prev) || prev <= 0) return "—";
    const diff = ((curr - prev) / prev) * 100;
    return `${diff >= 0 ? "▲" : "▼"}${Math.abs(diff).toFixed(0)}%`;
  };

  // Precio real al cierre del ejercicio: último cierre mensual en o antes de la fecha (máx. 45 días antes)
  const priceAt = (date: string): number | null => {
    const t = new Date(date).getTime();
    let best: { t: number; close: number } | null = null;
    for (const p of priceHistory) {
      const pt = new Date(p.date).getTime();
      if (pt <= t + 5 * 86400000 && (!best || pt > best.t)) best = { t: pt, close: p.close };
    }
    return best && t - best.t <= 45 * 86400000 ? best.close : null;
  };

  // Ejercicios con BPA de la SEC (diluido; si no, básico), los 5 más recientes
  const annuals = [...(financialsData?.annual || [])]
    .filter((a) => isNum(a?.dilutedEPS ?? a?.basicEPS) && (a.date || a.fiscalDateEnding))
    .sort((a, b) => String(a.date || a.fiscalDateEnding).localeCompare(String(b.date || b.fiscalDateEnding)))
    .slice(-5);

  const fundamentals: { year: string; price: string; priceYoY: string; eps: string; epsYoY: string; pe: string; rawPrice: number | null; rawEps: number; isEstimate?: boolean; date?: string }[] = [];
  annuals.forEach((a, idx) => {
    const date = String(a.date || a.fiscalDateEnding);
    const eps = (a.dilutedEPS ?? a.basicEPS) as number;
    const price = priceAt(date);
    const prev = idx > 0 ? fundamentals[idx - 1] : null;
    fundamentals.push({
      year: date.slice(0, 4),
      date,
      price: fmtC(price),
      priceYoY: prev ? getYoY(price, prev.rawPrice) : "—",
      eps: fmtC(eps),
      epsYoY: prev ? getYoY(eps, prev.rawEps) : "—",
      pe: isNum(price) && eps > 0 ? `${(price / eps).toFixed(1)}x` : "—",
      rawPrice: price,
      rawEps: eps,
    });
  });
  // Estimación de analistas para el próximo ejercicio (BPA "forward" de Yahoo)
  if (fundamentals.length > 0 && isNum(stock?.forwardEps)) {
    const last = fundamentals[fundamentals.length - 1];
    fundamentals.push({
      year: language === "ES" ? "Próx. (E)" : "Next (E)",
      price: "—",
      priceYoY: "—",
      eps: fmtC(stock!.forwardEps),
      epsYoY: getYoY(stock!.forwardEps as number, last.rawEps),
      pe: "—",
      rawPrice: null,
      rawEps: stock!.forwardEps as number,
      isEstimate: true,
    });
  }

  // CAGR del BPA de la SEC entre el primer y el último ejercicio con BPA positivo
  const actual = fundamentals.filter((f) => !f.isEstimate);
  const first = actual.find((f) => f.rawEps > 0);
  const lastA = actual[actual.length - 1];
  const years = first && lastA ? Number(lastA.year) - Number(first.year) : 0;
  const epsCagr = first && lastA && lastA.rawEps > 0 && years > 0 ? (Math.pow(lastA.rawEps / first.rawEps, 1 / years) - 1) * 100 : null;

  const lo = stock?.fiftyTwoWeekLow, hi = stock?.fiftyTwoWeekHigh;
  const divRate = stock?.dividendRate ?? position.dividendRate ?? null;
  const divYield = stock?.dividendYield;
  // Solo si es futura: Yahoo tarda en actualizar la fecha tras publicar resultados
  const upcomingDate = stock?.nextEarningsDate && new Date(stock.nextEarningsDate).getTime() >= Date.now() - 86400000 ? stock.nextEarningsDate : null;
  const earningsDate = upcomingDate
    ? new Date(upcomingDate).toLocaleDateString(language === "EN" ? "en-US" : "es-ES", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return {
    ticker: upper,
    summary: {
      prevClose: fmtC(stock?.previousClose),
      open: fmtC(stock?.open),
      fiftyTwoWeekRange: isNum(lo) && isNum(hi) ? `${fmtC(lo)} - ${fmtC(hi)}` : "—",
      volume: fmtBig(stock?.volume),
      avgVolume: fmtBig(stock?.avgVolume),
      mktCap: fmtBig(stock?.marketCap),
      beta: fmtX(stock?.beta ?? position.beta),
      peRatio: fmtX(stock?.trailingPE ?? position.pe),
      eps: fmtC(stock?.trailingEps),
      fwdPe: fmtX(stock?.forwardPE ?? position.fwdPe),
      pegRatio: fmtX(stock?.pegRatio ?? position.peg),
      oneYearTarget: fmtC(stock?.targetMeanPrice ?? position.targetMeanPrice),
      dividendYield: !isNum(divRate) ? "—" : divRate === 0 ? "0.00%" : `${isNum(divYield) ? (divYield * 100).toFixed(2) + "% " : ""}(${fmtC(divRate)})`,
      earningsDate,
    },
    epsCagr: isNum(epsCagr) ? `${epsCagr >= 0 ? "+" : ""}${epsCagr.toFixed(1)}%` : "—",
    fundamentals,
  };
};

/** BPA ajustado por trimestre frente al consenso (Yahoo) y estimación del siguiente. */
const getEPSData = (stock: StockInfo | null, language: "EN" | "ES") => {
  const label = (q: string) => {
    const m = /^(\d)Q(\d{4})$/.exec(q);
    return m ? `Q${m[1]} '${m[2].slice(-2)}` : q;
  };
  const rows: { quarter: string; estimate: number; actual: number | null; beat: boolean | null; diff: number | null; date: string; status: "Beat" | "Miss" | "Upcoming" }[] = [];
  for (const e of stock?.earningsQuarterly || []) {
    if (!isNum(e.estimate)) continue;
    const has = isNum(e.actual);
    const diff = has ? (e.actual as number) - e.estimate : null;
    rows.push({ quarter: label(e.quarter), estimate: e.estimate, actual: has ? (e.actual as number) : null, beat: diff === null ? null : diff >= 0, diff: diff === null ? null : Math.abs(diff), date: "", status: diff === null ? "Upcoming" : diff >= 0 ? "Beat" : "Miss" });
  }
  if (stock?.earningsNext && isNum(stock.earningsNext.estimate)) {
    const future = stock.nextEarningsDate && new Date(stock.nextEarningsDate).getTime() >= Date.now() - 86400000;
    const d = future ? new Date(stock.nextEarningsDate as string).toLocaleDateString(language === "EN" ? "en-US" : "es-ES", { day: "numeric", month: "short" }) : "—";
    rows.push({ quarter: label(stock.earningsNext.quarter), estimate: stock.earningsNext.estimate, actual: null, beat: null, diff: null, date: d, status: "Upcoming" });
  }
  return rows;
};

  const DistancePill = ({ current, target }: { current: number; target: number | null | undefined }) => {
    if (!target) return <span className="text-slate-500">—</span>;
    const distance = ((current - target) / target) * 100;
    const isPositive = distance >= 0;

    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono border ${isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}
      >
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {isPositive ? '+' : ''}{distance.toFixed(1)}%
      </span>
    );
  };

function StockDetailPanel({ position, language, onClose, financialsData }: { position: Position; language: "EN" | "ES"; onClose: () => void; financialsData?: { annual: any[]; quarterly: any[] } | null }) {
  const [activeQuarterIndex, setActiveQuarterIndex] = useState<number | null>(null);
  // Datos reales: cotización y resumen (/api/stock) y cierres mensuales de 10 años (/api/chart)
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ date: string; close: number }[]>([]);
  const [finLocal, setFinLocal] = useState<{ annual: any[]; quarterly: any[] } | null>(null);
  const hasFin = !!financialsData?.annual?.length;

  useEffect(() => {
    if (position.isCash) return;
    let active = true;
    const t = encodeURIComponent(position.ticker);
    fetch(`/api/stock/${t}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d && !d.isFallback) setStockInfo(d); })
      .catch(() => {});
    // Estados de la SEC si la tabla no los ha pasado (no siempre están cargados para todas las posiciones)
    if (!hasFin)
      fetch("/api/portfolio/financials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: position.ticker }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (active && d && !d.error && Array.isArray(d.annual)) setFinLocal({ annual: d.annual, quarterly: d.quarterly || [] }); })
        .catch(() => {});
    fetch(`/api/chart/${t}?range=10Y`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (active && Array.isArray(d)) setPriceHistory(d.filter((x: any) => x?.date && typeof x.close === "number")); })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [position.ticker, position.isCash, hasFin]);

  const dt = getStockDetails(position, stockInfo, hasFin ? financialsData : finLocal, priceHistory, language);

  const epsData = getEPSData(stockInfo, language);
  // Por defecto, el último trimestre ya publicado
  const lastReported = epsData.reduce((acc, e, i) => (e.actual !== null ? i : acc), epsData.length - 1);
  const qIndex = activeQuarterIndex !== null && activeQuarterIndex < epsData.length ? activeQuarterIndex : lastReported;
  const selectedQ = epsData[qIndex];
  const showActual = !!selectedQ && selectedQ.actual !== null;
  const isSelectedQPositive = selectedQ && selectedQ.actual !== null ? selectedQ.actual >= selectedQ.estimate : null;

  const RenderEstimateDot = (props: any) => {
    const { cx, cy, index } = props;
    if (cx === undefined || cy === undefined) return null;
    const isActive = index === qIndex;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        stroke={isActive ? "#e2e8f0" : "#64748b"}
        strokeWidth={2}
        fill="#0b0c16"
        className="cursor-pointer transition-all"
        onClick={() => setActiveQuarterIndex(index)}
      />
    );
  };

  const RenderActualDot = (props: any) => {
    const { cx, cy, payload, index } = props;
    if (cx === undefined || cy === undefined || payload.actual === null) return null;
    const isBeat = payload.actual >= payload.estimate;
    const isActive = index === qIndex;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={isActive ? 8 : 7}
        fill={isBeat ? "#10b981" : "#f43f5e"}
        stroke={isActive ? "#ffffff" : "none"}
        strokeWidth={isActive ? 2 : 0}
        className="cursor-pointer transition-all"
        onClick={() => setActiveQuarterIndex(index)}
      />
    );
  };

  const CustomXAxisTick = (props: any) => {
    const { x, y, index } = props;
    const data = epsData[index];
    if (!data) return null;

    const isActive = index === qIndex;
    const isBeat = data.status === "Beat";
    const isUpcoming = data.status === "Upcoming";

    return (
      <g transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => setActiveQuarterIndex(index)}>
        {/* Quarter Label */}
        <text
          x={0}
          y={15}
          textAnchor="middle"
          fill={isActive ? "#ffffff" : "#94a3b8"}
          className={`text-[11px] transition-all ${isActive ? "font-bold" : "font-semibold"}`}
        >
          {data.quarter}
        </text>

        {/* Beat / Miss Status */}
        <text
          x={0}
          y={30}
          textAnchor="middle"
          className="text-[10px] font-bold"
          fill={isUpcoming ? "#64748b" : isBeat ? "#10b981" : "#f43f5e"}
        >
          {isUpcoming ? "—" : language === "ES" ? (isBeat ? "Superó" : "Incumplió") : data.status}
        </text>

        {/* Diff / Date */}
        <text
          x={0}
          y={43}
          textAnchor="middle"
          className="text-[10px] font-mono font-medium"
          fill={isUpcoming ? "#94a3b8" : isBeat ? "#10b981" : "#f43f5e"}
        >
          {isUpcoming ? data.date : `${isBeat ? "+" : "−"}$${data.diff?.toFixed(2)}`}
        </text>
      </g>
    );
  };

  const tDetails = {
    EN: {
      prevClose: "Previous Close",
      open: "Open",
      range52: "52wk range",
      volume: "Volume",
      avgVolume: "Avg. Volume",
      mktCap: "Market Cap",
      beta: "Beta (5Y Monthly)",
      peTTM: "PE Ratio (TTM)",
      epsTTM: "EPS (TTM)",
      fwdPe: "Forward P/E",
      peg: "PEG Ratio",
      targetEst: "1y Target Est.",
      divYield: "Dividend(yield)",
      earningsDate: "Earnings Date",
      summary: "SUMMARY",
      priceChart: "PRICE CHART",
      fundamentalsByYear: "FUNDAMENTALS BY YEAR",
      price: "Price",
      yoy: "YoY",
      eps: "EPS",
      epsCagrLegend: "EPS: diluted, from SEC filings · Price: close at fiscal year-end · E = analyst estimate (Yahoo) · P/E = Price ÷ EPS · EPS vs. consensus: adjusted EPS (Yahoo)"
    },
    ES: {
      prevClose: "Cierre Anterior",
      open: "Apertura",
      range52: "52wk range",
      volume: "Volumen",
      avgVolume: "Volumen Prom.",
      mktCap: "Cap. de Mercado",
      beta: "Beta (5Y Mensual)",
      peTTM: "Ratio P/E (TTM)",
      epsTTM: "EPS (TTM)",
      fwdPe: "P/E Siguiente",
      peg: "Ratio PEG",
      targetEst: "Obj. 1 Año Est.",
      divYield: "Dividendo(yield)",
      earningsDate: "Fecha de Reporte",
      summary: "RESUMEN",
      priceChart: "GRÁFICO DE PRECIO",
      fundamentalsByYear: "FUNDAMENTALES POR AÑO",
      price: "Precio",
      yoy: "YoY",
      eps: "EPS",
      epsCagrLegend: "BPA: diluido, de los informes a la SEC · Precio: cierre del ejercicio · E = estimación de analistas (Yahoo) · P/E = Precio ÷ BPA · BPA vs. consenso: BPA ajustado (Yahoo)"
    }
  }[language];

  const formatC = (v: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
  };

  const isDailyPositive = position.chgPct >= 0;

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#0b0c16] border border-slate-800 rounded-2xl p-4 md:p-5 shadow-2xl relative text-left w-full max-w-4xl my-auto max-h-[92vh] overflow-y-auto select-text scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-sm w-7 h-7 flex items-center justify-center rounded-full border border-slate-800 hover:border-slate-700 bg-slate-900/60 transition-all cursor-pointer z-10"
        >
          ✕
        </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-2 mb-3">
        <div className="flex items-center gap-3">
          <CompanyLogo ticker={position.ticker} name={position.name} isCash={position.isCash} size="lg" />
          <span className="text-lg md:text-xl font-display font-bold text-white tracking-wide">
            {position.ticker}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold bg-slate-900 border border-slate-800 ${getSectorTextClass(getTickerSector(position.ticker, position.isCash))}`}>
            {language === "EN" ? getTickerSector(position.ticker, position.isCash) : getSectorSpanish(getTickerSector(position.ticker, position.isCash))}
          </span>
          <span className="text-xs md:text-sm text-slate-400 font-medium">
            {position.name}
          </span>
        </div>

        <div className="text-right sm:pr-12">
          <div className="text-base md:text-lg font-display font-bold text-white">
            {formatC(position.price)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-900/60 pb-1.5">
            <span className="text-xs font-bold text-slate-500 tracking-wider uppercase font-mono">
              {tDetails.summary}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.prevClose}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.prevClose}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.open}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.open}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1 gap-2">
                <span className="text-slate-400 whitespace-nowrap">{tDetails.range52}</span>
                <span className="font-mono text-white font-semibold text-[10px] text-right">{dt.summary.fiftyTwoWeekRange}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.volume}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.volume}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.avgVolume}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.avgVolume}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.mktCap}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.mktCap}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.peTTM}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.peRatio}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.epsTTM}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.eps}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.fwdPe}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.fwdPe}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.peg}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.pegRatio}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1">
                <span className="text-slate-400">{tDetails.targetEst}</span>
                <span className="font-mono text-white font-semibold">{dt.summary.oneYearTarget}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900/30 py-1 whitespace-nowrap gap-4">
                <span className="text-slate-400 shrink-0">{tDetails.divYield}</span>
                <span className="font-mono text-white font-semibold text-[10px] sm:text-xs">{dt.summary.dividendYield}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-900/30 py-1 whitespace-nowrap gap-4">
                <span className="text-slate-400 shrink-0">{language === "ES" ? "Media Móvil 50D" : "50-Day MA"}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white font-semibold text-[10px] sm:text-xs">{position.fiftyDayAverage ? formatC(position.fiftyDayAverage) : "—"}</span>
                  <DistancePill current={position.price} target={position.fiftyDayAverage} />
                </div>
              </div>
              <div className="flex justify-between items-center border-b border-slate-900/30 py-1 whitespace-nowrap gap-4">
                <span className="text-slate-400 shrink-0">{language === "ES" ? "Media Móvil 200D" : "200-Day MA"}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white font-semibold text-[10px] sm:text-xs">{position.twoHundredDayAverage ? formatC(position.twoHundredDayAverage) : "—"}</span>
                  <DistancePill current={position.price} target={position.twoHundredDayAverage} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* EPS Beat/Miss Section */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900/60 pb-1.5">
            <span className="text-xs font-bold text-slate-500 tracking-wider uppercase font-mono">
              {language === "ES" ? "BPA vs. consenso" : "EPS vs. consensus"}
            </span>
          </div>

          {/* Subheader detail row */}
          {!selectedQ ? (
            <div className="text-xs text-slate-500">
              {stockInfo
                ? (language === "ES" ? "Yahoo no tiene estimaciones de BPA para esta empresa." : "Yahoo has no EPS estimates for this company.")
                : (language === "ES" ? "Cargando…" : "Loading…")}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-300 font-mono">
              <span className="text-sm font-bold text-white uppercase tracking-wider">{selectedQ.quarter}</span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="inline-block w-3 h-3 rounded-full border border-slate-500 bg-transparent"></span>
                {language === "ES" ? "Estimación" : "Estimate"}{" "}
                <span className="font-mono text-white font-bold">
                  {selectedQ.estimate >= 0 ? "+" : ""}{selectedQ.estimate.toFixed(2)}
                </span>
              </span>
              {showActual ? (
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${isSelectedQPositive ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                  {language === "ES" ? "Real" : "Actual"}{" "}
                  <span className={`font-mono font-bold ${isSelectedQPositive ? "text-emerald-400" : "text-rose-400"}`}>
                    {selectedQ.actual! >= 0 ? "+" : ""}{selectedQ.actual!.toFixed(2)}
                  </span>
                  {selectedQ.estimate !== undefined && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${
                      selectedQ.actual! >= selectedQ.estimate
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                    }`}>
                      {selectedQ.actual! >= selectedQ.estimate ? "BEAT" : "MISS"}
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="inline-block w-2.5 h-2.5 rounded-full border border-dashed border-slate-600 bg-transparent"></span>
                  {language === "ES" ? "Real" : "Actual"} <span className="font-mono font-bold">—</span>
                </span>
              )}
            </div>
          )}

          <div className="h-60 w-full mt-2" onClick={(e) => e.stopPropagation()}>
            {!selectedQ ? null : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={epsData} margin={{ top: 20, right: 35, left: -20, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="quarter"
                    stroke="#475569"
                    fontSize={10}
                    tickLine={false}
                    tick={<CustomXAxisTick />}
                    interval={0}
                    padding={{ left: 45, right: 45 }}
                  />
                  <YAxis
                    stroke="#475569"
                    fontSize={9}
                    domain={["auto", "auto"]}
                    tickLine={false}
                    tickFormatter={(v) => v.toFixed(2)}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const isUpcoming = data.status === "Upcoming";
                        const isBeat = data.actual >= data.estimate;
                        return (
                          <div className="bg-[#0f111a] border border-slate-800 p-3 rounded-xl text-xs space-y-1 shadow-2xl font-mono text-left">
                            <p className="font-bold text-white mb-1 uppercase text-[11px] tracking-wide">{data.quarter}</p>
                            <p className="flex justify-between gap-4 text-slate-400">
                              <span>{language === "ES" ? "Estimación:" : "Estimate:"}</span>
                              <span className="text-white font-bold">{data.estimate.toFixed(2)}</span>
                            </p>
                            {!isUpcoming ? (
                              <>
                                <p className="flex justify-between gap-4 text-slate-400">
                                  <span>{language === "ES" ? "Real:" : "Actual:"}</span>
                                  <span className={`font-bold ${isBeat ? "text-emerald-400" : "text-rose-400"}`}>{data.actual.toFixed(2)}</span>
                                </p>
                                <p className="flex justify-between gap-4 pt-1 border-t border-slate-900 text-slate-400">
                                  <span>{language === "ES" ? "Resultado:" : "Result:"}</span>
                                  <span className={`font-extrabold ${isBeat ? "text-emerald-400" : "text-rose-400"}`}>
                                    {language === "ES" ? (isBeat ? `Superó (+${data.diff.toFixed(2)})` : `Incumplió (−${data.diff.toFixed(2)})`) : `${data.status} (${isBeat ? "+" : "−"}${data.diff.toFixed(2)})`}
                                  </span>
                                </p>
                              </>
                            ) : (
                              <p className="text-slate-500 italic pt-1 border-t border-slate-900">
                                {language === "ES" ? `Reporte el ${data.date}` : `Reporting on ${data.date}`}
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* Vertical Guideline at active quarter */}
                  <ReferenceLine x={selectedQ.quarter} stroke="#475569" strokeDasharray="3 3" strokeOpacity={0.8} />

                  {/* Horizontal Guideline at selected quarter's actual/estimate level */}
                  <ReferenceLine
                    y={selectedQ.actual !== null ? selectedQ.actual : selectedQ.estimate}
                    stroke="#475569"
                    strokeDasharray="3 3"
                    strokeOpacity={0.6}
                  />

                  {/* Estimate points line */}
                  <Line
                    type="monotone"
                    dataKey="estimate"
                    stroke="none"
                    dot={<RenderEstimateDot />}
                    activeDot={false}
                  />

                  {/* Actual points line */}
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="none"
                    dot={<RenderActualDot />}
                    activeDot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-900/60 pb-2">
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-400" size={14} />
            <span className="text-xs font-bold text-slate-500 tracking-wider uppercase font-mono">
              {tDetails.fundamentalsByYear}
            </span>
          </div>

          <div className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] md:text-xs font-extrabold">
            {dt.epsCagr} EPS CAGR
          </div>
        </div>

        {dt.fundamentals.length === 0 && (
          <p className="text-xs text-slate-500 py-2">
            {language === "ES" ? "Sin estados financieros de la SEC para esta empresa (o aún cargando)." : "No SEC financial statements for this company (or still loading)."}
          </p>
        )}
        <div className={`overflow-x-auto ${dt.fundamentals.length === 0 ? "hidden" : ""}`}>
          <table className="w-full text-left text-xs border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-900/60 text-slate-500 font-bold font-mono uppercase tracking-wider text-[10px]">
                <th className="py-2 pr-4"></th>
                {dt.fundamentals.map((f) => (
                  <th key={f.year} className="py-2 px-3 text-center">{f.year}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40 font-mono">
              <tr className="hover:bg-slate-900/20">
                <td className="py-2.5 pr-4 text-slate-400 font-sans font-medium">{tDetails.price}</td>
                {dt.fundamentals.map((f, idx) => (
                  <td key={idx} className="py-2.5 px-3 text-center text-white font-bold">{f.price}</td>
                ))}
              </tr>
              <tr className="hover:bg-slate-900/20 text-[10px] sm:text-xs">
                <td className="py-2 pr-4 text-slate-500 font-sans">{tDetails.yoy} ({tDetails.price})</td>
                {dt.fundamentals.map((f, idx) => (
                  <td key={idx} className={`py-2 px-3 text-center font-bold ${f.priceYoY.startsWith("▲") ? "text-emerald-400" : f.priceYoY.startsWith("▼") ? "text-rose-400" : "text-slate-500"}`}>
                    {f.priceYoY}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-900/20">
                <td className="py-2.5 pr-4 text-slate-400 font-sans font-medium">{tDetails.eps}</td>
                {dt.fundamentals.map((f, idx) => (
                  <td key={idx} className="py-2.5 px-3 text-center text-slate-300">{f.eps}</td>
                ))}
              </tr>
              <tr className="hover:bg-slate-900/20 text-[10px] sm:text-xs">
                <td className="py-2 pr-4 text-slate-500 font-sans">{tDetails.yoy} ({tDetails.eps})</td>
                {dt.fundamentals.map((f, idx) => (
                  <td key={idx} className={`py-2 px-3 text-center font-bold ${f.epsYoY.startsWith("▲") ? "text-emerald-400" : f.epsYoY.startsWith("▼") ? "text-rose-400" : "text-slate-500"}`}>
                    {f.epsYoY}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-900/20">
                <td className="py-2.5 pr-4 text-slate-400 font-sans font-medium">P/E</td>
                {dt.fundamentals.map((f, idx) => (
                  <td key={idx} className="py-2.5 px-3 text-center text-slate-300">{f.pe}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>
  );
}

interface HoldingsTableProps {
  positions: Position[];
  loading: boolean;
  onEditHoldings: () => void;
  language?: "EN" | "ES";
  isReadOnly?: boolean;
  initialTabMode?: "basis" | "valuation" | "health" | "financials";
  onTabModeChange?: (mode: "basis" | "valuation" | "health" | "financials") => void;
  financialsMap?: Record<string, { annual: any[]; quarterly: any[] }>;
}

export const HealthMetricsTooltip = ({
  title,
  metrics,
  raw,
  language,
  placement = "top"
}: {
  title: string,
  metrics: {key: string, label: string, suffix?: string}[],
  raw?: any,
  language: string,
  placement?: "top" | "bottom"
}) => {
  if (!raw) return null;
  const isBottom = placement === "bottom";

  return (
    <div className={`health-metrics-tooltip absolute z-[100] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 left-1/2 -translate-x-1/2 w-48 border rounded-xl p-3 text-left pointer-events-none ${
      isBottom ? "top-full mt-2" : "bottom-full mb-2"
    }`}>
      <div className="tooltip-title text-[10px] font-bold uppercase mb-2 border-b pb-1.5">{title} Assumptions</div>
      <div className="space-y-1.5">
        {metrics.map(m => (
          <div key={m.key} className="flex justify-between items-center gap-2">
            <span className="tooltip-label text-[10px] truncate">{m.label}</span>
            <span className="tooltip-val text-[10px] font-mono font-bold shrink-0">
              {raw[m.key] !== undefined && raw[m.key] !== null
                ? `${typeof raw[m.key] === "number" ? raw[m.key].toFixed(1) : raw[m.key]}${m.suffix || ""}`
                : "—"}
            </span>
          </div>
        ))}
      </div>
      <div className={`absolute left-1/2 -translate-x-1/2 border-[5px] border-transparent ${
        isBottom
          ? "arrow-top bottom-full -mb-[1px]"
          : "arrow-bottom top-full -mt-[1px]"
      }`} />
    </div>
  );
};


const ScoreDonut = ({ score, label, colorClass }: { score: number, label: string, colorClass: string }) => {
  const displayScore = Math.ceil(score || 0);
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.max(0, Math.min(100, displayScore)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
       <div className="relative flex items-center justify-center w-14 h-14">
          <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90" viewBox="0 0 64 64">
             <circle cx="32" cy="32" r={radius} className="stroke-slate-800/60" strokeWidth="6" fill="transparent" />
             <circle cx="32" cy="32" r={radius} className={`stroke-current ${colorClass} transition-all duration-1000`} strokeWidth="6" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
          </svg>
          <span className={`text-sm font-bold leading-none ${colorClass} relative z-10`}>{displayScore}</span>
       </div>
       <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">{label}</span>
    </div>
  );
};

/** Potencial frente al precio actual, en %. */
const upsideOf = (value: number | null | undefined, price: number): number | null =>
  typeof value === "number" && value > 0 && price > 0 ? (value / price - 1) * 100 : null;

/** Potencial en verde (sube) o rojo (baja). */
function UpsidePill({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold font-mono text-[10px] md:text-xs border ${up ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
      {up ? <TrendingUp size={11} className="flex-shrink-0" /> : <TrendingDown size={11} className="flex-shrink-0" />}
      {up ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

/** Valor por acción ("…" mientras carga, "—" sin dato). */
function ValueCell({ loading, value, format }: { loading: boolean; value: number | null; format: (v: number) => string }) {
  if (value !== null) return <>{format(value)}</>;
  return <span className="text-slate-500">{loading ? "…" : "—"}</span>;
}

export default function HoldingsTable({
  positions,
  loading,
  onEditHoldings,
  language = "EN",
  isReadOnly = false,
  initialTabMode,
  onTabModeChange,
  financialsMap: propFinancialsMap,
}: HoldingsTableProps) {
  const [viewMode, setViewMode] = useState<"table" | "cards">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return "cards";
    }
    return "table";
  });
  const [financialsViewMode, setFinancialsViewMode] = useState<"cards" | "table">("cards");
  const [holdingsTabMode, setHoldingsTabMode] = useState<"basis" | "valuation" | "health" | "financials">(initialTabMode || "basis");
  // Basis: orden por columna (de mayor a menor al primer clic) y agrupación por sector / subsector
  const [basisSort, setBasisSort] = useState<{ key: BasisSortKey; dir: "desc" | "asc" }>({ key: "mktValue", dir: "desc" });
  const [groupBy, setGroupBy] = useState<{ sector: boolean; subsector: boolean }>(() => {
    try {
      const v = localStorage.getItem("investiando_holdings_groupby");
      if (v) return JSON.parse(v);
    } catch {}
    return { sector: true, subsector: true };
  });
  useEffect(() => {
    try {
      localStorage.setItem("investiando_holdings_groupby", JSON.stringify(groupBy));
    } catch {}
  }, [groupBy]);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);

  useEffect(() => {
    if (initialTabMode) {
      setHoldingsTabMode(initialTabMode);
    }
  }, [initialTabMode]);

  const handleTabModeChange = (mode: "basis" | "valuation" | "health" | "financials") => {
    setHoldingsTabMode(mode);
    if (onTabModeChange) {
      onTabModeChange(mode);
    }
  };
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [localFinancialsMap, setLocalFinancialsMap] = useState<Record<string, { annual: any[]; quarterly: any[] }>>(() => getAllCachedFinancials());

  const effectiveFinancialsMap = useMemo(() => {
    return {
      ...getAllCachedFinancials(),
      ...(propFinancialsMap || {}),
      ...localFinancialsMap,
    };
  }, [propFinancialsMap, localFinancialsMap]);

  const [dcfAssumptionsMap, setDcfAssumptionsMap] = useState<Record<string, { growthRate: number; discountRate: number; terminalGrowthRate: number }>>({});

  useEffect(() => {
    const saved = localStorage.getItem("stock_tracker_dcf_assumptions");
    if (saved) {
      try {
        setDcfAssumptionsMap(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const calculateTickerDCF = (ticker: string, eps: number | null) => {
    const financials = effectiveFinancialsMap[ticker] || effectiveFinancialsMap[ticker.toUpperCase()];
    if (!financials?.annual || financials.annual.length === 0) return null;
    const latest = financials.annual[0];

    const getFieldValue = (data: any, key: string) => {
      if (!data) return undefined;
      return data[key] !== undefined && data[key] !== null ? data[key] : undefined;
    };

    const fcf = getFieldValue(latest, "freeCashFlow");
    const netIncome = getFieldValue(latest, "netIncomeCommonStockholders");
    const basicEps = getFieldValue(latest, "basicEPS") || getFieldValue(latest, "dilutedEPS") || eps;
    const cash = getFieldValue(latest, "cashAndCashEquivalents") || 0;
    const totalDebt = getFieldValue(latest, "totalDebt") || 0;

    if (fcf === undefined || fcf === null || netIncome === undefined || netIncome === null || basicEps === undefined || basicEps === null || basicEps === 0) return null;

    const sharesOutstanding = netIncome / basicEps;

    const assumption = dcfAssumptionsMap[ticker] || dcfAssumptionsMap[ticker.toUpperCase()] || { growthRate: 10, discountRate: 8, terminalGrowthRate: 2.5 };
    const growthRate = assumption.growthRate / 100;
    const discountRate = assumption.discountRate / 100;
    const terminalGrowthRate = assumption.terminalGrowthRate / 100;

    let currentFCF = fcf;
    let presentValueFCF = 0;
    const projectedFCFs = [];

    for (let i = 1; i <= 5; i++) {
        currentFCF *= (1 + growthRate);
        projectedFCFs.push(currentFCF);
        presentValueFCF += currentFCF / Math.pow(1 + discountRate, i);
    }

    const terminalValue = (projectedFCFs[4] * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
    const presentValueTerminal = terminalValue / Math.pow(1 + discountRate, 5);

    const enterpriseValue = presentValueFCF + presentValueTerminal;
    const equityValue = enterpriseValue + cash - totalDebt;
    const intrinsicValuePerShare = equityValue / sharesOutstanding;

    return intrinsicValuePerShare;
  };

  useEffect(() => {
    const fetchAllFinancials = async () => {
      const tickersToFetch = Array.from(new Set(positions.filter(p => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "CASH" && p.ticker.toUpperCase() !== "USD").map(p => p.ticker)));
      if (tickersToFetch.length === 0) return;

      const missing = tickersToFetch.filter(t => !getCachedFinancials(t));
      if (missing.length > 0) {
        const results = await Promise.all(missing.map(async t => {
          try {
            const res = await fetch("/api/portfolio/financials", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ticker: t })
            });
            const data = await res.json();
            return { ticker: t, data };
          } catch (e) {
            return { ticker: t, data: null };
          }
        }));
        const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
        results.forEach(r => {
          if (r.data && !r.data.error) {
            if (Array.isArray(r.data.annual)) r.data.annual.sort(sortFn);
            if (Array.isArray(r.data.quarterly)) r.data.quarterly.sort(sortFn);
            setCachedFinancials(r.ticker, r.data);
          }
        });
      }
      setLocalFinancialsMap(getAllCachedFinancials());
    };
    fetchAllFinancials();
  }, [positions]);

  const [years, setYears] = useState<5 | 10>(5);
  const [monthlyAddition, setMonthlyAddition] = useState<number>(0);
  const [cagr, setCagr] = useState<number>(30.2);
  const [isInterestGainsExpanded, setIsInterestGainsExpanded] = useState(false);

  const [performanceTimeframe, setPerformanceTimeframe] = useState<"day" | "week" | "month" | "6m" | "ytd" | "1y" | "ath">("day");
  const [dynamicPerformance, setDynamicPerformance] = useState<Record<string, number>>({});
  const [loadingPerformance, setLoadingPerformance] = useState<boolean>(false);
  const [isPerformanceExpanded, setIsPerformanceExpanded] = useState(false);

  useEffect(() => {
    const list = positions || [];
    const stockPos = list.filter((p) => p.ticker && p.ticker.toUpperCase() !== "CASH" && !p.isCash && p.shares > 0);

    if (performanceTimeframe === "day") {
      const dayData: Record<string, number> = {};
      stockPos.forEach((pos) => {
        dayData[pos.ticker.toUpperCase()] = typeof pos.chgPct === "number" ? pos.chgPct : 0;
      });
      setDynamicPerformance(dayData);
      return;
    }

    const apiRangeMap: Record<string, string> = {
      day: "1D",
      week: "1W",
      month: "1M",
      "6m": "6M",
      ytd: "YTD",
      "1y": "1Y",
      ath: "ALL",
    };
    const range = apiRangeMap[performanceTimeframe] || "1M";

    let active = true;
    setLoadingPerformance(true);

    const fetchAllPerformances = async () => {
      const results: Record<string, number> = {};

      await Promise.all(
        stockPos.map(async (pos) => {
          const ticker = pos.ticker.toUpperCase();
          try {
            const res = await fetch(`/api/chart/${encodeURIComponent(ticker)}?range=${range}`);
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length >= 2) {
                const lastPrice = data[data.length - 1].close;
                if (performanceTimeframe === "ath") {
                  const maxPrice = Math.max(...data.map((d: any) => d.close));
                  if (maxPrice > 0) {
                    const returnPct = ((lastPrice - maxPrice) / maxPrice) * 100;
                    results[ticker] = Number(returnPct.toFixed(2));
                    return;
                  }
                } else {
                  const firstPrice = data[0].close;
                  if (firstPrice > 0) {
                    const returnPct = ((lastPrice - firstPrice) / firstPrice) * 100;
                    results[ticker] = Number(returnPct.toFixed(2));
                    return;
                  }
                }
              }
            }
          } catch (err) {
            console.error(`Failed to fetch performance for ${ticker}:`, err);
          }
          // Sin gráfico: solo el cambio del día real; si no, la posición queda fuera de las barras
          const fb = getTickerPerformanceData(ticker, performanceTimeframe, pos);
          if (fb !== null) results[ticker] = fb;
        })
      );

      if (active) {
        setDynamicPerformance(results);
        setLoadingPerformance(false);
      }
    };

    fetchAllPerformances();

    return () => {
      active = false;
    };
  }, [positions, performanceTimeframe]);

  const performanceData = useMemo(() => {
    const list = positions || [];
    const stockPos = list.filter((p) => p.ticker && p.ticker.toUpperCase() !== "CASH" && !p.isCash && p.shares > 0);
    const data = stockPos.map((pos) => {
      const tickerUpper = pos.ticker.toUpperCase();
      const perf = tickerUpper in dynamicPerformance
        ? dynamicPerformance[tickerUpper]
        : getTickerPerformanceData(pos.ticker, performanceTimeframe, pos);
      return {
        name: pos.ticker,
        performance: perf,
      };
    });
    // Sin dato real no se dibuja
    const withData = data.filter((d): d is { name: string; performance: number } => typeof d.performance === "number");
    // Sort descending by performance so it looks exactly like the image!
    return withData.sort((a, b) => b.performance - a.performance);
  }, [positions, performanceTimeframe, dynamicPerformance]);

  const t = {
    EN: {
      portfolioProjection: "PORTFOLIO PROJECTION",
      monthlyAddition: "Monthly addition",
      cagr: "CAGR",
      current: "Current",
      projected: "Projected",
      onInvested: "on invested",
      portfolioFutureValue: "PORTFOLIO FUTURE VALUE",
      high52wk: "52wk High Portfolio Value",
      avgTargetValue: "Analyst Avg Target Value",
      highTargetValue: "Analyst High Target Value",
      projectionBreakdown: "PROJECTION BREAKDOWN",
      principal: "Principal",
      interestGains: "Interest Gains",
      totalValue: "Total Value",
      additions: "Additions",
    },
    ES: {
      portfolioProjection: "PROYECCIÓN DE PORTAFOLIO",
      monthlyAddition: "Aporte mensual",
      cagr: "CAGR",
      current: "Actual",
      projected: "Proyectado",
      onInvested: "sobre lo invertido",
      portfolioFutureValue: "VALOR FUTURO DEL PORTAFOLIO",
      high52wk: "Valor Máximo 52 Semanas",
      avgTargetValue: "Valor Objetivo Promedio",
      highTargetValue: "Valor Objetivo Alto",
      projectionBreakdown: "DESGLOSE DE PROYECCIÓN",
      principal: "Principal",
      interestGains: "Ganancias por Interés",
      totalValue: "Valor Total",
      additions: "Aportes",
    }
  }[language];

  const [projectionTab, setProjectionTab] = useState<"portfolio" | "margin" | "total">("portfolio");

  const getTabColor = (tab: "portfolio" | "margin" | "total"): string => {
    if (tab === "portfolio") return "#10b981"; // emerald
    if (tab === "margin") return "#f59e0b"; // amber
    return "#6366f1"; // indigo
  };

  const getTabBadgeClass = (tab: "portfolio" | "margin" | "total"): string => {
    if (tab === "portfolio") return "text-emerald-400 bg-emerald-500/5 border-emerald-500/10";
    if (tab === "margin") return "text-amber-400 bg-amber-500/5 border-amber-500/10";
    return "text-indigo-400 bg-indigo-500/5 border-indigo-500/10";
  };

  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});

  const toggleSector = (sectorName: string) => {
    setExpandedSectors(prev => ({
      ...prev,
      [sectorName]: !prev[sectorName]
    }));
  };

  const allPositions = positions || [];
  const activePositions = allPositions.filter(p => p.ticker !== "MARGIN_PAID");
  const principalPositions = useMemo(() => activePositions.filter((p) => !p.isMargin), [activePositions]);
  const marginActivePositions = useMemo(() => activePositions.filter((p) => p.isMargin && !p.isCash), [activePositions]);

  const selectedPositions = useMemo(() => {
    if (projectionTab === "portfolio") return principalPositions;
    if (projectionTab === "margin") return marginActivePositions;
    return activePositions;
  }, [projectionTab, principalPositions, marginActivePositions, activePositions]);

  const principalCurrentVal = useMemo(() => principalPositions.reduce((acc, pos) => acc + (pos.shares * pos.price), 0), [principalPositions]);
  const marginCurrentVal = useMemo(() => marginActivePositions.reduce((acc, pos) => acc + (pos.shares * pos.price), 0), [marginActivePositions]);
  const currentPortfolioValue = principalCurrentVal + marginCurrentVal;

  const selectedTotalMktValue = useMemo(() => {
    if (projectionTab === "portfolio") return principalCurrentVal;
    if (projectionTab === "margin") return marginCurrentVal;
    return currentPortfolioValue;
  }, [projectionTab, principalCurrentVal, marginCurrentVal, currentPortfolioValue]);

  const marginFinancedPrincipal = useMemo(() => {
    return selectedPositions
      .filter((p) => (p.isMargin || projectionTab === "margin") && !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD")
      .reduce((sum, p) => sum + (p.shares * (p.avgCost || p.price)), 0);
  }, [selectedPositions, projectionTab]);

  const netSelectedMktValue = Math.max(0, selectedTotalMktValue - marginFinancedPrincipal);

  // 1. 52wk High calculations & breakdown
  const principal52wk = useMemo(() => {
    const principalList = selectedPositions.filter(p => !p.isMargin && projectionTab !== "margin");
    const currentVal = principalList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const futureVal = principalList.reduce((acc, pos) => {
      if (pos.isCash || pos.ticker === "CASH" || pos.ticker === "USD") return acc + (pos.shares * pos.price);
      const highPrice = (pos.fiftyTwoWeekHigh !== null && pos.fiftyTwoWeekHigh !== undefined && pos.fiftyTwoWeekHigh > 0)
        ? pos.fiftyTwoWeekHigh
        : pos.price * 1.34668;
      return acc + (pos.shares * highPrice);
    }, 0);
    const gain = futureVal - currentVal;
    const gainPct = currentVal > 0 ? (gain / currentVal) * 100 : 0;
    return { currentVal, futureVal, gain, gainPct };
  }, [selectedPositions, projectionTab]);

  const margin52wk = useMemo(() => {
    const marginList = selectedPositions.filter(p => (p.isMargin || projectionTab === "margin") && !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD");
    const currentVal = marginList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const grossFutureVal = marginList.reduce((acc, pos) => {
      const highPrice = (pos.fiftyTwoWeekHigh !== null && pos.fiftyTwoWeekHigh !== undefined && pos.fiftyTwoWeekHigh > 0)
        ? pos.fiftyTwoWeekHigh
        : pos.price * 1.34668;
      return acc + (pos.shares * highPrice);
    }, 0);
    const netFutureVal = Math.max(0, grossFutureVal - marginFinancedPrincipal);
    const gain = grossFutureVal - currentVal;
    const debtBase = marginFinancedPrincipal > 0 ? marginFinancedPrincipal : currentVal;
    const gainPct = debtBase > 0 ? (gain / debtBase) * 100 : 0;
    return { currentVal, grossFutureVal, netFutureVal, gain, gainPct };
  }, [selectedPositions, projectionTab, marginFinancedPrincipal]);

  const fiftyTwoWeekHighTotal = useMemo(() => {
    return principal52wk.futureVal + margin52wk.netFutureVal;
  }, [principal52wk.futureVal, margin52wk.netFutureVal]);

  const total52wkGain = fiftyTwoWeekHighTotal - netSelectedMktValue;

  // 2. Avg Target calculations & breakdown
  const principalAvgTarget = useMemo(() => {
    const principalList = selectedPositions.filter(p => !p.isMargin && projectionTab !== "margin");
    const currentVal = principalList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const futureVal = principalList.reduce((acc, pos) => {
      if (pos.isCash || pos.ticker === "CASH" || pos.ticker === "USD") return acc + (pos.shares * pos.price);
      const data = getAnalystData(pos);
      const targetPrice = (pos.targetMeanPrice !== null && pos.targetMeanPrice !== undefined && pos.targetMeanPrice > 0)
        ? pos.targetMeanPrice
        : ((data.avgTarget !== null && data.avgTarget > 0) ? data.avgTarget : pos.price);
      return acc + (pos.shares * targetPrice);
    }, 0);
    const gain = futureVal - currentVal;
    const gainPct = currentVal > 0 ? (gain / currentVal) * 100 : 0;
    return { currentVal, futureVal, gain, gainPct };
  }, [selectedPositions, projectionTab]);

  const marginAvgTarget = useMemo(() => {
    const marginList = selectedPositions.filter(p => (p.isMargin || projectionTab === "margin") && !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD");
    const currentVal = marginList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const grossFutureVal = marginList.reduce((acc, pos) => {
      const data = getAnalystData(pos);
      const targetPrice = (pos.targetMeanPrice !== null && pos.targetMeanPrice !== undefined && pos.targetMeanPrice > 0)
        ? pos.targetMeanPrice
        : ((data.avgTarget !== null && data.avgTarget > 0) ? data.avgTarget : pos.price);
      return acc + (pos.shares * targetPrice);
    }, 0);
    const netFutureVal = Math.max(0, grossFutureVal - marginFinancedPrincipal);
    const gain = grossFutureVal - currentVal;
    const debtBase = marginFinancedPrincipal > 0 ? marginFinancedPrincipal : currentVal;
    const gainPct = debtBase > 0 ? (gain / debtBase) * 100 : 0;
    return { currentVal, grossFutureVal, netFutureVal, gain, gainPct };
  }, [selectedPositions, projectionTab, marginFinancedPrincipal]);

  const avgTargetValueTotal = useMemo(() => {
    return principalAvgTarget.futureVal + marginAvgTarget.netFutureVal;
  }, [principalAvgTarget.futureVal, marginAvgTarget.netFutureVal]);

  const totalAvgTargetGain = avgTargetValueTotal - netSelectedMktValue;

  // 3. High Target calculations & breakdown
  const principalHighTarget = useMemo(() => {
    const principalList = selectedPositions.filter(p => !p.isMargin && projectionTab !== "margin");
    const currentVal = principalList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const futureVal = principalList.reduce((acc, pos) => {
      if (pos.isCash || pos.ticker === "CASH" || pos.ticker === "USD") return acc + (pos.shares * pos.price);
      const data = getAnalystData(pos);
      const targetPrice = (pos.targetHighPrice !== null && pos.targetHighPrice !== undefined && pos.targetHighPrice > 0)
        ? pos.targetHighPrice
        : ((data.highTarget !== null && data.highTarget > 0) ? data.highTarget : pos.price);
      return acc + (pos.shares * targetPrice);
    }, 0);
    const gain = futureVal - currentVal;
    const gainPct = currentVal > 0 ? (gain / currentVal) * 100 : 0;
    return { currentVal, futureVal, gain, gainPct };
  }, [selectedPositions, projectionTab]);

  const marginHighTarget = useMemo(() => {
    const marginList = selectedPositions.filter(p => (p.isMargin || projectionTab === "margin") && !p.isCash && p.ticker !== "CASH" && p.ticker !== "USD");
    const currentVal = marginList.reduce((acc, pos) => acc + (pos.shares * pos.price), 0);
    const grossFutureVal = marginList.reduce((acc, pos) => {
      const data = getAnalystData(pos);
      const targetPrice = (pos.targetHighPrice !== null && pos.targetHighPrice !== undefined && pos.targetHighPrice > 0)
        ? pos.targetHighPrice
        : ((data.highTarget !== null && data.highTarget > 0) ? data.highTarget : pos.price);
      return acc + (pos.shares * targetPrice);
    }, 0);
    const netFutureVal = Math.max(0, grossFutureVal - marginFinancedPrincipal);
    const gain = grossFutureVal - currentVal;
    const debtBase = marginFinancedPrincipal > 0 ? marginFinancedPrincipal : currentVal;
    const gainPct = debtBase > 0 ? (gain / debtBase) * 100 : 0;
    return { currentVal, grossFutureVal, netFutureVal, gain, gainPct };
  }, [selectedPositions, projectionTab, marginFinancedPrincipal]);

  const highTargetValueTotal = useMemo(() => {
    return principalHighTarget.futureVal + marginHighTarget.netFutureVal;
  }, [principalHighTarget.futureVal, marginHighTarget.netFutureVal]);

  const totalHighTargetGain = highTargetValueTotal - netSelectedMktValue;

  const baseValueForUpside = useMemo(() => {
    if (projectionTab === "margin") {
      return marginFinancedPrincipal > 0 ? marginFinancedPrincipal : (netSelectedMktValue > 0 ? netSelectedMktValue : selectedTotalMktValue);
    }
    return netSelectedMktValue > 0 ? netSelectedMktValue : selectedTotalMktValue;
  }, [projectionTab, marginFinancedPrincipal, netSelectedMktValue, selectedTotalMktValue]);

  const high52wkUpside = useMemo(() => {
    if (baseValueForUpside <= 0) return 0;
    return ((fiftyTwoWeekHighTotal - netSelectedMktValue) / baseValueForUpside) * 100;
  }, [fiftyTwoWeekHighTotal, netSelectedMktValue, baseValueForUpside]);

  const avgTargetUpside = useMemo(() => {
    if (baseValueForUpside <= 0) return 0;
    return ((avgTargetValueTotal - netSelectedMktValue) / baseValueForUpside) * 100;
  }, [avgTargetValueTotal, netSelectedMktValue, baseValueForUpside]);

  const highTargetUpside = useMemo(() => {
    if (baseValueForUpside <= 0) return 0;
    return ((highTargetValueTotal - netSelectedMktValue) / baseValueForUpside) * 100;
  }, [highTargetValueTotal, netSelectedMktValue, baseValueForUpside]);

  // Projection Calculations
  const baseGrowthRate = cagr / 100;
  const effectiveGrowthRate = baseGrowthRate;
  const currentYear = new Date().getFullYear();

  const chartData = useMemo(() => {
    let currentValue = selectedTotalMktValue;
    const data = [];
    data.push({
      year: String(currentYear),
      value: Math.round(currentValue),
    });

    const totalMonths = years * 12;
    const monthlyRate = Math.pow(1 + effectiveGrowthRate, 1 / 12) - 1;

    for (let m = 1; m <= totalMonths; m++) {
      currentValue = currentValue * (1 + monthlyRate) + (projectionTab === "margin" ? 0 : monthlyAddition);
      if (m % 12 === 0) {
        const yearNum = currentYear + (m / 12);
        data.push({
          year: String(yearNum),
          value: Math.round(currentValue),
        });
      }
    }
    return data;
  }, [selectedTotalMktValue, years, effectiveGrowthRate, monthlyAddition, currentYear, projectionTab]);

  const projectedTotalValue = useMemo(() => {
    if (chartData.length === 0) return 0;
    return chartData[chartData.length - 1].value;
  }, [chartData]);

  const totalAdditions = projectionTab === "margin" ? 0 : (monthlyAddition * years * 12);

  const totalInvested = projectionTab === "margin"
    ? (marginFinancedPrincipal > 0 ? marginFinancedPrincipal : selectedTotalMktValue)
    : (selectedTotalMktValue + totalAdditions);
  const totalGrowth = Math.max(0, projectedTotalValue - totalInvested);
  const interestGains = totalGrowth;

  const percentageReturnOnInvested = totalInvested > 0
    ? ((projectedTotalValue - totalInvested) / totalInvested) * 100
    : 0;

  const { sortedSectors, sectorSubsectors } = useMemo(() => {
    const sortedPositions = [...selectedPositions].sort((a, b) => {
      if (a.isCash) return 1;
      if (b.isCash) return -1;
      const valA = a.shares * a.price;
      const valB = b.shares * b.price;
      return valB - valA;
    });

    const totalVal = sortedPositions.reduce((sum, p) => sum + (p.shares * p.price), 0);

    const subsectors = sortedPositions.reduce((acc, pos) => {
      const sector = getTickerSector(pos.ticker, pos.isCash);
      const subsector = getTickerSubsector(pos.ticker, pos.isCash, language);
      const posVal = pos.shares * pos.price;
      if (!acc[sector]) {
        acc[sector] = {};
      }
      if (!acc[sector][subsector]) {
        acc[sector][subsector] = { mktValue: 0, weight: 0 };
      }
      acc[sector][subsector].mktValue += posVal;
      acc[sector][subsector].weight += totalVal > 0 ? (posVal / totalVal) * 100 : 0;
      return acc;
    }, {} as Record<string, Record<string, { mktValue: number; weight: number }>>);

    const sectorWeights = sortedPositions.reduce((acc, pos) => {
      const sector = getTickerSector(pos.ticker, pos.isCash);
      const posVal = pos.shares * pos.price;
      const posWeight = totalVal > 0 ? (posVal / totalVal) * 100 : 0;
      acc[sector] = (acc[sector] || 0) + posWeight;
      return acc;
    }, {} as Record<string, number>);

    const sectorMktValues = sortedPositions.reduce((acc, pos) => {
      const sector = getTickerSector(pos.ticker, pos.isCash);
      const posVal = pos.shares * pos.price;
      acc[sector] = (acc[sector] || 0) + posVal;
      return acc;
    }, {} as Record<string, number>);

    const sortedSectorsList = (Object.entries(sectorWeights) as [string, number][])
      .map(([name, weight]) => ({
        name,
        weight,
        mktValue: sectorMktValues[name] || 0
      }))
      .sort((a, b) => b.weight - a.weight);

    return {
      sortedSectors: sortedSectorsList,
      sectorSubsectors: subsectors
    };
  }, [selectedPositions, language]);

  const formatAbbreviatedK = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000000000) {
      const billions = val / 1000000000;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(billions) + "Bn";
    }
    if (abs >= 1000000) {
      const millions = val / 1000000;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(millions) + "M";
    }
    if (abs >= 1000) {
      const thousands = val / 1000;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(thousands) + "k";
    }
    return formatCurrency(val);
  };

  const formatCurrency = (val: number | null) => {
    if (val === null) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  const getExtendedHoursLabel = (marketState?: string | null) => {
    if (marketState) {
      const ms = marketState.toUpperCase();
      if (ms.includes("PRE")) return "PRE";
      if (ms.includes("POST") || ms.includes("AFTER")) return "AH";
    }
    try {
      const nyTimeStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false });
      const timePart = nyTimeStr.split(",")[1]?.trim();
      if (timePart) {
        const [hourStr, minuteStr] = timePart.split(":");
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);
        const timeInMinutes = hour * 60 + minute;
        if (timeInMinutes < 9 * 60 + 30) {
          return "PRE";
        }
        if (timeInMinutes >= 16 * 60) {
          return "AH";
        }
      }
    } catch {
      // fallback
    }
    const localHour = new Date().getHours();
    if (localHour < 12) return "PRE";
    return "AH";
  };

  const formatValuation = (val: number | null) => {
    if (val === null) return "—";
    if (isReadOnly || Math.abs(val) >= 1000000) {
      const abs = Math.abs(val);
      if (abs >= 1000000000) {
        const billions = val / 1000000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(billions) + "Bn";
      }
      if (abs >= 1000000) {
        const millions = val / 1000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(millions) + "M";
      }
      if (abs === 0) return "$0.00";
    }
    return formatCurrency(val);
  };

  const formatStockValue = (val: number | null) => {
    if (val === null) return "—";
    if (isReadOnly || Math.abs(val) >= 1000000) {
      const abs = Math.abs(val);
      if (abs >= 1000000000) {
        const billions = val / 1000000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(billions) + "Bn";
      }
      if (abs >= 1000000) {
        const millions = val / 1000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(millions) + "M";
      }
      if (abs === 0) return "$0.00";
    }
    return formatCurrency(val);
  };

  const formatProjectionValue = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return "—";
    const abs = Math.abs(val);
    if (isReadOnly || abs >= 1000000) {
      if (abs >= 1000000000) {
        const billions = val / 1000000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(billions) + "Bn";
      }
      if (abs >= 1000000) {
        const millions = val / 1000000;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(millions) + "M";
      }
      if (abs === 0) return "$0.00";
    }
    return formatCurrency(val);
  };

  const formatPercent = (val: number | null) => {
    if (val === null) return "—";
    return `${val > 0 ? "+" : ""}${val.toFixed(2)}%`;
  };

  const formatNumber = (val: number | null, decimals = 2) => {
    if (val === null || isNaN(val)) return "—";
    return val.toFixed(decimals);
  };

  const formatShares = (val: number | null) => {
    if (val === null || isNaN(val)) return "—";
    if (isReadOnly) {
      const thousands = val / 1000;
      return `${thousands.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
    }
    return formatNumber(val);
  };

  // Sort positions: Stocks first (by market value desc), Cash last
  const sortedPositions = [...positions].sort((a, b) => {
    if (a.isCash) return 1;
    if (b.isCash) return -1;
    return b.mktValue - a.mktValue;
  });

  // 1. Sector distribution calculations
  const sectorWeights = sortedPositions.reduce((acc, pos) => {
    const sector = getTickerSector(pos.ticker, pos.isCash);
    acc[sector] = (acc[sector] || 0) + pos.weight;
    return acc;
  }, {} as Record<string, number>);

  const sectorMktValues = sortedPositions.reduce((acc, pos) => {
    const sector = getTickerSector(pos.ticker, pos.isCash);
    acc[sector] = (acc[sector] || 0) + pos.mktValue;
    return acc;
  }, {} as Record<string, number>);

  // Sort sectors by weight descending
  const statsSortedSectors = Object.entries(sectorWeights)
    .map(([name, weight]) => ({
      name,
      weight,
      mktValue: sectorMktValues[name] || 0
    }))
    .sort((a, b) => b.weight - a.weight);

  // 2. Weighted Multiples & Metrics
  const totalWeight = sortedPositions.reduce((sum, p) => sum + p.weight, 0);

  // Weighted PE (only include positions with valid pe > 0)
  const pePositions = sortedPositions.filter(p => p.pe !== null && p.pe > 0);
  const totalWeightForPe = pePositions.reduce((sum, p) => sum + p.weight, 0);
  const weightedPe = totalWeightForPe > 0
    ? pePositions.reduce((sum, p) => sum + (p.pe! * p.weight), 0) / totalWeightForPe
    : null;

  // Weighted Forward PE
  const fwdPePositions = sortedPositions.filter(p => p.fwdPe !== null && p.fwdPe > 0);
  const totalWeightForFwdPe = fwdPePositions.reduce((sum, p) => sum + p.weight, 0);
  const weightedFwdPe = totalWeightForFwdPe > 0
    ? fwdPePositions.reduce((sum, p) => sum + (p.fwdPe! * p.weight), 0) / totalWeightForFwdPe
    : null;

  // Weighted PEG
  const pegPositions = sortedPositions.filter(p => p.peg !== null && p.peg > 0);
  const totalWeightForPeg = pegPositions.reduce((sum, p) => sum + p.weight, 0);
  const weightedPeg = totalWeightForPeg > 0
    ? pegPositions.reduce((sum, p) => sum + (p.peg! * p.weight), 0) / totalWeightForPeg
    : null;

  // 3. Concentration of first 3 positions
  const sortedByWeight = [...sortedPositions].sort((a, b) => b.weight - a.weight);
  const top3Concentration = sortedByWeight.slice(0, 3).reduce((sum, p) => sum + p.weight, 0);
  const top3Positions = sortedByWeight.slice(0, 3);

  const totalMktValue = positions.reduce((sum, p) => sum + p.mktValue, 0);
  const totalCostBasis = positions.reduce((sum, p) => sum + (p.shares * p.avgCost), 0);
  const totalDailyPnL = positions.reduce((sum, p) => sum + p.dailyPnL, 0);
  const totalReturnAmt = positions.reduce((sum, p) => sum + p.returnAmt, 0);
  const totalReturnPct = totalCostBasis > 0 ? (totalReturnAmt / totalCostBasis) * 100 : 0;
  const previousValue = totalMktValue - totalDailyPnL;
  const totalDailyPnLPercent = previousValue !== 0 ? (totalDailyPnL / previousValue) * 100 : 0;

  const totalAvgValue = sortedPositions.reduce((acc, pos) => {
    const data = getAnalystData(pos);
    const targetPrice = (data.avgTarget !== null && data.avgTarget > 0) ? data.avgTarget : pos.price;
    return acc + (pos.shares * targetPrice);
  }, 0);

  const totalHighValue = sortedPositions.reduce((acc, pos) => {
    const data = getAnalystData(pos);
    const targetPrice = (data.highTarget !== null && data.highTarget > 0) ? data.highTarget : pos.price;
    return acc + (pos.shares * targetPrice);
  }, 0);

  const totalDcfValue = sortedPositions.reduce((acc, pos) => {
    const eps = pos.pe && pos.pe > 0 ? pos.price / pos.pe : null;
    let dcfIntrinsic = calculateTickerDCF(pos.ticker, eps);
    const data = getAnalystData(pos);
    if (dcfIntrinsic !== null && dcfIntrinsic < 0 && data.avgTarget !== null && data.avgTarget > 0) {
      dcfIntrinsic = data.avgTarget;
    }
    const targetPrice = (dcfIntrinsic !== null && dcfIntrinsic > 0) ? dcfIntrinsic : pos.price;
    return acc + (pos.shares * targetPrice);
  }, 0);

  const totalUpsideAvgPercent = totalMktValue > 0
    ? ((totalAvgValue - totalMktValue) / totalMktValue) * 100
    : 0;

  const totalUpsideHighPercent = totalMktValue > 0
    ? ((totalHighValue - totalMktValue) / totalMktValue) * 100
    : 0;

  const totalDividendIncome = sortedPositions.reduce((acc, pos) => {
    if (pos.isCash) return acc;
    const rate = getDividendPerShare(pos);
    return acc + (rate !== null ? rate * pos.shares : 0);
  }, 0);

  // Datos por valor para Valuation y para la proyección de Basis: /api/stock (cotización, beta, deuda…)
  // y /api/valuation (serie de precio y múltiplos). Basis solo necesita la serie de los fondos/ETF.
  const [dcfScenario, setDcfScenario] = useState<DcfScenario>("base");
  const [fvRange, setFvRange] = useState<FvRange>("10Y");
  const [valData, setValData] = useState<Record<string, { stock?: any; stockDone?: boolean; points?: any[]; pointsDone?: boolean }>>({});
  const valRequested = useRef<Set<string>>(new Set());
  const valTickers = useMemo(
    () => Array.from(new Set(activePositions.filter((p) => !p.isCash && p.ticker && p.ticker.toUpperCase() !== "CASH").map((p) => p.ticker.toUpperCase()))),
    [activePositions]
  );
  const finOf = (t: string) => effectiveFinancialsMap[t] || effectiveFinancialsMap[t.replace("-", ".")];
  // Sin estados financieros (fondos, ETF): su rentabilidad esperada sale de la historia del precio
  const fundKey = valTickers.map((t) => `${t}:${finOf(t) ? (finOf(t)?.annual?.length ? "s" : "f") : "?"}`).join(",");
  const valLoading = holdingsTabMode === "valuation" && valTickers.some((t) => !valData[t]?.stockDone || !valData[t]?.pointsDone);
  useEffect(() => {
    if (holdingsTabMode !== "valuation" && holdingsTabMode !== "basis") return;
    const jobs: { t: string; kind: "stock" | "points" }[] = [];
    for (const t of valTickers) {
      if (!valRequested.current.has(`stock:${t}`)) jobs.push({ t, kind: "stock" });
      const fin = finOf(t);
      const wantPoints = holdingsTabMode === "valuation" || (fin !== undefined && !(fin?.annual?.length > 0));
      if (wantPoints && !valRequested.current.has(`points:${t}`)) jobs.push({ t, kind: "points" });
    }
    if (!jobs.length) return;
    jobs.forEach((j) => valRequested.current.add(`${j.kind}:${j.t}`));
    const run = async ({ t, kind }: { t: string; kind: "stock" | "points" }) => {
      const url = kind === "stock" ? `/api/stock/${encodeURIComponent(t)}` : `/api/valuation/${encodeURIComponent(t)}`;
      const j = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setValData((prev) => ({
        ...prev,
        [t]: kind === "stock" ? { ...prev[t], stock: j, stockDone: true } : { ...prev[t], points: Array.isArray(j?.points) ? j.points : [], pointsDone: true },
      }));
    };
    // De 4 en 4 para no saturar al servidor
    (async () => {
      for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map(run));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingsTabMode, valTickers.join(","), fundKey]);
  const valuationByTicker = useMemo(() => {
    const out: Record<string, { dcf: number | null; fv: number | null; fvMultiple: number | null }> = {};
    for (const t of valTickers) {
      const d = valData[t];
      if (!d?.stockDone || !d?.pointsDone) continue;
      const fin = finOf(t);
      let dcf: number | null = null;
      try {
        dcf = dcfPerShare(fin?.annual, fin?.quarterly, d.stock, dcfScenario);
      } catch {
        dcf = null;
      }
      const fv = epsFairValue(d.points || [], fvRange);
      out[t] = { dcf, fv: fv?.value ?? null, fvMultiple: fv?.multiple ?? null };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valTickers, valData, effectiveFinancialsMap, dcfScenario, fvRange]);

  // Rentabilidad anual esperada de cada posición (utils/expectedReturn.ts): acciones con el modelo de
  // Bogle (escenario base a 5 años, como la pestaña Analysis); fondos/ETF con su historia de precio.
  const expectedReturns = useMemo(() => {
    const out: Record<string, ExpectedReturn | null> = {};
    for (const t of valTickers) {
      const d = valData[t];
      const fin = finOf(t);
      if (!d?.stockDone || fin === undefined) continue; // aún cargando
      const isFund = !(fin?.annual?.length > 0);
      if (isFund && !d.pointsDone) continue;
      out[t] = expectedAnnualReturn(t, fin, d.stock, d.points, activePositions.find((p) => p.ticker.toUpperCase() === t)?.price);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valTickers, valData, effectiveFinancialsMap]);

  // Scorecard / Health mode calculations using unified Master Stock Score Matrix
  const scoreV = useScoreBenchmarks();
  const scoredRowsMap = useMemo(() => {
    const map = new Map<string, any>();
    const stockPositions = activePositions.filter((p) => !p.isCash);
    if (stockPositions.length === 0) return map;

    stockPositions.forEach((pos) => {
      const sym = pos.ticker.toUpperCase();
      const sector = getTickerSector(pos.ticker, pos.isCash);
      const unified = getStockScore(sym, sector, pos.name);
      const finData = effectiveFinancialsMap[pos.ticker] || effectiveFinancialsMap[sym];

      let raw = { ...getRawFeatures(pos.ticker, pos.name, sector) };
      if (finData) {
        raw = overrideFeaturesWithFinancials(raw, finData);
      }
      // Múltiplos de la posición solo si la referencia no los trae (así la empresa y sus comparables
      // se miden con la misma fuente)
      if (raw.trailing_pe == null && pos.pe != null && pos.pe > 0) raw.trailing_pe = pos.pe;
      if (raw.forward_pe == null && pos.fwdPe != null && pos.fwdPe > 0) raw.forward_pe = pos.fwdPe;
      if (raw.ev_ebitda == null && pos.evEbitda != null && pos.evEbitda > 0) raw.ev_ebitda = pos.evEbitda;

      let rowScores: any = unified.strategyScores;
      let rowFactors: any = unified.factors;
      let profile: any = unified;

      const finMap: Record<string, any> = {};
      if (finData) {
        finMap[sym] = finData;
      }

      const scoredList = buildScores([raw], "zscore", finMap);
      if (scoredList && scoredList.length > 0) {
        rowScores = scoredList[0].scores;
        rowFactors = {
          growth: scoredList[0].factors.growth,
          quality: scoredList[0].factors.quality,
          stability: scoredList[0].factors.stability,
          valuation: scoredList[0].factors.valuation,
        };
        // Arquetipo y tipo del cálculo con todos los datos (no del de la matriz, que puede no tener estados)
        profile = { ...scoredList[0], subscores: scoredList[0].sub };
      }

      map.set(sym, {
        symbol: unified.symbol,
        name: unified.name,
        sector: unified.sector,
        scores: rowScores,
        factors: rowFactors,
        archetype: profile.archetype,
        type: profile.type,
        valuationMethod: profile.valuationMethod,
        note: profile.note,
        sub: profile.subscores || {},
        raw,
      });
    });
    return map;
  }, [activePositions, effectiveFinancialsMap, scoreV]);

  // CAGR de la proyección = media de la rentabilidad esperada de cada posición ponderada por su valor
  // de mercado; el efectivo cuenta al 0 % (como en Simulation). Las posiciones sin dato (aún cargando
  // o sin historia) no cuentan.
  const projectionCagr = useMemo(() => {
    // Posiciones de la pestaña elegida (Portfolio / Margin / Total)
    const stockPositions = selectedPositions.filter((p) => !p.isCash && p.ticker.toUpperCase() !== "CASH");
    const cashValue = selectedPositions.filter((p) => p.isCash || p.ticker.toUpperCase() === "CASH").reduce((a, p) => a + (p.mktValue || 0), 0);
    let sum = 0;
    let w = 0;
    let pending = 0;
    const missing: string[] = [];
    const byTicker: { ticker: string; rate: number; source: string; weight: number; capped?: boolean }[] = [];
    stockPositions.forEach((p) => {
      const t = p.ticker.toUpperCase();
      const mv = p.mktValue || p.shares * p.price || 0;
      if (!(t in expectedReturns)) {
        pending++;
        return;
      }
      const er = expectedReturns[t];
      if (!er) {
        missing.push(t);
        return;
      }
      sum += er.rate * mv;
      w += mv;
      byTicker.push({ ticker: t, rate: er.rate, source: er.source, weight: mv, capped: er.capped });
    });
    if (cashValue > 0) {
      w += cashValue; // al 0 %
      byTicker.push({ ticker: "CASH", rate: 0, source: "cash", weight: cashValue });
    }
    const total = byTicker.reduce((a, b) => a + b.weight, 0) || 1;
    byTicker.forEach((b) => (b.weight = (b.weight / total) * 100));
    return { rate: w > 0 ? Number((sum / w).toFixed(1)) : null, pending, missing, byTicker: byTicker.sort((a, b) => b.weight - a.weight) };
  }, [selectedPositions, expectedReturns]);
  const portfolioWeightedCagr = projectionCagr.pending === 0 ? projectionCagr.rate ?? 0 : 0;

  // El campo CAGR toma la rentabilidad esperada de la cartera cuando termina de cargar (el usuario
  // puede cambiarlo a mano después)
  useEffect(() => {
    if (portfolioWeightedCagr !== 0) setCagr(portfolioWeightedCagr);
  }, [portfolioWeightedCagr]);

  const portfolioHealth = useMemo(() => {
    return calculatePortfolioScoreFromMatrix(sortedPositions, effectiveFinancialsMap);
  }, [sortedPositions, effectiveFinancialsMap, scoreV]);

  const portfolioWeightedScore = portfolioHealth.score;
  const portfolioWeightedType = portfolioHealth.dominantType;
  const portfolioWeightedFactors = portfolioHealth.factors;

  const getScoreColorClass = (score: number | null) => {
    if (score === null) return "text-slate-500";
    if (score >= 75) return "text-emerald-400 font-bold";
    if (score >= 50) return "text-blue-400 font-semibold";
    if (score >= 35) return "text-amber-400";
    return "text-rose-400";
  };

  const getScoreBgClass = (score: number | null) => {
    if (score === null) return "bg-slate-900 text-slate-500 border-slate-800";
    if (score >= 75) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (score >= 50) return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    if (score >= 35) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  };

  const marginPositions = useMemo(() => sortedPositions.filter(p => p.isMargin && !p.isCash), [sortedPositions]);
  const grossMarginCostBasis = useMemo(() => marginPositions.reduce((sum, p) => sum + (p.shares * p.avgCost), 0), [marginPositions]);
  const marginPaidPos = useMemo(() => allPositions.find(p => p.ticker === "MARGIN_PAID"), [allPositions]);
  const marginPaidAmount = marginPaidPos ? marginPaidPos.shares : 0;
  const marginCostBasis = Math.max(0, grossMarginCostBasis - marginPaidAmount);
  const marginMktValue = useMemo(() => marginPositions.reduce((sum, p) => sum + p.mktValue, 0), [marginPositions]);
  const marginAnnualCost = marginCostBasis * 0.0625;
  const marginMonthlyCost = marginCostBasis * (Math.pow(1 + 0.0625, 1 / 12) - 1);

  // Tabla Basis: posiciones ordenadas por la columna elegida y agrupadas por sector y/o subsector.
  // Los grupos se ordenan por la suma de la columna (o por valor de mercado si no es sumable);
  // el efectivo va siempre al final, sin grupo.
  const basisRows: BasisRow[] = (() => {
    const dirMul = basisSort.dir === "desc" ? -1 : 1;
    const cmp = (a: Position, b: Position) => {
      const va = basisSortValue(a, basisSort.key), vb = basisSortValue(b, basisSort.key);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * (basisSort.dir === "desc" ? 1 : -1);
      return (va - vb) * dirMul;
    };
    const stocks = sortedPositions.filter((p) => !p.isCash).sort(cmp);
    const cash = sortedPositions.filter((p) => p.isCash);
    const indexOf = new Map(sortedPositions.map((p, i) => [p, i]));
    const summable: BasisSortKey[] = ["mktValue", "weight", "dailyPnL", "returnAmt", "dividend"];
    const sum = (ps: Position[], f: (p: Position) => number) => ps.reduce((a, p) => a + f(p), 0);
    const groupScore = (ps: Position[]) => {
      if (summable.includes(basisSort.key)) return sum(ps, (p) => basisSortValue(p, basisSort.key) as number);
      // Porcentajes: el del grupo (rentabilidad sobre su coste; cambio del día sobre su valor de ayer)
      if (basisSort.key === "returnPct") {
        const cost = sum(ps, (p) => p.shares * p.avgCost);
        return cost > 0 ? sum(ps, (p) => p.returnAmt) / cost : 0;
      }
      if (basisSort.key === "chgPct") {
        const prev = sum(ps, (p) => p.mktValue - p.dailyPnL);
        return prev > 0 ? sum(ps, (p) => p.dailyPnL) / prev : 0;
      }
      return sum(ps, (p) => p.mktValue);
    };
    const header = (level: "sector" | "subsector", label: string, ps: Position[]): BasisRow => ({
      kind: "group",
      level,
      label,
      count: ps.length,
      mktValue: ps.reduce((a, p) => a + p.mktValue, 0),
      weight: ps.reduce((a, p) => a + p.weight, 0),
      dailyPnL: ps.reduce((a, p) => a + p.dailyPnL, 0),
      returnAmt: ps.reduce((a, p) => a + p.returnAmt, 0),
      cost: ps.reduce((a, p) => a + p.shares * p.avgCost, 0),
      dividend: ps.reduce((a, p) => a + (getDividendPerShare(p) ?? 0) * p.shares, 0),
    });
    const groupsOf = (ps: Position[], keyFn: (p: Position) => string) => {
      const m = new Map<string, Position[]>();
      for (const p of ps) (m.get(keyFn(p)) ?? m.set(keyFn(p), []).get(keyFn(p))!).push(p);
      // Orden de los grupos: por su suma; de mayor a menor salvo que el orden sea ascendente
      return [...m.entries()].sort((a, b) => (groupScore(a[1]) - groupScore(b[1])) * (basisSort.key === "ticker" ? -1 : dirMul));
    };
    const rows: BasisRow[] = [];
    const pushPositions = (ps: Position[]) => ps.forEach((p) => rows.push({ kind: "pos", pos: p, idx: indexOf.get(p) ?? 0 }));
    const bySubsector = (ps: Position[]) => {
      if (!groupBy.subsector) return pushPositions(ps);
      for (const [label, sub] of groupsOf(ps, (p) => getTickerSubsector(p.ticker, false, language))) {
        rows.push(header("subsector", label, sub));
        pushPositions(sub);
      }
    };
    if (groupBy.sector) {
      for (const [label, ps] of groupsOf(stocks, (p) => getTickerSector(p.ticker, false))) {
        rows.push(header("sector", label, ps));
        bySubsector(ps);
      }
    } else bySubsector(stocks);
    pushPositions(cash);
    return rows;
  })();
  const toggleBasisSort = (key: BasisSortKey) =>
    setBasisSort((cur) => (cur.key === key ? { key, dir: cur.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "ticker" ? "asc" : "desc" }));
  const sortTh = (key: BasisSortKey, label: React.ReactNode, className = "py-2 px-1 md:px-2 text-right") => (
    <th className={className} aria-sort={basisSort.key === key ? (basisSort.dir === "desc" ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => toggleBasisSort(key)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-white transition-colors ${basisSort.key === key ? "text-emerald-400" : ""}`}
        title={language === "EN" ? "Sort" : "Ordenar"}
      >
        {label}
        <span className="text-[9px] opacity-80">{basisSort.key === key ? (basisSort.dir === "desc" ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="space-y-6" id="holdings-section">
      {/* 1. COMPONENT HEADER / CONTROL PANEL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0a0c14]/40 border border-slate-900/40 p-4 sm:p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/30 shrink-0">
            <Briefcase className="text-emerald-400" size={16} />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-display font-bold text-white tracking-wider uppercase flex items-center gap-2">
              {language === "EN" ? "PORTFOLIO POSITIONS" : "POSICIONES DE CARTERA"}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-none">
              {positions.filter(p => !p.isCash).length} {language === "EN" ? "active positions • Live market data" : "posiciones activas • Valores de mercado en tiempo real"}
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3 w-full md:w-auto">
          {/* Basis vs Valuation vs Health Toggle */}
          <div data-toggle className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex bg-[#0a0c14] border border-slate-900 rounded-full px-1 py-0.5 sm:px-1.5 sm:py-1 gap-0.5 sm:gap-0 font-bold shadow-inner" id="holdings-mode-toggle">
            <button aria-pressed={!!(holdingsTabMode === "basis")}
              id="holdings-tab-basis"
              onClick={() => handleTabModeChange("basis")}
              className={`px-1 min-[360px]:px-1.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 uppercase font-bold text-[9px] min-[380px]:text-[10px] sm:text-[11px] tracking-tight sm:tracking-wider ${
                holdingsTabMode === "basis"
                  ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Briefcase size={11} className="shrink-0 sm:w-3 sm:h-3" />
              <span>Basis</span>
            </button>
            <button aria-pressed={!!(holdingsTabMode === "valuation")}
              id="holdings-tab-valuation"
              onClick={() => handleTabModeChange("valuation")}
              className={`px-1 min-[360px]:px-1.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 uppercase font-bold text-[9px] min-[380px]:text-[10px] sm:text-[11px] tracking-tight sm:tracking-wider ${
                holdingsTabMode === "valuation"
                  ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles size={11} className="shrink-0 sm:w-3 sm:h-3" />
              <span>Valuation</span>
            </button>
            <button aria-pressed={!!(holdingsTabMode === "health")}
              id="holdings-tab-health"
              onClick={() => handleTabModeChange("health")}
              className={`px-1 min-[360px]:px-1.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 uppercase font-bold text-[9px] min-[380px]:text-[10px] sm:text-[11px] tracking-tight sm:tracking-wider ${
                holdingsTabMode === "health"
                  ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Award size={11} className="shrink-0 sm:w-3 sm:h-3" />
              <span>{language === "EN" ? "Health" : "Salud"}</span>
            </button>
            <button aria-pressed={!!(holdingsTabMode === "financials")}
              id="holdings-tab-financials"
              onClick={() => handleTabModeChange("financials")}
              className={`px-1 min-[360px]:px-1.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 uppercase font-bold text-[9px] min-[380px]:text-[10px] sm:text-[11px] tracking-tight sm:tracking-wider ${
                holdingsTabMode === "financials"
                  ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText size={11} className="shrink-0 sm:w-3 sm:h-3" />
              <span>{language === "EN" ? "Financials" : "Financieros"}</span>
            </button>
          </div>

          {/* View Toggles */}
          {holdingsTabMode === "financials" ? (
            <div data-toggle id="holdings-view-toggle" className="holdings-view-toggle flex bg-[#121420] p-1 rounded-xl border border-slate-800/60 text-[11px] font-bold">
              <button aria-pressed={!!(financialsViewMode === "cards")}
                onClick={() => setFinancialsViewMode("cards")}
                className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  financialsViewMode === "cards"
                    ? "bg-[#1c1e29] text-white shadow-inner active-view-mode"
                    : "text-slate-500 hover:text-slate-300 inactive-view-mode"
                }`}
              >
                <LayoutGrid size={13} />
                {language === "EN" ? "Cards" : "Tarjetas"}
              </button>
              <button aria-pressed={!!(financialsViewMode === "table")}
                onClick={() => setFinancialsViewMode("table")}
                className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  financialsViewMode === "table"
                    ? "bg-[#1c1e29] text-white shadow-inner active-view-mode"
                    : "text-slate-500 hover:text-slate-300 inactive-view-mode"
                }`}
              >
                <Table size={13} />
                {language === "EN" ? "Table" : "Tabla"}
              </button>
            </div>
          ) : (
            <div data-toggle id="holdings-view-toggle" className="holdings-view-toggle flex bg-[#121420] p-1 rounded-xl border border-slate-800/60 text-[11px] font-bold">
              <button aria-pressed={!!(viewMode === "cards")}
                onClick={() => setViewMode("cards")}
                className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "cards"
                    ? "bg-[#1c1e29] text-white shadow-inner active-view-mode"
                    : "text-slate-500 hover:text-slate-300 inactive-view-mode"
                }`}
              >
                <LayoutGrid size={13} />
                {language === "EN" ? "Cards" : "Tarjetas"}
              </button>
              <button aria-pressed={!!(viewMode === "table")}
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "table"
                    ? "bg-[#1c1e29] text-white shadow-inner active-view-mode"
                    : "text-slate-500 hover:text-slate-300 inactive-view-mode"
                }`}
              >
                <Table size={13} />
                {language === "EN" ? "Table" : "Tabla"}
              </button>
            </div>
          )}

          {!isReadOnly && (
            <button
              onClick={onEditHoldings}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg hover:shadow-emerald-500/20 cursor-pointer"
            >
              <Edit size={14} />
              {language === "EN" ? "Edit Portfolio" : "Editar Carteras"}
            </button>
          )}
        </div>
      </div>

      {/* Valuation: escenario del DCF y rango del valor razonable por múltiplos */}
      {holdingsTabMode === "valuation" && valTickers.length > 0 && (
        <div id="holdings-valuation-controls" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-bold">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase tracking-wider">DCF</span>
            <div data-toggle className="flex bg-[#121420] p-1 rounded-xl border border-slate-800/60">
              {(["bear", "base", "bull"] as DcfScenario[]).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  aria-pressed={dcfScenario === sc}
                  onClick={() => setDcfScenario(sc)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${dcfScenario === sc ? "bg-[#1c1e29] text-white shadow-inner" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {sc === "bear" ? (language === "EN" ? "Bear" : "Bajista") : sc === "base" ? "Base" : language === "EN" ? "Bull" : "Alcista"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase tracking-wider">{language === "EN" ? "Fair value (P/E)" : "Valor razonable (PER)"}</span>
            <div data-toggle className="flex bg-[#121420] p-1 rounded-xl border border-slate-800/60">
              {FV_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={fvRange === r}
                  onClick={() => setFvRange(r)}
                  className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${fvRange === r ? "bg-[#1c1e29] text-white shadow-inner" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {r === "ALL" ? (language === "EN" ? "All" : "Todo") : r}
                </button>
              ))}
            </div>
          </div>
          {valLoading && (
            <span className="flex items-center gap-1.5 text-slate-500 font-medium">
              <Loader2 size={12} className="animate-spin" />
              {language === "EN" ? "Loading valuations…" : "Cargando valoraciones…"}
            </span>
          )}
          <span className="text-slate-500 font-normal text-[10px] basis-full">
            {language === "EN"
              ? "DCF: same model as Stock Explorer, by scenario. Fair value: diluted EPS TTM × median P/E of the selected range."
              : "DCF: el mismo modelo que Stock Explorer, según el escenario. Valor razonable: BPA diluido TTM × PER mediano del rango elegido."}
          </span>
        </div>
      )}

      {/* 2.5 PROYECCIÓN, VALOR FUTURO Y SECTORES: solo en Basis, encima de la tabla */}
      {holdingsTabMode === "basis" && activePositions.length > 0 && (
        <div className="space-y-4" id="portfolio-projections-section">
          {/* Tabs Selector: Portfolio / Margin / Total (only show selector if margin positions exist) */}
          {marginActivePositions.length > 0 && (
            <div data-toggle className="flex bg-[#121420] p-1 rounded-2xl border border-slate-800/80 w-fit text-xs font-bold font-mono">
              <button aria-pressed={!!(projectionTab === "portfolio")}
                type="button"
                onClick={() => setProjectionTab("portfolio")}
                className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                  projectionTab === "portfolio"
                    ? "bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {language === "EN" ? "Portfolio" : "Portafolio"}
              </button>
              <button aria-pressed={!!(projectionTab === "margin")}
                type="button"
                onClick={() => setProjectionTab("margin")}
                className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                  projectionTab === "margin"
                    ? "bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {language === "EN" ? "Margin" : "Margen"}
              </button>
              <button aria-pressed={!!(projectionTab === "total")}
                type="button"
                onClick={() => setProjectionTab("total")}
                className={`px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                  projectionTab === "total"
                    ? "bg-indigo-500 text-slate-950 font-black shadow-lg shadow-indigo-500/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Total
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Card 1: PORTFOLIO PROJECTION */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📊</span>
                    <h3 className="font-display font-bold text-xs text-slate-400 tracking-wider uppercase">
                      {projectionTab === "portfolio"
                        ? t.portfolioProjection
                        : (projectionTab === "margin"
                          ? (language === "EN" ? "MARGIN PROJECTION" : "PROYECCIÓN DE MARGEN")
                          : (language === "EN" ? "TOTAL PROJECTION" : "PROYECCIÓN TOTAL")
                        )
                      }
                    </h3>
                  </div>

                  {/* Year Selectors */}
                  <div data-toggle className="flex bg-[#121420] p-1 rounded-xl border border-slate-800/60 text-[10px] font-bold">
                    <button aria-pressed={!!(years === 5)}
                      type="button"
                      onClick={() => setYears(5)}
                      className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
                        years === 5
                          ? "bg-[#1c1e29] text-white shadow-inner"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      5Y
                    </button>
                    <button aria-pressed={!!(years === 10)}
                      type="button"
                      onClick={() => setYears(10)}
                      className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
                        years === 10
                          ? "bg-[#1c1e29] text-white shadow-inner"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      10Y
                    </button>
                  </div>
                </div>

                {/* Controls Row */}
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400 w-full whitespace-nowrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{t.monthlyAddition}</span>
                    <div className="flex items-center bg-[#121420] border border-slate-800/80 rounded-xl px-2.5 py-1 shrink-0">
                      <span className="text-slate-500 font-mono mr-1">$</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        disabled={projectionTab === "margin"}
                        value={projectionTab === "margin" ? 0 : monthlyAddition}
                        onChange={(e) => setMonthlyAddition(Math.max(0, Number(e.target.value)))}
                        className="bg-transparent text-white font-mono font-bold w-12 sm:w-14 focus:outline-none text-right disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span>{t.cagr}</span>
                    <div className="flex items-center bg-[#121420] border border-slate-800/80 rounded-xl px-2 py-1">
                      <input
                        type="number"
                        min="0"
                        max="200"
                        step="0.1"
                        value={cagr}
                        onChange={(e) => setCagr(Math.max(0, Number(e.target.value)))}
                        className="bg-transparent text-white font-mono font-bold w-10 focus:outline-none text-right mr-0.5"
                      />
                      <span className="text-slate-500 font-mono">%</span>
                    </div>
                  </div>
                </div>

                {/* De dónde sale el CAGR (rentabilidad esperada de la cartera) */}
                <div
                  className="text-[10px] text-slate-500 leading-snug -mt-1"
                  title={projectionCagr.byTicker
                    .map((b) => `${b.ticker} ${b.rate >= 0 ? "+" : ""}${b.rate.toFixed(1)}% (${b.source === "cash" ? (language === "EN" ? "cash" : "efectivo") : b.source === "bogle" ? "Bogle" : language === "EN" ? `price history${b.capped ? ", capped" : ""}` : `historia del precio${b.capped ? ", con tope" : ""}`}) · ${b.weight.toFixed(1)}%`)
                    .join("\n")}
                >
                  {projectionCagr.pending > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" />
                      {language === "EN" ? "Computing the portfolio's expected return…" : "Calculando la rentabilidad esperada de la cartera…"}
                    </span>
                  ) : projectionCagr.rate !== null ? (
                    <>
                      {language === "EN"
                        ? `Expected return ${projectionCagr.rate.toFixed(1)}%/yr: stocks with the Bogle model (base, 5y); ETFs with their price history (max 25%); cash 0%.`
                        : `Rentabilidad esperada ${projectionCagr.rate.toFixed(1)} %/año: acciones con el modelo de Bogle (base, 5 años); ETF con su historia de precio (máx. 25 %); efectivo 0 %.`}
                      {projectionCagr.missing.length > 0 && ` ${language === "EN" ? "Without data" : "Sin datos"}: ${projectionCagr.missing.join(", ")}.`}
                      {Math.abs(cagr - projectionCagr.rate) > 0.05 && (
                        <button type="button" onClick={() => setCagr(projectionCagr.rate as number)} className="ml-1.5 underline text-emerald-400 hover:text-emerald-300 cursor-pointer">
                          {language === "EN" ? "Reset" : "Restablecer"}
                        </button>
                      )}
                    </>
                  ) : null}
                </div>

                {/* Main Value Display */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="text-left">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">{t.current}</span>
                    <span className="text-lg md:text-xl font-mono font-bold text-white mt-1 block">
                      {formatAbbreviatedK(selectedTotalMktValue)}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                      {t.additions} ({years}Y)
                    </span>
                    <span className="text-lg md:text-xl font-mono font-bold text-slate-300 mt-1 block">
                      {formatAbbreviatedK(projectionTab === "margin" ? 0 : (monthlyAddition * years * 12))}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                      {t.projected} ({years}Y)
                    </span>
                    <span className="text-lg md:text-xl font-mono font-bold text-emerald-400 mt-1 block">
                      {formatAbbreviatedK(projectedTotalValue)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chart Container */}
              <div className="h-44 w-full mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValueHoldings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getTabColor(projectionTab)} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={getTabColor(projectionTab)} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1e29" vertical={false} opacity={0.1} />
                    <XAxis
                      dataKey="year"
                      stroke="#475569"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#475569"
                      fontSize={10}
                      tickFormatter={(val) => `$${Math.round(val / 1000)}k`}
                      tickLine={false}
                      axisLine={false}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f111a",
                        borderColor: "#1e293b",
                        borderRadius: "12px"
                      }}
                      itemStyle={{ color: getTabColor(projectionTab) }}
                      labelStyle={{ color: "#94a3b8", fontFamily: "monospace" }}
                      formatter={(val: any) => [formatCurrency(Number(val)), "Value"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={getTabColor(projectionTab)}
                      fillOpacity={1}
                      fill="url(#colorValueHoldings)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Bottom Accent line */}
              <div className="text-center mt-4">
                <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-4 py-1.5 rounded-full border ${getTabBadgeClass(projectionTab)}`}>
                  <TrendingUp size={12} />
                  CAGR {cagr.toFixed(1)}% · +{percentageReturnOnInvested.toFixed(1)}% {t.onInvested}
                </span>
              </div>
            </div>

            {/* Card 2: PORTFOLIO FUTURE VALUE */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <Rocket className="text-pink-500" size={16} />
                  <h3 className="font-display font-bold text-xs text-slate-400 tracking-wider uppercase">
                    {projectionTab === "portfolio"
                      ? t.portfolioFutureValue
                      : (projectionTab === "margin"
                        ? (language === "EN" ? "MARGIN FUTURE VALUE" : "VALOR FUTURO CON MARGEN")
                        : (language === "EN" ? "COMBINED FUTURE VALUE" : "VALOR FUTURO COMBINADO")
                      )
                    }
                  </h3>
                  <Info size={13} className="text-slate-500 hover:text-slate-300 cursor-pointer" />
                </div>

                {/* List Rows */}
                <div className="space-y-4 pt-1">
                  {/* Row 1: 52wk High */}
                  <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>
                        {projectionTab === "portfolio"
                          ? t.high52wk
                          : (projectionTab === "margin"
                            ? (language === "EN" ? "52wk High Margin Portfolio" : "Máximo 52 Semanas Margen")
                            : (language === "EN" ? "52wk High Combined Portfolio" : "Máximo 52 Semanas Combinado")
                          )
                        }
                      </span>
                      <Info size={12} className="text-slate-600 hover:text-slate-400 cursor-pointer" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative group/val cursor-help">
                        <span className="text-sm font-mono font-bold text-white underline decoration-dotted decoration-slate-600 underline-offset-4 hover:decoration-emerald-400 hover:text-emerald-300 transition-colors">
                          {formatCurrency(fiftyTwoWeekHighTotal)}
                        </span>

                        {/* Tooltip Card */}
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover/val:block w-72 p-3.5 bg-[#0b0e17]/95 border border-slate-700/90 rounded-2xl shadow-2xl z-50 pointer-events-none text-left backdrop-blur-xl ring-1 ring-white/10">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between font-mono">
                            <span>{language === "ES" ? "Desglose 52wk High" : "52wk High Breakdown"}</span>
                            <span className="text-emerald-400">{total52wkGain >= 0 ? "+" : ""}{formatCurrency(total52wkGain)}</span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            {/* Principal Gain */}
                            {projectionTab !== "margin" && (
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
                                  {language === "ES" ? "Ganancia Principal:" : "Principal Gain:"}
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-bold text-emerald-400 text-[11px]">
                                    {principal52wk.gain >= 0 ? "+" : ""}{formatCurrency(principal52wk.gain)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-1">
                                    ({principal52wk.gainPct >= 0 ? "+" : ""}{principal52wk.gainPct.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Margin Gain */}
                            {(projectionTab === "margin" || (projectionTab === "total" && marginFinancedPrincipal > 0)) ? (
                              <>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                                    {language === "ES" ? "Ganancia Margen:" : "Margin Gain:"}
                                  </span>
                                  <div className="text-right font-mono">
                                    <span className="font-bold text-amber-300 text-[11px]">
                                      {margin52wk.gain >= 0 ? "+" : ""}{formatCurrency(margin52wk.gain)}
                                    </span>
                                    <span className="text-[10px] text-slate-400 ml-1">
                                      ({margin52wk.gainPct >= 0 ? "+" : ""}{margin52wk.gainPct.toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/80 font-mono">
                                  <span>{language === "ES" ? "Deuda financiada restada:" : "Deducted financing:"}</span>
                                  <span className="text-rose-400">-{formatCurrency(marginFinancedPrincipal)}</span>
                                </div>
                              </>
                            ) : (
                              projectionTab === "portfolio" && (
                                <div className="text-[10px] text-slate-500 italic pt-0.5">
                                  {language === "ES" ? "Pestaña Cartera Principal (Sin margen)" : "Portfolio Tab (No margin)"}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                        +{high52wkUpside.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Analyst Avg Target */}
                  <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>{t.avgTargetValue}</span>
                      <Info size={12} className="text-slate-600 hover:text-slate-400 cursor-pointer" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative group/val cursor-help">
                        <span className="text-sm font-mono font-bold text-white underline decoration-dotted decoration-slate-600 underline-offset-4 hover:decoration-emerald-400 hover:text-emerald-300 transition-colors">
                          {formatCurrency(avgTargetValueTotal)}
                        </span>

                        {/* Tooltip Card */}
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover/val:block w-72 p-3.5 bg-[#0b0e17]/95 border border-slate-700/90 rounded-2xl shadow-2xl z-50 pointer-events-none text-left backdrop-blur-xl ring-1 ring-white/10">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between font-mono">
                            <span>{language === "ES" ? "Desglose Avg Target" : "Avg Target Breakdown"}</span>
                            <span className="text-emerald-400">{totalAvgTargetGain >= 0 ? "+" : ""}{formatCurrency(totalAvgTargetGain)}</span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            {/* Principal Gain */}
                            {projectionTab !== "margin" && (
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
                                  {language === "ES" ? "Ganancia Principal:" : "Principal Gain:"}
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-bold text-emerald-400 text-[11px]">
                                    {principalAvgTarget.gain >= 0 ? "+" : ""}{formatCurrency(principalAvgTarget.gain)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-1">
                                    ({principalAvgTarget.gainPct >= 0 ? "+" : ""}{principalAvgTarget.gainPct.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Margin Gain */}
                            {(projectionTab === "margin" || (projectionTab === "total" && marginFinancedPrincipal > 0)) ? (
                              <>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                                    {language === "ES" ? "Ganancia Margen:" : "Margin Gain:"}
                                  </span>
                                  <div className="text-right font-mono">
                                    <span className="font-bold text-amber-300 text-[11px]">
                                      {marginAvgTarget.gain >= 0 ? "+" : ""}{formatCurrency(marginAvgTarget.gain)}
                                    </span>
                                    <span className="text-[10px] text-slate-400 ml-1">
                                      ({marginAvgTarget.gainPct >= 0 ? "+" : ""}{marginAvgTarget.gainPct.toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/80 font-mono">
                                  <span>{language === "ES" ? "Deuda financiada restada:" : "Deducted financing:"}</span>
                                  <span className="text-rose-400">-{formatCurrency(marginFinancedPrincipal)}</span>
                                </div>
                              </>
                            ) : (
                              projectionTab === "portfolio" && (
                                <div className="text-[10px] text-slate-500 italic pt-0.5">
                                  {language === "ES" ? "Pestaña Cartera Principal (Sin margen)" : "Portfolio Tab (No margin)"}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                        +{avgTargetUpside.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Row 3: Analyst High Target */}
                  <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>{t.highTargetValue}</span>
                      <Info size={12} className="text-slate-600 hover:text-slate-400 cursor-pointer" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative group/val cursor-help">
                        <span className="text-sm font-mono font-bold text-white underline decoration-dotted decoration-slate-600 underline-offset-4 hover:decoration-emerald-400 hover:text-emerald-300 transition-colors">
                          {formatCurrency(highTargetValueTotal)}
                        </span>

                        {/* Tooltip Card */}
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover/val:block w-72 p-3.5 bg-[#0b0e17]/95 border border-slate-700/90 rounded-2xl shadow-2xl z-50 pointer-events-none text-left backdrop-blur-xl ring-1 ring-white/10">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between font-mono">
                            <span>{language === "ES" ? "Desglose High Target" : "High Target Breakdown"}</span>
                            <span className="text-emerald-400">{totalHighTargetGain >= 0 ? "+" : ""}{formatCurrency(totalHighTargetGain)}</span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            {/* Principal Gain */}
                            {projectionTab !== "margin" && (
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
                                  {language === "ES" ? "Ganancia Principal:" : "Principal Gain:"}
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-bold text-emerald-400 text-[11px]">
                                    {principalHighTarget.gain >= 0 ? "+" : ""}{formatCurrency(principalHighTarget.gain)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 ml-1">
                                    ({principalHighTarget.gainPct >= 0 ? "+" : ""}{principalHighTarget.gainPct.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Margin Gain */}
                            {(projectionTab === "margin" || (projectionTab === "total" && marginFinancedPrincipal > 0)) ? (
                              <>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                                    {language === "ES" ? "Ganancia Margen:" : "Margin Gain:"}
                                  </span>
                                  <div className="text-right font-mono">
                                    <span className="font-bold text-amber-300 text-[11px]">
                                      {marginHighTarget.gain >= 0 ? "+" : ""}{formatCurrency(marginHighTarget.gain)}
                                    </span>
                                    <span className="text-[10px] text-slate-400 ml-1">
                                      ({marginHighTarget.gainPct >= 0 ? "+" : ""}{marginHighTarget.gainPct.toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/80 font-mono">
                                  <span>{language === "ES" ? "Deuda financiada restada:" : "Deducted financing:"}</span>
                                  <span className="text-rose-400">-{formatCurrency(marginFinancedPrincipal)}</span>
                                </div>
                              </>
                            ) : (
                              projectionTab === "portfolio" && (
                                <div className="text-[10px] text-slate-500 italic pt-0.5">
                                  {language === "ES" ? "Pestaña Cartera Principal (Sin margen)" : "Portfolio Tab (No margin)"}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                        +{highTargetUpside.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Projection Breakdown Box */}
                {projectionTab === "portfolio" ? (
                  <div className="bg-[#121420]/60 border border-slate-900 rounded-2xl p-4 mt-2">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-3 font-mono">
                      {t.projectionBreakdown} ({years}Y · CAGR {cagr.toFixed(1)}%)
                    </span>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between items-center text-slate-400">
                        <span>{t.principal}</span>
                        <span className="font-mono font-semibold text-white">
                          {formatCurrency(selectedTotalMktValue)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span>{t.additions} ({years}Y)</span>
                        <span className="font-mono font-semibold text-slate-300">
                          +{formatCurrency(totalAdditions)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span className="flex items-center gap-1">
                          {t.interestGains}
                          <ChevronDown size={12} className="text-slate-500" />
                        </span>
                        <span className="font-mono font-bold text-emerald-400">
                          +{formatCurrency(interestGains)}
                        </span>
                      </div>
                      <div className="border-t border-slate-900/80 my-2 pt-2.5 flex justify-between items-center">
                        <span className="font-bold text-white">{t.totalValue}</span>
                        <span className="font-mono font-extrabold text-lg text-emerald-400">
                          {formatCurrency(projectedTotalValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#121420]/60 border border-slate-900 rounded-2xl p-4 mt-2 space-y-3 animate-fade-in">
                    <span className={`text-[9px] ${projectionTab === "margin" ? "text-amber-400" : "text-indigo-400"} font-bold uppercase tracking-wider block font-mono`}>
                      {projectionTab === "margin"
                        ? (language === "EN" ? "DEBT & MARGIN INTEREST ANALYSIS" : "ANÁLISIS DE DEUDA E INTERESES DE MARGEN")
                        : (language === "EN" ? "COMBINED DEBT & INTEREST ANALYSIS" : "ANÁLISIS COMBINADO DE DEUDA E INTERESES")
                      } ({years}Y · {language === "EN" ? "Rate 6.25%" : "Tasa 6.25%"})
                    </span>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between items-center text-slate-400">
                        <span>
                          {projectionTab === "margin"
                            ? (language === "EN" ? "Gross Projected Margin Value" : "Valor Bruto Margen Proyectado")
                            : (language === "EN" ? "Gross Projected Total Value" : "Valor Bruto Total Proyectado")
                          }
                        </span>
                        <span className="font-mono font-semibold text-white">
                          {formatCurrency(projectedTotalValue)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-slate-400">
                        <span className="flex items-center gap-1 text-rose-400">
                          {language === "EN" ? "Margin Loan (Debt)" : "Préstamo de Margen (Deuda)"}
                        </span>
                        <span className="font-mono font-semibold text-rose-400">
                          -{formatCurrency(marginFinancedPrincipal)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-slate-400">
                        <span>{language === "EN" ? "Margin Interest (1 Year)" : "Interés de Margen (1 Año)"}</span>
                        <span className="font-mono text-slate-300">
                          {formatCurrency(marginFinancedPrincipal * 0.0625)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-slate-400 border-b border-slate-900 pb-2">
                        <span className="text-rose-400 font-medium">{language === "EN" ? "Total Interest" : "Intereses Totales"} ({years} {language === "EN" ? "Years" : "Años"})</span>
                        <span className="font-mono font-semibold text-rose-400">
                          -{formatCurrency(marginFinancedPrincipal * 0.0625 * years)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-slate-400 pt-1">
                        <span>{language === "EN" ? "Net Value (Minus Loan)" : "Valor Neto (Menos Deuda)"}</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {formatCurrency(Math.max(0, projectedTotalValue - marginFinancedPrincipal))}
                        </span>
                      </div>

                      <div className="border-t border-slate-900/80 my-2 pt-2.5 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white block">
                            {projectionTab === "margin"
                              ? (language === "EN" ? "Final Net Value" : "Valor Neto Final")
                              : (language === "EN" ? "Combined Net Value" : "Valor Neto Combinado")
                            }
                          </span>
                          <span className="text-[10px] text-slate-500 block leading-none">{language === "EN" ? "(Minus Loan & Interest)" : "(Menos Deuda e Intereses)"}</span>
                        </div>
                        <span className="font-mono font-extrabold text-lg text-emerald-400">
                          {formatCurrency(Math.max(0, projectedTotalValue - marginFinancedPrincipal - (marginFinancedPrincipal * 0.0625 * years)))}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3: SECTORES S&P 500 */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <PieChartIcon className="text-blue-400" size={16} />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-xs text-slate-400 tracking-wider uppercase">
                      {projectionTab === "portfolio"
                        ? (language === "EN" ? "SECTOR DISTRIBUTION (PORTFOLIO)" : "DISTRIBUCIÓN POR SECTOR (PORTAFOLIO)")
                        : projectionTab === "margin"
                        ? (language === "EN" ? "SECTOR DISTRIBUTION (MARGIN)" : "DISTRIBUCIÓN POR SECTOR (MARGEN)")
                        : (language === "EN" ? "SECTOR DISTRIBUTION (COMBINED)" : "DISTRIBUCIÓN POR SECTOR (COMBINADO)")
                      }
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      {projectionTab === "portfolio"
                        ? (language === "EN" ? "Weighting of portfolio by market value" : "Distribución del portafolio por valor de mercado")
                        : projectionTab === "margin"
                        ? (language === "EN" ? "Weighting of margin positions by market value" : "Distribución de posiciones con margen por valor de mercado")
                        : (language === "EN" ? "Weighting of combined portfolio by market value" : "Distribución del portafolio combinado por valor de mercado")
                      }
                    </p>
                  </div>
                </div>

                {/* Sectors List */}
                <div className="space-y-3 pr-1">
                  {sortedSectors.map((sector, sIdx) => {
                    const isExpanded = !!expandedSectors[sector.name];
                    const subsectors = sectorSubsectors[sector.name]
                      ? (Object.entries(sectorSubsectors[sector.name]) as [string, { mktValue: number; weight: number }][]).sort((a, b) => b[1].weight - a[1].weight)
                      : [];

                    return (
                      <div key={`${sector.name}-${sIdx}`} className="border-b border-slate-800/10 pb-2.5 last:border-0 last:pb-0">
                        <div
                          onClick={() => toggleSector(sector.name)}
                          className="flex justify-between items-center text-xs cursor-pointer group hover:bg-slate-800/30 p-1 rounded-lg transition-all"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-slate-500 group-hover:text-slate-300 shrink-0">
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${getSectorColor(sector.name)}`} />
                            <span className="font-semibold text-slate-300 group-hover:text-white truncate text-xs" title={language === "EN" ? sector.name : getSectorSpanish(sector.name)}>
                              {language === "EN" ? sector.name : getSectorSpanish(sector.name)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 font-mono shrink-0 text-xs">
                            <span className="text-slate-400 font-medium">{formatCurrency(sector.mktValue)}</span>
                            <span className="text-white font-extrabold">{sector.weight.toFixed(1)}%</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="pl-6 pr-1 mt-1">
                          <div className="h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${getSectorColor(sector.name)}`}
                              style={{ width: `${sector.weight}%` }}
                            />
                          </div>
                        </div>

                        {/* Subsectors */}
                        {isExpanded && subsectors.length > 0 && (
                          <div className="pl-8 pr-1 mt-2 flex flex-col gap-1.5 border-l-2 border-slate-800/60 ml-4">
                            {subsectors.map(([subName, subData], subIdx) => (
                              <div key={`${subName}-${subIdx}`} className="flex justify-between items-center text-[11px]">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                                  <span className="text-slate-400 font-medium truncate">{subName}</span>
                                </div>
                                <div className="flex items-center gap-2 font-mono shrink-0">
                                  <span className="text-slate-500 text-[10px]">{formatCurrency(subData.mktValue)}</span>
                                  <span className="text-slate-300 font-semibold">{subData.weight.toFixed(1)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Insights panel will be rendered below the tickers list */}
      {holdingsTabMode === "health" && sortedPositions.length > 0 && (
        <div className="bg-[#0a0c14]/40 border border-slate-900/40 p-6 rounded-2xl flex flex-col xl:flex-row items-center gap-6 justify-between">
          <div className="flex flex-col items-center xl:items-start gap-2 xl:w-1/4">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{language === "EN" ? "Portfolio Health" : "Salud del Portafolio"}</span>
            <div className="flex items-center gap-4">
              <div className={`flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgClass(portfolioWeightedScore)} border-[3px]`}>
                <span className="text-2xl font-black">{portfolioWeightedScore.toFixed(0)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-semibold mb-1">{language === "EN" ? "Portfolio Type" : "Tipo de Portafolio"}</span>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${getTypeBadgeConfig(portfolioWeightedType).className}`}>
                  <span>{getTypeBadgeConfig(portfolioWeightedType).icon}</span>
                  {portfolioWeightedType || "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-6 md:gap-10 flex-1">
             <ScoreDonut score={portfolioWeightedFactors.growth} label={language === "EN" ? "Growth" : "Crecimiento"} colorClass={getScoreColorClass(portfolioWeightedFactors.growth)} />
             <ScoreDonut score={portfolioWeightedFactors.quality} label={language === "EN" ? "Quality" : "Calidad"} colorClass={getScoreColorClass(portfolioWeightedFactors.quality)} />
             <ScoreDonut score={portfolioWeightedFactors.stability} label={language === "EN" ? "Stability" : "Estabilidad"} colorClass={getScoreColorClass(portfolioWeightedFactors.stability)} />
             <ScoreDonut score={portfolioWeightedFactors.valuation} label={language === "EN" ? "Valuation" : "Valuación"} colorClass={getScoreColorClass(portfolioWeightedFactors.valuation)} />
          </div>
          <div className="hidden xl:block xl:w-1/4"></div>
        </div>
      )}


      {loading && positions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="animate-spin text-emerald-400" size={32} />
          <p className="text-sm font-medium">
            {language === "EN" ? "Fetching live market quotes..." : "Obteniendo cotizaciones de mercado en vivo..."}
          </p>
        </div>
      ) : sortedPositions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl py-16 text-center border-2 border-dashed border-slate-800 rounded-xl">
          <p className="text-slate-400 font-medium mb-3">
            {language === "EN" ? "Your portfolio is empty." : "Tu portafolio está vacío."}
          </p>
          {!isReadOnly && (
            <button
              onClick={onEditHoldings}
              className="inline-flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-emerald-500/30 cursor-pointer"
            >
              <Plus size={14} /> {language === "EN" ? "Add my first stock" : "Agregar mi primera acción"}
            </button>
          )}
        </div>
      ) : holdingsTabMode === "financials" ? (
        <CompanyFinancials
          language={language}
          tickers={Array.from(new Set(positions.filter(p => !p.isCash).map(p => p.ticker)))}
          prefetchedData={effectiveFinancialsMap}
          viewMode={financialsViewMode}
          onViewModeChange={setFinancialsViewMode}
        />
      ) : viewMode === "table" ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
          {holdingsTabMode === "basis" && (
            <div className="flex justify-end mb-3 relative">
              <button
                type="button"
                onClick={() => setGroupMenuOpen((o) => !o)}
                aria-expanded={groupMenuOpen}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/60 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              >
                <Layers size={13} />
                {language === "EN" ? "Group by" : "Agrupar por"}:{" "}
                <span className="text-emerald-400">
                  {groupBy.sector && groupBy.subsector
                    ? language === "EN" ? "Sector + Subsector" : "Sector + Subsector"
                    : groupBy.sector
                      ? "Sector"
                      : groupBy.subsector
                        ? "Subsector"
                        : language === "EN" ? "None" : "Ninguno"}
                </span>
                <ChevronDown size={13} className={groupMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>
              {groupMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setGroupMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-40 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-1.5 text-xs">
                    {([
                      { key: "sector", label: language === "EN" ? "S&P 500 sector" : "Sector S&P 500" },
                      { key: "subsector", label: "Subsector" },
                    ] as const).map((o) => (
                      <label key={o.key} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-800 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          checked={groupBy[o.key]}
                          onChange={(e) => setGroupBy((g) => ({ ...g, [o.key]: e.target.checked }))}
                          className="accent-emerald-500 w-3.5 h-3.5"
                        />
                        {o.label}
                      </label>
                    ))}
                    <div className="border-t border-slate-800 mt-1 pt-1 flex gap-1">
                      <button type="button" onClick={() => setGroupBy({ sector: true, subsector: true })} className="flex-1 px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
                        {language === "EN" ? "Both" : "Ambos"}
                      </button>
                      <button type="button" onClick={() => setGroupBy({ sector: false, subsector: false })} className="flex-1 px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
                        {language === "EN" ? "None" : "Ninguno"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
          <table className={`w-full text-left border-collapse ${holdingsTabMode === "valuation" ? "min-w-[950px]" : "min-w-[850px]"}`}>
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider">
                {holdingsTabMode === "basis" ? (
                  sortTh("ticker", "Ticker", "py-2 px-1 md:px-2")
                ) : (
                  <th className={`py-2 px-1 md:px-2 ${holdingsTabMode === "valuation" ? "w-[160px]" : ""}`}>Ticker</th>
                )}
                {holdingsTabMode === "basis" ? (
                  sortTh("price", language === "EN" ? "Price" : "Precio")
                ) : holdingsTabMode !== "valuation" && (
                  <th className="py-2 px-1 md:px-2 text-right">
                    {holdingsTabMode === "health"
                      ? "Piotroski F-Score"
                      : (language === "EN" ? "Price" : "Precio")}
                  </th>
                )}
                {holdingsTabMode === "basis" ? (
                  <>
                    {sortTh("shares", language === "EN" ? "Shares" : "Acciones")}
                    {sortTh("avgCost", language === "EN" ? "Avg Cost" : "Costo Prom.")}
                    {sortTh("mktValue", language === "EN" ? "Mkt Value" : "Val. Mercado")}
                    {sortTh("weight", language === "EN" ? "Weight" : "Peso")}
                    {sortTh("dailyPnL", language === "EN" ? "Daily P&L" : "P&L Diario")}
                    {sortTh("chgPct", language === "EN" ? "Change %" : "Cambio %")}
                    {sortTh("returnAmt", language === "EN" ? "Return $" : "Retorno $")}
                    {sortTh("returnPct", language === "EN" ? "Return %" : "Retorno %")}
                    {sortTh("dividend", language === "EN" ? "Dividend" : "Dividendo", "py-2 px-1 md:px-2 text-right text-emerald-400 font-bold whitespace-nowrap")}
                  </>
                ) : holdingsTabMode === "valuation" ? (
                  <>
                    <th className="py-2 px-1 md:px-2 text-center">P/E</th>
                    <th className="py-2 px-1 md:px-2 text-center">Fwd P/E</th>
                    <th className="py-2 px-1 md:px-2 text-center border-r border-slate-700/50">PEG</th>
                    <th className="py-2 px-1 md:px-2 text-center">{language === "EN" ? "Avg Upside" : "Upside Prom."}</th>
                    <th className="py-2 px-1 md:px-2 text-center border-r border-slate-700/50">{language === "EN" ? "High Upside" : "Upside Alto"}</th>
                    <th className="py-2 px-1 md:px-2 text-right whitespace-nowrap">DCF ({dcfScenario === "bear" ? (language === "EN" ? "Bear" : "Bajista") : dcfScenario === "base" ? "Base" : language === "EN" ? "Bull" : "Alcista"})</th>
                    <th className="py-2 px-1 md:px-2 text-center border-r border-slate-700/50">{language === "EN" ? "DCF Upside" : "Upside DCF"}</th>
                    <th className="py-2 px-1 md:px-2 text-right whitespace-nowrap">{language === "EN" ? "Fair Value" : "Valor razonable"} ({fvRange === "ALL" ? (language === "EN" ? "All" : "Todo") : fvRange})</th>
                    <th className="py-2 px-1 md:px-2 text-center border-r border-slate-700/50">{language === "EN" ? "FV Upside" : "Upside VR"}</th>
                    <th className="py-2 px-1 md:px-2 text-right whitespace-nowrap">200d MA Price</th>
                    <th className="py-2 px-1 md:px-2 text-right whitespace-nowrap">50d MA Price</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 px-1 md:px-2 text-center">Score</th>
                    <th className="py-2 px-1 md:px-2 text-center">{language === "ES" ? "Crecimiento" : "Growth"}</th>
                    <th className="py-2 px-1 md:px-2 text-center">{language === "ES" ? "Calidad" : "Quality"}</th>
                    <th className="py-2 px-1 md:px-2 text-center">{language === "ES" ? "Estabilidad" : "Stability"}</th>
                    <th className="py-2 px-1 md:px-2 text-center">{language === "ES" ? "Valuación" : "Valuation"}</th>
                    <th className="py-2 px-1 md:px-2 text-left">{language === "ES" ? "Tipo" : "Type"}</th>
                    <th className="py-2 px-1 md:px-2 text-center">200d MA</th>
                    <th className="py-2 px-1 md:px-2 text-center">50d MA</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(holdingsTabMode === "basis" ? basisRows : sortedPositions.map((pos, idx): BasisRow => ({ kind: "pos", pos, idx }))).map((row, rowIdx) => {
                if (row.kind === "group") {
                  const up = row.returnAmt >= 0;
                  const sector = row.level === "sector";
                  return (
                    <tr
                      key={`g-${row.level}-${row.label}-${rowIdx}`}
                      className={sector ? "bg-slate-800/40 text-slate-100" : "bg-slate-800/15 text-slate-300"}
                    >
                      <td colSpan={4} className={`py-2 ${sector ? "px-1 md:px-2" : "pl-5 md:pl-7 pr-2"} text-[11px] md:text-xs font-bold uppercase tracking-wider`}>
                        <span className={sector ? "text-emerald-400" : "text-slate-400"}>{sector ? "■" : "▸"}</span> {row.label}
                        <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-500">
                          ({row.count})
                        </span>
                      </td>
                      <td className="py-2 px-1 md:px-2 text-right font-mono font-bold text-[11px] md:text-xs">{formatCurrency(row.mktValue)}</td>
                      <td className="py-2 px-1 md:px-2 text-right font-mono text-[11px] md:text-xs">{row.weight.toFixed(1)}%</td>
                      <td className={`py-2 px-1 md:px-2 text-right font-mono text-[11px] md:text-xs ${row.dailyPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {row.dailyPnL >= 0 ? "+" : ""}
                        {formatStockValue(row.dailyPnL)}
                      </td>
                      <td className="py-2 px-1 md:px-2" />
                      <td className={`py-2 px-1 md:px-2 text-right font-mono text-[11px] md:text-xs ${up ? "text-emerald-400" : "text-rose-400"}`}>
                        {up ? "+" : ""}
                        {formatStockValue(row.returnAmt)}
                      </td>
                      <td className={`py-2 px-1 md:px-2 text-right font-mono text-[11px] md:text-xs ${up ? "text-emerald-400" : "text-rose-400"}`}>
                        {row.cost > 0 ? formatPercent((row.returnAmt / row.cost) * 100) : "—"}
                      </td>
                      <td className="py-2 px-1 md:px-2 text-right font-mono text-[11px] md:text-xs text-emerald-400">{row.dividend > 0 ? formatCurrency(row.dividend) : "—"}</td>
                    </tr>
                  );
                }
                const { pos, idx } = row;
                const tooltipPlacement = idx < sortedPositions.length / 2 ? "bottom" : "top";
                const isDailyPositive = pos.dailyPnL >= 0;
                const isTotalPositive = pos.returnAmt >= 0;

                const eps = pos.pe && pos.pe > 0 ? pos.price / pos.pe : null;
                const analystData = getAnalystData(pos);
                const hasAvgTarget = analystData.avgTarget !== null && analystData.avgTarget > 0;

                let dcfIntrinsic = calculateTickerDCF(pos.ticker, eps);
                if (dcfIntrinsic !== null && dcfIntrinsic < 0 && hasAvgTarget) {
                  dcfIntrinsic = analystData.avgTarget;
                }
                const dcfValue = dcfIntrinsic !== null ? dcfIntrinsic * pos.shares : null;

                const upsideAvg = hasAvgTarget ? (((analystData.avgTarget || 0) - pos.price) / pos.price) * 100 : null;

                const hasHighTarget = analystData.highTarget !== null && analystData.highTarget > 0;
                const upsideHigh = hasHighTarget ? (((analystData.highTarget || 0) - pos.price) / pos.price) * 100 : null;

                const scoredRow = scoredRowsMap.get(pos.ticker.toUpperCase());

                return (
                  <React.Fragment key={`${pos.ticker}-${idx}`}>
                    <tr
                      onClick={() => !pos.isCash && setSelectedTicker(selectedTicker === pos.ticker ? null : pos.ticker)}
                      className={`text-xs md:text-sm hover:bg-slate-800/40 transition-colors ${
                        pos.isCash ? "font-medium cursor-default" : "cursor-pointer"
                      } ${selectedTicker === pos.ticker ? "bg-white/10 backdrop-blur-xl border-y border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.1)] font-semibold relative z-10" : ""}`}
                    >
                    {/* Ticker Symbol & Name */}
                    <td className="py-2.5 px-1 md:px-2">
                      <div className="flex items-center gap-2.5">
                        <CompanyLogo ticker={pos.ticker} name={pos.name} isCash={pos.isCash} size="md" />
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-display font-bold text-white text-xs md:text-sm tracking-wide">
                              {pos.ticker}
                            </span>
                            {pos.isMargin && (
                              <span
                                title={language === "ES" ? "Posición en Margen • Costo de financiamiento: 6.25% E.A. cobrado mensualmente (~0.51%/mes)" : "Margin Position • Financing cost: 6.25% effective annual rate charged monthly (~0.51%/mo)"}
                                className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold uppercase tracking-wider"
                              >
                                MARGIN
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 truncate max-w-[80px] md:max-w-[120px]" title={pos.name}>
                            {pos.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Price or Piotroski Score (depending on tab mode) */}
                    {holdingsTabMode !== "valuation" && (
                      <td className="py-2.5 px-1 md:px-2 text-right font-mono">
                        {pos.isCash ? (
                          "—"
                        ) : holdingsTabMode === "health" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              title={language === "ES" ? "Piotroski F-Score (0 a 9) obtenido de datos financieros externos" : "Piotroski F-Score (0 to 9) retrieved from external financial metrics"}
                              className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-xs tracking-wide ${
                                pos.piotroskiScore == null
                                ? "text-theme-text-muted"
                                : pos.piotroskiScore >= 7
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                  : pos.piotroskiScore >= 4
                                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              }`}
                            >
                              <span>{pos.piotroskiScore == null ? "—" : `${pos.piotroskiScore} / 9`}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5 text-white font-mono">
                            <span>{formatCurrency(pos.price)}</span>
                            {pos.isAfterHoursPrice && (
                              <span
                                title={`Precio Extended Hours (${getExtendedHoursLabel(pos.marketState)} - ${pos.marketState || "CLOSED"})`}
                                className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-sans font-semibold tracking-wide"
                              >
                                {getExtendedHoursLabel(pos.marketState)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    )}

                    {holdingsTabMode === "basis" ? (
                      <>
                        {/* Shares */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono text-slate-300">
                          {pos.isCash ? "—" : formatShares(pos.shares)}
                        </td>

                        {/* Avg Cost */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono text-slate-400">
                          {pos.isCash ? "—" : formatCurrency(pos.avgCost)}
                        </td>

                        {/* Market Value */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono font-bold text-white">
                          {formatValuation(pos.mktValue)}
                        </td>

                        {/* Portfolio Weight */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono text-emerald-400 font-bold">
                          {formatNumber(pos.weight, 1)}%
                        </td>

                        {/* Daily P&L */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono">
                          {pos.isCash ? (
                            "—"
                          ) : (
                            <span
                              className={`inline-block px-1 md:px-2 py-0.5 md:py-1 rounded-lg text-[10px] md:text-xs font-semibold ${
                                isDailyPositive
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {isDailyPositive ? "+" : ""}
                              {formatStockValue(pos.dailyPnL)}
                            </span>
                          )}
                        </td>

                        {/* Chg % */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono">
                          {pos.isCash ? (
                            "—"
                          ) : (
                            <span className={isDailyPositive ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                              {formatPercent(pos.chgPct)}
                            </span>
                          )}
                        </td>

                        {/* Return $ */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono">
                          {pos.isCash ? (
                            "—"
                          ) : (
                            <span
                              className={`inline-block px-1 md:px-2 py-0.5 md:py-1 rounded-lg text-[10px] md:text-xs font-semibold ${
                                isTotalPositive
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {isTotalPositive ? "+" : ""}
                              {formatStockValue(pos.returnAmt)}
                            </span>
                          )}
                        </td>

                        {/* Return % */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono">
                          {pos.isCash ? (
                            "—"
                          ) : (
                            <span className={isTotalPositive ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                              {formatPercent(pos.returnPct)}
                            </span>
                          )}
                        </td>

                        {/* Dividend */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                          {formatTotalDividend(pos, isReadOnly)}
                        </td>
                      </>
                    ) : holdingsTabMode === "valuation" ? (
                      <>
                        {/* P/E Ratio */}
                        <td className="py-2.5 px-1 md:px-2 text-center font-mono text-slate-400">
                          {pos.isCash ? "—" : formatNumber(pos.pe, 1)}
                        </td>

                        {/* Forward P/E */}
                        <td className="py-2.5 px-1 md:px-2 text-center font-mono text-slate-400">
                          {pos.isCash ? "—" : formatNumber(pos.fwdPe, 1)}
                        </td>

                        {/* PEG Ratio */}
                        <td className="py-2.5 px-1 md:px-2 text-center font-mono text-slate-400 border-r border-slate-700/50">
                          {pos.isCash ? "—" : formatNumber(pos.peg, 2)}
                        </td>

                        {/* Upside (Avg) */}
                        <td className="py-2.5 px-1 md:px-2 text-center">
                          <UpsidePill value={upsideAvg} />
                        </td>

                        {/* Upside (High) */}
                        <td className="py-2.5 px-1 md:px-2 text-center border-r border-slate-700/50">
                          <UpsidePill value={upsideHigh} />
                        </td>

                        {/* DCF */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono text-slate-300 whitespace-nowrap">
                          <ValueCell loading={!pos.isCash && valLoading && !valuationByTicker[pos.ticker.toUpperCase()]} value={pos.isCash ? null : valuationByTicker[pos.ticker.toUpperCase()]?.dcf ?? null} format={formatCurrency} />
                        </td>
                        <td className="py-2.5 px-1 md:px-2 text-center border-r border-slate-700/50">
                          <UpsidePill value={upsideOf(pos.isCash ? null : valuationByTicker[pos.ticker.toUpperCase()]?.dcf ?? null, pos.price)} />
                        </td>

                        {/* Valor razonable por múltiplos */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono text-slate-300 whitespace-nowrap" title={valuationByTicker[pos.ticker.toUpperCase()]?.fvMultiple ? `${language === "EN" ? "Median P/E" : "PER mediano"} ${valuationByTicker[pos.ticker.toUpperCase()]!.fvMultiple!.toFixed(1)}×` : undefined}>
                          <ValueCell loading={!pos.isCash && valLoading && !valuationByTicker[pos.ticker.toUpperCase()]} value={pos.isCash ? null : valuationByTicker[pos.ticker.toUpperCase()]?.fv ?? null} format={formatCurrency} />
                        </td>
                        <td className="py-2.5 px-1 md:px-2 text-center border-r border-slate-700/50">
                          <UpsidePill value={upsideOf(pos.isCash ? null : valuationByTicker[pos.ticker.toUpperCase()]?.fv ?? null, pos.price)} />
                        </td>

                        {/* 200d MA */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono text-slate-300 whitespace-nowrap">
                          {pos.isCash || !pos.twoHundredDayAverage ? (
                            "—"
                          ) : (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <span>{formatCurrency(pos.twoHundredDayAverage)}</span>
                              <DistancePill current={pos.price} target={pos.twoHundredDayAverage} />
                            </div>
                          )}
                        </td>

                        {/* 50d MA */}
                        <td className="py-2.5 px-1 md:px-2 text-right font-mono text-slate-300 whitespace-nowrap">
                          {pos.isCash || !pos.fiftyDayAverage ? (
                            "—"
                          ) : (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <span>{formatCurrency(pos.fiftyDayAverage)}</span>
                              <DistancePill current={pos.price} target={pos.fiftyDayAverage} />
                            </div>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Score */}
                        <td className="py-2.5 px-1 md:px-2 text-center">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-black ${getScoreBgClass(scoredRow?.scores?.balanced ?? null)}`}>
                            {typeof scoredRow?.scores?.balanced === "number" ? scoredRow.scores.balanced.toFixed(0) : "—"}
                          </span>
                        </td>

                        {/* Growth */}
                        <td className="py-2.5 px-1 md:px-2 text-center group relative cursor-help">
                          <HealthMetricsTooltip
                            title={language === "ES" ? "Crecimiento" : "Growth"}
                            metrics={[
                              {key: "revenue_cagr", label: "Revenue CAGR", suffix: "%"},
                              {key: "eps_cagr", label: "EPS CAGR", suffix: "%"},
                              {key: "fcf_cagr", label: "Operating Cash Flow CAGR", suffix: "%"},
                            ]}
                            raw={scoredRow?.raw}
                            language={language}
                            placement={tooltipPlacement}
                          />
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.growth ?? null)}`}>
                              {typeof scoredRow?.factors?.growth === "number" ? scoredRow.factors.growth.toFixed(0) : "—"}
                            </span>
                            <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-emerald-500 h-full rounded-full"
                                style={{ width: `${scoredRow?.factors?.growth ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Quality */}
                        <td className="py-2.5 px-1 md:px-2 text-center group relative cursor-help">
                          <HealthMetricsTooltip
                            title={language === "ES" ? "Calidad" : "Quality"}
                            metrics={[
                              {key: "roic", label: "ROIC", suffix: "%"},
                              {key: "gross_margin", label: "Gross Margin", suffix: "%"},
                              {key: "operating_margin", label: "Oper. Margin", suffix: "%"},
                              {key: "fcf_conversion", label: "FCF Conversion", suffix: "%"},
                            ]}
                            raw={scoredRow?.raw}
                            language={language}
                            placement={tooltipPlacement}
                          />
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.quality ?? null)}`}>
                              {typeof scoredRow?.factors?.quality === "number" ? scoredRow.factors.quality.toFixed(0) : "—"}
                            </span>
                            <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-blue-500 h-full rounded-full"
                                style={{ width: `${scoredRow?.factors?.quality ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Stability */}
                        <td className="py-2.5 px-1 md:px-2 text-center group relative cursor-help">
                          <HealthMetricsTooltip
                            title={language === "ES" ? "Estabilidad" : "Stability"}
                            metrics={[
                              {key: "beta", label: "Beta"},
                              {key: "rev_growth_vol", label: "Rev Volatility", suffix: "%"},
                              {key: "margin_vol", label: "Margin Volatility", suffix: "%"},
                              {key: "interest_cov", label: "Interest Cov.", suffix: "x"},
                            ]}
                            raw={scoredRow?.raw}
                            language={language}
                            placement={tooltipPlacement}
                          />
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.stability ?? null)}`}>
                              {typeof scoredRow?.factors?.stability === "number" ? scoredRow.factors.stability.toFixed(0) : "—"}
                            </span>
                            <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-amber-500 h-full rounded-full"
                                style={{ width: `${scoredRow?.factors?.stability ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Valuation */}
                        <td className="py-2.5 px-1 md:px-2 text-center group relative cursor-help">
                          <HealthMetricsTooltip
                            title={language === "ES" ? "Valoración" : "Valuation"}
                            metrics={[
                              {key: "trailing_pe", label: "Trailing P/E", suffix: "x"},
                              {key: "forward_pe", label: "Forward P/E", suffix: "x"},
                              {key: "ev_ebitda", label: "EV/EBITDA", suffix: "x"},
                              {key: "fcf_yield", label: "FCF Yield", suffix: "%"},
                            ]}
                            raw={scoredRow?.raw}
                            language={language}
                            placement={tooltipPlacement}
                          />
                          <div className="flex flex-col items-center">
                            <span className={`text-xs font-bold ${getScoreColorClass(scoredRow?.factors?.valuation ?? null)}`}>
                              {typeof scoredRow?.factors?.valuation === "number" ? scoredRow.factors.valuation.toFixed(0) : "—"}
                            </span>
                            <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-rose-500 h-full rounded-full"
                                style={{ width: `${scoredRow?.factors?.valuation ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td className="py-2.5 px-1 md:px-2 text-left">
                          {pos.isCash ? (
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800 block w-max truncate max-w-[150px]">
                              —
                            </span>
                          ) : (
                            <span
                              className={`text-[11px] font-bold px-2.5 py-1 rounded border block w-max truncate max-w-[170px] ${getTypeBadgeConfig(scoredRow?.type).className}`}
                              title={scoredRow?.type ? `${scoredRow?.type}\n${language === 'ES' ? 'Método:' : 'Method:'} ${scoredRow?.valuationMethod}` : ""}
                            >
                              <span className="mr-1.5 opacity-80">{getTypeBadgeConfig(scoredRow?.type).icon}</span>
                              {scoredRow?.type || "—"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-1 md:px-2 text-center">
                          {pos.isCash ? "—" : <DistancePill current={pos.price} target={pos.twoHundredDayAverage} />}
                        </td>
                        <td className="py-2.5 px-1 md:px-2 text-center">
                          {pos.isCash ? "—" : <DistancePill current={pos.price} target={pos.fiftyDayAverage} />}
                        </td>
                      </>
                    )}
                  </tr>


                </React.Fragment>
              );
            })}
            </tbody>
            {holdingsTabMode !== "health" && (
              <tfoot>
                <tr
                  className="border-t-2 border-slate-800 bg-transparent text-slate-100 font-bold text-[16px]"
                >
                  <td className="py-3 px-1 md:px-2 font-display tracking-wider font-extrabold uppercase text-slate-400">
                    {language === "EN" ? "TOTAL PORTFOLIO" : "TOTAL GENERAL"}
                  </td>
                  {holdingsTabMode !== "valuation" && (
                    <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-500">—</td>
                  )}
                  {holdingsTabMode === "basis" ? (
                    <>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-500">—</td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-500">—</td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-white font-extrabold">
                        {formatValuation(totalMktValue)}
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-emerald-400 font-extrabold">
                        100.0%
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${
                          totalDailyPnL >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}>
                          {totalDailyPnL >= 0 ? "+" : ""}{formatStockValue(totalDailyPnL)}
                        </span>
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono">
                        <span className={totalDailyPnL >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {formatPercent(totalDailyPnLPercent)}
                        </span>
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${
                          totalReturnAmt >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}>
                          {totalReturnAmt >= 0 ? "+" : ""}{formatStockValue(totalReturnAmt)}
                        </span>
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono">
                        <span className={totalReturnAmt >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {formatPercent(totalReturnPct)}
                        </span>
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-emerald-400 font-bold whitespace-nowrap">
                        {formatValuation(totalDividendIncome)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-1 md:px-2 text-center font-mono text-slate-400">
                        {weightedPe !== null ? formatNumber(weightedPe, 1) : "—"}
                      </td>
                      <td className="py-3 px-1 md:px-2 text-center font-mono text-slate-400">
                        {weightedFwdPe !== null ? formatNumber(weightedFwdPe, 1) : "—"}
                      </td>
                      <td className="py-3 px-1 md:px-2 text-center font-mono text-slate-400 border-r border-slate-700/50">
                        {weightedPeg !== null ? formatNumber(weightedPeg, 2) : "—"}
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-500">—</td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-300 font-semibold">
                        {formatValuation(totalAvgValue)}
                      </td>
                      <td className="py-3 px-1 md:px-2 text-center border-r border-slate-700/50">
                        <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                          <TrendingUp size={11} className="flex-shrink-0" />
                          {totalUpsideAvgPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-500">—</td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-300 font-semibold">
                        {formatValuation(totalHighValue)}
                      </td>
                      <td className="py-3 px-1 md:px-2 text-center border-r border-slate-700/50">
                        <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono text-xs">
                          <TrendingUp size={11} className="flex-shrink-0" />
                          {totalUpsideHighPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-500">—</td>
                      <td className="py-3 px-1 md:px-2 text-right font-mono text-slate-500">—</td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
          </div>
        </div>
      ) : (
        /* Cards Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Total General Card/Banner for Grid View */}
          <div className="col-span-full holding-banner-card bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                <TrendingUp className="text-emerald-400" size={18} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                  {language === "EN" ? "TOTAL PORTFOLIO VALUE" : "TOTAL GENERAL DE CARTERA"}
                </span>
                <div className="flex items-center gap-2.5 sm:gap-3 mt-0.5 flex-wrap">
                  <span className="text-xl font-mono font-extrabold text-white">
                    {formatValuation(totalMktValue)}
                  </span>
                  {holdingsTabMode === "health" && (
                    <div className="flex items-center gap-1.5 pl-2.5 sm:pl-3 border-l border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        {language === "EN" ? "Portfolio Score" : "Score Portafolio"}:
                      </span>
                      <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-black ${getScoreBgClass(portfolioWeightedScore)}`}>
                        {portfolioWeightedScore.toFixed(0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {holdingsTabMode !== "health" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-8 border-t border-slate-800 md:border-t-0 pt-4 md:pt-0">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">
                    {language === "EN" ? "Investment" : "Inversión"}
                  </span>
                  <span className="text-sm font-mono font-medium text-slate-300 block mt-0.5">
                    {formatValuation(totalCostBasis)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">
                    {language === "EN" ? "Daily Return" : "Retorno Diario"}
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className={`text-sm font-mono font-bold ${totalDailyPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {totalDailyPnL >= 0 ? "+" : ""}{formatStockValue(totalDailyPnL)}
                    </span>
                    <span className={`text-[10px] font-bold ${totalDailyPnL >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      ({totalDailyPnLPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">
                    {language === "EN" ? "Total Return" : "Retorno Histórico"}
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className={`text-sm font-mono font-bold ${totalReturnAmt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {totalReturnAmt >= 0 ? "+" : ""}{formatStockValue(totalReturnAmt)}
                    </span>
                    <span className={`text-[10px] font-bold ${totalReturnAmt >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      ({totalReturnPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {sortedPositions.map((pos, idx) => {
            const cardTooltipPlacement = idx < sortedPositions.length / 2 ? "bottom" : "top";
            const isDailyPositive = pos.dailyPnL >= 0;
            const isTotalPositive = pos.returnAmt >= 0;
            const cardScoredRow = scoredRowsMap.get(pos.ticker.toUpperCase());
            const analystData = getAnalystData(pos);
            const avgTarget = analystData.avgTarget;
            const highTarget = analystData.highTarget;
            const upsideAvg = avgTarget && pos.price > 0 ? ((avgTarget - pos.price) / pos.price) * 100 : null;
            const upsideHigh = highTarget && pos.price > 0 ? ((highTarget - pos.price) / pos.price) * 100 : null;

            return (
              <React.Fragment key={`${pos.ticker}-card-${idx}`}>
                <div
                  onClick={() => !pos.isCash && setSelectedTicker(selectedTicker === pos.ticker ? null : pos.ticker)}
                  className={`holding-card border rounded-2xl p-4 sm:p-5 transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between min-h-[215px] sm:h-[215px] ${
                    pos.isCash
                      ? "bg-slate-900 border-slate-800 hover:bg-slate-800/40 cursor-default"
                      : "bg-slate-900 border-slate-800 hover:border-slate-700/80 cursor-pointer"
                  } ${selectedTicker === pos.ticker ? "border-white/30 bg-white/10 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36),inset_0_1px_1px_rgba(255,255,255,0.2)] z-10 relative" : ""}`}
                >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CompanyLogo ticker={pos.ticker} name={pos.name} isCash={pos.isCash} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <h3 className="font-display font-bold text-lg text-white leading-none">
                            {pos.ticker}
                          </h3>
                          {pos.isMargin && (
                            <span
                              title={language === "ES" ? "Posición en Margen • Costo de financiamiento: 6.25% E.A. cobrado mensualmente (~0.51%/mes)" : "Margin Position • Financing cost: 6.25% effective annual rate charged monthly (~0.51%/mo)"}
                              className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold uppercase tracking-wider"
                            >
                              MARGIN 6.25%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate max-w-[130px] sm:max-w-[180px]" title={pos.name}>
                          {pos.name}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold shrink-0">
                      {formatNumber(pos.weight, 1)}% {language === "EN" ? "Weight" : "Peso"}
                    </span>
                  </div>

                  {holdingsTabMode === "basis" ? (
                    <div className="grid grid-cols-3 gap-2 mt-4 items-start">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold truncate">
                          {language === "EN" ? "Market Value" : "Val. Mercado"}
                        </p>
                        <p className="text-sm sm:text-base font-mono font-bold text-white mt-1">
                          {formatValuation(pos.mktValue)}
                        </p>
                      </div>
                      {!pos.isCash && (
                        <>
                          <div className="min-w-0">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold truncate">
                              {language === "EN" ? "Price" : "Precio"}
                            </p>
                            <p className="text-xs font-mono text-slate-300 mt-1 flex items-center gap-1 flex-wrap">
                              <span>{formatCurrency(pos.price)}</span>
                              {pos.isAfterHoursPrice && (
                                <span className="text-[8.5px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-sans font-semibold">{getExtendedHoursLabel(pos.marketState)}</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold truncate">
                              {language === "EN" ? "Dividend" : "Dividendo"}
                            </p>
                            <div className="mt-1 flex items-baseline justify-end gap-1 flex-wrap">
                              <span className={`text-xs font-mono font-bold ${formatTotalDividend(pos, isReadOnly) === "$0.00" || formatTotalDividend(pos, isReadOnly) === "—" ? "text-slate-400" : "text-emerald-400"}`}>
                                {formatTotalDividend(pos, isReadOnly)}
                              </span>
                              {(() => {
                                const rate = getDividendPerShare(pos);
                                if (rate !== null && rate > 0 && pos.price > 0) {
                                  const yieldPct = (rate / pos.price) * 100;
                                  return (
                                    <span className="text-[9.5px] font-mono text-slate-400">
                                      ({yieldPct.toFixed(1)}%)
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : holdingsTabMode === "valuation" ? (
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">P/E</p>
                        <p className="text-sm font-mono font-bold text-white mt-0.5">
                          {pos.isCash ? "—" : formatNumber(pos.pe, 1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">FWD P/E</p>
                        <p className="text-sm font-mono font-bold text-white mt-0.5">
                          {pos.isCash ? "—" : formatNumber(pos.fwdPe, 1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">PEG</p>
                        <p className="text-sm font-mono font-bold text-white mt-0.5">
                          {pos.isCash ? "—" : formatNumber(pos.peg, 2)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mt-4 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/40">
                      <div className="text-center group relative cursor-help">
                        <HealthMetricsTooltip
                          title={language === "ES" ? "Crecimiento" : "Growth"}
                          metrics={[
                            {key: "revenue_cagr", label: "Revenue CAGR", suffix: "%"},
                            {key: "eps_cagr", label: "EPS CAGR", suffix: "%"},
                            {key: "fcf_cagr", label: "Operating Cash Flow CAGR", suffix: "%"},
                          ]}
                          raw={cardScoredRow?.raw}
                          language={language}
                          placement={cardTooltipPlacement}
                        />
                        <p className="text-[9px] text-slate-500 uppercase font-semibold">{language === "ES" ? "CREC" : "GROWTH"}</p>
                        <p className={`text-xs font-mono font-bold mt-0.5 ${getScoreColorClass(cardScoredRow?.factors?.growth ?? null)}`}>
                          {typeof cardScoredRow?.factors?.growth === "number" ? cardScoredRow.factors.growth.toFixed(0) : "—"}
                        </p>
                      </div>
                      <div className="text-center group relative cursor-help">
                        <HealthMetricsTooltip
                          title={language === "ES" ? "Calidad" : "Quality"}
                          metrics={[
                            {key: "roic", label: "ROIC", suffix: "%"},
                            {key: "gross_margin", label: "Gross Margin", suffix: "%"},
                            {key: "operating_margin", label: "Oper. Margin", suffix: "%"},
                            {key: "fcf_conversion", label: "FCF Conversion", suffix: "%"},
                          ]}
                          raw={cardScoredRow?.raw}
                          language={language}
                          placement={cardTooltipPlacement}
                        />
                        <p className="text-[9px] text-slate-500 uppercase font-semibold">{language === "ES" ? "CAL" : "QUALITY"}</p>
                        <p className={`text-xs font-mono font-bold mt-0.5 ${getScoreColorClass(cardScoredRow?.factors?.quality ?? null)}`}>
                          {typeof cardScoredRow?.factors?.quality === "number" ? cardScoredRow.factors.quality.toFixed(0) : "—"}
                        </p>
                      </div>
                      <div className="text-center group relative cursor-help">
                        <HealthMetricsTooltip
                          title={language === "ES" ? "Estabilidad" : "Stability"}
                          metrics={[
                            {key: "beta", label: "Beta"},
                            {key: "rev_growth_vol", label: "Rev Volatility", suffix: "%"},
                            {key: "margin_vol", label: "Margin Volatility", suffix: "%"},
                            {key: "interest_cov", label: "Interest Cov.", suffix: "x"},
                          ]}
                          raw={cardScoredRow?.raw}
                          language={language}
                          placement={cardTooltipPlacement}
                        />
                        <p className="text-[9px] text-slate-500 uppercase font-semibold">{language === "ES" ? "EST" : "STABILITY"}</p>
                        <p className={`text-xs font-mono font-bold mt-0.5 ${getScoreColorClass(cardScoredRow?.factors?.stability ?? null)}`}>
                          {typeof cardScoredRow?.factors?.stability === "number" ? cardScoredRow.factors.stability.toFixed(0) : "—"}
                        </p>
                      </div>
                      <div className="text-center group relative cursor-help">
                        <HealthMetricsTooltip
                          title={language === "ES" ? "Valoración" : "Valuation"}
                          metrics={[
                            {key: "trailing_pe", label: "Trailing P/E", suffix: "x"},
                            {key: "forward_pe", label: "Forward P/E", suffix: "x"},
                            {key: "ev_ebitda", label: "EV/EBITDA", suffix: "x"},
                            {key: "fcf_yield", label: "FCF Yield", suffix: "%"},
                          ]}
                          raw={cardScoredRow?.raw}
                          language={language}
                          placement={cardTooltipPlacement}
                        />
                        <p className="text-[9px] text-slate-500 uppercase font-semibold">{language === "ES" ? "VAL" : "VALUATION"}</p>
                        <p className={`text-xs font-mono font-bold mt-0.5 ${getScoreColorClass(cardScoredRow?.factors?.valuation ?? null)}`}>
                          {typeof cardScoredRow?.factors?.valuation === "number" ? cardScoredRow.factors.valuation.toFixed(0) : "—"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {!pos.isCash ? (
                  holdingsTabMode === "basis" ? (
                    <div className="border-t border-slate-800 pt-3 flex items-center justify-between mt-auto">
                      <div>
                        <span className="text-[10px] text-slate-500 block">
                          {language === "EN" ? "DAILY CHANGE" : "CAMBIO DIARIO"}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-xs font-mono font-semibold ${isDailyPositive ? "text-emerald-400" : "text-rose-400"}`}>
                            {formatPercent(pos.chgPct)}
                          </span>
                          <span className="text-slate-600 text-xs">•</span>
                          <span className={`text-[11px] font-mono ${isDailyPositive ? "text-emerald-500" : "text-rose-500"}`}>
                            {isDailyPositive ? "+" : ""}
                            {formatStockValue(pos.dailyPnL)}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">
                          {language === "EN" ? "TOTAL RETURN" : "RETORNO TOTAL"}
                        </span>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className={`text-xs font-mono font-semibold ${isTotalPositive ? "text-emerald-400" : "text-rose-400"}`}>
                            {formatPercent(pos.returnPct)}
                          </span>
                          <span className="text-slate-600 text-xs">•</span>
                          <span className={`text-[11px] font-mono ${isTotalPositive ? "text-emerald-500" : "text-rose-500"}`}>
                            {isTotalPositive ? "+" : ""}
                            {formatStockValue(pos.returnAmt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : holdingsTabMode === "valuation" ? (
                    <div className="border-t border-slate-800 pt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 mt-auto">
                      {[
                        { label: language === "EN" ? "AVG UPSIDE" : "UPSIDE PROM.", value: null as number | null, up: upsideAvg },
                        { label: language === "EN" ? "HIGH UPSIDE" : "UPSIDE ALTO", value: null as number | null, up: upsideHigh },
                        {
                          label: `DCF (${dcfScenario === "bear" ? (language === "EN" ? "BEAR" : "BAJISTA") : dcfScenario === "base" ? "BASE" : language === "EN" ? "BULL" : "ALCISTA"})`,
                          value: valuationByTicker[pos.ticker.toUpperCase()]?.dcf ?? null,
                          up: upsideOf(valuationByTicker[pos.ticker.toUpperCase()]?.dcf ?? null, pos.price),
                        },
                        {
                          label: `${language === "EN" ? "FAIR VALUE" : "VALOR RAZ."} (${fvRange === "ALL" ? (language === "EN" ? "ALL" : "TODO") : fvRange})`,
                          value: valuationByTicker[pos.ticker.toUpperCase()]?.fv ?? null,
                          up: upsideOf(valuationByTicker[pos.ticker.toUpperCase()]?.fv ?? null, pos.price),
                        },
                      ].map((c, i) => (
                        <div key={i} className={i % 2 ? "text-right" : ""}>
                          <span className="text-[10px] text-slate-500 block">{c.label}</span>
                          <div className={`flex items-center gap-1.5 mt-0.5 ${i % 2 ? "justify-end" : ""}`}>
                            {i >= 2 && (
                              <span className="text-xs font-mono font-bold text-slate-300">
                                {c.value !== null ? formatCurrency(c.value) : valLoading && !valuationByTicker[pos.ticker.toUpperCase()] ? "…" : "—"}
                              </span>
                            )}
                            {c.up !== null ? (
                              <span className={`text-[10px] font-mono font-bold ${c.up >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {i >= 2 ? "(" : ""}{c.up >= 0 ? "+" : ""}{c.up.toFixed(1)}%{i >= 2 ? ")" : ""}
                              </span>
                            ) : i < 2 ? (
                              <span className="text-xs font-mono text-slate-500">—</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-t border-slate-800 pt-3 flex items-center justify-between mt-auto">
                      <div className="flex-1 overflow-hidden min-w-0 pr-2">
                        <span className="text-[10px] text-slate-500 block">
                          {language === "EN" ? "TYPE" : "TIPO"}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border truncate max-w-full inline-flex items-center ${getTypeBadgeConfig(cardScoredRow?.type).className}`} title={cardScoredRow?.type ? `${cardScoredRow?.type}\n${language === 'ES' ? 'Método:' : 'Method:'} ${cardScoredRow?.valuationMethod}` : ""}>
                            <span className="mr-1 opacity-80 shrink-0">{getTypeBadgeConfig(cardScoredRow?.type).icon}</span>
                            <span className="truncate">{cardScoredRow?.type || "—"}</span>
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">Score</span>
                        <span className={`inline-block px-2.5 py-0.5 mt-1 rounded text-xs font-black ${getScoreBgClass(cardScoredRow?.scores?.balanced ?? null)}`}>
                          {typeof cardScoredRow?.scores?.balanced === "number" ? cardScoredRow.scores.balanced.toFixed(0) : "—"}
                        </span>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-slate-400 text-xs mt-auto">
                    <span>{language === "EN" ? "Cash available for transactions" : "Efectivo disponible para transacciones"}</span>
                    <span className="font-mono text-slate-200">{formatValuation(pos.mktValue)}</span>
                  </div>
                )}
              </div>


            </React.Fragment>
            );
          })}
        </div>
      )}

      {/* 2.3 TICKER PERFORMANCE COMPARATOR CHART */}
      {activePositions.filter(p => p.ticker && p.ticker.toUpperCase() !== "CASH" && !p.isCash && p.shares > 0).length > 0 && holdingsTabMode !== "financials" && (
        <div className="bg-[#0f111a]/80 backdrop-blur-md border border-slate-900/60 rounded-3xl p-6 shadow-xl mt-6" id="ticker-performance-comparator-card">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setIsPerformanceExpanded(!isPerformanceExpanded)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <BarChart3 className="text-emerald-400" size={16} />
              </div>
              <div>
                <h3 className="text-sm font-display font-bold text-white tracking-wider uppercase flex items-center gap-2">
                  Ticker Performance
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {language === "ES"
                    ? "Rendimiento porcentual de cada posición ordenadas de mayor a menor retorno"
                    : "Percentage return of each holding sorted from highest to lowest return"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white font-bold uppercase tracking-wider" style={{ color: '#ffffff' }}>
                {isPerformanceExpanded
                  ? (language === "ES" ? "Ocultar" : "Collapse")
                  : (language === "ES" ? "Mostrar" : "Expand")}
              </span>
              <div className={`p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/40 text-slate-400 transition-transform duration-200 ${isPerformanceExpanded ? "rotate-180" : ""}`}>
                <ChevronDown size={14} />
              </div>
            </div>
          </div>

          {isPerformanceExpanded && (
            <div className="mt-6 pt-6 border-t border-slate-900/60 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col md:flex-row md:items-center justify-end gap-4 mb-6">
                {/* Timeframe Selectors */}
                <div data-toggle className="flex bg-[#121420] p-1 rounded-xl border border-slate-800/60 text-[10px] font-bold">
                  {[
                    { key: "day", label: "1d" },
                    { key: "week", label: "1W" },
                    { key: "month", label: "1M" },
                    { key: "6m", label: "6M" },
                    { key: "ytd", label: "YTD" },
                    { key: "1y", label: "1y" },
                    { key: "ath", label: "ATH" },
                  ].map((tf) => (
                    <button aria-pressed={!!(performanceTimeframe === tf.key)}
                      key={tf.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPerformanceTimeframe(tf.key as any);
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer uppercase ${
                        performanceTimeframe === tf.key
                          ? "bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/10"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bar Chart Container */}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData} margin={{ top: 15, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1e29" vertical={false} opacity={0.1} />
                    <XAxis
                      dataKey="name"
                      stroke="#475569"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                      className="font-mono font-bold"
                    />
                    <YAxis
                      stroke="#475569"
                      fontSize={10}
                      tickFormatter={(val) => `${val >= 0 ? "+" : ""}${val}%`}
                      tickLine={false}
                      axisLine={false}
                      width={55}
                      className="font-mono"
                    />
                    <Tooltip
                      content={<CustomPerformanceTooltip language={language} />}
                      cursor={{ fill: '#1e293b', opacity: 0.15 }}
                    />
                    <ReferenceLine y={0} stroke="#475569" strokeWidth={1} opacity={0.4} />
                    <Bar dataKey="performance" radius={[4, 4, 0, 0]} maxBarSize={45}>
                      {performanceData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.performance >= 0 ? "#10b981" : "#f43f5e"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}


      {selectedTicker && (
        (() => {
          const pos = sortedPositions.find(p => p.ticker === selectedTicker);
          if (!pos || pos.isCash) return null;
          return (
            <StockDetailPanel
              position={pos}
              language={language}
              onClose={() => setSelectedTicker(null)}
              financialsData={effectiveFinancialsMap[pos.ticker.toUpperCase()]}
            />
          );
        })()
      )}

    </div>
  );
}

// ---------------------------------------------------------------------
// Ticker Performance Helpers
// ---------------------------------------------------------------------

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  language?: "EN" | "ES";
}

const CustomPerformanceTooltip = ({ active, payload, label, language = "EN" }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isPositive = data.performance >= 0;
    return (
      <div className="bg-[#0f111a] border border-slate-800 p-3 rounded-xl text-xs space-y-1.5 shadow-2xl font-mono text-left">
        <p className="font-bold text-white uppercase text-[11px] tracking-wide">{label}</p>
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: isPositive ? "#10b981" : "#f43f5e" }}
          />
          <span className="text-slate-300 font-medium">
            {language === "ES" ? "Rendimiento" : "Performance"}:
          </span>
          <span className={`font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
            {isPositive ? "+" : ""}{data.performance.toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 border-t border-slate-800/60 pt-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          <span>Dip Finder: {data.performance.toFixed(2)}%</span>
        </div>
      </div>
    );
  }
  return null;
};

function getTickerPerformanceData(ticker: string, timeframe: string, pos?: any): number | null {
  // Solo dato real: el cambio del día de la cotización. Para otros periodos, sin gráfico de Yahoo no
  // hay rentabilidad (antes, una tabla fija de 15 tickers o una cifra generada con un hash del ticker).
  if (timeframe === "day" && pos && typeof pos.chgPct === "number" && Number.isFinite(pos.chgPct)) return pos.chgPct;
  return null;
}
