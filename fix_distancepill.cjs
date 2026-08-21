const fs = require('fs');
let code = fs.readFileSync('src/components/HoldingsTable.tsx', 'utf8');

const pillSearch = `  const DistancePill = ({ current, target }: { current: number; target: number | null | undefined }) => {
    if (!target) return <span className="text-slate-500">—</span>;
    const distance = ((current - target) / target) * 100;
    const isPositive = distance >= 0;
    return (
      <span className={\`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono border \${isPositive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}\`}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {isPositive ? '+' : ''}{distance.toFixed(1)}%
      </span>
    );
  };`;

// Remove it from HoldingsTable
code = code.replace(pillSearch, "");

// Insert it above StockDetailPanel (line ~1475)
const panelSearch = `function StockDetailPanel({ position, language, onClose, financialsData }: { position: Position; language: "EN" | "ES"; onClose: () => void; financialsData?: { annual: any[]; quarterly: any[] } | null }) {`;

code = code.replace(panelSearch, pillSearch + "\n\n" + panelSearch);

fs.writeFileSync('src/components/HoldingsTable.tsx', code);
console.log('moved DistancePill');
