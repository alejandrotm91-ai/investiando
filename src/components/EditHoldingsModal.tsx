import React, { useState, useEffect } from "react";
import { Holding, Position, SearchResult } from "../types";
import { X, Search, Trash2, Plus, Loader2, DollarSign, RefreshCw, ShieldAlert, Percent } from "lucide-react";

interface EditHoldingsModalProps {
  holdings: Holding[];
  positions?: Position[];
  onClose: () => void;
  onSave: (newHoldings: Holding[]) => void;
  language?: "EN" | "ES";
}

export default function EditHoldingsModal({ holdings, positions, onClose, onSave, language = "EN" }: EditHoldingsModalProps) {
  const [localHoldings, setLocalHoldings] = useState<Holding[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [cashAmount, setCashAmount] = useState<number>(14000);

  // Popup states for asking shares and avgCost on addition
  const [pendingAdd, setPendingAdd] = useState<{ symbol: string; name: string } | null>(null);
  const [pendingShares, setPendingShares] = useState<number | "">("");
  const [pendingAvgCost, setPendingAvgCost] = useState<number | "">("");
  const [pendingIsMargin, setPendingIsMargin] = useState<boolean>(false);

  // Helper to calculate or lookup position market value
  const getMktValue = (h: Holding): number => {
    if (h.isCash || h.ticker.toUpperCase() === "CASH") {
      return h.shares;
    }
    const pos = positions?.find((p) => p.ticker.toUpperCase() === h.ticker.toUpperCase());
    if (pos && typeof pos.mktValue === "number" && !isNaN(pos.mktValue) && pos.mktValue > 0) {
      return pos.mktValue;
    }
    if (pos && typeof pos.price === "number" && !isNaN(pos.price) && pos.price > 0) {
      return pos.price * h.shares;
    }
    return (h.avgCost || 0) * (h.shares || 0);
  };

  // Initialize and sort positions by Market Value descending
  useEffect(() => {
    const stocksOnly = holdings.filter((h) => h.ticker.toUpperCase() !== "CASH");
    const cashPos = holdings.find((h) => h.ticker.toUpperCase() === "CASH");
    
    const stocksCopy: Holding[] = JSON.parse(JSON.stringify(stocksOnly));
    stocksCopy.sort((a, b) => getMktValue(b) - getMktValue(a));

    setLocalHoldings(stocksCopy);
    if (cashPos) {
      setCashAmount(cashPos.shares);
    }
  }, [holdings, positions]);

  // Debounced Search of tickers
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleUpdateField = (index: number, field: keyof Holding, value: any) => {
    setLocalHoldings((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      return copy;
    });
  };

  const handleToggleMargin = (index: number) => {
    setLocalHoldings((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        isMargin: !copy[index].isMargin,
      };
      return copy;
    });
  };

  const handleRemoveHolding = (index: number) => {
    setLocalHoldings((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddTicker = (result: SearchResult) => {
    const uppercaseTicker = result.symbol.toUpperCase();
    
    // Check if already in list
    if (localHoldings.some((h) => h.ticker.toUpperCase() === uppercaseTicker)) {
      setSearchQuery("");
      setSearchResults([]);
      return;
    }

    // Instead of adding immediately, open the popup
    setPendingAdd({
      symbol: uppercaseTicker,
      name: result.name || uppercaseTicker
    });
    setPendingShares("");
    setPendingAvgCost("");
    setPendingIsMargin(false);
    
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleConfirmAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pendingAdd) return;

    const shares = Number(pendingShares) || 0;
    const avgCost = Number(pendingAvgCost) || 0;

    setLocalHoldings((prev) => [
      ...prev,
      {
        ticker: pendingAdd.symbol,
        shares: shares > 0 ? shares : 1,
        avgCost: avgCost > 0 ? avgCost : 1,
        isMargin: pendingIsMargin,
      },
    ]);

    setPendingAdd(null);
    setPendingShares("");
    setPendingAvgCost("");
    setPendingIsMargin(false);
  };

  const handleSaveAndSubmit = () => {
    // Reconstruct list with cash included
    const finalHoldings: Holding[] = [
      ...localHoldings.map((h) => ({
        ticker: h.ticker.toUpperCase(),
        shares: Number(h.shares) || 0,
        avgCost: Number(h.avgCost) || 0,
        isMargin: Boolean(h.isMargin),
      })),
      {
        ticker: "CASH",
        shares: Number(cashAmount) || 0,
        avgCost: 1,
        isCash: true,
      },
    ];

    onSave(finalHoldings);
  };

  // Margin metrics calculations
  const marginHoldings = localHoldings.filter((h) => h.isMargin);
  const marginCostBasis = marginHoldings.reduce((sum, h) => sum + ((Number(h.shares) || 0) * (Number(h.avgCost) || 0)), 0);
  const marginAnnualCost = marginCostBasis * 0.0625;
  const marginMonthlyCost = marginCostBasis * (Math.pow(1 + 0.0625, 1 / 12) - 1);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl h-[92vh] max-h-[96vh] flex flex-col justify-between overflow-hidden shadow-2xl">
        
        {/* HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-905">
          <div>
            <h3 className="text-base font-display font-bold text-white uppercase tracking-wider">
              {language === "EN" ? "Edit Positions & Portfolio" : "Editar Posiciones & Portafolio"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {language === "EN" 
                ? "Manage your stocks, cash, and margin positions. Margin carries a 6.25% effective annual rate charged monthly." 
                : "Administra tus acciones, efectivo y posiciones con margen. El margen tiene un costo de 6.25% E.A. cobrado mensualmente."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY (SCROLLABLE) */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* SEARCH BOX */}
          <div className="space-y-2 relative">
            <label className="text-[11px] text-emerald-400 font-bold uppercase tracking-wider block">
              {language === "EN" ? "Add New Asset (Search Yahoo Finance)" : "Agregar Nuevo Activo (Buscar en Yahoo Finance)"}
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === "EN" ? "e.g. NU, UBER, NKE, AAPL, Tesla, Microsoft..." : "Ej: NU, UBER, NKE, AAPL, Tesla, Microsoft..."}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-all font-medium"
              />
              {searching && (
                <Loader2 className="absolute right-3.5 top-3 text-emerald-500 animate-spin" size={16} />
              )}
            </div>

            {/* Dropdown Results */}
            {searchQuery.trim() !== "" && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden max-h-[260px] overflow-y-auto z-50 shadow-2xl divide-y divide-slate-800">
                
                {/* Option to add custom ticker directly */}
                <button
                  onClick={() => handleAddTicker({
                    symbol: searchQuery.toUpperCase().trim(),
                    name: `${searchQuery.toUpperCase().trim()} (${language === "EN" ? "Custom Ticker" : "Ticker personalizado"})`,
                    exchange: "US",
                    type: "EQUITY"
                  })}
                  className="w-full text-left px-4 py-3 hover:bg-emerald-500/10 text-emerald-400 font-semibold border-b border-slate-800 transition-colors flex items-center justify-between text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Plus size={14} className="text-emerald-400 animate-pulse" />
                    <span>{language === "EN" ? `Add "${searchQuery.toUpperCase().trim()}" directly` : `Agregar "${searchQuery.toUpperCase().trim()}" directamente`}</span>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold uppercase">
                    {language === "EN" ? "Add" : "Incorporar"}
                  </span>
                </button>

                {searchResults.map((res, idx) => (
                  <button
                    key={`${res.symbol}-${idx}`}
                    onClick={() => handleAddTicker(res)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-800 transition-colors flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <span className="font-mono font-bold text-white text-sm block">{res.symbol}</span>
                      <span className="text-slate-400 truncate max-w-[280px] block mt-0.5">{res.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold uppercase text-[10px]">
                        {res.exchange}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* MARGIN SUMMARY BANNER (IF MARGIN POSITIONS EXIST) */}
          {marginHoldings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <Percent size={18} />
                </div>
                <div>
                  <span className="text-xs font-bold text-amber-200 block uppercase tracking-wider">
                    {language === "EN" ? "Margin Leverage Active (6.25% E.A.)" : "Apalancamiento en Margen Activo (6.25% E.A.)"}
                  </span>
                  <span className="text-[11px] text-amber-300/80">
                    {marginHoldings.length} {marginHoldings.length === 1 ? (language === "EN" ? "margin position" : "posición con margen") : (language === "EN" ? "margin positions" : "posiciones con margen")} • {language === "EN" ? "Principal:" : "Costo financiado:"}{" "}
                    <strong className="font-mono text-white">${marginCostBasis.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-auto text-right">
                <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-amber-500/20">
                  <span className="text-[9px] text-slate-400 uppercase font-semibold block">
                    {language === "EN" ? "Est. Monthly Cost" : "Costo Mensual Est."}
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    ~${marginMonthlyCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m
                  </span>
                </div>
                <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-amber-500/20 hidden sm:block">
                  <span className="text-[9px] text-slate-400 uppercase font-semibold block">
                    {language === "EN" ? "Annual Cost (6.25%)" : "Costo Anual (6.25%)"}
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-300">
                    ${marginAnnualCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/y
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* POSITIONS LIST */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
              <h4 className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                {language === "EN" ? "Existing Stock Positions" : "Posiciones de Acciones Existentes"}
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1 text-slate-400 hover:text-white text-xs font-semibold hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                >
                  {language === "EN" ? "Cancel" : "Cancelar"}
                </button>
                <button
                  onClick={handleSaveAndSubmit}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-emerald-500/10 cursor-pointer flex items-center gap-1.5"
                >
                  {language === "EN" ? "Save Changes" : "Guardar Cambios"}
                </button>
              </div>
            </div>

            {localHoldings.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 text-center">
                {language === "EN" ? "No stocks in your portfolio. Search above to add one." : "No tienes acciones en la lista. Busca una arriba para agregarla."}
              </p>
            ) : (
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
                {localHoldings.map((hold, index) => {
                  const isMarginPos = Boolean(hold.isMargin);
                  const posCost = (Number(hold.shares) || 0) * (Number(hold.avgCost) || 0);
                  const posMonthlyInterest = posCost * (Math.pow(1 + 0.0625, 1 / 12) - 1);

                  return (
                    <div
                      key={`${hold.ticker}-${index}`}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 px-3.5 transition-colors ${
                        isMarginPos ? "bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-500" : "hover:bg-slate-800/10"
                      }`}
                    >
                      <div className="flex items-center justify-between sm:justify-start gap-2.5 flex-shrink-0 min-w-[120px]">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-bold text-white text-sm tracking-wide block">
                              {hold.ticker}
                            </span>
                            {isMarginPos && (
                              <span 
                                title={language === "EN" ? "Margin Position (6.25% effective annual rate charged monthly)" : "Posición con Margen (6.25% efectivo anual cobrado mensualmente)"}
                                className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold uppercase tracking-wider"
                              >
                                MARGIN
                              </span>
                            )}
                          </div>
                          {(() => {
                            const val = getMktValue(hold);
                            return val > 0 ? (
                              <span className="text-[10px] font-mono text-emerald-400 font-medium block">
                                ${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : null;
                          })()}
                        </div>

                        {/* Mobile remove button */}
                        <button
                          onClick={() => handleRemoveHolding(index)}
                          className="sm:hidden p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                          title={language === "EN" ? "Remove position" : "Eliminar posición"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 items-center">
                        {/* Shares */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">
                            {language === "EN" ? "Qty:" : "Cant:"}
                          </span>
                          <input
                            type="number"
                            value={hold.shares || ""}
                            step="any"
                            onChange={(e) => handleUpdateField(index, "shares", Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-2 py-1 text-xs text-white outline-none font-mono font-semibold"
                          />
                        </div>
                        
                        {/* Avg Cost */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">
                            {language === "EN" ? "Cost:" : "Costo:"}
                          </span>
                          <input
                            type="number"
                            value={hold.avgCost || ""}
                            step="any"
                            onChange={(e) => handleUpdateField(index, "avgCost", Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-2 py-1 text-xs text-white outline-none font-mono font-semibold"
                          />
                        </div>

                        {/* Margin Checkbox toggle */}
                        <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-center bg-slate-900/60 border border-slate-800/80 rounded-lg px-2.5 py-1">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isMarginPos}
                              onChange={() => handleToggleMargin(index)}
                              className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/20 cursor-pointer accent-amber-500"
                            />
                            <span className={`text-[11px] font-bold tracking-tight transition-colors ${
                              isMarginPos ? "text-amber-400" : "text-slate-400"
                            }`}>
                              {language === "EN" ? "Margin" : "Margen"}
                            </span>
                          </label>
                          {isMarginPos && (
                            <span 
                              title={language === "EN" ? `Financing cost: ~$${posMonthlyInterest.toFixed(2)}/mo (6.25% E.A.)` : `Costo financiamiento: ~$${posMonthlyInterest.toFixed(2)}/mes (6.25% E.A.)`}
                              className="text-[9px] font-mono text-amber-300/90 ml-1.5 font-semibold"
                            >
                              ~${posMonthlyInterest.toFixed(1)}/m
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Desktop Trash Button */}
                      <button
                        onClick={() => handleRemoveHolding(index)}
                        className="hidden sm:block p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer flex-shrink-0"
                        title={language === "EN" ? "Remove position" : "Eliminar posición"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ADD STOCK DETAILS SUB-MODAL POPUP */}
      {pendingAdd && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <form
            onSubmit={handleConfirmAdd}
            className="bg-slate-900 border border-emerald-500/25 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative overflow-hidden"
          >
            {/* Ambient emerald pulse */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-pulse" />
            
            <h4 className="text-sm font-display font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2">
              <span className="p-1 bg-emerald-500/10 text-emerald-400 rounded-lg"><Plus size={14} /></span>
              {language === "EN" ? `Configure Asset: ${pendingAdd.symbol}` : `Configurar Activo: ${pendingAdd.symbol}`}
            </h4>
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              {language === "EN"
                ? <>Enter the number of shares, average cost, and specify if this position is purchased on margin for <strong className="text-emerald-400">{pendingAdd.symbol}</strong>.</>
                : <>Introduce la cantidad de acciones, costo promedio e indica si esta posición es de margen para <strong className="text-emerald-400">{pendingAdd.symbol}</strong>.</>}
            </p>

            <div className="space-y-3.5 mb-5">
              {/* Shares Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase block">
                  {language === "EN" ? "Number of Shares" : "Cantidad de Acciones"}
                </label>
                <input
                  type="number"
                  required
                  placeholder={language === "EN" ? "e.g. 10, 25.5" : "Ej: 10, 25.5"}
                  value={pendingShares}
                  step="any"
                  min="0.0001"
                  onChange={(e) => setPendingShares(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-sm text-white font-mono outline-none transition-all"
                />
              </div>

              {/* Avg Cost Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase block">
                  {language === "EN" ? "Average Purchase Price ($)" : "Precio Promedio de Compra ($)"}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2 text-slate-500 font-mono text-sm">$</span>
                  <input
                    type="number"
                    required
                    placeholder={language === "EN" ? "e.g. 115.40" : "Ej: 115.40"}
                    value={pendingAvgCost}
                    step="any"
                    min="0.01"
                    onChange={(e) => setPendingAvgCost(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 pl-7 pr-3 text-sm text-white font-mono outline-none transition-all"
                  />
                </div>
              </div>

              {/* Margin Checkbox Option */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pendingIsMargin}
                    onChange={(e) => setPendingIsMargin(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/20 cursor-pointer accent-amber-500"
                  />
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>{language === "EN" ? "Margin Position" : "Posición de Margen"}</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-mono uppercase font-bold">
                      6.25% E.A.
                    </span>
                  </span>
                </label>
                <p className="text-[10px] text-slate-400 pl-6 leading-tight">
                  {language === "EN"
                    ? "Annual financing cost of 6.25% effective rate charged monthly (~0.51%/mo)."
                    : "Costo de financiamiento de 6.25% efectivo anual cobrado mensualmente (~0.51%/mes)."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPendingAdd(null);
                  setPendingShares("");
                  setPendingAvgCost("");
                  setPendingIsMargin(false);
                }}
                className="px-3.5 py-1.5 text-slate-400 hover:text-white text-xs font-semibold hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                {language === "EN" ? "Cancel" : "Cancelar"}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/10 cursor-pointer"
              >
                {language === "EN" ? "Add to Portfolio" : "Agregar a Cartera"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
