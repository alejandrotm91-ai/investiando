const fs = require('fs');

const path = 'src/components/SummaryDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove score and type from Card 1
const scoreStr = `                
                {portfolioWeightedScore > 0 && (
                  <div className="flex items-center gap-2 group cursor-pointer" title={language === "ES" ? "Score de Salud del Portafolio" : "Portfolio Health Score"}>
                    <div className="flex flex-col items-end mr-1">
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-500">
                        Score
                      </span>
                    </div>
                    <div className="relative w-10 h-10 flex items-center justify-center">
                      <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        {/* Background Track */}
                        <path
                          className="text-slate-800"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.5"
                        />
                        {/* Progress */}
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={getScoreHex(portfolioWeightedScore)}
                          strokeWidth="3.5"
                          strokeDasharray={\`\${portfolioWeightedScore}, 100\`}
                          className="drop-shadow-sm transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={\`text-[10px] font-bold font-mono \${getScoreColorClass(portfolioWeightedScore)}\`}>
                          {portfolioWeightedScore.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}`;
content = content.replace(scoreStr, '');

const typeStr = `                {portfolioWeightedType && (
                  <div className={\`inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold \${getTypeBadgeConfig(portfolioWeightedType).className}\`} title={language === "EN" ? "Dominant Portfolio Type" : "Tipo Dominante del Portafolio"}>
                    <span>{getTypeBadgeConfig(portfolioWeightedType).icon}</span>
                    {portfolioWeightedType}
                  </div>
                )}`;
content = content.replace(typeStr, '');

// 2. Add score and type to Card 3
const card3HeaderMatch = `              <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <PieChartIcon size={16} />
              </span>`;

const newMetricsStr = `              <div className="flex items-center gap-3">
${typeStr}
${scoreStr}
                <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl ml-1">
                  <PieChartIcon size={16} />
                </span>
              </div>`;

content = content.replace(card3HeaderMatch, newMetricsStr);

fs.writeFileSync(path, content);
console.log("Patched SummaryDashboard.tsx");
