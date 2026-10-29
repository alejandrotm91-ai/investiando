const fs = require('fs');
let content = fs.readFileSync('src/components/EditHoldingsModal.tsx', 'utf-8');

// 1. Add pendingCurrency state
content = content.replace(
  /const \[pendingAvgCost, setPendingAvgCost\] = useState<number \| "">\(""\);/,
  `const [pendingAvgCost, setPendingAvgCost] = useState<number | "">("");
  const [pendingCurrency, setPendingCurrency] = useState<string>("USD");`
);

// 2. Reset it on open
content = content.replace(
  /setPendingAvgCost\(""\);\n\s*setPendingIsMargin\(false\);/,
  `setPendingAvgCost("");
    setPendingCurrency("USD");
    setPendingIsMargin(false);`
);

// 3. Reset it on close/cancel
content = content.replace(
  /setPendingAvgCost\(""\);\n\s*setPendingIsMargin\(false\);\n\s*\}\}\n\s*className="px-3\.5 py-1\.5/,
  `setPendingAvgCost("");
                  setPendingCurrency("USD");
                  setPendingIsMargin(false);
                }}
                className="px-3.5 py-1.5`
);

// 4. In handleConfirmAdd, use rate to get avgCost
content = content.replace(
  /const avgCost = Number\(pendingAvgCost\) \|\| 0;\n\n\s*setLocalHoldings\(\(prev\) => \[\n\s*\.\.\.prev,\n\s*\{\n\s*ticker: pendingAdd\.symbol,\n\s*shares: shares > 0 \? shares : 1,\n\s*avgCost: avgCost > 0 \? avgCost : 1,\n\s*originalCost: avgCost > 0 \? avgCost : 1,\n\s*inputCurrency: "USD",\n\s*isMargin: pendingIsMargin,\n\s*\},/,
  `const costInput = Number(pendingAvgCost) || 0;
    const rate = fxRates[pendingCurrency] || 1;
    const avgCostUSD = costInput * rate;

    setLocalHoldings((prev) => [
      ...prev,
      {
        ticker: pendingAdd.symbol,
        shares: shares > 0 ? shares : 1,
        avgCost: avgCostUSD > 0 ? avgCostUSD : 1,
        originalCost: costInput > 0 ? costInput : 1,
        inputCurrency: pendingCurrency,
        isMargin: pendingIsMargin,
      },`
);

// 5. Update the input in the submodal to have a select dropdown next to it
content = content.replace(
  /<div className="relative">\n\s*<span className="absolute left-3\.5 top-2 text-slate-500 font-mono text-sm">\$<\/span>\n\s*<input\n\s*type="number"\n\s*required\n\s*placeholder=\{language === "EN" \? "e\.g\. 150\.20" : "Ej: 150\.20"\}\n\s*value=\{pendingAvgCost\}\n\s*step="any"\n\s*min="0"\n\s*onChange=\{\(e\) => setPendingAvgCost\(e\.target\.value === "" \? "" : Number\(e\.target\.value\)\)\}\n\s*className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 pl-8 pr-3 text-sm text-white font-mono outline-none transition-all"\n\s*\/>\n\s*<\/div>/,
  `<div className="flex w-full">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-2 text-slate-500 font-mono text-sm">$</span>
                    <input
                      type="number"
                      required
                      placeholder={language === "EN" ? "e.g. 150.20" : "Ej: 150.20"}
                      value={pendingAvgCost}
                      step="any"
                      min="0"
                      onChange={(e) => setPendingAvgCost(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full bg-slate-950 border-y border-l border-slate-800 focus:border-emerald-500 rounded-l-xl py-2 pl-8 pr-3 text-sm text-white font-mono outline-none transition-all"
                    />
                  </div>
                  <select
                    value={pendingCurrency}
                    onChange={(e) => setPendingCurrency(e.target.value)}
                    className="bg-slate-900 border-y border-r border-slate-800 focus:border-emerald-500 rounded-r-xl px-2 py-2 text-xs text-slate-300 outline-none font-bold cursor-pointer"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="COP">COP</option>
                  </select>
                </div>`
);

fs.writeFileSync('src/components/EditHoldingsModal.tsx', content);
