import { SuperinvestorMeta } from "./types";

export const hohn: SuperinvestorMeta = {
  name: "Chris Hohn",
  fund: "TCI Fund Management",
  institution: "TCI Fund Management Ltd",
  period: "Q2 2026 (30-Jun-2026)",
  aum13F: 52.77,
  filingDate: "14-Ago-2026",
  source: "SEC EDGAR 13F-HR / Dataroma.com (captura verificada por usuario, 14-Ago-2026)",
  category: "Activist",
  categoryES: "Activista",
  descEN: "Activist investor specializing in high-quality monopolistic infrastructure, payment rails, ratings agencies, and transportation compounders.",
  descES: "Inversor activista enfocado en monopolios de alta calidad, redes globales de pago, agencias de calificación crediticia e infraestructura de transporte.",
  holdings: [
    { ticker: "GE", company: "GE Aerospace (−0.17% Q2)", shares: 47428233, avgCost: 373.73, reportedPrice: 373.73, valueM: 17725.35, portfolioWeight: 33.59, sector: "Industrials", activity: "Reduce 0.17%" },
    { ticker: "V", company: "Visa Inc (+0.09% Q2)", shares: 30494133, avgCost: 343.09, reportedPrice: 343.09, valueM: 10462.23, portfolioWeight: 19.83, sector: "Financial Services", activity: "Add 0.09%" },
    { ticker: "MCO", company: "Moody's Corp", shares: 14334027, avgCost: 452.92, reportedPrice: 452.92, valueM: 6492.17, portfolioWeight: 12.30, sector: "Financial Services", activity: "Hold" },
    { ticker: "SPGI", company: "S&P Global Inc (+0.33% Q2)", shares: 14081957, avgCost: 407.26, reportedPrice: 407.26, valueM: 5735.02, portfolioWeight: 10.87, sector: "Financial Services", activity: "Add 0.33%" },
    { ticker: "CP", company: "Canadian Pacific Kansas City (−2.57% Q2)", shares: 45325726, avgCost: 86.62, reportedPrice: 86.62, valueM: 3925.91, portfolioWeight: 7.44, sector: "Industrials", activity: "Reduce 2.57%" },
    { ticker: "GOOG", company: "Alphabet Inc Cl C (+12.25% Q2)", shares: 9938819, avgCost: 353.33, reportedPrice: 353.33, valueM: 3511.68, portfolioWeight: 6.65, sector: "Communication Services", activity: "Add 12.25%" },
    { ticker: "FER", company: "Ferrovial SE (+0.97% Q2)", shares: 20940441, avgCost: 68.51, reportedPrice: 68.51, valueM: 1434.61, portfolioWeight: 2.72, sector: "Industrials", activity: "Add 0.97%" },
    { ticker: "CNI", company: "Canadian National Railway (−4.23% Q2)", shares: 9433422, avgCost: 119.21, reportedPrice: 119.21, valueM: 1124.54, portfolioWeight: 2.13, sector: "Industrials", activity: "Reduce 4.23%" },
    { ticker: "GOOGL", company: "Alphabet Inc Cl A", shares: 2457000, avgCost: 357.37, reportedPrice: 357.37, valueM: 878.06, portfolioWeight: 1.66, sector: "Communication Services", activity: "Hold" },
    { ticker: "MLM", company: "Martin Marietta Materials (NUEVA)", shares: 1315109, avgCost: 576.70, reportedPrice: 576.70, valueM: 758.42, portfolioWeight: 1.44, sector: "Basic Materials", activity: "NEW" },
    { ticker: "VMC", company: "Vulcan Materials (NUEVA)", shares: 2447004, avgCost: 295.01, reportedPrice: 295.01, valueM: 721.89, portfolioWeight: 1.37, sector: "Basic Materials", activity: "NEW" }
  ]
};
