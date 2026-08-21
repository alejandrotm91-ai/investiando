import { overrideFeaturesWithFinancials } from "./src/utils/engine";

const raw = {};
const fin = {
  annual: [
    { date: "2026-12-31", totalRevenue: 100, basicEPS: 10, freeCashFlow: 50 },
    { date: "2025-12-31", totalRevenue: 80, basicEPS: 8, freeCashFlow: 40 },
    { date: "2024-12-31", totalRevenue: 60, basicEPS: 6, freeCashFlow: 30 }
  ],
  quarterly: [
    { date: "2026-06-30", totalRevenue: 90, basicEPS: 9, freeCashFlow: 45 },
    { date: "2026-03-31", totalRevenue: 85, basicEPS: 8.5, freeCashFlow: 42 },
    { date: "2025-12-31", totalRevenue: 80, basicEPS: 8, freeCashFlow: 40 },
    { date: "2025-09-30", totalRevenue: 75, basicEPS: 7.5, freeCashFlow: 38 },
    { date: "2025-06-30", totalRevenue: 70, basicEPS: 7, freeCashFlow: 35 }
  ]
};

console.log(overrideFeaturesWithFinancials(raw as any, fin));
