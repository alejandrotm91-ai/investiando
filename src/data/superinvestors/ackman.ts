import { SuperinvestorMeta } from "./types";

export const ackman: SuperinvestorMeta = {
  name: "Bill Ackman",
  fund: "Pershing Square Capital",
  institution: "Pershing Square Inc.",
  period: "Q2 2026 (30-Jun-2026)",
  aum13F: 19.47,
  filingDate: "14-Ago-2026",
  source: "SEC EDGAR 13F-HR / Dataroma.com (archivo Excel Q2 2026)",
  category: "Activist",
  categoryES: "Activista",
  descEN: "Activist investor known for highly concentrated, high-conviction positions in mega-cap technology, consumer platforms, and quality infrastructure.",
  descES: "Inversor activista conocido por posiciones altamente concentradas y de gran convicción en líderes globales de consumo, finanzas y tecnología.",
  holdings: [
    { ticker: "UBER", company: "Uber Technologies Inc.", shares: 34326200, avgCost: 72.16, reportedPrice: 72.16, valueM: 2476.98, portfolioWeight: 12.72, sector: "Technology", activity: "Add 14.58%" },
    { ticker: "BN", company: "Brookfield Corp.", shares: 57481047, avgCost: 42.59, reportedPrice: 42.59, valueM: 2448.12, portfolioWeight: 12.58, sector: "Financial Services", activity: "Reduce 3.71%" },
    { ticker: "MSFT", company: "Microsoft Corp.", shares: 6206730, avgCost: 373.02, reportedPrice: 373.02, valueM: 2315.23, portfolioWeight: 11.89, sector: "Technology", activity: "Add 9.77%" },
    { ticker: "AMZN", company: "Amazon.com Inc.", shares: 8563857, avgCost: 238.34, reportedPrice: 238.34, valueM: 2041.11, portfolioWeight: 10.49, sector: "Consumer Cyclical", activity: "Reduce 25.22%" },
    { ticker: "HHH", company: "Howard Hughes Holdings Inc.", shares: 27852064, avgCost: 71.49, reportedPrice: 71.49, valueM: 1991.14, portfolioWeight: 10.23, sector: "Real Estate", activity: "Add 47.74%" },
    { ticker: "QSR", company: "Restaurant Brands International", shares: 25821284, avgCost: 72.51, reportedPrice: 72.51, valueM: 1872.30, portfolioWeight: 9.62, sector: "Consumer Cyclical", activity: "Add 14.02%" },
    { ticker: "META", company: "Meta Platforms Inc.", shares: 3196062, avgCost: 563.29, reportedPrice: 563.29, valueM: 1800.31, portfolioWeight: 9.25, sector: "Communication Services", activity: "Add 20.11%" },
    { ticker: "V", company: "Visa Inc.", shares: 3270470, avgCost: 343.09, reportedPrice: 343.09, valueM: 1122.07, portfolioWeight: 5.76, sector: "Financial Services", activity: "Buy" },
    { ticker: "MA", company: "Mastercard Inc.", shares: 2124646, avgCost: 513.60, reportedPrice: 513.60, valueM: 1091.22, portfolioWeight: 5.61, sector: "Financial Services", activity: "Buy" },
    { ticker: "SPGI", company: "S&P Global Inc.", shares: 2593155, avgCost: 407.26, reportedPrice: 407.26, valueM: 1056.09, portfolioWeight: 5.43, sector: "Financial Services", activity: "Buy" },
    { ticker: "NFLX", company: "Netflix Inc.", shares: 13081465, avgCost: 71.40, reportedPrice: 71.40, valueM: 934.02, portfolioWeight: 4.80, sector: "Communication Services", activity: "Buy" },
    { ticker: "PSUS", company: "Pershing Square Usa Ltd", shares: 4000000, avgCost: 37.38, reportedPrice: 37.38, valueM: 149.52, portfolioWeight: 0.77, sector: "Financial Services", activity: "Buy" },
    { ticker: "SEG", company: "Seaport Entertainment Group", shares: 5023780, avgCost: 26.60, reportedPrice: 26.60, valueM: 133.63, portfolioWeight: 0.69, sector: "Consumer Cyclical", activity: "Hold" },
    { ticker: "HTZ", company: "Hertz Global Hldgs Inc.", shares: 14991599, avgCost: 2.27, reportedPrice: 2.27, valueM: 33.96, portfolioWeight: 0.17, sector: "Industrials", activity: "Reduce 1.64%" }
  ]
};
