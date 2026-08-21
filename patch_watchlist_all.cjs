const fs = require('fs');
let code = fs.readFileSync('src/components/WatchlistDashboard.tsx', 'utf8');

// 1. Add 'health' to viewMode type
code = code.replace(
  'const [viewMode, setViewMode] = useState<"prices" | "valuation">("prices");',
  'const [viewMode, setViewMode] = useState<"prices" | "valuation" | "health">("prices");'
);

// 2. Add HealthMetricsTooltip to imports
code = code.replace(
  'import { getTickerSector, CompanyLogo } from "./HoldingsTable";',
  'import { getTickerSector, CompanyLogo, HealthMetricsTooltip } from "./HoldingsTable";'
);
// 3. Add HeartPulse to lucide-react imports
code = code.replace(
  'import { Plus, Trash2, Search, TrendingUp, TrendingDown, Eye, AlertCircle, RefreshCw, DollarSign, Scale, BarChart3 } from "lucide-react";',
  'import { Plus, Trash2, Search, TrendingUp, TrendingDown, Eye, AlertCircle, RefreshCw, DollarSign, Scale, BarChart3, HeartPulse } from "lucide-react";'
);

// 4. Update scoresMap to scoredRowsMap to store full row objects instead of just numbers
const fullScoresMapReplaceRegex = /const scoresMap = useMemo\(\(\) => \{[\s\S]*?\}, \[items, portfolioPositions\]\);/;

const newScoresMap = `  const scoredRowsMap = useMemo(() => {
    const fullMap: Record<string, any> = {};
    if (items.length === 0) return fullMap;
    
    const seenTickers = new Set<string>();
    const rawFeaturesList: any[] = [];

    items.forEach((item) => {
      const sym = item.symbol.toUpperCase();
      if (!seenTickers.has(sym)) {
        seenTickers.add(sym);
        const sector = getTickerSector(sym, false);
        const raw = { ...getRawFeatures(sym, item.name, sector) };
        if (item.pe !== undefined && item.pe !== null) raw.trailing_pe = item.pe;
        if (item.fwdPe !== undefined && item.fwdPe !== null) raw.forward_pe = item.fwdPe;
        rawFeaturesList.push(raw);
      }
    });

    const stockPositions = portfolioPositions.filter((p) => !p.isCash);
    stockPositions.forEach((pos) => {
      const sym = pos.ticker.toUpperCase();
      if (!seenTickers.has(sym)) {
        seenTickers.add(sym);
        const sector = getTickerSector(sym, false);
        const raw = { ...getRawFeatures(sym, pos.name, sector) };
        if (pos.pe !== undefined && pos.pe !== null) raw.trailing_pe = pos.pe;
        if (pos.fwdPe !== undefined && pos.fwdPe !== null) raw.forward_pe = pos.fwdPe;
        if (pos.evEbitda !== undefined && pos.evEbitda !== null) raw.ev_ebitda = pos.evEbitda;
        rawFeaturesList.push(raw);
      }
    });
    
    const scoredList = buildScores(rawFeaturesList, "zscore");
    scoredList.forEach((row) => {
      fullMap[row.symbol.toUpperCase()] = row;
    });
    
    return fullMap;
  }, [items, portfolioPositions]);

  const getScoreColorClass = (score: number | null) => {
    if (score === null) return "text-slate-500";
    if (score >= 75) return "text-emerald-400";
    if (score >= 50) return "text-blue-400";
    if (score >= 35) return "text-amber-400";
    return "text-rose-400";
  };
`;

code = code.replace(fullScoresMapReplaceRegex, newScoresMap);

// The toggle
const targetToggle = `<button
                  onClick={() => setViewMode("valuation")}
                  className={\`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] tracking-wider \${
                    viewMode === "valuation"
                      ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                      : "text-slate-500 hover:text-slate-300"
                  }\`}
                >
                  <Scale size={11} />
                  {t.tabValuation}
                </button>`;

const replacementToggle = `<button
                  onClick={() => setViewMode("valuation")}
                  className={\`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] tracking-wider \${
                    viewMode === "valuation"
                      ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                      : "text-slate-500 hover:text-slate-300"
                  }\`}
                >
                  <Scale size={11} />
                  {t.tabValuation}
                </button>
                <button
                  onClick={() => setViewMode("health")}
                  className={\`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] tracking-wider \${
                    viewMode === "health"
                      ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                      : "text-slate-500 hover:text-slate-300"
                  }\`}
                >
                  <HeartPulse size={11} />
                  {language === "EN" ? "Health" : "Salud"}
                </button>`;

code = code.replace(targetToggle, replacementToggle);

// Table headers
const targetHeaders = `{viewMode === "prices" ? (
                      <>
                        <th className="py-4 px-6 text-right">{t.colPrice}</th>
                        <th className="py-4 px-6 text-right">{t.colChg}</th>
                        <th className="py-4 px-6 text-right">{t.colChgPct}</th>
                      </>
                    ) : (
                      <>
                        <th className="py-4 px-6 text-right">{t.colFwdPE}</th>
                        <th className="py-4 px-6 text-right">{t.colPE}</th>
                        <th className="py-4 px-6 text-right">{t.colPEG}</th>
                        <th className="py-4 px-6 text-right text-emerald-400">{language === "ES" ? "Div. / Acción" : "Div. / Share"}</th>
                      </>
                    )}`;

const replacementHeaders = `{viewMode === "prices" ? (
                      <>
                        <th className="py-4 px-6 text-right">{t.colPrice}</th>
                        <th className="py-4 px-6 text-right">{t.colChg}</th>
                        <th className="py-4 px-6 text-right">{t.colChgPct}</th>
                      </>
                    ) : viewMode === "valuation" ? (
                      <>
                        <th className="py-4 px-6 text-right">{t.colFwdPE}</th>
                        <th className="py-4 px-6 text-right">{t.colPE}</th>
                        <th className="py-4 px-6 text-right">{t.colPEG}</th>
                        <th className="py-4 px-6 text-right text-emerald-400">{language === "ES" ? "Div. / Acción" : "Div. / Share"}</th>
                      </>
                    ) : (
                      <>
                        <th className="py-4 px-3 md:px-6 text-center w-24">{language === "ES" ? "Crecimiento" : "Growth"}</th>
                        <th className="py-4 px-3 md:px-6 text-center w-24">{language === "ES" ? "Calidad" : "Quality"}</th>
                        <th className="py-4 px-3 md:px-6 text-center w-24">{language === "ES" ? "Estabilidad" : "Stability"}</th>
                        <th className="py-4 px-3 md:px-6 text-center w-24">{language === "ES" ? "Valoración" : "Valuation"}</th>
                      </>
                    )}`;

code = code.replace(targetHeaders, replacementHeaders);

// Table rows
const targetRows = `                    const score = scoresMap[item.symbol.toUpperCase()] ?? null;
                    const sector = getTickerSector(item.symbol, false);
                    const raw = getRawFeatures(item.symbol, item.name, sector);
                    
                    const pe = item.pe !== undefined && item.pe !== null ? item.pe : raw.trailing_pe;
                    const peFwd = item.fwdPe !== undefined && item.fwdPe !== null ? item.fwdPe : raw.forward_pe;
                    const peg = item.peg !== undefined && item.peg !== null ? item.peg : (pe / Math.max(0.1, raw.eps_cagr));

                    return (
                      <tr key={idx} className="hover:bg-slate-900/30 transition-colors group">
                        <td className="py-4 px-6 font-bold text-white tracking-wider text-sm">
                          <div className="flex items-center gap-2.5">
                            <CompanyLogo ticker={item.symbol} name={item.name} size="sm" />
                            <span>{item.symbol}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-400 font-sans">{item.name}</td>
                        <td className="py-4 px-6 text-center">
                          <span className={\`inline-flex items-center justify-center px-3 py-1 rounded-xl text-xs font-black border font-mono \${getScoreBgClass(score)}\`}>
                            {score !== null ? \`\${score.toFixed(1)}\` : "—"}
                          </span>
                        </td>
                        {viewMode === "prices" ? (
                          <>
                            <td className="py-4 px-6 text-right font-bold text-slate-200">
                              \${item.price.toFixed(2)}
                            </td>
                            <td className={\`py-4 px-6 text-right font-bold \${isPositive ? "text-emerald-400" : "text-rose-400"}\`}>
                              {isPositive ? "+" : ""}{item.change.toFixed(2)}
                            </td>
                            <td className={\`py-4 px-6 text-right font-bold \${isPositive ? "text-emerald-400" : "text-rose-400"}\`}>
                              {isPositive ? "+" : ""}{item.changePct.toFixed(2)}%
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-4 px-6 text-right font-bold text-slate-200">
                              {peFwd !== undefined && peFwd !== null ? \`\${peFwd.toFixed(1)}x\` : "—"}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-slate-200">
                              {pe !== undefined && pe !== null ? \`\${pe.toFixed(1)}x\` : "—"}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-[#bbf246]">
                              {peg !== undefined && peg !== null ? peg.toFixed(2) : "—"}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-emerald-400">
                              {(() => {
                                const known: Record<string, number> = { MSFT: 3.30, META: 2.00, NVDA: 0.40, AVGO: 21.20, GOOGL: 0.80, GOOG: 0.80, AAPL: 1.00, AMZN: 0, TSLA: 0, KO: 1.94, WMT: 0.83 };
                                const rate = known[item.symbol.toUpperCase()];
                                if (rate === undefined) return "—";
                                return rate === 0 ? "$0.00" : \`$\${rate.toFixed(2)}\`;
                              })()}
                            </td>
                          </>
                        )}`;

const replacementRows = `                    const scoredRow = scoredRowsMap[item.symbol.toUpperCase()];
                    const score = scoredRow?.scores?.balanced ?? null;
                    const sector = getTickerSector(item.symbol, false);
                    const raw = getRawFeatures(item.symbol, item.name, sector);
                    
                    const pe = item.pe !== undefined && item.pe !== null ? item.pe : raw.trailing_pe;
                    const peFwd = item.fwdPe !== undefined && item.fwdPe !== null ? item.fwdPe : raw.forward_pe;
                    const peg = item.peg !== undefined && item.peg !== null ? item.peg : (pe / Math.max(0.1, raw.eps_cagr));

                    const tooltipPlacement = idx < items.length / 2 ? "bottom" : "top";

                    return (
                      <tr key={idx} className="hover:bg-slate-900/30 transition-colors group">
                        <td className="py-4 px-6 font-bold text-white tracking-wider text-sm">
                          <div className="flex items-center gap-2.5">
                            <CompanyLogo ticker={item.symbol} name={item.name} size="sm" />
                            <span>{item.symbol}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-400 font-sans">{item.name}</td>
                        <td className="py-4 px-6 text-center">
                          <span className={\`inline-flex items-center justify-center px-3 py-1 rounded-xl text-xs font-black border font-mono \${getScoreBgClass(score)}\`}>
                            {score !== null ? \`\${score.toFixed(1)}\` : "—"}
                          </span>
                        </td>
                        {viewMode === "prices" ? (
                          <>
                            <td className="py-4 px-6 text-right font-bold text-slate-200">
                              \${item.price.toFixed(2)}
                            </td>
                            <td className={\`py-4 px-6 text-right font-bold \${isPositive ? "text-emerald-400" : "text-rose-400"}\`}>
                              {isPositive ? "+" : ""}{item.change.toFixed(2)}
                            </td>
                            <td className={\`py-4 px-6 text-right font-bold \${isPositive ? "text-emerald-400" : "text-rose-400"}\`}>
                              {isPositive ? "+" : ""}{item.changePct.toFixed(2)}%
                            </td>
                          </>
                        ) : viewMode === "valuation" ? (
                          <>
                            <td className="py-4 px-6 text-right font-bold text-slate-200">
                              {peFwd !== undefined && peFwd !== null ? \`\${peFwd.toFixed(1)}x\` : "—"}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-slate-200">
                              {pe !== undefined && pe !== null ? \`\${pe.toFixed(1)}x\` : "—"}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-[#bbf246]">
                              {peg !== undefined && peg !== null ? peg.toFixed(2) : "—"}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-emerald-400">
                              {(() => {
                                const known: Record<string, number> = { MSFT: 3.30, META: 2.00, NVDA: 0.40, AVGO: 21.20, GOOGL: 0.80, GOOG: 0.80, AAPL: 1.00, AMZN: 0, TSLA: 0, KO: 1.94, WMT: 0.83 };
                                const rate = known[item.symbol.toUpperCase()];
                                if (rate === undefined) return "—";
                                return rate === 0 ? "$0.00" : \`$\${rate.toFixed(2)}\`;
                              })()}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 px-3 md:px-6 text-center group relative cursor-help">
                              <HealthMetricsTooltip 
                                title={language === "ES" ? "Crecimiento" : "Growth"}
                                metrics={[
                                  {key: "revenue_cagr", label: "Revenue Growth", suffix: "%"},
                                  {key: "eps_cagr", label: "EPS Growth", suffix: "%"},
                                  {key: "fcf_cagr", label: "FCF Growth", suffix: "%"},
                                ]}
                                raw={scoredRow?.raw}
                                language={language}
                                placement={tooltipPlacement}
                              />
                              <div className="flex flex-col items-center">
                                <span className={\`text-xs font-bold \${getScoreColorClass(scoredRow?.factors?.growth ?? null)}\`}>
                                  {typeof scoredRow?.factors?.growth === "number" ? scoredRow.factors.growth.toFixed(0) : "—"}
                                </span>
                                <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                  <div 
                                    className="bg-emerald-500 h-full rounded-full" 
                                    style={{ width: \`\${scoredRow?.factors?.growth ?? 0}%\` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 md:px-6 text-center group relative cursor-help">
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
                                <span className={\`text-xs font-bold \${getScoreColorClass(scoredRow?.factors?.quality ?? null)}\`}>
                                  {typeof scoredRow?.factors?.quality === "number" ? scoredRow.factors.quality.toFixed(0) : "—"}
                                </span>
                                <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                  <div 
                                    className="bg-blue-500 h-full rounded-full" 
                                    style={{ width: \`\${scoredRow?.factors?.quality ?? 0}%\` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 md:px-6 text-center group relative cursor-help">
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
                                <span className={\`text-xs font-bold \${getScoreColorClass(scoredRow?.factors?.stability ?? null)}\`}>
                                  {typeof scoredRow?.factors?.stability === "number" ? scoredRow.factors.stability.toFixed(0) : "—"}
                                </span>
                                <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                  <div 
                                    className="bg-amber-500 h-full rounded-full" 
                                    style={{ width: \`\${scoredRow?.factors?.stability ?? 0}%\` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 md:px-6 text-center group relative cursor-help">
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
                                <span className={\`text-xs font-bold \${getScoreColorClass(scoredRow?.factors?.valuation ?? null)}\`}>
                                  {typeof scoredRow?.factors?.valuation === "number" ? scoredRow.factors.valuation.toFixed(0) : "—"}
                                </span>
                                <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden mt-1">
                                  <div 
                                    className="bg-purple-500 h-full rounded-full" 
                                    style={{ width: \`\${scoredRow?.factors?.valuation ?? 0}%\` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </>
                        )}`;

code = code.replace(targetRows, replacementRows);

fs.writeFileSync('src/components/WatchlistDashboard.tsx', code);
console.log("patched WatchlistDashboard fully");
