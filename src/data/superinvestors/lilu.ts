import { SuperinvestorMeta } from "./types";

export const lilu: SuperinvestorMeta = {
  name: "Li Lu",
  fund: "Himalaya Capital",
  institution: "Himalaya Capital Management LLC",
  period: "Q2 2026 (30-Jun-2026)",
  aum13F: 3.70,
  filingDate: "14-Ago-2026",
  source: "SEC EDGAR 13F-HR / Dataroma.com (archivo Excel Q2 2026)",
  category: "Value",
  categoryES: "Valor",
  descEN: "Distinguished partner of Charlie Munger focusing on high-growth compounding tech, financials, and major consumer leaders in US & Asia.",
  descES: "Socio distinguido de Charlie Munger centrado en tecnología de alto crecimiento, financieras y líderes de consumo en EE.UU. y Asia.",
  holdings: [
    { ticker: "GOOGL", company: "Alphabet Inc.", shares: 2543300, avgCost: 357.37, reportedPrice: 357.37, valueM: 908.90, portfolioWeight: 24.55, sector: "Communication Services", activity: "Hold" },
    { ticker: "GOOG", company: "Alphabet Inc. CL C", shares: 2451300, avgCost: 353.33, reportedPrice: 353.33, valueM: 866.12, portfolioWeight: 23.39, sector: "Communication Services", activity: "Hold" },
    { ticker: "PDD", company: "Pinduoduo Inc.", shares: 10761119, avgCost: 76.28, reportedPrice: 76.28, valueM: 820.86, portfolioWeight: 22.17, sector: "Consumer Cyclical", activity: "Add 133.53%" },
    { ticker: "BRK.B", company: "Berkshire Hathaway CL B", shares: 1108318, avgCost: 500.39, reportedPrice: 500.39, valueM: 554.59, portfolioWeight: 14.98, sector: "Financial Services", activity: "Add 23.46%" },
    { ticker: "EWBC", company: "East West Bancorp", shares: 2776351, avgCost: 129.09, reportedPrice: 129.09, valueM: 358.40, portfolioWeight: 9.68, sector: "Financial Services", activity: "Hold" },
    { ticker: "CROX", company: "Crocs Inc.", shares: 887093, avgCost: 120.64, reportedPrice: 120.64, valueM: 107.02, portfolioWeight: 2.89, sector: "Consumer Cyclical", activity: "Hold" },
    { ticker: "TME", company: "Tencent Music Entertainment Grp", shares: 6590836, avgCost: 8.35, reportedPrice: 8.35, valueM: 55.03, portfolioWeight: 1.49, sector: "Communication Services", activity: "Hold" },
    { ticker: "AAPL", company: "Apple Inc.", shares: 110600, avgCost: 289.36, reportedPrice: 289.36, valueM: 32.00, portfolioWeight: 0.86, sector: "Technology", activity: "Hold" }
  ]
};
