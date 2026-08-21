const fs = require('fs');

const path = 'src/components/WatchlistDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add FileText import
content = content.replace(
  /HeartPulse } from "lucide-react";/,
  'HeartPulse, FileText } from "lucide-react";'
);

// 2. Add CompanyFinancials import
content = content.replace(
  /import { getTickerSector, CompanyLogo, HealthMetricsTooltip } from "\.\/HoldingsTable";/,
  'import { getTickerSector, CompanyLogo, HealthMetricsTooltip } from "./HoldingsTable";\nimport { CompanyFinancials } from "./CompanyFinancials";'
);

// 3. Add financials to viewMode
content = content.replace(
  /useState<"prices" \| "valuation" \| "health">/,
  'useState<"prices" | "valuation" | "health" | "financials">'
);

// 4. Add Financials to translation
content = content.replace(
  /tabValuation: "Valuation",/,
  'tabValuation: "Valuation",\n      tabFinancials: "Financials",'
);
content = content.replace(
  /tabValuation: "Valuación",/,
  'tabValuation: "Valuación",\n      tabFinancials: "Financieros",'
);

// 5. Update controls row text
content = content.replace(
  /\{viewMode === "prices" \? t\.tabPrices : t\.tabValuation\}/,
  '{viewMode === "prices" ? t.tabPrices : viewMode === "financials" ? t.tabFinancials : viewMode === "health" ? (language === "EN" ? "Health" : "Salud") : t.tabValuation}'
);

// 6. Add Financials toggle button
const healthToggleStr = `                <button
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

const financialsToggleStr = `                <button
                  onClick={() => setViewMode("financials")}
                  className={\`px-3.5 py-1.5 rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1.5 uppercase font-bold text-[10px] tracking-wider \${
                    viewMode === "financials"
                      ? "bg-gradient-to-r from-[#8da2f8] via-[#5c6dfd] to-[#bbf246] text-[#0a0d1a] font-extrabold shadow-md"
                      : "text-slate-500 hover:text-slate-300"
                  }\`}
                >
                  <FileText size={11} />
                  {t.tabFinancials}
                </button>`;

content = content.replace(healthToggleStr, healthToggleStr + "\n" + financialsToggleStr);

// 7. Conditionally render CompanyFinancials or the table
const tableStartStr = `<div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">`;

const tableReplacementStr = `{viewMode === "financials" ? (
              <div className="p-4 border-t border-slate-900/60">
                <CompanyFinancials 
                  language={language}
                  tickers={items.map(i => i.symbol)}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">`;

content = content.replace(tableStartStr, tableReplacementStr);

// 8. Close the conditional rendering for the table
const tableEndStr = `                </tbody>
              </table>
            </div>
          </div>
        )}`;

const tableEndReplacementStr = `                </tbody>
              </table>
            </div>
            )}
          </div>
        )}`;

content = content.replace(tableEndStr, tableEndReplacementStr);

fs.writeFileSync(path, content);
console.log("Patched WatchlistDashboard.tsx");
