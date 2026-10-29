export interface SectorTopHolding {
  symbol: string;
  name: string;
  weight: number; // Percentage in sector ETF (e.g. 15.8)
  price: number;
  returns: {
    "1D": number;
    "1W": number;
    "1M": number;
    "YTD": number;
    "1Y": number;
  };
  fiftyTwoWeekHigh?: number;
  diff52WHighPct?: number; // Downside percentage from 52W high (e.g. -2.40)
  upside52WHighPct?: number; // Upside percentage to reach 52W high (e.g. 2.46)
}

export interface SectorHoldingsConfig {
  sectorKey: string;
  etfTicker: string;
  nameEN: string;
  nameES: string;
  totalTop10Weight: number;
  holdings: SectorTopHolding[];
}

export const SECTOR_TOP_HOLDINGS: Record<string, SectorHoldingsConfig> = {
  XLK: {
    sectorKey: "technology",
    etfTicker: "XLK",
    nameEN: "Technology",
    nameES: "Tecnología",
    totalTop10Weight: 67.8,
    holdings: [
      { symbol: "NVDA", name: "NVIDIA Corporation", weight: 15.8, price: 128.50, returns: { "1D": 2.35, "1W": 4.10, "1M": 8.50, "YTD": 32.40, "1Y": 48.20 } },
      { symbol: "MSFT", name: "Microsoft Corporation", weight: 14.5, price: 448.90, returns: { "1D": 1.15, "1W": 1.80, "1M": 3.90, "YTD": 15.20, "1Y": 26.80 } },
      { symbol: "AAPL", name: "Apple Inc.", weight: 13.8, price: 224.30, returns: { "1D": -0.42, "1W": 0.65, "1M": 2.40, "YTD": 14.80, "1Y": 22.10 } },
      { symbol: "AVGO", name: "Broadcom Inc.", weight: 5.4, price: 162.30, returns: { "1D": 1.85, "1W": 2.90, "1M": 6.10, "YTD": 24.50, "1Y": 45.80 } },
      { symbol: "CRM", name: "Salesforce, Inc.", weight: 3.2, price: 254.30, returns: { "1D": -1.15, "1W": -0.40, "1M": 1.20, "YTD": 9.40, "1Y": 18.60 } },
      { symbol: "AMD", name: "Advanced Micro Devices", weight: 3.0, price: 142.60, returns: { "1D": 2.40, "1W": 3.80, "1M": 5.40, "YTD": 18.90, "1Y": 31.20 } },
      { symbol: "ORCL", name: "Oracle Corporation", weight: 2.9, price: 138.90, returns: { "1D": 1.62, "1W": 2.40, "1M": 4.80, "YTD": 22.10, "1Y": 35.40 } },
      { symbol: "ADBE", name: "Adobe Inc.", weight: 2.8, price: 512.30, returns: { "1D": -0.92, "1W": 0.30, "1M": 1.90, "YTD": 8.70, "1Y": 14.20 } },
      { symbol: "CSCO", name: "Cisco Systems, Inc.", weight: 2.6, price: 46.80, returns: { "1D": -0.22, "1W": 0.45, "1M": 1.50, "YTD": 5.80, "1Y": 9.40 } },
      { symbol: "ACN", name: "Accenture plc", weight: 2.4, price: 298.40, returns: { "1D": 0.48, "1W": 1.10, "1M": 2.60, "YTD": 7.20, "1Y": 12.80 } },
    ]
  },
  XLC: {
    sectorKey: "communications",
    etfTicker: "XLC",
    nameEN: "Communications",
    nameES: "Comunicaciones",
    totalTop10Weight: 74.3,
    holdings: [
      { symbol: "META", name: "Meta Platforms, Inc.", weight: 22.4, price: 535.05, returns: { "1D": -8.63, "1W": -4.20, "1M": 1.80, "YTD": 18.40, "1Y": 32.10 } },
      { symbol: "GOOGL", name: "Alphabet Inc. (Class A)", weight: 12.8, price: 334.53, returns: { "1D": -0.65, "1W": 0.80, "1M": 3.20, "YTD": 16.20, "1Y": 28.90 } },
      { symbol: "GOOG", name: "Alphabet Inc. (Class C)", weight: 10.9, price: 336.10, returns: { "1D": -0.60, "1W": 0.85, "1M": 3.30, "YTD": 16.40, "1Y": 29.10 } },
      { symbol: "NFLX", name: "Netflix, Inc.", weight: 6.2, price: 658.00, returns: { "1D": 2.10, "1W": 3.50, "1M": 7.40, "YTD": 24.80, "1Y": 44.20 } },
      { symbol: "TMUS", name: "T-Mobile US, Inc.", weight: 5.1, price: 196.40, returns: { "1D": 0.75, "1W": 1.40, "1M": 3.80, "YTD": 14.50, "1Y": 26.30 } },
      { symbol: "DIS", name: "The Walt Disney Company", weight: 4.8, price: 96.40, returns: { "1D": -0.85, "1W": -0.20, "1M": 1.10, "YTD": 6.40, "1Y": 11.80 } },
      { symbol: "VZ", name: "Verizon Communications", weight: 4.3, price: 41.80, returns: { "1D": 0.35, "1W": 0.90, "1M": 2.10, "YTD": 8.20, "1Y": 14.50 } },
      { symbol: "CMCSA", name: "Comcast Corporation", weight: 4.1, price: 38.60, returns: { "1D": -0.45, "1W": 0.20, "1M": 1.40, "YTD": 4.80, "1Y": 8.90 } },
      { symbol: "T", name: "AT&T Inc.", weight: 3.9, price: 21.50, returns: { "1D": 0.65, "1W": 1.20, "1M": 2.80, "YTD": 12.40, "1Y": 21.50 } },
      { symbol: "EA", name: "Electronic Arts Inc.", weight: 2.6, price: 145.20, returns: { "1D": 0.92, "1W": 1.60, "1M": 3.40, "YTD": 10.10, "1Y": 16.80 } },
    ]
  },
  XLY: {
    sectorKey: "discretionary",
    etfTicker: "XLY",
    nameEN: "Consumer Discretionary",
    nameES: "Consumo Discrecional",
    totalTop10Weight: 70.8,
    holdings: [
      { symbol: "AMZN", name: "Amazon.com, Inc.", weight: 23.5, price: 239.00, returns: { "1D": 5.45, "1W": 6.80, "1M": 9.20, "YTD": 22.40, "1Y": 36.50 } },
      { symbol: "TSLA", name: "Tesla, Inc.", weight: 15.2, price: 309.69, returns: { "1D": 3.81, "1W": 5.20, "1M": 8.40, "YTD": 26.80, "1Y": 41.20 } },
      { symbol: "HD", name: "The Home Depot, Inc.", weight: 9.4, price: 365.80, returns: { "1D": 0.78, "1W": 1.40, "1M": 3.10, "YTD": 9.80, "1Y": 18.40 } },
      { symbol: "MCD", name: "McDonald's Corporation", weight: 4.9, price: 268.90, returns: { "1D": 0.35, "1W": 0.80, "1M": 1.90, "YTD": 5.60, "1Y": 10.20 } },
      { symbol: "BKNG", name: "Booking Holdings Inc.", weight: 4.2, price: 3920.00, returns: { "1D": 1.15, "1W": 2.10, "1M": 4.50, "YTD": 14.20, "1Y": 25.80 } },
      { symbol: "TJX", name: "The TJX Companies, Inc.", weight: 3.7, price: 114.50, returns: { "1D": 0.62, "1W": 1.20, "1M": 2.80, "YTD": 11.40, "1Y": 20.10 } },
      { symbol: "LOW", name: "Lowe's Companies, Inc.", weight: 3.4, price: 245.20, returns: { "1D": 0.54, "1W": 1.10, "1M": 2.50, "YTD": 8.90, "1Y": 16.40 } },
      { symbol: "SBUX", name: "Starbucks Corporation", weight: 3.1, price: 94.80, returns: { "1D": -0.42, "1W": 0.50, "1M": 1.80, "YTD": 6.20, "1Y": 11.50 } },
      { symbol: "NKE", name: "NIKE, Inc.", weight: 2.7, price: 75.40, returns: { "1D": -1.45, "1W": -0.80, "1M": 0.60, "YTD": 2.10, "1Y": 4.80 } },
      { symbol: "CMG", name: "Chipotle Mexican Grill", weight: 2.1, price: 58.90, returns: { "1D": 1.42, "1W": 2.50, "1M": 5.10, "YTD": 15.80, "1Y": 28.40 } },
    ]
  },
  XLF: {
    sectorKey: "financials",
    etfTicker: "XLF",
    nameEN: "Financials",
    nameES: "Finanzas",
    totalTop10Weight: 56.4,
    holdings: [
      { symbol: "BRK-B", name: "Berkshire Hathaway Inc.", weight: 13.4, price: 508.50, returns: { "1D": -0.13, "1W": 0.70, "1M": 2.10, "YTD": 12.40, "1Y": 22.80 } },
      { symbol: "JPM", name: "JPMorgan Chase & Co.", weight: 10.6, price: 351.48, returns: { "1D": 1.96, "1W": 2.80, "1M": 5.40, "YTD": 18.90, "1Y": 34.20 } },
      { symbol: "V", name: "Visa Inc.", weight: 7.7, price: 365.68, returns: { "1D": -0.83, "1W": 0.40, "1M": 1.80, "YTD": 10.50, "1Y": 19.60 } },
      { symbol: "MA", name: "Mastercard Incorporated", weight: 6.6, price: 462.10, returns: { "1D": -0.45, "1W": 0.65, "1M": 2.20, "YTD": 11.20, "1Y": 21.40 } },
      { symbol: "BAC", name: "Bank of America Corp.", weight: 4.3, price: 39.80, returns: { "1D": 1.25, "1W": 2.10, "1M": 4.20, "YTD": 14.60, "1Y": 27.80 } },
      { symbol: "WFC", name: "Wells Fargo & Company", weight: 3.9, price: 58.40, returns: { "1D": 0.95, "1W": 1.80, "1M": 3.90, "YTD": 13.80, "1Y": 25.40 } },
      { symbol: "GS", name: "The Goldman Sachs Group", weight: 3.5, price: 482.30, returns: { "1D": 1.65, "1W": 2.70, "1M": 5.80, "YTD": 19.20, "1Y": 35.10 } },
      { symbol: "MS", name: "Morgan Stanley", weight: 3.1, price: 104.20, returns: { "1D": 1.40, "1W": 2.40, "1M": 4.90, "YTD": 16.80, "1Y": 31.50 } },
      { symbol: "SPGI", name: "S&P Global Inc.", weight: 2.9, price: 498.50, returns: { "1D": 0.55, "1W": 1.20, "1M": 2.80, "YTD": 11.80, "1Y": 20.90 } },
      { symbol: "BLK", name: "BlackRock, Inc.", weight: 2.8, price: 885.20, returns: { "1D": 0.82, "1W": 1.60, "1M": 3.50, "YTD": 13.40, "1Y": 24.60 } },
    ]
  },
  XLI: {
    sectorKey: "industrials",
    etfTicker: "XLI",
    nameEN: "Industrials",
    nameES: "Industriales",
    totalTop10Weight: 39.6,
    holdings: [
      { symbol: "GE", name: "GE Aerospace", weight: 5.9, price: 162.50, returns: { "1D": 1.35, "1W": 2.40, "1M": 5.20, "YTD": 19.80, "1Y": 38.50 } },
      { symbol: "CAT", name: "Caterpillar Inc.", weight: 5.3, price: 345.60, returns: { "1D": 0.88, "1W": 1.70, "1M": 3.80, "YTD": 14.20, "1Y": 26.40 } },
      { symbol: "RTX", name: "RTX Corporation", weight: 4.6, price: 118.20, returns: { "1D": 1.10, "1W": 1.90, "1M": 4.10, "YTD": 15.60, "1Y": 28.90 } },
      { symbol: "UNP", name: "Union Pacific Corp.", weight: 4.2, price: 238.90, returns: { "1D": 0.45, "1W": 1.10, "1M": 2.50, "YTD": 9.40, "1Y": 16.80 } },
      { symbol: "HON", name: "Honeywell International", weight: 3.9, price: 208.40, returns: { "1D": 0.62, "1W": 1.30, "1M": 2.80, "YTD": 8.70, "1Y": 15.20 } },
      { symbol: "ETN", name: "Eaton Corporation plc", weight: 3.6, price: 318.50, returns: { "1D": 1.45, "1W": 2.60, "1M": 5.60, "YTD": 21.40, "1Y": 40.20 } },
      { symbol: "DE", name: "Deere & Company", weight: 3.5, price: 388.20, returns: { "1D": 0.52, "1W": 1.20, "1M": 2.60, "YTD": 7.90, "1Y": 14.60 } },
      { symbol: "LMT", name: "Lockheed Martin Corp.", weight: 3.3, price: 542.10, returns: { "1D": 0.78, "1W": 1.50, "1M": 3.40, "YTD": 12.80, "1Y": 24.10 } },
      { symbol: "PH", name: "Parker-Hannifin Corp.", weight: 3.1, price: 594.30, returns: { "1D": 1.20, "1W": 2.10, "1M": 4.60, "YTD": 17.50, "1Y": 32.80 } },
      { symbol: "BA", name: "The Boeing Company", weight: 3.0, price: 158.40, returns: { "1D": -0.65, "1W": 0.30, "1M": 1.20, "YTD": 4.20, "1Y": 7.80 } },
    ]
  },
  XLV: {
    sectorKey: "healthcare",
    etfTicker: "XLV",
    nameEN: "Healthcare",
    nameES: "Salud",
    totalTop10Weight: 57.0,
    holdings: [
      { symbol: "LLY", name: "Eli Lilly and Company", weight: 11.9, price: 845.20, returns: { "1D": 0.92, "1W": 1.80, "1M": 4.20, "YTD": 16.40, "1Y": 31.80 } },
      { symbol: "UNH", name: "UnitedHealth Group", weight: 9.5, price: 422.95, returns: { "1D": 0.57, "1W": 1.20, "1M": 2.60, "YTD": 8.90, "1Y": 15.40 } },
      { symbol: "JNJ", name: "Johnson & Johnson", weight: 6.8, price: 256.16, returns: { "1D": -3.53, "1W": -1.80, "1M": 0.40, "YTD": 4.20, "1Y": 8.90 } },
      { symbol: "ABBV", name: "AbbVie Inc.", weight: 6.5, price: 174.20, returns: { "1D": 0.41, "1W": 1.10, "1M": 2.40, "YTD": 9.80, "1Y": 17.50 } },
      { symbol: "MRK", name: "Merck & Co., Inc.", weight: 4.7, price: 124.60, returns: { "1D": -0.62, "1W": 0.40, "1M": 1.50, "YTD": 6.10, "1Y": 11.80 } },
      { symbol: "TMO", name: "Thermo Fisher Scientific", weight: 4.2, price: 548.20, returns: { "1D": 0.75, "1W": 1.40, "1M": 3.10, "YTD": 10.50, "1Y": 19.20 } },
      { symbol: "ABT", name: "Abbott Laboratories", weight: 3.9, price: 105.20, returns: { "1D": 0.18, "1W": 0.80, "1M": 1.90, "YTD": 7.40, "1Y": 13.60 } },
      { symbol: "AMGN", name: "Amgen Inc.", weight: 3.5, price: 312.40, returns: { "1D": -0.38, "1W": 0.60, "1M": 1.80, "YTD": 8.20, "1Y": 14.90 } },
      { symbol: "ISRG", name: "Intuitive Surgical", weight: 3.4, price: 452.10, returns: { "1D": 1.65, "1W": 2.80, "1M": 6.10, "YTD": 22.40, "1Y": 39.50 } },
      { symbol: "PFE", name: "Pfizer Inc.", weight: 3.1, price: 28.40, returns: { "1D": -0.25, "1W": 0.30, "1M": 0.90, "YTD": 3.80, "1Y": 6.40 } },
    ]
  },
  XLP: {
    sectorKey: "staples",
    etfTicker: "XLP",
    nameEN: "Consumer Staples",
    nameES: "Consumo Básico",
    totalTop10Weight: 68.3,
    holdings: [
      { symbol: "PG", name: "Procter & Gamble Co.", weight: 14.6, price: 168.30, returns: { "1D": 0.32, "1W": 0.85, "1M": 1.80, "YTD": 7.40, "1Y": 13.50 } },
      { symbol: "COST", name: "Costco Wholesale Corp.", weight: 12.4, price: 852.40, returns: { "1D": 1.12, "1W": 1.90, "1M": 3.90, "YTD": 14.80, "1Y": 26.40 } },
      { symbol: "WMT", name: "Walmart Inc.", weight: 10.9, price: 68.50, returns: { "1D": 0.65, "1W": 1.30, "1M": 2.80, "YTD": 11.20, "1Y": 20.80 } },
      { symbol: "KO", name: "The Coca-Cola Company", weight: 9.5, price: 64.20, returns: { "1D": 0.28, "1W": 0.70, "1M": 1.60, "YTD": 6.50, "1Y": 11.90 } },
      { symbol: "PEP", name: "PepsiCo, Inc.", weight: 8.7, price: 172.50, returns: { "1D": 0.15, "1W": 0.55, "1M": 1.40, "YTD": 5.40, "1Y": 9.80 } },
      { symbol: "PM", name: "Philip Morris International", weight: 5.9, price: 108.50, returns: { "1D": 0.42, "1W": 0.95, "1M": 2.10, "YTD": 8.60, "1Y": 15.40 } },
      { symbol: "MDLZ", name: "Mondelez International", weight: 3.9, price: 70.20, returns: { "1D": 0.22, "1W": 0.60, "1M": 1.30, "YTD": 4.80, "1Y": 8.70 } },
      { symbol: "MO", name: "Altria Group, Inc.", weight: 3.2, price: 48.60, returns: { "1D": 0.18, "1W": 0.50, "1M": 1.10, "YTD": 4.20, "1Y": 7.90 } },
      { symbol: "CL", name: "Colgate-Palmolive Co.", weight: 2.9, price: 96.80, returns: { "1D": 0.45, "1W": 0.90, "1M": 1.90, "YTD": 7.80, "1Y": 14.20 } },
      { symbol: "TGT", name: "Target Corporation", weight: 2.4, price: 148.50, returns: { "1D": -0.35, "1W": 0.40, "1M": 1.20, "YTD": 5.10, "1Y": 9.20 } },
    ]
  },
  XLE: {
    sectorKey: "energy",
    etfTicker: "XLE",
    nameEN: "Energy",
    nameES: "Energía",
    totalTop10Weight: 73.6,
    holdings: [
      { symbol: "XOM", name: "Exxon Mobil Corp.", weight: 22.8, price: 157.07, returns: { "1D": 0.20, "1W": -0.80, "1M": -1.60, "YTD": -0.90, "1Y": 5.20 } },
      { symbol: "CVX", name: "Chevron Corporation", weight: 14.9, price: 158.20, returns: { "1D": -0.35, "1W": -1.20, "1M": -2.40, "YTD": -1.80, "1Y": 3.80 } },
      { symbol: "COP", name: "ConocoPhillips", weight: 7.9, price: 112.40, returns: { "1D": -0.55, "1W": -1.40, "1M": -2.80, "YTD": -2.10, "1Y": 3.20 } },
      { symbol: "EOG", name: "EOG Resources, Inc.", weight: 5.0, price: 124.80, returns: { "1D": -0.72, "1W": -1.60, "1M": -3.10, "YTD": -2.40, "1Y": 2.90 } },
      { symbol: "SLB", name: "Schlumberger Limited", weight: 4.5, price: 48.90, returns: { "1D": -1.15, "1W": -2.10, "1M": -3.90, "YTD": -3.50, "1Y": 1.50 } },
      { symbol: "MPC", name: "Marathon Petroleum", weight: 4.2, price: 172.50, returns: { "1D": 0.45, "1W": -0.60, "1M": -1.20, "YTD": 1.20, "1Y": 8.40 } },
      { symbol: "PSX", name: "Phillips 66", weight: 3.9, price: 138.20, returns: { "1D": 0.32, "1W": -0.75, "1M": -1.50, "YTD": 0.80, "1Y": 7.10 } },
      { symbol: "VLO", name: "Valero Energy Corp.", weight: 3.7, price: 146.80, returns: { "1D": 0.25, "1W": -0.85, "1M": -1.70, "YTD": 0.50, "1Y": 6.80 } },
      { symbol: "WMB", name: "The Williams Companies", weight: 3.5, price: 44.50, returns: { "1D": 0.62, "1W": 0.20, "1M": 0.80, "YTD": 3.40, "1Y": 11.20 } },
      { symbol: "OXY", name: "Occidental Petroleum", weight: 3.2, price: 54.20, returns: { "1D": -0.80, "1W": -1.70, "1M": -3.20, "YTD": -2.80, "1Y": 2.10 } },
    ]
  },
  XLRE: {
    sectorKey: "realestate",
    etfTicker: "XLRE",
    nameEN: "Real Estate",
    nameES: "Bienes Raíces",
    totalTop10Weight: 59.4,
    holdings: [
      { symbol: "PLD", name: "Prologis, Inc.", weight: 11.9, price: 122.40, returns: { "1D": -0.15, "1W": -0.40, "1M": -1.10, "YTD": 2.40, "1Y": 7.80 } },
      { symbol: "AMT", name: "American Tower Corp.", weight: 9.3, price: 198.50, returns: { "1D": -0.32, "1W": -0.65, "1M": -1.50, "YTD": 1.80, "1Y": 6.50 } },
      { symbol: "EQIX", name: "Equinix, Inc.", weight: 8.5, price: 842.10, returns: { "1D": 0.45, "1W": 0.20, "1M": 0.80, "YTD": 4.60, "1Y": 12.40 } },
      { symbol: "WELL", name: "Welltower Inc.", weight: 6.6, price: 116.80, returns: { "1D": 0.62, "1W": 0.80, "1M": 1.90, "YTD": 6.80, "1Y": 16.20 } },
      { symbol: "SPG", name: "Simon Property Group", weight: 5.5, price: 154.20, returns: { "1D": -0.22, "1W": -0.50, "1M": -1.20, "YTD": 2.10, "1Y": 7.10 } },
      { symbol: "PSA", name: "Public Storage", weight: 4.9, price: 312.40, returns: { "1D": -0.18, "1W": -0.45, "1M": -1.05, "YTD": 1.90, "1Y": 6.90 } },
      { symbol: "DLR", name: "Digital Realty Trust", weight: 4.7, price: 152.60, returns: { "1D": 0.38, "1W": 0.30, "1M": 1.10, "YTD": 5.20, "1Y": 13.80 } },
      { symbol: "O", name: "Realty Income Corp.", weight: 4.6, price: 58.90, returns: { "1D": -0.28, "1W": -0.60, "1M": -1.40, "YTD": 1.50, "1Y": 5.80 } },
      { symbol: "CCI", name: "Crown Castle Inc.", weight: 4.2, price: 112.50, returns: { "1D": -0.42, "1W": -0.80, "1M": -1.80, "YTD": 0.90, "1Y": 4.60 } },
      { symbol: "VICI", name: "VICI Properties Inc.", weight: 3.8, price: 32.40, returns: { "1D": 0.12, "1W": -0.20, "1M": -0.70, "YTD": 2.00, "1Y": 6.40 } },
    ]
  },
  XLB: {
    sectorKey: "materials",
    etfTicker: "XLB",
    nameEN: "Materials",
    nameES: "Materiales",
    totalTop10Weight: 65.6,
    holdings: [
      { symbol: "LIN", name: "Linde plc", weight: 18.6, price: 442.50, returns: { "1D": 0.42, "1W": -0.20, "1M": 0.60, "YTD": 5.40, "1Y": 12.80 } },
      { symbol: "SHW", name: "Sherwin-Williams Co.", weight: 7.9, price: 358.40, returns: { "1D": 0.55, "1W": 0.10, "1M": 0.90, "YTD": 6.20, "1Y": 14.20 } },
      { symbol: "FCX", name: "Freeport-McMoRan Inc.", weight: 6.5, price: 48.20, returns: { "1D": -0.16, "1W": -0.80, "1M": -0.40, "YTD": 3.80, "1Y": 8.90 } },
      { symbol: "ECL", name: "Ecolab Inc.", weight: 5.9, price: 246.80, returns: { "1D": 0.38, "1W": 0.20, "1M": 0.80, "YTD": 5.10, "1Y": 11.80 } },
      { symbol: "APD", name: "Air Products & Chemicals", weight: 5.7, price: 294.20, returns: { "1D": 0.25, "1W": -0.30, "1M": 0.40, "YTD": 4.20, "1Y": 9.80 } },
      { symbol: "NEM", name: "Newmont Corporation", weight: 4.9, price: 46.50, returns: { "1D": 0.85, "1W": 1.20, "1M": 2.40, "YTD": 8.90, "1Y": 18.40 } },
      { symbol: "CTVA", name: "Corteva, Inc.", weight: 4.5, price: 56.80, returns: { "1D": 0.18, "1W": -0.40, "1M": 0.20, "YTD": 3.40, "1Y": 7.60 } },
      { symbol: "DOW", name: "Dow Inc.", weight: 4.3, price: 52.40, returns: { "1D": -0.32, "1W": -0.90, "1M": -0.60, "YTD": 2.10, "1Y": 5.40 } },
      { symbol: "PPG", name: "PPG Industries, Inc.", weight: 3.9, price: 134.20, returns: { "1D": 0.20, "1W": -0.25, "1M": 0.50, "YTD": 3.90, "1Y": 8.50 } },
      { symbol: "DD", name: "DuPont de Nemours", weight: 3.6, price: 82.60, returns: { "1D": 0.15, "1W": -0.35, "1M": 0.30, "YTD": 3.20, "1Y": 7.20 } },
    ]
  },
  XLU: {
    sectorKey: "utilities",
    etfTicker: "XLU",
    nameEN: "Utilities",
    nameES: "Servicios Públicos",
    totalTop10Weight: 60.1,
    holdings: [
      { symbol: "NEE", name: "NextEra Energy, Inc.", weight: 14.4, price: 78.40, returns: { "1D": 0.55, "1W": 1.10, "1M": 1.60, "YTD": 9.80, "1Y": 21.40 } },
      { symbol: "SO", name: "The Southern Company", weight: 8.5, price: 88.20, returns: { "1D": 0.38, "1W": 0.85, "1M": 1.20, "YTD": 7.60, "1Y": 16.80 } },
      { symbol: "DUK", name: "Duke Energy Corp.", weight: 7.9, price: 112.50, returns: { "1D": 0.42, "1W": 0.90, "1M": 1.30, "YTD": 7.90, "1Y": 17.20 } },
      { symbol: "CEG", name: "Constellation Energy", weight: 7.0, price: 264.20, returns: { "1D": 1.25, "1W": 2.40, "1M": 3.80, "YTD": 18.40, "1Y": 38.60 } },
      { symbol: "SRE", name: "Sempra", weight: 4.9, price: 86.40, returns: { "1D": 0.32, "1W": 0.75, "1M": 1.10, "YTD": 6.80, "1Y": 14.90 } },
      { symbol: "AEP", name: "American Electric Power", weight: 4.7, price: 98.60, returns: { "1D": 0.28, "1W": 0.70, "1M": 1.00, "YTD": 6.40, "1Y": 14.10 } },
      { symbol: "D", name: "Dominion Energy, Inc.", weight: 4.2, price: 56.80, returns: { "1D": 0.25, "1W": 0.65, "1M": 0.90, "YTD": 5.80, "1Y": 12.80 } },
      { symbol: "PEG", name: "Public Service Enterprise", weight: 3.9, price: 86.20, returns: { "1D": 0.45, "1W": 0.95, "1M": 1.40, "YTD": 8.20, "1Y": 18.20 } },
      { symbol: "ED", name: "Consolidated Edison", weight: 3.7, price: 102.40, returns: { "1D": 0.22, "1W": 0.60, "1M": 0.85, "YTD": 5.40, "1Y": 11.90 } },
      { symbol: "WEC", name: "WEC Energy Group", weight: 3.5, price: 92.80, returns: { "1D": 0.30, "1W": 0.70, "1M": 1.05, "YTD": 6.20, "1Y": 13.50 } },
    ]
  }
};
