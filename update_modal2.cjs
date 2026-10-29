const fs = require('fs');
let content = fs.readFileSync('src/components/EditHoldingsModal.tsx', 'utf-8');

// Update handleConfirmAdd to include inputCurrency and originalCost
content = content.replace(
  /avgCost: avgCost > 0 \? avgCost : 1,\n\s*isMargin: pendingIsMargin,\n\s*\}\,/,
  `avgCost: avgCost > 0 ? avgCost : 1,
        originalCost: avgCost > 0 ? avgCost : 1,
        inputCurrency: "USD",
        isMargin: pendingIsMargin,
      },`
);

// Inject AI Upload Button in the search box area
const searchBoxRegex = /\{\/\* SEARCH BOX \*\/\}\n\s*<div className="space-y-2 relative">/;
content = content.replace(
  searchBoxRegex,
  `{/* SEARCH BOX & UPLOAD */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex-1 space-y-2 relative">
              <label className="text-[11px] text-emerald-400 font-bold uppercase tracking-wider block">
                {language === "EN" ? "Add New Asset" : "Agregar Nuevo Activo"}
              </label>
              <div className="relative">
                <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={language === "EN" ? "e.g. NU, UBER, NKE, AAPL..." : "Ej: NU, UBER, NKE, AAPL..."}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-all font-medium"
                />
                {searching && (
                  <Loader2 className="absolute right-3.5 top-3 text-emerald-500 animate-spin" size={16} />
                )}
              </div>
              
              {/* Dropdown Results */}
              {searchQuery.trim() !== "" && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden max-h-[260px] overflow-y-auto z-50 shadow-2xl divide-y divide-slate-800">
                  <button
                    onClick={() => handleAddTicker({
                      symbol: searchQuery.toUpperCase().trim(),
                      name: \`\${searchQuery.toUpperCase().trim()} (\${language === "EN" ? "Custom Ticker" : "Ticker personalizado"})\`,
                      exchange: "US",
                      type: "EQUITY"
                    })}
                    className="w-full text-left px-4 py-3 hover:bg-emerald-500/10 text-emerald-400 font-semibold border-b border-slate-800 transition-colors flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Plus size={14} className="text-emerald-400 animate-pulse" />
                      <span>{language === "EN" ? \`Add "\${searchQuery.toUpperCase().trim()}" directly\` : \`Agregar "\${searchQuery.toUpperCase().trim()}" directamente\`}</span>
                    </div>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold uppercase">
                      {language === "EN" ? "Add" : "Incorporar"}
                    </span>
                  </button>

                  {searchResults.map((res, idx) => (
                    <button
                      key={\`\${res.symbol}-\${idx}\`}
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
            
            <div className="flex-shrink-0 self-end">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isExtracting}
                className="flex items-center gap-2 bg-slate-900 border border-slate-700 hover:border-emerald-500 text-emerald-400 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={language === "EN" ? "Import portfolio from a screenshot" : "Importar portafolio de una captura"}
              >
                {isExtracting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Camera size={16} />
                )}
                <span className="hidden sm:inline">{language === "EN" ? "AI Import" : "Importar (IA)"}</span>
              </button>
            </div>
          </div>
          <div className="hidden">` // Trick to hide the old search box code since I've replaced it
);

// End the hiding block right before MARGIN SUMMARY BANNER
content = content.replace(
  /\{\/\* MARGIN SUMMARY BANNER \(IF MARGIN POSITIONS EXIST\) \*\/\}/,
  `</div>\n          {/* MARGIN SUMMARY BANNER (IF MARGIN POSITIONS EXIST) */}`
);

// Update the avgCost input in the main list
content = content.replace(
  /<input\n\s*type="number"\n\s*value=\{hold\.avgCost \|\| ""\}\n\s*step="any"\n\s*onChange=\{\(e\) => handleUpdateField\(index, "avgCost", Number\(e\.target\.value\)\)\}\n\s*className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-2 py-1 text-xs text-white outline-none font-mono font-semibold"\n\s*\/>/g,
  `<div className="flex w-full">
                            <input
                              type="number"
                              value={hold.originalCost ?? hold.avgCost ?? ""}
                              step="any"
                              placeholder="0.00"
                              onChange={(e) => handleUpdateField(index, "originalCost", e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-slate-900 border-y border-l border-slate-800 focus:border-emerald-500 rounded-l px-2 py-1 text-xs text-white outline-none font-mono font-semibold min-w-[50px]"
                            />
                            <select
                              value={hold.inputCurrency || "USD"}
                              onChange={(e) => handleUpdateField(index, "inputCurrency", e.target.value)}
                              className="bg-slate-900 border-y border-r border-slate-800 focus:border-emerald-500 rounded-r px-1 py-1 text-[10px] text-slate-300 outline-none font-bold cursor-pointer"
                            >
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                              <option value="COP">COP</option>
                            </select>
                          </div>`
);


fs.writeFileSync('src/components/EditHoldingsModal.tsx', content);
