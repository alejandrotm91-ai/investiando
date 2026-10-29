import React, { useState, useMemo } from "react";
import { PortfolioData, Position } from "../types";
import { CompanyLogo, getTickerSector, getSectorSpanish } from "./HoldingsTable";
import { Eye, EyeOff, Maximize2, Minimize2, PieChart as PieChartIcon, X, Info } from "lucide-react";

interface PortfolioDistributionDonutProps {
  portfolio: PortfolioData;
  selectedTicker: string | null;
  onSelectTicker: (ticker: string | null) => void;
  selectedSector: string | null;
  onClearSector: () => void;
  language?: "EN" | "ES";
  isReadOnly?: boolean;
  theme?: "dark" | "light";
  showPortfolioTotal: boolean;
  onToggleShowPortfolioTotal: () => void;
  portfolioWeightedType?: string | null;
  portfolioWeightedScore?: number;
  onNavigateToHealth?: () => void;
  getTypeBadgeConfig?: (type: string | undefined | null) => { icon: string; className: string };
  getScoreHex?: (score: number) => string;
  getScoreColorClass?: (score: number) => string;
}

// Brand color accents mapped to popular tickers for an authentic financial terminal look
const BRAND_COLORS: Record<string, string> = {
  NVDA: "#84cc16", // Lime Green
  MSFT: "#c8b965", // Khaki / Gold
  AVGO: "#ff0055", // Broadcom Crimson Red
  META: "#0080ff", // Electric Blue
  AMZN: "#ff8800", // Amazon Orange
  GOOGL: "#9c9985", // Google Slate / Olive Grey
  GOOG: "#9c9985",
  NBIS: "#d4ff33", // Bright Chartreuse
  MA: "#ff5500",   // Mastercard Orange-Red
  UBER: "#00c8e6", // Uber Cyan / Teal
  NU: "#8a2be2",   // Nu Bank Purple
  NFLX: "#ff0000", // Netflix Red
  AAPL: "#a3aaae", // Apple Slate Silver
  TSLA: "#ef4444", // Tesla Red
  AMD: "#ea580c",  // AMD Orange
  COST: "#0284c7", // Costco Blue
  LLY: "#dc2626",  // Eli Lilly Red
  JPM: "#1e40af",  // JP Morgan Blue
  V: "#2563eb",    // Visa Blue
  CASH: "#10b981", // Cash Green
  USD: "#10b981",
  EFECTIVO: "#10b981",
};

// Vibrant fallback palette matching the visual hierarchy in the reference design
const VIBRANT_PALETTE = [
  "#84cc16", // Lime
  "#c8b965", // Khaki gold
  "#ff0055", // Crimson
  "#0080ff", // Electric blue
  "#ff8800", // Vivid orange
  "#9c9985", // Olive grey
  "#d4ff33", // Chartreuse
  "#ff5500", // Orange-red
  "#00c8e6", // Cyan
  "#8a2be2", // Purple
  "#ff0000", // Red
  "#10b981", // Emerald
  "#06b6d4", // Teal
  "#f43f5e", // Rose
  "#eab308", // Yellow
  "#3b82f6", // Blue
  "#a855f7", // Violet
  "#ec4899", // Pink
  "#64748b", // Slate
];

interface SliceData {
  ticker: string;
  name: string;
  mktValue: number;
  weight: number;
  dailyPnL?: number;
  chgPct?: number;
  color: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  isOther?: boolean;
}

export const PortfolioDistributionDonut: React.FC<PortfolioDistributionDonutProps> = ({
  portfolio,
  selectedTicker,
  onSelectTicker,
  selectedSector,
  onClearSector,
  language = "ES",
  isReadOnly = false,
  theme = "dark",
  showPortfolioTotal,
  onToggleShowPortfolioTotal,
  portfolioWeightedType,
  portfolioWeightedScore = 0,
  onNavigateToHealth,
  getTypeBadgeConfig,
  getScoreHex,
  getScoreColorClass,
}) => {
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [centerMode, setCenterMode] = useState<"mktValue" | "today" | "total">("mktValue");
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Format currencies with standard and compact valuations (Bn / M / k) matching Portfolio Value in Summary
  const formatValuation = (val: number, withSign = false) => {
    if (val === null || val === undefined || isNaN(val)) return "—";
    const sign = withSign && val > 0 ? "+" : val < 0 ? "-" : "";
    const absVal = Math.abs(val);

    if (absVal >= 1000000000) {
      const billions = absVal / 1000000000;
      return `${sign}$${billions.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}Bn`;
    }
    if (absVal >= 1000000) {
      const millions = absVal / 1000000;
      return `${sign}$${millions.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
    }
    if (absVal >= 1000) {
      const thousands = absVal / 1000;
      return `${sign}$${thousands.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
    }
    if (absVal === 0) return `${sign}$0.00`;
    return `${sign}$${absVal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatCurrency = (val: number, withSign = false) => {
    if (val === null || val === undefined || isNaN(val)) return "—";
    const sign = withSign && val > 0 ? "+" : val < 0 ? "-" : "";
    const absVal = Math.abs(val);
    if (isReadOnly || absVal >= 1000000) {
      return formatValuation(val, withSign);
    }
    return `${sign}$${absVal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Format currency rounded in compact form (Bn / M / k) for donut center
  const formatKCurrency = (val: number, withSign = false) => {
    return formatValuation(val, withSign);
  };

  const formatPercent = (val: number, withSign = true) => {
    const sign = withSign && val > 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
  };

  // Calculate dynamic badge size based on position weight percentage
  const getBadgeDimensions = (weight: number, isModal = false) => {
    // Dynamic weight progression: small holdings (<=2%) stay sleek (~24px),
    // while dominant holdings (15-30%+) expand prominently (~46-54px)
    const baseBadgeMin = isModal ? 28 : 24;
    const baseBadgeMax = isModal ? 64 : 54;
    
    // Normalized weight factor between 0.5% and 32%
    const normalized = Math.max(0, Math.min(1, (weight - 0.5) / 31.5));
    // Curved easing so growth is perceptible across the entire weight distribution
    const curve = Math.pow(normalized, 0.65);
    
    const badgePx = Math.round(baseBadgeMin + (baseBadgeMax - baseBadgeMin) * curve);
    const innerPx = Math.max(16, Math.round(badgePx * 0.78));

    return {
      badgePx,
      innerPx,
      logoSize: (badgePx >= 38 ? (badgePx >= 48 ? "lg" : "md") : "sm") as "sm" | "md" | "lg",
    };
  };

  // Filter positions for pie chart
  const filteredPositions = useMemo(() => {
    if (!portfolio || !portfolio.positions) return [];
    if (!selectedSector) return portfolio.positions;
    return portfolio.positions.filter(
      (pos) => getTickerSector(pos.ticker, pos.isCash) === selectedSector
    );
  }, [portfolio, selectedSector]);

  const totalValue = useMemo(() => {
    return filteredPositions.reduce((sum, p) => sum + p.mktValue, 0);
  }, [filteredPositions]);

  // Build slices data
  const { slices, topPositionsCount } = useMemo(() => {
    if (filteredPositions.length === 0 || totalValue <= 0) {
      return { slices: [], topPositionsCount: 0 };
    }

    const sorted = [...filteredPositions].sort((a, b) => b.weight - a.weight);
    
    // In modern view, show individual slices for positions >= 1.5% or top 12
    const minThreshold = selectedSector ? 0.5 : 1.2;
    const prominent = sorted.filter((p) => p.weight >= minThreshold);
    const others = sorted.filter((p) => p.weight < minThreshold);

    const effectiveProminent = prominent.length > 0 ? prominent : sorted.slice(0, 10);
    const effectiveOthers = prominent.length > 0 ? others : sorted.slice(10);

    const rawSlices: {
      ticker: string;
      name: string;
      mktValue: number;
      weight: number;
      dailyPnL?: number;
      chgPct?: number;
      isOther?: boolean;
    }[] = effectiveProminent.map((pos) => {
      const isCashItem = pos.isCash || pos.ticker === "CASH" || pos.ticker === "USD" || pos.ticker === "EFECTIVO" || pos.name?.toLowerCase().includes("efectivo") || pos.name?.toLowerCase().includes("cash");
      let displayName = pos.name;
      let displayTicker = pos.ticker;
      if (isCashItem) {
        displayName = language === "EN" ? "Cash (USD)" : "Efectivo (USD)";
        displayTicker = language === "EN" ? "CASH" : "EFECTIVO";
      }
      return {
        ticker: displayTicker,
        name: displayName,
        mktValue: pos.mktValue,
        weight: pos.weight,
        dailyPnL: pos.dailyPnL,
        chgPct: pos.chgPct,
        isOther: false,
      };
    });

    if (effectiveOthers.length > 0) {
      const othersMktValue = effectiveOthers.reduce((sum, p) => sum + p.mktValue, 0);
      const othersWeight = effectiveOthers.reduce((sum, p) => sum + p.weight, 0);
      rawSlices.push({
        ticker: language === "EN" ? "Other" : "Otros",
        name: language === "EN" ? "Other Positions" : "Otras Posiciones",
        mktValue: othersMktValue,
        weight: othersWeight,
        isOther: true,
      });
    }

    // Compute total weight to normalize angles to 360°
    const sumWeight = rawSlices.reduce((sum, s) => sum + s.weight, 0);

    let currentAngle = 0;
    const computedSlices: SliceData[] = rawSlices.map((item, idx) => {
      const normalizedWeight = sumWeight > 0 ? (item.weight / sumWeight) * 100 : 0;
      const angleSpan = (normalizedWeight / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angleSpan;
      const midAngle = startAngle + angleSpan / 2;
      currentAngle = endAngle;

      const cleanTicker = item.ticker.toUpperCase();
      const color = item.isOther
        ? "#64748b"
        : (BRAND_COLORS[cleanTicker] || VIBRANT_PALETTE[idx % VIBRANT_PALETTE.length]);

      return {
        ...item,
        color,
        startAngle,
        endAngle,
        midAngle,
      };
    });

    return { slices: computedSlices, topPositionsCount: effectiveProminent.length };
  }, [filteredPositions, totalValue, selectedSector, language]);

  // Arc path generator for SVG donut slice
  const getArcPath = (
    cx: number,
    cy: number,
    rInner: number,
    rOuter: number,
    startDeg: number,
    endDeg: number,
    padDeg = 1.2
  ) => {
    const effectiveStart = startDeg + padDeg / 2;
    const effectiveEnd = endDeg - padDeg / 2;
    if (effectiveEnd <= effectiveStart) return "";

    const startRad = ((effectiveStart - 90) * Math.PI) / 180;
    const endRad = ((effectiveEnd - 90) * Math.PI) / 180;

    const x1 = cx + rOuter * Math.cos(startRad);
    const y1 = cy + rOuter * Math.sin(startRad);
    const x2 = cx + rOuter * Math.cos(endRad);
    const y2 = cy + rOuter * Math.sin(endRad);

    const x3 = cx + rInner * Math.cos(endRad);
    const y3 = cy + rInner * Math.sin(endRad);
    const x4 = cx + rInner * Math.cos(startRad);
    const y4 = cy + rInner * Math.sin(startRad);

    const largeArc = effectiveEnd - effectiveStart > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };

  // Dimensions for SVG & pill placement
  const viewSize = 460;
  const center = viewSize / 2;
  const rInner = 86;
  const rOuter = 158;
  const rInsideBadge = (rInner + rOuter) / 2;
  const rPill = rOuter + 26;

  // Active highlighted slice (either hovered or selected)
  const activeSlice = useMemo(() => {
    const targetTicker = hoveredTicker || selectedTicker;
    if (!targetTicker) return null;
    return slices.find((s) => s.ticker === targetTicker || (targetTicker === "CASH" && s.ticker === "EFECTIVO") || (targetTicker === "EFECTIVO" && s.ticker === "CASH")) || null;
  }, [hoveredTicker, selectedTicker, slices]);

  // Center display values
  const centerDisplay = useMemo(() => {
    if (activeSlice) {
      return {
        label: activeSlice.ticker,
        subLabel: activeSlice.name,
        value: showPortfolioTotal
          ? formatKCurrency(activeSlice.mktValue)
          : "••••••",
        pct: `${activeSlice.weight.toFixed(1)}%`,
        pnlPct: activeSlice.chgPct !== undefined ? formatPercent(activeSlice.chgPct) : undefined,
        isPositive: (activeSlice.chgPct ?? 0) >= 0,
        isSlice: true,
      };
    }

    if (centerMode === "today") {
      const pnl = portfolio.totals.dailyPnL;
      const pnlPct = portfolio.totals.dailyPnLPercent;
      return {
        label: language === "ES" ? "HOY" : "TODAY",
        subLabel: undefined,
        value: showPortfolioTotal ? formatKCurrency(pnl, true) : "••••••",
        pct: formatPercent(pnlPct, true),
        isPositive: pnl >= 0,
        isSlice: false,
      };
    }

    if (centerMode === "total") {
      const pnl = portfolio.totals.totalReturn;
      const pnlPct = portfolio.totals.totalReturnPercent;
      return {
        label: language === "ES" ? "RETORNO TOTAL" : "TOTAL RETURN",
        subLabel: undefined,
        value: showPortfolioTotal ? formatKCurrency(pnl, true) : "••••••",
        pct: formatPercent(pnlPct, true),
        isPositive: pnl >= 0,
        isSlice: false,
      };
    }

    // mktValue mode (DEFAULT)
    return {
      label: language === "ES" ? "VALOR TOTAL" : "TOTAL VALUE",
      subLabel: undefined,
      value: showPortfolioTotal ? formatKCurrency(totalValue) : "••••••",
      pct: `${filteredPositions.length} ${language === "ES" ? "Activos" : "Assets"}`,
      isPositive: true,
      isSlice: false,
    };
  }, [activeSlice, centerMode, portfolio.totals, totalValue, filteredPositions.length, showPortfolioTotal, language]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between w-full lg:flex-1 min-w-0 relative">
      {/* Card Header */}
      <div>
        <div className="flex items-center justify-between gap-2 text-slate-400 mb-2 h-7">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
              {language === "ES" ? "Distribución de Portafolio" : "Portfolio Distribution"}
            </span>
            
            {/* Toggle hide/show total values */}
            <button
              type="button"
              onClick={onToggleShowPortfolioTotal}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
              title={
                showPortfolioTotal
                  ? language === "ES" ? "Ocultar valores" : "Hide values"
                  : language === "ES" ? "Mostrar valores" : "Show values"
              }
            >
              {showPortfolioTotal ? <Eye size={13} /> : <EyeOff size={13} className="text-slate-500" />}
            </button>

            {/* Clear sector filter button */}
            {selectedSector && (
              <button
                onClick={onClearSector}
                className="text-[10px] text-emerald-400 normal-case bg-emerald-500/15 hover:bg-emerald-500/25 px-1.5 py-0.5 rounded-full border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                title={language === "ES" ? "Limpiar filtro de sector" : "Clear sector filter"}
              >
                <span className="truncate max-w-[80px] sm:max-w-none">
                  {language === "EN" ? selectedSector : getSectorSpanish(selectedSector)}
                </span>
                <span className="font-extrabold text-emerald-300">×</span>
              </button>
            )}
          </div>

          {/* Right Header Badges & Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Health / Portfolio Type Badges */}
            {portfolioWeightedType && getTypeBadgeConfig && (
              <button
                onClick={onNavigateToHealth}
                className={`inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-xl text-[10px] font-extrabold cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-md border border-emerald-500/30 ${getTypeBadgeConfig(portfolioWeightedType).className}`}
                title={language === "ES" ? "Ir a Salud en pestaña Holdings" : "Go to Health in Holdings tab"}
              >
                <span className="text-xs">{getTypeBadgeConfig(portfolioWeightedType).icon}</span>
                <span className="hidden xl:inline">{portfolioWeightedType}</span>
              </button>
            )}

            {portfolioWeightedScore > 0 && getScoreHex && getScoreColorClass && (
              <button
                id="portfolio-health-score-btn"
                onClick={onNavigateToHealth}
                className="inline-flex items-center gap-1 group cursor-pointer hover:scale-105 active:scale-95 transition-all px-1.5 py-0.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/90 border border-slate-800/80 hover:border-slate-700 shadow-sm shrink-0"
                title={language === "ES" ? "Ir a Salud en pestaña Holdings" : "Go to Health in Holdings tab"}
              >
                <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <path
                      className="text-slate-800"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={getScoreHex(portfolioWeightedScore)}
                      strokeWidth="3.5"
                      strokeDasharray={`${portfolioWeightedScore}, 100`}
                      className="drop-shadow-sm transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-[9px] font-extrabold font-mono ${getScoreColorClass(portfolioWeightedScore)}`}>
                      {portfolioWeightedScore.toFixed(0)}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 hidden xl:inline uppercase tracking-wider">
                  {language === "ES" ? "Salud" : "Health"}
                </span>
              </button>
            )}

            {/* Maximize / Fullscreen Modal Button */}
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
              title={language === "ES" ? "Expandir vista completa" : "Expand full view"}
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {slices.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-slate-500 text-xs">
            {language === "ES" ? "No hay activos en el portafolio." : "No assets in portfolio."}
          </div>
        ) : (
          <div className="relative w-full flex items-center justify-center py-1 min-h-[290px] sm:min-h-[320px]">
            <div className="relative w-full max-w-[340px] sm:max-w-[370px] aspect-square flex items-center justify-center select-none">
              
              {/* SVG Donut Ring & Inside Percentage Badges */}
              <svg
                viewBox={`0 0 ${viewSize} ${viewSize}`}
                className="w-full h-full overflow-visible drop-shadow-2xl"
              >
                <defs>
                  {slices.map((slice, i) => (
                    <radialGradient
                      key={`grad-${slice.ticker}-${i}`}
                      id={`grad-${slice.ticker}-${i}`}
                      cx="50%"
                      cy="50%"
                      r="50%"
                    >
                      <stop offset="60%" stopColor={slice.color} stopOpacity="1" />
                      <stop offset="100%" stopColor={slice.color} stopOpacity="0.85" />
                    </radialGradient>
                  ))}
                </defs>

                {/* Slices */}
                {slices.map((slice, i) => {
                  const isHovered = hoveredTicker === slice.ticker;
                  const isSelected = selectedTicker === slice.ticker;
                  const hasSelection = selectedTicker !== null || hoveredTicker !== null;
                  const isDimmed = hasSelection && !isHovered && !isSelected;
                  const pathD = getArcPath(center, center, rInner, rOuter, slice.startAngle, slice.endAngle, 1.5);

                  return (
                    <path
                      key={`slice-${slice.ticker}-${i}`}
                      d={pathD}
                      fill={`url(#grad-${slice.ticker}-${i})`}
                      className="cursor-pointer transition-all duration-200"
                      style={{
                        opacity: isDimmed ? 0.3 : 1,
                        transform: isHovered || isSelected ? "scale(1.025)" : "scale(1)",
                        transformOrigin: `${center}px ${center}px`,
                        filter: isHovered || isSelected ? `drop-shadow(0 0 12px ${slice.color}80)` : "none",
                      }}
                      onMouseEnter={() => setHoveredTicker(slice.ticker)}
                      onMouseLeave={() => setHoveredTicker(null)}
                      onClick={() => {
                        if (!slice.isOther) {
                          onSelectTicker(selectedTicker === slice.ticker ? null : slice.ticker);
                        }
                      }}
                    />
                  );
                })}

                {/* Percentage Badges inside the Ring */}
                {slices.map((slice, i) => {
                  // Only show percentage pill if slice angle span >= 13 degrees
                  const angleSpan = slice.endAngle - slice.startAngle;
                  if (angleSpan < 13) return null;

                  const midRad = ((slice.midAngle - 90) * Math.PI) / 180;
                  const bx = center + rInsideBadge * Math.cos(midRad);
                  const by = center + rInsideBadge * Math.sin(midRad);

                  const pctText = slice.weight >= 10 
                    ? `${Math.round(slice.weight)}%` 
                    : `${slice.weight.toFixed(1)}%`;

                  return (
                    <g
                      key={`pct-badge-${slice.ticker}-${i}`}
                      transform={`translate(${bx}, ${by})`}
                      className="pointer-events-none"
                    >
                      {/* Dark Pill Background */}
                      <rect
                        x="-20"
                        y="-10"
                        width="40"
                        height="20"
                        rx="10"
                        fill="#0b0e14"
                        fillOpacity="0.85"
                        stroke="#1e293b"
                        strokeWidth="0.75"
                      />
                      <text
                        x="0"
                        y="3.5"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10.5"
                        fontWeight="800"
                        fontFamily="monospace"
                      >
                        {pctText}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Floating Pill Badges around the Perimeter */}
              {slices.map((slice, i) => {
                // Render outer pill for prominent positions
                const angleSpan = slice.endAngle - slice.startAngle;
                if (angleSpan < 7 && i > 12) return null;

                const midRad = ((slice.midAngle - 90) * Math.PI) / 180;
                const px = center + rPill * Math.cos(midRad);
                const py = center + rPill * Math.sin(midRad);

                const leftPct = (px / viewSize) * 100;
                const topPct = (py / viewSize) * 100;

                const isHovered = hoveredTicker === slice.ticker;
                const isSelected = selectedTicker === slice.ticker;
                const hasSelection = selectedTicker !== null || hoveredTicker !== null;
                const isDimmed = hasSelection && !isHovered && !isSelected;

                const { badgePx, innerPx, logoSize } = getBadgeDimensions(slice.weight, false);

                return (
                  <div
                    key={`outer-pill-${slice.ticker}-${i}`}
                    title={`${slice.ticker} • ${slice.name} (${slice.weight.toFixed(1)}%)`}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${badgePx}px`,
                      height: `${badgePx}px`,
                      transform: "translate(-50%, -50%)",
                      borderColor: slice.color,
                      boxShadow: isHovered || isSelected 
                        ? `0 0 16px ${slice.color}80, 0 4px 12px rgba(0,0,0,0.6)` 
                        : "0 4px 12px rgba(0,0,0,0.5)",
                    }}
                    onMouseEnter={() => setHoveredTicker(slice.ticker)}
                    onMouseLeave={() => setHoveredTicker(null)}
                    onClick={() => {
                      if (!slice.isOther) {
                        onSelectTicker(selectedTicker === slice.ticker ? null : slice.ticker);
                      }
                    }}
                    className={`absolute z-10 flex items-center justify-center rounded-full bg-[#0c0f17]/95 border-2 cursor-pointer transition-all duration-200 hover:scale-125 active:scale-95 ${
                      isDimmed ? "opacity-35" : "opacity-100"
                    } ${isSelected ? "ring-2 ring-white/70 scale-115" : ""}`}
                  >
                    {/* Ticker Logo Icon */}
                    {!slice.isOther ? (
                      <div
                        className="rounded-full overflow-hidden flex items-center justify-center shrink-0 pointer-events-none [&>div]:!w-full [&>div]:!h-full [&>div]:!p-0.5"
                        style={{ width: `${innerPx}px`, height: `${innerPx}px` }}
                      >
                        <CompanyLogo ticker={slice.ticker} size={logoSize} />
                      </div>
                    ) : (
                      <div
                        className="rounded-full shrink-0"
                        style={{
                          width: `${Math.round(innerPx * 0.75)}px`,
                          height: `${Math.round(innerPx * 0.75)}px`,
                          backgroundColor: slice.color,
                        }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Donut Center Display */}
              <div
                onClick={() => {
                  setCenterMode((prev) =>
                    prev === "mktValue" ? "today" : prev === "today" ? "total" : "mktValue"
                  );
                }}
                className="absolute inset-0 m-auto w-[136px] h-[136px] sm:w-[148px] sm:h-[148px] rounded-full bg-[#0b0e16]/95 border border-slate-800/80 shadow-2xl flex flex-col items-center justify-center cursor-pointer hover:border-slate-700 transition-all z-20 group p-1"
                title={language === "ES" ? "Clic para alternar entre Valor Total, Hoy y Retorno Total" : "Click to toggle between Total Value, Today and Total Return"}
              >
                {/* Header Label */}
                <div className="flex items-center gap-1 text-slate-400 group-hover:text-slate-200 transition-colors">
                  <span className="text-[9.5px] sm:text-[10px] font-extrabold uppercase tracking-widest leading-none">
                    {centerDisplay.label}
                  </span>
                  {!centerDisplay.isSlice && (
                    <span className="text-[8.5px] text-slate-500 font-mono">↻</span>
                  )}
                </div>

                {/* Sub-label (Company Name if slice is active) */}
                {centerDisplay.subLabel && (
                  <span className="text-[8.5px] sm:text-[9px] text-slate-400 font-medium truncate max-w-[110px] sm:max-w-[120px] mt-0.5 text-center">
                    {centerDisplay.subLabel}
                  </span>
                )}

                {/* Hero Amount */}
                <span
                  className={`text-xl sm:text-2xl font-mono font-black mt-0.5 sm:mt-1 leading-none tracking-tight ${
                    centerDisplay.isSlice
                      ? "text-white"
                      : centerDisplay.isPositive
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {centerDisplay.value}
                </span>

                {/* Percentage / Subtext */}
                <div className="mt-0.5 sm:mt-1 flex items-center gap-1 font-mono">
                  <span
                    className={`text-[11px] sm:text-xs font-bold ${
                      centerDisplay.isSlice
                        ? "text-emerald-400"
                        : centerDisplay.isPositive
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {centerDisplay.pct}
                  </span>

                  {centerDisplay.pnlPct && (
                    <span
                      className={`text-[9.5px] sm:text-[10px] font-bold ${
                        centerDisplay.isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      ({centerDisplay.pnlPct})
                    </span>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Expanded fullscreen modal view */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col justify-between">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                  <PieChartIcon size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {language === "ES" ? "Distribución Integral del Portafolio" : "Complete Portfolio Distribution"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {language === "ES"
                      ? "Visualización interactiva de asignación de capital por activo"
                      : "Interactive asset capital allocation visualizer"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body: Large Donut with Full Position Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 my-6 items-center">
              {/* Large Donut */}
              <div className="lg:col-span-7 flex items-center justify-center">
                <div className="relative w-[380px] sm:w-[460px] aspect-square flex items-center justify-center select-none">
                  <svg
                    viewBox={`0 0 ${viewSize} ${viewSize}`}
                    className="w-full h-full overflow-visible drop-shadow-2xl"
                  >
                    {slices.map((slice, i) => {
                      const isHovered = hoveredTicker === slice.ticker;
                      const isSelected = selectedTicker === slice.ticker;
                      const hasSelection = selectedTicker !== null || hoveredTicker !== null;
                      const isDimmed = hasSelection && !isHovered && !isSelected;
                      const pathD = getArcPath(center, center, rInner, rOuter, slice.startAngle, slice.endAngle, 1.5);

                      return (
                        <path
                          key={`modal-slice-${slice.ticker}-${i}`}
                          d={pathD}
                          fill={slice.color}
                          className="cursor-pointer transition-all duration-200"
                          style={{
                            opacity: isDimmed ? 0.3 : 1,
                            transform: isHovered || isSelected ? "scale(1.03)" : "scale(1)",
                            transformOrigin: `${center}px ${center}px`,
                            filter: isHovered || isSelected ? `drop-shadow(0 0 12px ${slice.color}90)` : "none",
                          }}
                          onMouseEnter={() => setHoveredTicker(slice.ticker)}
                          onMouseLeave={() => setHoveredTicker(null)}
                          onClick={() => {
                            if (!slice.isOther) {
                              onSelectTicker(selectedTicker === slice.ticker ? null : slice.ticker);
                            }
                          }}
                        />
                      );
                    })}

                    {/* Percentage badges */}
                    {slices.map((slice, i) => {
                      const angleSpan = slice.endAngle - slice.startAngle;
                      if (angleSpan < 12) return null;
                      const midRad = ((slice.midAngle - 90) * Math.PI) / 180;
                      const bx = center + rInsideBadge * Math.cos(midRad);
                      const by = center + rInsideBadge * Math.sin(midRad);

                      return (
                        <g
                          key={`modal-pct-${slice.ticker}-${i}`}
                          transform={`translate(${bx}, ${by})`}
                          className="pointer-events-none"
                        >
                          <rect
                            x="-20"
                            y="-10"
                            width="40"
                            height="20"
                            rx="10"
                            fill="#0b0e14"
                            fillOpacity="0.85"
                            stroke="#1e293b"
                            strokeWidth="0.75"
                          />
                          <text
                            x="0"
                            y="3.5"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="10.5"
                            fontWeight="800"
                            fontFamily="monospace"
                          >
                            {slice.weight >= 10 ? `${Math.round(slice.weight)}%` : `${slice.weight.toFixed(1)}%`}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Outer Pills in Modal */}
                  {slices.map((slice, i) => {
                    const angleSpan = slice.endAngle - slice.startAngle;
                    if (angleSpan < 6 && i > 12) return null;
                    const midRad = ((slice.midAngle - 90) * Math.PI) / 180;
                    const px = center + rPill * Math.cos(midRad);
                    const py = center + rPill * Math.sin(midRad);
                    const leftPct = (px / viewSize) * 100;
                    const topPct = (py / viewSize) * 100;

                    const isHovered = hoveredTicker === slice.ticker;
                    const isSelected = selectedTicker === slice.ticker;

                    const { badgePx, innerPx, logoSize } = getBadgeDimensions(slice.weight, true);

                    return (
                      <div
                        key={`modal-pill-${slice.ticker}-${i}`}
                        title={`${slice.ticker} • ${slice.name} (${slice.weight.toFixed(1)}%)`}
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: `${badgePx}px`,
                          height: `${badgePx}px`,
                          transform: "translate(-50%, -50%)",
                          borderColor: slice.color,
                          boxShadow: isHovered || isSelected ? `0 0 16px ${slice.color}80` : "0 4px 12px rgba(0,0,0,0.5)",
                        }}
                        onMouseEnter={() => setHoveredTicker(slice.ticker)}
                        onMouseLeave={() => setHoveredTicker(null)}
                        onClick={() => {
                          if (!slice.isOther) {
                            onSelectTicker(selectedTicker === slice.ticker ? null : slice.ticker);
                          }
                        }}
                        className="absolute z-10 flex items-center justify-center rounded-full bg-[#0c0f17] border-2 cursor-pointer transition-all hover:scale-125 active:scale-95"
                      >
                        {!slice.isOther ? (
                          <div
                            className="rounded-full overflow-hidden flex items-center justify-center shrink-0 pointer-events-none [&>div]:!w-full [&>div]:!h-full [&>div]:!p-0.5"
                            style={{ width: `${innerPx}px`, height: `${innerPx}px` }}
                          >
                            <CompanyLogo ticker={slice.ticker} size={logoSize} />
                          </div>
                        ) : (
                          <div
                            className="rounded-full shrink-0"
                            style={{
                              width: `${Math.round(innerPx * 0.75)}px`,
                              height: `${Math.round(innerPx * 0.75)}px`,
                              backgroundColor: slice.color,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Center of Donut in Modal */}
                  <div
                    onClick={() => {
                      setCenterMode((prev) =>
                        prev === "mktValue" ? "today" : prev === "today" ? "total" : "mktValue"
                      );
                    }}
                    className="absolute inset-0 m-auto w-[190px] h-[190px] rounded-full bg-[#0b0e16] border border-slate-800 shadow-2xl flex flex-col items-center justify-center cursor-pointer hover:border-slate-700 transition-all z-20"
                  >
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      {centerDisplay.label}
                    </span>
                    <span
                      className={`text-3xl font-mono font-black mt-1 ${
                        centerDisplay.isSlice
                          ? "text-white"
                          : centerDisplay.isPositive
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {centerDisplay.value}
                    </span>
                    <span className="text-xs font-bold font-mono text-emerald-400 mt-1">
                      {centerDisplay.pct}
                    </span>
                  </div>
                </div>
              </div>

              {/* Positions List in Modal */}
              <div className="lg:col-span-5 flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
                {slices.map((pos, idx) => {
                  const isSelected = selectedTicker === pos.ticker;
                  return (
                    <div
                      key={`modal-list-${pos.ticker}-${idx}`}
                      onClick={() => {
                        if (!pos.isOther) {
                          onSelectTicker(selectedTicker === pos.ticker ? null : pos.ticker);
                        }
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-slate-800 border-emerald-500 shadow-md"
                          : "bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: pos.color }}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-white font-mono uppercase truncate">
                            {pos.ticker}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate">
                            {pos.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 pl-2">
                        <span className="text-xs font-extrabold font-mono text-white">
                          {pos.weight.toFixed(1)}%
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {showPortfolioTotal ? formatCurrency(pos.mktValue) : "••••••"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
              <span>
                {language === "ES" ? "Total del Portafolio:" : "Portfolio Total:"}{" "}
                <strong className="text-white font-mono">
                  {showPortfolioTotal ? formatCurrency(totalValue) : "••••••"}
                </strong>
              </span>
              <button
                onClick={() => setIsExpanded(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                {language === "ES" ? "Cerrar" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
