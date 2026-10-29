// Rutas de datos de mercado (Yahoo Finance), copiadas de server.ts en la Fase 2.
// Cambios respecto al original: refrescos en segundo plano con bg() (waitUntil de Cloudflare)
// y tipos de Express sustituidos por los del adaptador. El resto es el código original.
// @ts-nocheck -- código heredado sin tipos estrictos; se revisa al limpiar server.ts.
import { getYahoo } from "../yahoo";
import { bg, type LegacyApp, type LegacyReq, type LegacyRes } from "./express-shim";
import { SUPERINVESTORS } from "../../superinvestors";
import { SUPERINVESTOR_SCORES } from "../../utils/superinvestorScore";
import { SECTOR_TOP_HOLDINGS } from "../../data/sp500SectorHoldings";

const yahooFinance: any = getYahoo();

/**
 * Universal safe helper to fetch historical/chart data using modern chart() endpoint first,
 * falling back gracefully to historical().
 */
async function fetchSafeChartHistory(
  symbol: string,
  startDate: Date,
  now: Date,
  interval: "1d" | "1wk" | "1mo" = "1d"
): Promise<{ date: string | Date; close: number }[]> {
  const yahooSymbol = symbol.replace(/\./g, "-");
  try {
    if (yahooFinance && typeof yahooFinance.chart === "function") {
      const chartRes: any = await yahooFinance.chart(
        yahooSymbol,
        {
          period1: startDate,
          period2: now,
          interval,
        },
        { validateResult: false }
      );
      if (chartRes?.quotes && Array.isArray(chartRes.quotes) && chartRes.quotes.length > 0) {
        return chartRes.quotes
          .filter((q: any) => typeof q.close === "number" && !isNaN(q.close))
          .map((q: any) => ({
            date: q.date,
            close: Number(q.close),
          }));
      }
    }
  } catch {
    // Try historical fallback
  }

  try {
    if (yahooFinance && typeof yahooFinance.historical === "function") {
      const histRes: any = await yahooFinance.historical(
        yahooSymbol,
        {
          period1: startDate,
          period2: now,
          interval,
        },
        { validateResult: false }
      );
      if (Array.isArray(histRes) && histRes.length > 0) {
        return histRes
          .filter((h: any) => typeof (h.close || h.adjClose) === "number" && !isNaN(h.close || h.adjClose))
          .map((h: any) => ({
            date: h.date,
            close: Number(h.close || h.adjClose),
          }));
      }
    }
  } catch {
    // Fallback to empty
  }

  return [];
}

/**
 * Helper to extract effective price from Yahoo Finance quote / summary.
 * When market is closed / after hours / pre-market, checks for postMarketPrice or preMarketPrice in summary/quote
 * and updates the price to reflect extended hours trading.
 */
export function extractPriceAndQuoteData(q: any, summary?: any) {
  if (!q && !summary) {
    return {
      price: 0,
      regularMarketPrice: 0,
      regularMarketPreviousClose: 0,
      postMarketPrice: null,
      preMarketPrice: null,
      marketState: null,
      isAfterHoursPrice: false,
    };
  }

  let regularPrice = q?.regularMarketPrice;
  let prevClose = q?.regularMarketPreviousClose;
  let postMarketPrice = q?.postMarketPrice;
  let preMarketPrice = q?.preMarketPrice;
  let marketState = q?.marketState;

  if (summary?.price) {
    const sp = summary.price;
    if (sp.marketState) marketState = sp.marketState;
    if (sp.postMarketPrice !== undefined && sp.postMarketPrice !== null) {
      postMarketPrice = typeof sp.postMarketPrice === "object" ? sp.postMarketPrice.raw : sp.postMarketPrice;
    }
    if (sp.preMarketPrice !== undefined && sp.preMarketPrice !== null) {
      preMarketPrice = typeof sp.preMarketPrice === "object" ? sp.preMarketPrice.raw : sp.preMarketPrice;
    }
    if (sp.regularMarketPrice !== undefined && sp.regularMarketPrice !== null && (regularPrice === undefined || regularPrice === null)) {
      regularPrice = typeof sp.regularMarketPrice === "object" ? sp.regularMarketPrice.raw : sp.regularMarketPrice;
    }
    if (sp.regularMarketPreviousClose !== undefined && sp.regularMarketPreviousClose !== null && (prevClose === undefined || prevClose === null)) {
      prevClose = typeof sp.regularMarketPreviousClose === "object" ? sp.regularMarketPreviousClose.raw : sp.regularMarketPreviousClose;
    }
  }

  if (summary?.summaryDetail) {
    const sd = summary.summaryDetail;
    if (postMarketPrice === undefined || postMarketPrice === null) {
      if (sd.postMarketPrice !== undefined && sd.postMarketPrice !== null) {
        postMarketPrice = typeof sd.postMarketPrice === "object" ? sd.postMarketPrice.raw : sd.postMarketPrice;
      }
    }
    if (preMarketPrice === undefined || preMarketPrice === null) {
      if (sd.preMarketPrice !== undefined && sd.preMarketPrice !== null) {
        preMarketPrice = typeof sd.preMarketPrice === "object" ? sd.preMarketPrice.raw : sd.preMarketPrice;
      }
    }
  }

  const stateUpper = typeof marketState === "string" ? marketState.toUpperCase() : "";
  const isClosedOrExtended = !stateUpper || stateUpper !== "REGULAR";

  let effectivePrice = regularPrice;
  let isAfterHoursPrice = false;

  if (isClosedOrExtended) {
    if ((stateUpper === "POST" || stateUpper === "POSTPOST" || stateUpper === "CLOSED" || !stateUpper) && typeof postMarketPrice === "number" && postMarketPrice > 0) {
      effectivePrice = postMarketPrice;
      isAfterHoursPrice = true;
    } else if ((stateUpper === "PRE" || stateUpper === "PREPRE") && typeof preMarketPrice === "number" && preMarketPrice > 0) {
      effectivePrice = preMarketPrice;
      isAfterHoursPrice = true;
    } else if (typeof postMarketPrice === "number" && postMarketPrice > 0) {
      effectivePrice = postMarketPrice;
      isAfterHoursPrice = true;
    } else if (typeof preMarketPrice === "number" && preMarketPrice > 0) {
      effectivePrice = preMarketPrice;
      isAfterHoursPrice = true;
    }
  }

  return {
    price: typeof effectivePrice === "number" && effectivePrice > 0 ? effectivePrice : (regularPrice || 0),
    regularMarketPrice: typeof regularPrice === "number" ? regularPrice : (effectivePrice || 0),
    regularMarketPreviousClose: typeof prevClose === "number" ? prevClose : ((effectivePrice || 0) * 0.99),
    postMarketPrice: typeof postMarketPrice === "number" ? postMarketPrice : null,
    preMarketPrice: typeof preMarketPrice === "number" ? preMarketPrice : null,
    marketState: stateUpper || null,
    isAfterHoursPrice,
  };
}

// Robust fallback data for common symbols to guarantee app functionality if external API experiences rate limiting/blocks
const FALLBACK_QUOTES: Record<string, any> = {
  MSFT: { regularMarketPrice: 372.79, regularMarketPreviousClose: 352.82, longName: "Microsoft Corporation", trailingPE: 21.01, forwardPE: 18.18, pegRatio: 1.09, dividendRate: 3.30 },
  META: { regularMarketPrice: 550.25, regularMarketPreviousClose: 542.88, longName: "Meta Platforms, Inc.", trailingPE: 24.5, forwardPE: 19.2, pegRatio: 1.25, dividendRate: 2.00 },
  NVDA: { regularMarketPrice: 115.50, regularMarketPreviousClose: 112.40, longName: "NVIDIA Corporation", trailingPE: 62.1, forwardPE: 30.5, pegRatio: 1.15, dividendRate: 0.40 },
  AVGO: { regularMarketPrice: 325.30, regularMarketPreviousClose: 320.10, longName: "Broadcom Inc.", trailingPE: 28.2, forwardPE: 15.4, pegRatio: 1.35, dividendRate: 21.20 },
  AMZN: { regularMarketPrice: 175.50, regularMarketPreviousClose: 172.10, longName: "Amazon.com, Inc.", trailingPE: 38.4, forwardPE: 25.1, pegRatio: 1.18, dividendRate: 0 },
  MAGS: { regularMarketPrice: 58.50, regularMarketPreviousClose: 57.20, longName: "Roundhill Magnificent Seven ETF", trailingPE: null, forwardPE: null, pegRatio: null, dividendRate: null },
  SMH: { regularMarketPrice: 245.50, regularMarketPreviousClose: 242.10, longName: "VanEck Semiconductor ETF", trailingPE: null, forwardPE: null, pegRatio: null, dividendRate: 0.85 },
  QQQM: { regularMarketPrice: 205.80, regularMarketPreviousClose: 203.40, longName: "Invesco NASDAQ 100 ETF", trailingPE: null, forwardPE: null, pegRatio: null, dividendRate: 1.20 },
  GOOGL: { regularMarketPrice: 154.20, regularMarketPreviousClose: 152.10, longName: "Alphabet Inc. Clase A", trailingPE: 22.3, forwardPE: 18.5, pegRatio: 1.11, dividendRate: 0.80 },
  GOOG: { regularMarketPrice: 155.10, regularMarketPreviousClose: 153.20, longName: "Alphabet Inc. Clase C", trailingPE: 22.1, forwardPE: 18.0, pegRatio: 1.10, dividendRate: 0.80 },
  IREN: { regularMarketPrice: 8.50, regularMarketPreviousClose: 8.10, longName: "IREN Limited", trailingPE: null, forwardPE: null, pegRatio: null },
  BN: { regularMarketPrice: 42.50, regularMarketPreviousClose: 41.80, longName: "Brookfield Corp", trailingPE: 18.5, forwardPE: 12.3, pegRatio: 1.2 },
  UBER: { regularMarketPrice: 72.30, regularMarketPreviousClose: 71.10, longName: "Uber Technologies, Inc.", trailingPE: 31.4, forwardPE: 22.5, pegRatio: 1.4 },
  QSR: { regularMarketPrice: 74.20, regularMarketPreviousClose: 73.10, longName: "Restaurant Brands International", trailingPE: 18.4, forwardPE: 15.6, pegRatio: 1.15 },
  HLT: { regularMarketPrice: 202.50, regularMarketPreviousClose: 198.80, longName: "Hilton Worldwide Holdings", trailingPE: 28.2, forwardPE: 22.5, pegRatio: 1.6 },
  CP: { regularMarketPrice: 82.50, regularMarketPreviousClose: 81.90, longName: "Canadian Pacific Kansas City", trailingPE: 22.1, forwardPE: 19.5, pegRatio: 1.3 },
  NKE: { regularMarketPrice: 91.20, regularMarketPreviousClose: 93.10, longName: "Nike, Inc.", trailingPE: 20.2, forwardPE: 17.5, pegRatio: 1.4 },
  CMG: { regularMarketPrice: 56.40, regularMarketPreviousClose: 55.10, longName: "Chipotle Mexican Grill", trailingPE: 45.2, forwardPE: 35.8, pegRatio: 1.95 },
  NFLX: { regularMarketPrice: 595.00, regularMarketPreviousClose: 585.50, longName: "Netflix, Inc.", trailingPE: 35.2, forwardPE: 26.5, pegRatio: 1.4 },
  "BRK.B": { regularMarketPrice: 382.50, regularMarketPreviousClose: 378.10, longName: "Berkshire Hathaway Inc. Cl B", trailingPE: 12.5, forwardPE: 11.8, pegRatio: 1.5 },
  WM: { regularMarketPrice: 182.40, regularMarketPreviousClose: 179.90, longName: "Waste Management, Inc.", trailingPE: 28.1, forwardPE: 24.3, pegRatio: 2.1 },
  CNI: { regularMarketPrice: 122.50, regularMarketPreviousClose: 121.10, longName: "Canadian National Railway", trailingPE: 19.5, forwardPE: 18.2, pegRatio: 1.6 },
  CAT: { regularMarketPrice: 325.40, regularMarketPreviousClose: 318.50, longName: "Caterpillar Inc.", trailingPE: 15.2, forwardPE: 14.1, pegRatio: 1.1 },
  DE: { regularMarketPrice: 368.50, regularMarketPreviousClose: 362.40, longName: "Deere & Company", trailingPE: 12.4, forwardPE: 11.8, pegRatio: 1.3 },
  ECL: { regularMarketPrice: 220.50, regularMarketPreviousClose: 218.40, longName: "Ecolab Inc.", trailingPE: 32.1, forwardPE: 26.4, pegRatio: 1.8 },
  WMT: { regularMarketPrice: 62.50, regularMarketPreviousClose: 61.80, longName: "Walmart Inc.", trailingPE: 25.1, forwardPE: 21.4, pegRatio: 2.1 },
  FDX: { regularMarketPrice: 255.40, regularMarketPreviousClose: 251.20, longName: "FedEx Corporation", trailingPE: 14.2, forwardPE: 11.5, pegRatio: 0.95 },
  KOF: { regularMarketPrice: 95.50, regularMarketPreviousClose: 94.10, longName: "Coca-Cola FEMSA ADR", trailingPE: 15.2, forwardPE: 13.1, pegRatio: 1.1 },
  WCN: { regularMarketPrice: 165.40, regularMarketPreviousClose: 162.20, longName: "Waste Connections, Inc.", trailingPE: 31.2, forwardPE: 25.4, pegRatio: 1.9 },
  CPNG: { regularMarketPrice: 21.40, regularMarketPreviousClose: 20.80, longName: "Coupang, Inc.", trailingPE: 28.4, forwardPE: 21.5, pegRatio: 1.1 },
  SDGR: { regularMarketPrice: 24.50, regularMarketPreviousClose: 25.10, longName: "Schrodinger Inc.", trailingPE: null, forwardPE: null, pegRatio: null },
  MSGS: { regularMarketPrice: 185.00, regularMarketPreviousClose: 182.50, longName: "Madison Square Garden Sports", trailingPE: 30.1, forwardPE: 25.2, pegRatio: 1.8 },
  WST: { regularMarketPrice: 355.20, regularMarketPreviousClose: 348.40, longName: "West Pharmaceutical Services", trailingPE: 38.4, forwardPE: 31.5, pegRatio: 2.4 },
  MCD: { regularMarketPrice: 282.40, regularMarketPreviousClose: 280.10, longName: "McDonald's Corporation", trailingPE: 22.1, forwardPE: 19.5, pegRatio: 1.85 },
  BUD: { regularMarketPrice: 58.50, regularMarketPreviousClose: 57.90, longName: "Anheuser-Busch InBev ADR", trailingPE: 18.2, forwardPE: 15.4, pegRatio: 1.2 },
  PCAR: { regularMarketPrice: 112.50, regularMarketPreviousClose: 110.20, longName: "PACCAR Inc", trailingPE: 12.4, forwardPE: 11.8, pegRatio: 0.95 },
  DHR: { regularMarketPrice: 245.20, regularMarketPreviousClose: 242.10, longName: "Danaher Corporation", trailingPE: 28.1, forwardPE: 23.4, pegRatio: 1.85 },
  KHC: { regularMarketPrice: 35.40, regularMarketPreviousClose: 35.10, longName: "Kraft Heinz Company", trailingPE: 12.1, forwardPE: 11.2, pegRatio: 1.4 },
  HRL: { regularMarketPrice: 32.50, regularMarketPreviousClose: 32.10, longName: "Hormel Foods Corporation", trailingPE: 19.5, forwardPE: 17.2, pegRatio: 2.1 },
  ONON: { regularMarketPrice: 38.50, regularMarketPreviousClose: 37.20, longName: "On Holding AG", trailingPE: 38.0, forwardPE: 28.5, pegRatio: 1.4 },
  VLTO: { regularMarketPrice: 88.50, regularMarketPreviousClose: 86.20, longName: "Veralto Corporation", trailingPE: 26.2, forwardPE: 22.1, pegRatio: 1.7 },
  GE: { regularMarketPrice: 145.20, regularMarketPreviousClose: 141.50, longName: "GE Aerospace", trailingPE: 24.1, forwardPE: 20.3, pegRatio: 1.5 },
  V: { regularMarketPrice: 275.40, regularMarketPreviousClose: 271.20, longName: "Visa Inc.", trailingPE: 28.2, forwardPE: 23.1, pegRatio: 1.6 },
  SPGI: { regularMarketPrice: 425.60, regularMarketPreviousClose: 418.20, longName: "S&P Global Inc.", trailingPE: 27.8, forwardPE: 23.4, pegRatio: 1.45 },
  BABA: { regularMarketPrice: 75.80, regularMarketPreviousClose: 73.10, longName: "Alibaba Group Holding ADR", trailingPE: 12.4, forwardPE: 10.2, pegRatio: 0.95 },
  TSM: { regularMarketPrice: 145.20, regularMarketPreviousClose: 142.10, longName: "Taiwan Semiconductor ADR", trailingPE: 22.8, forwardPE: 18.5, pegRatio: 1.15 },
  MU: { regularMarketPrice: 115.40, regularMarketPreviousClose: 112.10, longName: "Micron Technology", trailingPE: 45.2, forwardPE: 15.3, pegRatio: 0.95 },
  WDC: { regularMarketPrice: 65.80, regularMarketPreviousClose: 63.20, longName: "Western Digital Corp", trailingPE: 18.2, forwardPE: 14.5, pegRatio: 1.1 },
  PDD: { regularMarketPrice: 128.50, regularMarketPreviousClose: 125.10, longName: "PDD Holdings ADR", trailingPE: 15.4, forwardPE: 12.2, pegRatio: 0.85 },
  EWBC: { regularMarketPrice: 75.40, regularMarketPreviousClose: 74.10, longName: "East West Bancorp", trailingPE: 9.5, forwardPE: 8.8, pegRatio: 1.05 },
  BAC: { regularMarketPrice: 38.20, regularMarketPreviousClose: 37.50, longName: "Bank of America Corp", trailingPE: 12.1, forwardPE: 11.2, pegRatio: 1.3 },
  BYD: { regularMarketPrice: 28.50, regularMarketPreviousClose: 28.10, longName: "BYD Co Ltd ADR", trailingPE: 18.2, forwardPE: 15.4, pegRatio: 1.15 },
  KO: { regularMarketPrice: 62.15, regularMarketPreviousClose: 61.80, longName: "Coca-Cola Company", trailingPE: 24.2, forwardPE: 22.1, pegRatio: 2.1 },
  JD: { regularMarketPrice: 26.50, regularMarketPreviousClose: 25.80, longName: "JD.com Inc ADR", trailingPE: 11.2, forwardPE: 9.5, pegRatio: 0.85 },
  HTHT: { regularMarketPrice: 35.40, regularMarketPreviousClose: 34.80, longName: "H World Group ADR", trailingPE: 22.1, forwardPE: 18.4, pegRatio: 1.3 },
  YUMC: { regularMarketPrice: 38.50, regularMarketPreviousClose: 37.90, longName: "Yum China Holdings", trailingPE: 18.2, forwardPE: 15.4, pegRatio: 1.1 },
  WFC: { regularMarketPrice: 55.40, regularMarketPreviousClose: 54.80, longName: "Wells Fargo & Co", trailingPE: 11.5, forwardPE: 10.2, pegRatio: 0.95 },
  AXON: { regularMarketPrice: 310.20, regularMarketPreviousClose: 305.10, longName: "Axon Enterprise Inc.", trailingPE: 55.0, forwardPE: 45.0, pegRatio: 1.80 },
  CFLT: { regularMarketPrice: 28.50, regularMarketPreviousClose: 29.10, longName: "Confluent Inc.", trailingPE: 40.0, forwardPE: 30.0, pegRatio: 1.20 },
  DDOG: { regularMarketPrice: 115.00, regularMarketPreviousClose: 118.20, longName: "Datadog Inc.", trailingPE: 50.0, forwardPE: 40.0, pegRatio: 1.50 },
  IOT: { regularMarketPrice: 35.20, regularMarketPreviousClose: 34.80, longName: "Samsara Inc.", trailingPE: 45.0, forwardPE: 35.0, pegRatio: 1.30 },
  BE: { regularMarketPrice: 12.40, regularMarketPreviousClose: 11.80, longName: "Bloom Energy Corp.", trailingPE: 30.0, forwardPE: 22.0, pegRatio: 1.10 },
  ARM: { regularMarketPrice: 125.00, regularMarketPreviousClose: 122.50, longName: "Arm Holdings ADR", trailingPE: 75.0, forwardPE: 55.0, pegRatio: 2.50 },
  SNOW: { regularMarketPrice: 145.20, regularMarketPreviousClose: 141.80, longName: "Snowflake Inc.", trailingPE: 150.0, forwardPE: 85.0, pegRatio: 2.1 },
  CRWV: { regularMarketPrice: 103.81, regularMarketPreviousClose: 100.00, longName: "CoreWeave Inc.", trailingPE: 50.0, forwardPE: 30.0, pegRatio: 1.2 },
  CBRS: { regularMarketPrice: 221.00, regularMarketPreviousClose: 218.50, longName: "Cerebras Systems Inc", trailingPE: 45.0, forwardPE: 35.0, pegRatio: 1.4 },
  SPCX: { regularMarketPrice: 170.86, regularMarketPreviousClose: 168.00, longName: "Space Exploration Technologies (SpaceX)", trailingPE: 60.0, forwardPE: 45.0, pegRatio: 1.8 },
  KLAC: { regularMarketPrice: 785.40, regularMarketPreviousClose: 778.20, longName: "KLA Corp", trailingPE: 28.5, forwardPE: 22.1, pegRatio: 1.35 },
  LRCX: { regularMarketPrice: 915.20, regularMarketPreviousClose: 905.10, longName: "Lam Research Corp", trailingPE: 29.1, forwardPE: 21.8, pegRatio: 1.28 },
  HOOD: { regularMarketPrice: 24.50, regularMarketPreviousClose: 23.80, longName: "Robinhood Markets Inc", trailingPE: 32.4, forwardPE: 24.0, pegRatio: 1.2 },
  SNPS: { regularMarketPrice: 560.20, regularMarketPreviousClose: 554.10, longName: "Synopsys Inc", trailingPE: 42.1, forwardPE: 32.5, pegRatio: 1.6 },
  AMAT: { regularMarketPrice: 210.50, regularMarketPreviousClose: 206.80, longName: "Applied Materials Inc", trailingPE: 24.8, forwardPE: 19.5, pegRatio: 1.2 },
  QCOM: { regularMarketPrice: 175.40, regularMarketPreviousClose: 172.80, longName: "Qualcomm Inc", trailingPE: 19.2, forwardPE: 15.6, pegRatio: 1.15 },
  ELV: { regularMarketPrice: 505.20, regularMarketPreviousClose: 501.10, longName: "Elevance Health, Inc.", trailingPE: 16.5, forwardPE: 14.2, pegRatio: 1.15 },
  CEIX: { regularMarketPrice: 92.40, regularMarketPreviousClose: 91.10, longName: "Consol Energy Inc.", trailingPE: 6.8, forwardPE: 7.2, pegRatio: 0.95 },
  ANTM: { regularMarketPrice: 485.50, regularMarketPreviousClose: 480.20, longName: "Anthem, Inc. (Elevance)", trailingPE: 16.0, forwardPE: 13.8, pegRatio: 1.12 },
  SNDK: { regularMarketPrice: 78.40, regularMarketPreviousClose: 76.50, longName: "SanDisk Corp. (Western Digital)", trailingPE: 15.0, forwardPE: 12.0, pegRatio: 1.10 },
  SPY: { regularMarketPrice: 771.35, regularMarketPreviousClose: 768.10, longName: "SPDR S&P 500 ETF Trust (S&P 500)", trailingPE: 28.5, forwardPE: 22.8, pegRatio: 1.75 },
  VOO: { regularMarketPrice: 710.79, regularMarketPreviousClose: 708.20, longName: "Vanguard S&P 500 ETF (S&P 500)", trailingPE: 28.5, forwardPE: 22.8, pegRatio: 1.75 },
  QQQ: { regularMarketPrice: 744.50, regularMarketPreviousClose: 741.00, longName: "Invesco QQQ Trust (NASDAQ-100)", trailingPE: 33.4, forwardPE: 26.8, pegRatio: 1.62 },
  DIA: { regularMarketPrice: 517.49, regularMarketPreviousClose: 515.20, longName: "SPDR Dow Jones Industrial Average ETF", trailingPE: 22.5, forwardPE: 19.8, pegRatio: 1.5 },
  "^GSPC": { regularMarketPrice: 7743.41, regularMarketPreviousClose: 7704.13, longName: "S&P 500 Index (^GSPC)", trailingPE: 28.5, forwardPE: 22.8, pegRatio: 1.75 },
  "^NDX": { regularMarketPrice: 23500.00, regularMarketPreviousClose: 23350.00, longName: "NASDAQ-100 Index (^NDX)", trailingPE: 33.4, forwardPE: 26.8, pegRatio: 1.62 },
  "^IXIC": { regularMarketPrice: 27068.72, regularMarketPreviousClose: 26939.38, longName: "Nasdaq Composite Index (^IXIC)", trailingPE: 32.5, forwardPE: 25.9, pegRatio: 1.55 },
  "^DJI": { regularMarketPrice: 51828.62, regularMarketPreviousClose: 51350.00, longName: "Dow Jones Industrial Average (^DJI)", trailingPE: 24.1, forwardPE: 20.2, pegRatio: 1.45 },
  "^VIX": { regularMarketPrice: 14.87, regularMarketPreviousClose: 15.67, longName: "CBOE Volatility Index (^VIX)", trailingPE: 0, forwardPE: 0, pegRatio: 0 },
  "BTC-USD": { regularMarketPrice: 83814.00, regularMarketPreviousClose: 84300.00, longName: "Bitcoin USD", trailingPE: 0, forwardPE: 0, pegRatio: 0 },
  "ETH-USD": { regularMarketPrice: 2680.00, regularMarketPreviousClose: 2690.00, longName: "Ethereum USD", trailingPE: 0, forwardPE: 0, pegRatio: 0 },
  "GC=F": { regularMarketPrice: 4320.50, regularMarketPreviousClose: 4298.00, longName: "Gold Futures", trailingPE: 0, forwardPE: 0, pegRatio: 0 },
  "SI=F": { regularMarketPrice: 64.71, regularMarketPreviousClose: 64.00, longName: "Silver Futures", trailingPE: 0, forwardPE: 0, pegRatio: 0 },
  CASH: { regularMarketPrice: 1.0, regularMarketPreviousClose: 1.0, longName: "US Dollar Cash", trailingPE: 0, forwardPE: 0, pegRatio: 0 },
};

async function getHistoricalData(
  symbol: string,
  startDate: Date,
  now: Date,
  interval: "1d" | "1wk" | "1mo",
  timeframe: string,
  currentPrice?: number
): Promise<{ date: string; close: number }[]> {
  const ticker = symbol.toUpperCase();
  
  if (ticker !== "CASH" && ticker !== "PORTFOLIO") {
    try {
      const historicalData = await fetchSafeChartHistory(ticker, startDate, now, interval);

      if (historicalData && historicalData.length > 0) {
        return historicalData.map((d: any) => ({
          date: d.date instanceof Date ? d.date.toISOString().split("T")[0] : String(d.date).split("T")[0],
          close: Number(d.close || 100),
        }));
      }
    } catch (apiError) {
      console.log(`[Historical Info] Activated simulated historical model for ${ticker}`);
    }
  }

  // Fallback simulation (Backward Random Walk from currentPrice or fallback price)
  const data: { date: string; close: number }[] = [];
  const points =
    timeframe === "1W" ? 7 :
    timeframe === "1M" ? 30 :
    timeframe === "3M" ? 90 :
    timeframe === "1Y" ? 250 :
    timeframe === "5Y" ? 60 :
    timeframe === "10Y" ? 120 :
    timeframe === "ALL" ? 60 : 30;

  let basePrice = currentPrice || FALLBACK_QUOTES[ticker]?.regularMarketPrice || 150;
  if (ticker === "VOO") basePrice = 710.79;
  if (ticker === "QQQ") basePrice = 744.50;
  if (ticker === "SPY") basePrice = 771.35;
  if (ticker === "^GSPC") basePrice = 7743.41;
  if (ticker === "^IXIC") basePrice = 27068.72;
  if (ticker === "^DJI") basePrice = 51828.62;
  if (ticker === "CASH") basePrice = 1.0;

  let currentVal = basePrice;
  const isMonthly = timeframe === "5Y" || timeframe === "10Y" || timeframe === "ALL";
  
  let drift = 0.0004; // standard daily stock drift
  let volatility = 0.015; // standard daily volatility

  if (ticker === "VOO" || ticker === "SPY" || ticker === "^GSPC") {
    drift = isMonthly ? 0.007 : 0.0003;
    volatility = isMonthly ? 0.035 : 0.01;
  } else if (ticker === "QQQ" || ticker === "^IXIC") {
    drift = isMonthly ? 0.01 : 0.0004;
    volatility = isMonthly ? 0.045 : 0.012;
  } else if (ticker === "CASH") {
    drift = 0;
    volatility = 0;
  } else {
    drift = isMonthly ? 0.012 : 0.0005;
    volatility = isMonthly ? 0.06 : 0.02;
    if (ticker === "NVDA") volatility *= 1.5;
  }

  for (let i = 0; i <= points; i++) {
    const date = new Date(now);
    if (isMonthly) {
      date.setMonth(now.getMonth() - i);
    } else {
      date.setDate(now.getDate() - i);
    }

    const dateStr = date.toISOString().split("T")[0];

    if (i === 0) {
      data.unshift({ date: dateStr, close: Number(basePrice.toFixed(2)) });
    } else {
      const rand = Math.random() - 0.49;
      const noise = rand * volatility;
      currentVal = currentVal / (1 + drift + noise);
      if (ticker === "CASH") {
        currentVal = 1.0;
      }
      data.unshift({ date: dateStr, close: Number(currentVal.toFixed(2)) });
    }
  }

  return data;
}

export function registerMarketRoutes(app: LegacyApp) {
  // 1. Search tickers
  app.get("/api/search", async (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      return res.json([]);
    }

    const cleanQ = query.trim().toLowerCase();
    const isSP500Query = cleanQ.includes("sp500") || cleanQ.includes("s&p") || cleanQ.includes("sp 500") || cleanQ.includes("spx") || cleanQ === "spy" || cleanQ === "voo" || cleanQ === "^gspc";
    const isNasdaqQuery = cleanQ.includes("nasdaq") || cleanQ.includes("ndx") || cleanQ.includes("qqq") || cleanQ.includes("ixic") || cleanQ.includes("nasdaq-100") || cleanQ.includes("nasdaq 100");

    try {
      const searchResult = await yahooFinance.search(query, {}, { validateResult: false }) as any;
      const apiQuotes = searchResult.quotes || [];
      const results: Array<{ symbol: string; name: string; exchange: string; type: string }> = apiQuotes
        .filter((q: any) => q && q.symbol)
        .map((q: any) => ({
          symbol: q.symbol.toUpperCase(),
          name: q.shortname || q.longname || q.symbol,
          exchange: q.exchange || "US",
          type: q.quoteType || "EQUITY",
        }));

      // In case of index search, prioritize prominent ETF and Index definitions
      const priorityIndexMatches: Array<{ symbol: string; name: string; exchange: string; type: string }> = [];
      if (isSP500Query) {
        priorityIndexMatches.push(
          { symbol: "SPY", name: "SPDR S&P 500 ETF Trust (S&P 500)", exchange: "NYSE", type: "ETF" },
          { symbol: "^GSPC", name: "S&P 500 Index", exchange: "INDEX", type: "INDEX" },
          { symbol: "VOO", name: "Vanguard S&P 500 ETF", exchange: "NYSE", type: "ETF" }
        );
      }
      if (isNasdaqQuery) {
        priorityIndexMatches.push(
          { symbol: "QQQ", name: "Invesco QQQ Trust (NASDAQ-100)", exchange: "NASDAQ", type: "ETF" },
          { symbol: "^NDX", name: "NASDAQ-100 Index", exchange: "INDEX", type: "INDEX" },
          { symbol: "^IXIC", name: "Nasdaq Composite Index", exchange: "INDEX", type: "INDEX" }
        );
      }

      // Add local fallback matches if not already present
      const localMatches = Object.keys(FALLBACK_QUOTES)
        .filter((symbol) => symbol.toLowerCase().includes(query.toLowerCase()) || FALLBACK_QUOTES[symbol].longName.toLowerCase().includes(query.toLowerCase()))
        .map((symbol) => ({
          symbol: symbol.toUpperCase(),
          name: FALLBACK_QUOTES[symbol].longName,
          exchange: symbol.startsWith("^") ? "INDEX" : "US",
          type: symbol.startsWith("^") ? "INDEX" : "EQUITY",
        }));

      const finalResults: Array<{ symbol: string; name: string; exchange: string; type: string }> = [];
      const seenSymbols = new Set<string>();

      // 1. Put priority indices first if queried
      priorityIndexMatches.forEach((item) => {
        if (!seenSymbols.has(item.symbol)) {
          finalResults.push(item);
          seenSymbols.add(item.symbol);
        }
      });

      // 2. Put API results
      results.forEach((item) => {
        if (!seenSymbols.has(item.symbol)) {
          finalResults.push(item);
          seenSymbols.add(item.symbol);
        }
      });

      // 3. Put local matches
      localMatches.forEach((match) => {
        if (!seenSymbols.has(match.symbol)) {
          finalResults.push(match);
          seenSymbols.add(match.symbol);
        }
      });

      res.json(finalResults);
    } catch (error) {
      console.error("Yahoo Finance Search error, falling back to local list matching:", error);
      // Fallback search in our local map
      const matched = Object.keys(FALLBACK_QUOTES)
        .filter((symbol) => symbol.toLowerCase().includes(query.toLowerCase()) || FALLBACK_QUOTES[symbol].longName.toLowerCase().includes(query.toLowerCase()))
        .map((symbol) => ({
          symbol: symbol.toUpperCase(),
          name: FALLBACK_QUOTES[symbol].longName,
          exchange: symbol.startsWith("^") ? "INDEX" : "US",
          type: symbol.startsWith("^") ? "INDEX" : "EQUITY",
        }));
      res.json(matched);
    }
  });

  // Helper to calculate Wilder's RSI 14-day
  function calculateRSI14(closes: number[]): number {
    if (closes.length < 15) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= 14; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) {
        gains += diff;
      } else {
        losses -= diff;
      }
    }

    let avgGain = gains / 14;
    let avgLoss = losses / 14;

    for (let i = 15; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const currentGain = diff > 0 ? diff : 0;
      const currentLoss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * 13 + currentGain) / 14;
      avgLoss = (avgLoss * 13 + currentLoss) / 14;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    return Number(rsi.toFixed(1));
  }

  // 1.5 Sector ETFs and RSI calculations with multi-timeframe metrics and in-memory cache
  const SECTOR_ETFS_CONFIG: Record<string, { ticker: string; nameEN: string; nameES: string; category: "growth" | "defensive" | "cyclical"; defaultPrice: number; defaultPct: number; defaultPct1W: number; defaultPct1M: number; defaultPctYTD: number; defaultPct1Y: number }> = {
    technology: { ticker: "XLK", nameEN: "Technology", nameES: "Tecnología", category: "growth", defaultPrice: 195.75, defaultPct: 0.64, defaultPct1W: 0.21, defaultPct1M: 4.96, defaultPctYTD: 35.65, defaultPct1Y: 40.83 },
    communications: { ticker: "XLC", nameEN: "Communications", nameES: "Comunicaciones", category: "growth", defaultPrice: 110.97, defaultPct: -0.45, defaultPct1W: -1.41, defaultPct1M: -0.44, defaultPctYTD: -5.07, defaultPct1Y: -5.18 },
    discretionary: { ticker: "XLY", nameEN: "Consumer Discretionary", nameES: "Consumo Discrecional", category: "growth", defaultPrice: 108.84, defaultPct: -0.28, defaultPct1W: -1.64, defaultPct1M: -6.65, defaultPctYTD: -8.04, defaultPct1Y: -7.85 },
    financials: { ticker: "XLF", nameEN: "Financials", nameES: "Finanzas", category: "cyclical", defaultPrice: 53.40, defaultPct: -1.13, defaultPct1W: -2.09, defaultPct1M: -7.47, defaultPctYTD: -2.79, defaultPct1Y: -0.13 },
    industrials: { ticker: "XLI", nameEN: "Industrials", nameES: "Industriales", category: "cyclical", defaultPrice: 166.98, defaultPct: -1.27, defaultPct1W: -1.83, defaultPct1M: -4.65, defaultPctYTD: 5.70, defaultPct1Y: 10.42 },
    materials: { ticker: "XLB", nameEN: "Materials", nameES: "Materiales", category: "cyclical", defaultPrice: 48.70, defaultPct: -0.81, defaultPct1W: -3.14, defaultPct1M: -7.57, defaultPctYTD: 5.59, defaultPct1Y: 10.91 },
    energy: { ticker: "XLE", nameEN: "Energy", nameES: "Energía", category: "cyclical", defaultPrice: 61.50, defaultPct: -0.06, defaultPct1W: -1.39, defaultPct1M: -3.85, defaultPctYTD: 34.72, defaultPct1Y: 34.94 },
    realestate: { ticker: "XLRE", nameEN: "Real Estate", nameES: "Bienes Raíces", category: "cyclical", defaultPrice: 40.91, defaultPct: -1.04, defaultPct1W: -2.22, defaultPct1M: -7.25, defaultPctYTD: 1.31, defaultPct1Y: -1.35 },
    healthcare: { ticker: "XLV", nameEN: "Healthcare", nameES: "Salud", category: "defensive", defaultPrice: 168.42, defaultPct: -1.35, defaultPct1W: -0.23, defaultPct1M: -1.24, defaultPctYTD: 8.30, defaultPct1Y: 25.56 },
    staples: { ticker: "XLP", nameEN: "Consumer Staples", nameES: "Consumo Básico", category: "defensive", defaultPrice: 80.60, defaultPct: -1.53, defaultPct1W: -2.22, defaultPct1M: -5.15, defaultPctYTD: 3.75, defaultPct1Y: 3.64 },
    utilities: { ticker: "XLU", nameEN: "Utilities", nameES: "Servicios Públicos", category: "defensive", defaultPrice: 39.44, defaultPct: -0.68, defaultPct1W: -0.78, defaultPct1M: -6.61, defaultPctYTD: -8.66, defaultPct1Y: -7.66 },
  };

  const INITIAL_SECTORS_DATA = Object.keys(SECTOR_ETFS_CONFIG).map((key) => {
    const s = SECTOR_ETFS_CONFIG[key];
    const simulatedPct = s.defaultPct;
    const rsi14 = 52.0;
    let sentiment = "Neutral";
    let sentimentES = "Neutral";
    if (simulatedPct > 0.6) { sentiment = "Bullish"; sentimentES = "Alcista"; }
    else if (simulatedPct < -0.6) { sentiment = "Bearish"; sentimentES = "Bajista"; }

    return {
      key,
      ticker: s.ticker,
      nameEN: s.nameEN,
      nameES: s.nameES,
      category: s.category,
      price: s.defaultPrice,
      pct: s.defaultPct,
      pct1W: s.defaultPct1W,
      pct1M: s.defaultPct1M,
      pctYTD: s.defaultPctYTD,
      pct1Y: s.defaultPct1Y,
      rsi14,
      sparkline: [30, 35, 32, 40, 42, 38, 45, 52, 50, 55],
      sentiment,
      sentimentES,
    };
  });

  let sectorsCache: { data: any[]; timestamp: number } = {
    data: INITIAL_SECTORS_DATA,
    timestamp: 0,
  };
  let isUpdatingSectors = false;

  const refreshSectors = async () => {
    if (isUpdatingSectors) return;
    isUpdatingSectors = true;
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - 370);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const keys = Object.keys(SECTOR_ETFS_CONFIG);
    const tickers = keys.map((k) => SECTOR_ETFS_CONFIG[k].ticker);

    try {
      // 1. Fetch all sector quotes in a single batch call with 6-second timeout
      const quoteMap: Record<string, any> = {};
      try {
        const batchPromise = yahooFinance.quote(tickers, {}, { validateResult: false });
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 6000));
        const batchQuotes: any = await Promise.race([batchPromise, timeoutPromise]);
        if (Array.isArray(batchQuotes)) {
          batchQuotes.forEach((q: any) => {
            if (q && q.symbol) quoteMap[q.symbol.toUpperCase()] = q;
          });
        }
      } catch (err) {
        // Continue with individual quotes if batch fails
      }

      // 2. Fetch 1-year history for multi-timeframe returns, sparklines & RSI concurrently
      const results = await Promise.all(
        keys.map(async (key) => {
          const sector = SECTOR_ETFS_CONFIG[key];
          const prevSector = sectorsCache.data.find((item: any) => item.key === key);

          try {
            let quote = quoteMap[sector.ticker.toUpperCase()];
            if (!quote) {
              try {
                const singleQuotePromise = yahooFinance.quote(sector.ticker, {}, { validateResult: false });
                const singleTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
                quote = await Promise.race([singleQuotePromise, singleTimeout]);
              } catch {
                // quote failed
              }
            }

            let validHistory: any[] = [];
            try {
              const hist = await fetchSafeChartHistory(sector.ticker, startDate, now, "1d");
              validHistory = hist || [];
            } catch {
              // ignore chart failure
            }

            let price = typeof quote?.regularMarketPrice === "number"
              ? quote.regularMarketPrice
              : (validHistory.length > 0 ? validHistory[validHistory.length - 1].close : (prevSector?.price || sector.defaultPrice));

            let pctChange = typeof quote?.regularMarketChangePercent === "number"
              ? quote.regularMarketChangePercent
              : (prevSector?.pct ?? sector.defaultPct);

            const nCloses = validHistory.length;
            const lastClose = validHistory.length > 0 ? validHistory[nCloses - 1].close : price;
            
            // 1W return (5-6 trading days ago)
            const close1W = nCloses >= 6 ? validHistory[nCloses - 6].close : (nCloses >= 2 ? validHistory[0].close : lastClose);
            const pct1W = close1W > 0 ? Number((((lastClose - close1W) / close1W) * 100).toFixed(2)) : (prevSector?.pct1W ?? sector.defaultPct1W);
            
            // 1M return (21-22 trading days ago)
            const close1M = nCloses >= 22 ? validHistory[nCloses - 22].close : (nCloses >= 2 ? validHistory[0].close : lastClose);
            const pct1M = close1M > 0 ? Number((((lastClose - close1M) / close1M) * 100).toFixed(2)) : (prevSector?.pct1M ?? sector.defaultPct1M);
            
            // YTD return (from Jan 1 of current year)
            const closeYTD = validHistory.find((h: any) => new Date(h.date) >= startOfYear)?.close || (nCloses > 0 ? validHistory[0].close : lastClose);
            const pctYTD = closeYTD > 0 
              ? Number((((lastClose - closeYTD) / closeYTD) * 100).toFixed(2))
              : (typeof quote?.ytdReturn === "number" ? Number(quote.ytdReturn.toFixed(2)) : (prevSector?.pctYTD ?? sector.defaultPctYTD));

            // 1Y return (from ~365 days ago)
            const close1Y = validHistory.length > 0 ? validHistory[0].close : lastClose;
            const pct1Y = close1Y > 0
              ? Number((((lastClose - close1Y) / close1Y) * 100).toFixed(2))
              : (typeof quote?.fiftyTwoWeekChangePercent === "number" ? Number(quote.fiftyTwoWeekChangePercent.toFixed(2)) : (prevSector?.pct1Y ?? sector.defaultPct1Y));

            let sparkline = prevSector?.sparkline || [30, 35, 32, 40, 42, 38, 45, 52, 50, 55];
            if (validHistory.length >= 8) {
              const recent = validHistory.slice(-15).map((h: any) => h.close);
              const min = Math.min(...recent);
              const max = Math.max(...recent);
              const range = max - min || 1;
              sparkline = recent.map((c: number) => Math.round(((c - min) / range) * 100));
            }

            let rsi14 = prevSector?.rsi14 || 50;
            if (validHistory.length >= 15) {
              const closes = validHistory.map((h: any) => h.close);
              rsi14 = calculateRSI14(closes);
            }

            let sentiment = "Neutral";
            if (rsi14 > 70) sentiment = "Overbought";
            else if (rsi14 > 55) sentiment = "Bullish";
            else if (rsi14 < 30) sentiment = "Oversold";
            else if (rsi14 < 45) sentiment = "Bearish";

            let sentimentES = "Neutral";
            if (rsi14 > 70) sentimentES = "Sobrecompra";
            else if (rsi14 > 55) sentimentES = "Alcista";
            else if (rsi14 < 30) sentimentES = "Sobrevendido";
            else if (rsi14 < 45) sentimentES = "Bajista";

            return {
              key,
              ticker: sector.ticker,
              nameEN: sector.nameEN,
              nameES: sector.nameES,
              category: sector.category,
              price: Number(price.toFixed(2)),
              pct: Number(pctChange.toFixed(2)),
              pct1W: Number(pct1W.toFixed(2)),
              pct1M: Number(pct1M.toFixed(2)),
              pctYTD: Number(pctYTD.toFixed(2)),
              pct1Y: Number(pct1Y.toFixed(2)),
              rsi14: Number(rsi14.toFixed(1)),
              sparkline,
              sentiment,
              sentimentES,
            };
          } catch {
            return prevSector || INITIAL_SECTORS_DATA.find((item: any) => item.key === key);
          }
        })
      );

      if (results && results.length > 0) {
        sectorsCache = { data: results, timestamp: Date.now() };
      }
    } catch {
      // Keep existing sectorsCache
    } finally {
      isUpdatingSectors = false;
    }
  };

  app.get("/api/market/sectors", async (req, res) => {
    if (sectorsCache.timestamp === 0) {
      await refreshSectors();
    } else if (Date.now() - sectorsCache.timestamp > 45000) {
      bg(refreshSectors());
    }
    res.json(sectorsCache.data);
  });

  // 1.55 Real-time Earnings Calendar route with in-memory caching
  const earningsCache = new Map<string, { report: any; timestamp: number }>();
  const EARNINGS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  const DEFAULT_MARKET_EARNINGS_TICKERS = [
    "NFLX", "TSLA", "META", "GOOGL", "GOOG", "MSFT", "AMZN", "AAPL", "NVDA", "AMD",
    "TSM", "ASML", "JPM", "BAC", "GS", "MS", "UNH", "LLY", "PLTR", "V", "MA",
    "WMT", "COST", "DIS", "KO", "PEP", "ORCL", "CRM", "ADBE", "QCOM", "AVGO", "UBER"
  ];

  function formatEarningsCurrency(val: any, isBillions = false): string {
    if (val === undefined || val === null || isNaN(Number(val))) return "$0.00";
    const num = Number(val);
    if (isBillions) {
      if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
      if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
      if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
      return `$${num.toFixed(2)}`;
    }
    return `$${num.toFixed(2)}`;
  }

  function formatEarningsDate(date: Date | string): string {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = new Date(date);
    if (isNaN(d.getTime())) return "TBD";
    return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}, ${d.getUTCFullYear()}`;
  }

  async function fetchTickerEarningsReport(ticker: string): Promise<any | null> {
    const sym = ticker.toUpperCase().trim();
    if (!sym || sym.startsWith("^")) return null;

    const cached = earningsCache.get(sym);
    if (cached && Date.now() - cached.timestamp < EARNINGS_CACHE_TTL) {
      return cached.report;
    }

    try {
      const q = await yahooFinance.quoteSummary(
        sym,
        { modules: ["earnings", "calendarEvents", "price", "financialData", "earningsHistory"] },
        { validateResult: false }
      );
      if (!q) return null;

      const name = q?.price?.longName || q?.price?.shortName || sym;
      const quarterly = q?.earnings?.earningsChart?.quarterly || [];
      const finQuarterly = q?.earnings?.financialsChart?.quarterly || [];
      const lastQ = quarterly[quarterly.length - 1];
      const prevQ = quarterly[quarterly.length - 2];
      const lastFin = finQuarterly[finQuarterly.length - 1];
      const prevFin = finQuarterly[finQuarterly.length - 2];
      const calEarnings = q?.calendarEvents?.earnings;
      const nextDateRaw = calEarnings?.earningsDate?.[0];

      const now = new Date();
      const lastReportedDate = lastQ?.reportedDate ? new Date(lastQ.reportedDate) : null;
      const daysSinceReport = lastReportedDate ? (now.getTime() - lastReportedDate.getTime()) / (1000 * 3600 * 24) : 999;
      const isRecentlyReported = daysSinceReport >= 0 && daysSinceReport <= 35;

      let dateStr = "";
      let time: "Before Market" | "After Market" = "After Market";
      let epsEst = "$0.00";
      let epsAct: string | undefined = undefined;
      let epsStatus: "Beat" | "Miss" | "In-Line" | "Pending" = "Pending";
      let epsSurprise: string | undefined = undefined;
      let revEst = "$0.0B";
      let revAct: string | undefined = undefined;
      let revStatus: "Beat" | "Miss" | "In-Line" | "Pending" = "Pending";
      let revSurprise: string | undefined = undefined;
      let prevEps = "$0.00";
      let prevRev = "$0.0B";

      if (isRecentlyReported && lastQ) {
        dateStr = formatEarningsDate(lastReportedDate!);
        time = (lastReportedDate!.getUTCHours() >= 18 || lastReportedDate!.getUTCHours() === 0) ? "After Market" : "Before Market";
        epsEst = formatEarningsCurrency(lastQ.estimate);
        epsAct = formatEarningsCurrency(lastQ.actual);
        const sPct = Number(lastQ.surprisePct || 0);
        epsSurprise = `${sPct >= 0 ? "+" : ""}${sPct.toFixed(1)}%`;
        epsStatus = sPct > 0.5 ? "Beat" : sPct < -0.5 ? "Miss" : "In-Line";

        const revVal = lastFin?.revenue;
        revAct = formatEarningsCurrency(revVal, true);
        const estRevVal = revVal ? (sPct > 0 ? revVal * (1 - Math.min(0.04, sPct / 200)) : revVal * (1 + Math.min(0.04, Math.abs(sPct) / 200))) : null;
        revEst = formatEarningsCurrency(estRevVal, true);
        const revDiff = revVal && estRevVal ? ((revVal - estRevVal) / estRevVal) * 100 : 0;
        revSurprise = `${revDiff >= 0 ? "+" : ""}${revDiff.toFixed(1)}%`;
        revStatus = revDiff > 0.3 ? "Beat" : revDiff < -0.3 ? "Miss" : "In-Line";

        prevEps = formatEarningsCurrency(prevQ?.actual ?? prevQ?.estimate ?? 0);
        prevRev = formatEarningsCurrency(prevFin?.revenue, true);
      } else {
        const nextDate = nextDateRaw ? new Date(nextDateRaw) : new Date(now.getTime() + 7 * 24 * 3600 * 1000);
        dateStr = formatEarningsDate(nextDate);
        time = (nextDate.getUTCHours() < 18 && nextDate.getUTCHours() > 5) ? "Before Market" : "After Market";
        epsEst = formatEarningsCurrency(calEarnings?.earningsAverage ?? lastQ?.actual ?? 1.0);
        epsStatus = "Pending";
        revEst = formatEarningsCurrency(calEarnings?.revenueAverage ?? lastFin?.revenue ?? 1e10, true);
        revStatus = "Pending";
        prevEps = formatEarningsCurrency(lastQ?.actual ?? 0);
        prevRev = formatEarningsCurrency(lastFin?.revenue, true);
      }

      const highProfile = ["AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "NFLX", "AMD", "JPM", "BAC", "GS", "MS", "UNH", "LLY", "PLTR", "WMT", "COST", "TSM", "ASML"];
      const importance: "High" | "Medium" | "Low" = highProfile.includes(sym) ? "High" : "Medium";

      const report = {
        ticker: sym,
        name,
        date: dateStr,
        time,
        epsEst,
        epsAct,
        epsStatus,
        epsSurprise,
        revEst,
        revAct,
        revStatus,
        revSurprise,
        prevEps,
        prevRev,
        importance,
        isRecentlyReported,
      };

      earningsCache.set(sym, { report, timestamp: Date.now() });
      return report;
    } catch (err: any) {
      console.warn(`[EarningsCalendar] Could not fetch earnings for ${sym}:`, err?.message || err);
      return null;
    }
  }

  const handleEarningsRequest = async (req: LegacyReq, res: LegacyRes) => {
    try {
      const requestedTickers: string[] = Array.isArray(req.body?.tickers)
        ? req.body.tickers
        : typeof req.query?.tickers === "string"
        ? (req.query.tickers as string).split(",")
        : [];

      // Combine user holdings with standard market leaders
      const tickerSet = new Set<string>();
      requestedTickers.forEach((t) => {
        if (typeof t === "string" && t.trim() && !t.startsWith("^")) {
          tickerSet.add(t.toUpperCase().trim());
        }
      });
      DEFAULT_MARKET_EARNINGS_TICKERS.forEach((t) => tickerSet.add(t));

      const tickerList = Array.from(tickerSet);

      // Batch fetch with concurrency limit to avoid throttling
      const chunkSize = 6;
      const reports: any[] = [];
      for (let i = 0; i < tickerList.length; i += chunkSize) {
        const chunk = tickerList.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(chunk.map((t) => fetchTickerEarningsReport(t)));
        chunkResults.forEach((r) => {
          if (r) reports.push(r);
        });
      }

      res.json({ success: true, reports });
    } catch (e: any) {
      console.error("[EarningsCalendar] Error serving earnings:", e);
      res.status(500).json({ success: false, error: e?.message || "Internal server error" });
    }
  };

  app.get("/api/earnings/calendar", handleEarningsRequest);
  app.post("/api/earnings/calendar", handleEarningsRequest);


  // 1.6 Global Indices real-time route with in-memory cache
  const INDICES_CONFIG = [
    { nameEN: "VIX", nameES: "VIX", symbol: "^VIX", defaultPrice: 14.87, defaultHigh: 35.30, defaultChg: -0.80, defaultPct: -5.10 },
    { nameEN: "S&P500", nameES: "S&P500", symbol: "^GSPC", defaultPrice: 7743.41, defaultHigh: 7816.70, defaultChg: 39.28, defaultPct: 0.51 },
    { nameEN: "NASDAQ", nameES: "NASDAQ", symbol: "^IXIC", defaultPrice: 27068.72, defaultHigh: 27288.79, defaultChg: 129.34, defaultPct: 0.48 },
    { nameEN: "DOW", nameES: "DOW", symbol: "^DJI", defaultPrice: 51828.62, defaultHigh: 54744.33, defaultChg: 478.64, defaultPct: 0.93 },
  ];

  const INITIAL_INDICES_DATA = INDICES_CONFIG.map((idx) => {
    const rawHigh = idx.defaultHigh;
    const price = idx.defaultPrice;
    const distToHighRatio = (rawHigh - price) / (price > 0 ? price : 1);
    const athScore = Math.max(0, 1 - distToHighRatio);
    return {
      nameEN: idx.nameEN,
      nameES: idx.nameES,
      symbol: idx.symbol,
      price: price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      rawPrice: price,
      high: rawHigh,
      highFormatted: rawHigh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      change: (idx.defaultChg >= 0 ? "+" : "") + idx.defaultChg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      changePct: idx.defaultPct,
      athScorePct: Number((athScore * 100).toFixed(2)),
      distToHighPct: Number((distToHighRatio * 100).toFixed(2)),
      sparkline: [20, 25, 22, 30, 35, 40, 38, 45, 50],
    };
  });

  let indicesCache: { data: any[]; timestamp: number } = {
    data: INITIAL_INDICES_DATA,
    timestamp: 0,
  };
  let isUpdatingIndices = false;

  const refreshIndices = async () => {
    if (isUpdatingIndices) return;
    isUpdatingIndices = true;
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - 15);
    const symbols = INDICES_CONFIG.map((i) => i.symbol);

    try {
      // 1. Batch fetch all 4 indices quotes in one fast call with 6s timeout
      const quoteMap: Record<string, any> = {};
      try {
        const batchPromise = yahooFinance.quote(symbols, {}, { validateResult: false });
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 6000));
        const batchRes: any = await Promise.race([batchPromise, timeoutPromise]);
        if (Array.isArray(batchRes)) {
          batchRes.forEach((q: any) => {
            if (q && q.symbol) quoteMap[q.symbol.toUpperCase()] = q;
          });
        }
      } catch (e) {
        // Continue to fallback
      }

      const results = await Promise.all(
        INDICES_CONFIG.map(async (idxInfo) => {
          const prevItem = indicesCache.data.find((item: any) => item.symbol === idxInfo.symbol);
          try {
            let quote = quoteMap[idxInfo.symbol.toUpperCase()];
            if (!quote) {
              try {
                const singlePromise = yahooFinance.quote(idxInfo.symbol, {}, { validateResult: false });
                const singleTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
                quote = await Promise.race([singlePromise, singleTimeout]);
              } catch {
                // quote failed
              }
            }

            let history: any[] = [];
            try {
              history = await fetchSafeChartHistory(idxInfo.symbol, startDate, now, "1d");
            } catch {
              // ignore history error
            }

            const price = quote?.regularMarketPrice ?? prevItem?.rawPrice ?? idxInfo.defaultPrice;
            const change = quote?.regularMarketChange ?? (typeof prevItem?.change === "string" ? parseFloat(prevItem.change) : idxInfo.defaultChg);
            const changePct = quote?.regularMarketChangePercent ?? prevItem?.changePct ?? idxInfo.defaultPct;

            const defaultHighs: Record<string, number> = {
              "^GSPC": 7816.70,
              "^IXIC": 27288.79,
              "^DJI": 54744.33,
              "^VIX": 35.30,
            };

            let rawHigh = typeof quote?.fiftyTwoWeekHigh === "number" && quote.fiftyTwoWeekHigh >= price
              ? quote.fiftyTwoWeekHigh
              : (prevItem?.high || defaultHighs[idxInfo.symbol] || idxInfo.defaultHigh || price * 1.05);

            if (rawHigh < price) {
              rawHigh = price * 1.01;
            }

            const distToHighRatio = (rawHigh - price) / (price > 0 ? price : 1);
            const athScore = Math.max(0, 1 - distToHighRatio);
            const athScorePct = athScore * 100;
            const distToHighPct = distToHighRatio * 100;

            let sparkline = prevItem?.sparkline || [20, 25, 22, 30, 35, 40, 38, 45, 50];
            if (Array.isArray(history) && history.length > 0) {
              const closes = history.map((h: any) => h.close).filter((c: any) => typeof c === "number" && !isNaN(c));
              if (closes.length > 0) {
                const min = Math.min(...closes);
                const max = Math.max(...closes);
                const range = max - min || 1;
                sparkline = closes.map((c: number) => Math.round(((c - min) / range) * 100));
              }
            }

            return {
              nameEN: idxInfo.nameEN,
              nameES: idxInfo.nameES,
              symbol: idxInfo.symbol,
              price: price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              rawPrice: price,
              high: rawHigh,
              highFormatted: rawHigh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              change: (change >= 0 ? "+" : "") + change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              changePct: Number(Number(changePct).toFixed(2)),
              athScorePct: Number(athScorePct.toFixed(2)),
              distToHighPct: Number(distToHighPct.toFixed(2)),
              sparkline,
            };
          } catch {
            return prevItem || INITIAL_INDICES_DATA.find((item: any) => item.symbol === idxInfo.symbol);
          }
        })
      );

      if (results && results.length > 0) {
        indicesCache = { data: results, timestamp: Date.now() };
      }
    } catch {
      // Keep existing indicesCache
    } finally {
      isUpdatingIndices = false;
    }
  };

  app.get("/api/market/indices", async (req, res) => {
    if (indicesCache.timestamp === 0) {
      await refreshIndices();
    } else if (Date.now() - indicesCache.timestamp > 20000) {
      bg(refreshIndices());
    }
    res.json(indicesCache.data);
  });

  // In-memory cache for top 50 tickers
  const TOP_50_DEFAULTS = [
    { symbol: "NVDA", defaultPrice: 128.50, defaultChgPct: 2.35 },
    { symbol: "AAPL", defaultPrice: 224.30, defaultChgPct: -0.42 },
    { symbol: "MSFT", defaultPrice: 448.90, defaultChgPct: 1.15 },
    { symbol: "GOOGL", defaultPrice: 334.53, defaultChgPct: -0.65 },
    { symbol: "AMZN", defaultPrice: 239.00, defaultChgPct: 5.45 },
    { symbol: "META", defaultPrice: 535.05, defaultChgPct: -8.63 },
    { symbol: "TSLA", defaultPrice: 309.69, defaultChgPct: 3.81 },
    { symbol: "BRK-B", defaultPrice: 508.50, defaultChgPct: -0.13 },
    { symbol: "AVGO", defaultPrice: 162.30, defaultChgPct: 1.85 },
    { symbol: "LLY", defaultPrice: 845.20, defaultChgPct: 0.92 },
    { symbol: "JPM", defaultPrice: 351.48, defaultChgPct: 1.96 },
    { symbol: "V", defaultPrice: 365.68, defaultChgPct: -0.83 },
    { symbol: "UNH", defaultPrice: 422.95, defaultChgPct: 0.57 },
    { symbol: "XOM", defaultPrice: 157.07, defaultChgPct: 0.20 },
    { symbol: "MA", defaultPrice: 462.10, defaultChgPct: -0.45 },
    { symbol: "PG", defaultPrice: 168.30, defaultChgPct: 0.32 },
    { symbol: "COST", defaultPrice: 852.40, defaultChgPct: 1.12 },
    { symbol: "JNJ", defaultPrice: 256.16, defaultChgPct: -3.53 },
    { symbol: "HD", defaultPrice: 365.80, defaultChgPct: 0.78 },
    { symbol: "ABBV", defaultPrice: 174.20, defaultChgPct: 0.41 },
    { symbol: "BAC", defaultPrice: 39.80, defaultChgPct: 1.25 },
    { symbol: "NFLX", defaultPrice: 658.00, defaultChgPct: 2.10 },
    { symbol: "WMT", defaultPrice: 68.50, defaultChgPct: 0.65 },
    { symbol: "CRM", defaultPrice: 254.30, defaultChgPct: -1.15 },
    { symbol: "AMD", defaultPrice: 142.60, defaultChgPct: 2.40 },
    { symbol: "CVX", defaultPrice: 158.20, defaultChgPct: -0.35 },
    { symbol: "ORCL", defaultPrice: 138.90, defaultChgPct: 1.62 },
    { symbol: "DIS", defaultPrice: 96.40, defaultChgPct: -0.85 },
    { symbol: "PEP", defaultPrice: 172.50, defaultChgPct: 0.15 },
    { symbol: "KO", defaultPrice: 64.20, defaultChgPct: 0.28 },
    { symbol: "TSM", defaultPrice: 168.50, defaultChgPct: 2.80 },
    { symbol: "ADBE", defaultPrice: 512.30, defaultChgPct: -0.92 },
    { symbol: "ACN", defaultPrice: 298.40, defaultChgPct: 0.48 },
    { symbol: "CSCO", defaultPrice: 46.80, defaultChgPct: -0.22 },
    { symbol: "NKE", defaultPrice: 75.40, defaultChgPct: -1.45 },
    { symbol: "MCD", defaultPrice: 268.90, defaultChgPct: 0.35 },
    { symbol: "ABT", defaultPrice: 105.20, defaultChgPct: 0.18 },
    { symbol: "MRK", defaultPrice: 124.60, defaultChgPct: -0.62 },
    { symbol: "DHR", defaultPrice: 258.40, defaultChgPct: 0.85 },
    { symbol: "TXN", defaultPrice: 198.20, defaultChgPct: 1.05 },
    { symbol: "PM", defaultPrice: 108.50, defaultChgPct: 0.42 },
    { symbol: "AMGN", defaultPrice: 312.40, defaultChgPct: -0.38 },
    { symbol: "IBM", defaultPrice: 184.60, defaultChgPct: 0.72 },
    { symbol: "GE", defaultPrice: 162.50, defaultChgPct: 1.35 },
    { symbol: "INTU", defaultPrice: 638.20, defaultChgPct: -0.75 },
    { symbol: "QCOM", defaultPrice: 172.80, defaultChgPct: 1.95 },
    { symbol: "CAT", defaultPrice: 345.60, defaultChgPct: 0.88 },
    { symbol: "NOW", defaultPrice: 812.50, defaultChgPct: -0.52 },
    { symbol: "AMAT", defaultPrice: 208.40, defaultChgPct: 2.15 },
    { symbol: "PLTR", defaultPrice: 28.50, defaultChgPct: 4.12 },
  ];

  let top50Cache: { data: any[]; timestamp: number } = {
    data: TOP_50_DEFAULTS.map((t) => ({ symbol: t.symbol, price: t.defaultPrice, changePct: t.defaultChgPct })),
    timestamp: 0,
  };
  let isUpdatingTop50 = false;

  const refreshTop50 = async () => {
    if (isUpdatingTop50) return;
    isUpdatingTop50 = true;
    try {
      // Chunk symbols into groups of 25 for batch quoting
      const symbols = TOP_50_DEFAULTS.map((t) => t.symbol.replace(/\./g, "-"));
      const chunks = [symbols.slice(0, 25), symbols.slice(25)];
      const quoteMap: Record<string, any> = {};

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const batchPromise = yahooFinance.quote(chunk, {}, { validateResult: false });
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
            const batchQuotes: any = await Promise.race([batchPromise, timeoutPromise]);
            if (Array.isArray(batchQuotes)) {
              batchQuotes.forEach((q: any) => {
                if (q && q.symbol) {
                  quoteMap[q.symbol.toUpperCase()] = q;
                }
              });
            }
          } catch {
            // chunk failed
          }
        })
      );

      const results = TOP_50_DEFAULTS.map((item) => {
        const yahooSymbol = item.symbol.replace(/\./g, "-").toUpperCase();
        const quote = quoteMap[yahooSymbol] || quoteMap[item.symbol.toUpperCase()];
        const prev = top50Cache.data.find((t) => t.symbol === item.symbol);
        return {
          symbol: item.symbol,
          price: typeof quote?.regularMarketPrice === "number" ? Number(quote.regularMarketPrice.toFixed(2)) : (prev?.price ?? item.defaultPrice),
          changePct: typeof quote?.regularMarketChangePercent === "number" ? Number(quote.regularMarketChangePercent.toFixed(2)) : (prev?.changePct ?? item.defaultChgPct),
        };
      });

      top50Cache = { data: results, timestamp: Date.now() };
    } catch {
      // Keep existing top50Cache data
    } finally {
      isUpdatingTop50 = false;
    }
  };

  // 1.6.5 Top 50 Tickers by Market Cap route
  app.get("/api/market/top50", async (req, res) => {
    if (top50Cache.timestamp === 0) {
      await refreshTop50();
    } else if (Date.now() - top50Cache.timestamp > 45000) {
      bg(refreshTop50());
    }
    res.json(top50Cache.data);
  });

  // 1.6.6 S&P 500 Sector Top 10 Holdings with real-time quotes & multi-timeframe returns
  let sectorTop10Cache: { data: Record<string, any>; timestamp: number } = {
    data: JSON.parse(JSON.stringify(SECTOR_TOP_HOLDINGS)),
    timestamp: 0,
  };
  let isUpdatingSectorTop10 = false;

  const refreshSectorTop10 = async () => {
    if (isUpdatingSectorTop10) return;
    isUpdatingSectorTop10 = true;
    try {
      const allSymbols = new Set<string>();
      Object.values(sectorTop10Cache.data).forEach((sec: any) => {
        if (sec && Array.isArray(sec.holdings)) {
          sec.holdings.forEach((h: any) => {
            if (h && h.symbol) allSymbols.add(h.symbol);
          });
        }
      });

      const symbolList = Array.from(allSymbols).map((s) => s.replace(/\./g, "-"));
      const chunkSize = 25;
      const quoteMap: Record<string, any> = {};

      for (let i = 0; i < symbolList.length; i += chunkSize) {
        const chunk = symbolList.slice(i, i + chunkSize);
        try {
          const batchPromise = yahooFinance.quote(chunk, {}, { validateResult: false });
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
          const quotes: any = await Promise.race([batchPromise, timeoutPromise]);
          if (Array.isArray(quotes)) {
            quotes.forEach((q: any) => {
              if (q && q.symbol) {
                quoteMap[q.symbol.toUpperCase()] = q;
              }
            });
          }
        } catch {
          // chunk failed, continue
        }
      }

      const updatedData: Record<string, any> = {};
      for (const [secTicker, secConfig] of Object.entries(sectorTop10Cache.data)) {
        const updatedHoldings = (secConfig as any).holdings.map((h: any) => {
          const ySym = h.symbol.replace(/\./g, "-").toUpperCase();
          const quote = quoteMap[ySym] || quoteMap[h.symbol.toUpperCase()];
          if (!quote) return h;

          const curPrice = typeof quote.regularMarketPrice === "number" ? Number(quote.regularMarketPrice.toFixed(2)) : h.price;
          const chgPct1D = typeof quote.regularMarketChangePercent === "number" ? Number(quote.regularMarketChangePercent.toFixed(2)) : h.returns["1D"];
          const chgPct1Y = typeof quote.fiftyTwoWeekChangePercent === "number" ? Number(quote.fiftyTwoWeekChangePercent.toFixed(2)) : h.returns["1Y"];

          const rawHigh = typeof quote.fiftyTwoWeekHigh === "number" && quote.fiftyTwoWeekHigh > 0
            ? Number(quote.fiftyTwoWeekHigh.toFixed(2))
            : (h.fiftyTwoWeekHigh || Number((curPrice * 1.08).toFixed(2)));
          const high52 = Math.max(rawHigh, curPrice);
          const diff52WHighPct = high52 > 0 ? Number((((curPrice - high52) / high52) * 100).toFixed(2)) : 0;
          const upside52WHighPct = curPrice > 0 && high52 >= curPrice ? Number((((high52 - curPrice) / curPrice) * 100).toFixed(2)) : 0;

          return {
            ...h,
            price: curPrice,
            fiftyTwoWeekHigh: high52,
            diff52WHighPct,
            upside52WHighPct,
            returns: {
              ...h.returns,
              "1D": chgPct1D,
              "1Y": chgPct1Y || h.returns["1Y"],
            },
          };
        });

        updatedData[secTicker] = {
          ...(secConfig as any),
          holdings: updatedHoldings,
        };
      }

      sectorTop10Cache = { data: updatedData, timestamp: Date.now() };
    } catch {
      // keep cache
    } finally {
      isUpdatingSectorTop10 = false;
    }
  };

  app.get("/api/market/sector-top10", async (req, res) => {
    const requestedSector = typeof req.query.sector === "string" ? req.query.sector.toUpperCase().trim() : "";
    if (sectorTop10Cache.timestamp === 0) {
      await refreshSectorTop10();
    } else if (Date.now() - sectorTop10Cache.timestamp > 60000) {
      bg(refreshSectorTop10());
    }

    if (requestedSector && sectorTop10Cache.data[requestedSector]) {
      return res.json(sectorTop10Cache.data[requestedSector]);
    }
    res.json(sectorTop10Cache.data);
  });


  // 1.7 Commodities & Crypto real-time route with in-memory cache
  const COMMODITIES_CONFIG = [
    { nameEN: "Gold", nameES: "Oro", symbol: "GC=F", defaultPrice: 4320.50, defaultHigh: 5586.20 },
    { nameEN: "Silver", nameES: "Plata", symbol: "SI=F", defaultPrice: 64.71, defaultHigh: 121.30 },
    { nameEN: "Copper", nameES: "Cobre", symbol: "HG=F", defaultPrice: 6.78, defaultHigh: 6.83 },
    { nameEN: "Crude Oil", nameES: "Petróleo Crudo", symbol: "CL=F", defaultPrice: 92.44, defaultHigh: 119.48 },
    { nameEN: "Natural Gas", nameES: "Gas Natural", symbol: "NG=F", defaultPrice: 3.25, defaultHigh: 7.83 },
  ];

  const CRYPTOS_CONFIG = [
    { nameEN: "Bitcoin", nameES: "Bitcoin", symbol: "BTC-USD", defaultPrice: 83814.00, defaultHigh: 126198.00 },
    { nameEN: "Ethereum", nameES: "Ethereum", symbol: "ETH-USD", defaultPrice: 2680.00, defaultHigh: 4755.00 },
  ];

  const INITIAL_COMMODITIES_DATA = COMMODITIES_CONFIG.map((item) => {
    const price = item.defaultPrice;
    const rawHigh = item.defaultHigh;
    const distToHighRatio = (rawHigh - price) / (price > 0 ? price : 1);
    const athScorePct = Math.min(100, Math.max(5, (price / rawHigh) * 100));
    const distToHighPct = Math.max(0, ((rawHigh - price) / rawHigh) * 100);
    return {
      nameEN: item.nameEN,
      nameES: item.nameES,
      symbol: item.symbol,
      price: price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      rawPrice: price,
      high: rawHigh,
      highFormatted: rawHigh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      pct: 0.45,
      athScorePct: Number(athScorePct.toFixed(1)),
      distToHighPct: Number(distToHighPct.toFixed(1)),
    };
  });

  const INITIAL_CRYPTOS_DATA = CRYPTOS_CONFIG.map((item) => {
    const price = item.defaultPrice;
    const rawHigh = item.defaultHigh;
    const athScorePct = Math.min(100, Math.max(5, (price / (rawHigh > 0 ? rawHigh : 1)) * 100));
    const distToHighPct = Math.max(0, ((rawHigh - price) / (rawHigh > 0 ? rawHigh : 1)) * 100);
    return {
      nameEN: item.nameEN,
      nameES: item.nameES,
      symbol: item.symbol,
      price: price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      rawPrice: price,
      high: rawHigh,
      highFormatted: rawHigh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      pct: 2.26,
      athScorePct: Number(athScorePct.toFixed(1)),
      distToHighPct: Number(distToHighPct.toFixed(1)),
    };
  });

  let commoditiesCryptoCache: { data: { commodities: any[]; cryptos: any[] }; timestamp: number } = {
    data: { commodities: INITIAL_COMMODITIES_DATA, cryptos: INITIAL_CRYPTOS_DATA },
    timestamp: 0,
  };
  let isUpdatingCommoditiesCrypto = false;

  const refreshCommoditiesCrypto = async () => {
    if (isUpdatingCommoditiesCrypto) return;
    isUpdatingCommoditiesCrypto = true;

    try {
      const allSymbols = [
        ...COMMODITIES_CONFIG.map((c) => c.symbol),
        ...CRYPTOS_CONFIG.map((c) => c.symbol),
      ];

      // Single batch quote for all commodities & crypto with 6-second timeout
      const quoteMap: Record<string, any> = {};
      try {
        const batchPromise = yahooFinance.quote(allSymbols, {}, { validateResult: false });
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 6000));
        const batchQuotes: any = await Promise.race([batchPromise, timeoutPromise]);
        if (Array.isArray(batchQuotes)) {
          batchQuotes.forEach((q: any) => {
            if (q && q.symbol) quoteMap[q.symbol.toUpperCase()] = q;
          });
        }
      } catch (err) {
        // Continue with individual quotes if batch fails
      }

      const commoditiesResult = COMMODITIES_CONFIG.map((item) => {
        const prev = commoditiesCryptoCache.data.commodities.find((c: any) => c.symbol === item.symbol);
        const quote = quoteMap[item.symbol.toUpperCase()];
        const price = typeof quote?.regularMarketPrice === "number" ? quote.regularMarketPrice : (prev?.rawPrice ?? item.defaultPrice);
        const changePct = typeof quote?.regularMarketChangePercent === "number" ? quote.regularMarketChangePercent : (prev?.pct ?? 0.0);
        let rawHigh = quote?.fiftyTwoWeekHigh || prev?.high || item.defaultHigh || price * 1.10;
        if (rawHigh < price) rawHigh = price;

        const athScorePct = Math.min(100, Math.max(5, (price / (rawHigh > 0 ? rawHigh : 1)) * 100));
        const distToHighPct = Math.max(0, ((rawHigh - price) / (rawHigh > 0 ? rawHigh : 1)) * 100);

        return {
          nameEN: item.nameEN,
          nameES: item.nameES,
          symbol: item.symbol,
          price: price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          rawPrice: price,
          high: rawHigh,
          highFormatted: rawHigh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          pct: Number(Number(changePct).toFixed(2)),
          athScorePct: Number(athScorePct.toFixed(1)),
          distToHighPct: Number(distToHighPct.toFixed(1)),
        };
      });

      const cryptosResult = CRYPTOS_CONFIG.map((item) => {
        const prev = commoditiesCryptoCache.data.cryptos.find((c: any) => c.symbol === item.symbol);
        const quote = quoteMap[item.symbol.toUpperCase()];
        const price = typeof quote?.regularMarketPrice === "number" ? quote.regularMarketPrice : (prev?.rawPrice ?? item.defaultPrice);
        const changePct = typeof quote?.regularMarketChangePercent === "number" ? quote.regularMarketChangePercent : (prev?.pct ?? 0.0);
        let rawHigh = quote?.fiftyTwoWeekHigh || prev?.high || item.defaultHigh || price * 1.15;
        if (rawHigh < price) rawHigh = price;

        const athScorePct = Math.min(100, Math.max(5, (price / (rawHigh > 0 ? rawHigh : 1)) * 100));
        const distToHighPct = Math.max(0, ((rawHigh - price) / (rawHigh > 0 ? rawHigh : 1)) * 100);

        return {
          nameEN: item.nameEN,
          nameES: item.nameES,
          symbol: item.symbol,
          price: price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          rawPrice: price,
          high: rawHigh,
          highFormatted: rawHigh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          pct: Number(Number(changePct).toFixed(2)),
          athScorePct: Number(athScorePct.toFixed(1)),
          distToHighPct: Number(distToHighPct.toFixed(1)),
        };
      });

      commoditiesCryptoCache = {
        data: { commodities: commoditiesResult, cryptos: cryptosResult },
        timestamp: Date.now(),
      };
    } catch {
      // Keep existing commoditiesCryptoCache
    } finally {
      isUpdatingCommoditiesCrypto = false;
    }
  };

  app.get("/api/market/commodities-crypto", async (req, res) => {
    if (commoditiesCryptoCache.timestamp === 0) {
      await refreshCommoditiesCrypto();
    } else if (Date.now() - commoditiesCryptoCache.timestamp > 25000) {
      bg(refreshCommoditiesCrypto());
    }
    res.json(commoditiesCryptoCache.data);
  });

  // In-memory cache for superinvestor stats to ensure lightning-fast responses and prevent API rate-limiting
  let superinvestorsStatsCache: { timestamp: number; data: any } = { timestamp: 0, data: null };

  // Fetch real-time portfolio stats for all superinvestors in bulk
  app.get("/api/superinvestors/stats", async (req, res) => {
    // Return cached stats if less than 60 seconds old
    if (superinvestorsStatsCache.data && Date.now() - superinvestorsStatsCache.timestamp < 60000) {
      return res.json(superinvestorsStatsCache.data);
    }

    try {
      const uniqueTickers = new Set<string>();
      Object.values(SUPERINVESTORS).forEach((si) => {
        si.holdings.forEach((h) => {
          if (h.ticker && h.ticker.toUpperCase() !== "CASH") {
            uniqueTickers.add(h.ticker.toUpperCase());
          }
        });
      });

      const tickers = Array.from(uniqueTickers);
      let liveQuotes: Record<string, any> = {};

      if (tickers.length > 0) {
        try {
          const quotePromises = tickers.map(async (ticker) => {
            try {
              const yahooTicker = ticker.replace(/\./g, "-");
              // Timeout each quote after 2000ms so the whole request never hangs
              const quotePromise = yahooFinance.quote(yahooTicker, {}, { validateResult: false });
              const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
              const q: any = await Promise.race([quotePromise, timeoutPromise]);
              if (!q) return null;
              return {
                symbol: ticker,
                yahooSymbol: yahooTicker,
                regularMarketPrice: q.regularMarketPrice,
                regularMarketPreviousClose: q.regularMarketPreviousClose,
                longName: q.longName || q.shortName || q.symbol,
              };
            } catch (err) {
              return null;
            }
          });

          const resolvedQuotes = await Promise.all(quotePromises);
          resolvedQuotes.forEach((q) => {
            if (q && q.symbol) {
              liveQuotes[q.symbol.toUpperCase()] = q;
              if (q.yahooSymbol) {
                liveQuotes[q.yahooSymbol.toUpperCase()] = q;
              }
            }
          });
        } catch (apiError) {
          console.log("[Stats Info] Using fallback parameters for superinvestors real-time quotes");
        }
      }

      const stats: Record<string, any> = {};

      Object.entries(SUPERINVESTORS).forEach(([key, si]) => {
        let totalPortfolioValue = 0;
        let totalCostBasis = 0;
        let totalDailyPnL = 0;

        si.holdings.forEach((h) => {
          const ticker = h.ticker.toUpperCase();
          if (ticker === "CASH") {
            totalPortfolioValue += h.shares;
            totalCostBasis += h.shares;
          } else {
            const quoteSource = liveQuotes[ticker] || FALLBACK_QUOTES[ticker] || {
              regularMarketPrice: h.avgCost || 100,
              regularMarketPreviousClose: (h.avgCost || 100) * 0.98,
            };

            const price = quoteSource.regularMarketPrice;
            const prevClose = quoteSource.regularMarketPreviousClose || price * 0.99;
            const shares = Number(h.shares) || 0;
            const avgCost = Number(h.avgCost) || 0;

            totalPortfolioValue += shares * price;
            totalCostBasis += shares * avgCost;
            totalDailyPnL += shares * (price - prevClose);
          }
        });

        const dailyPnLPercent = totalPortfolioValue > 0 ? (totalDailyPnL / (totalPortfolioValue - totalDailyPnL)) * 100 : 0;
        const totalReturnAmt = totalPortfolioValue - totalCostBasis;
        const totalReturnPercent = totalCostBasis > 0 ? (totalReturnAmt / totalCostBasis) * 100 : 0;

        stats[key] = {
          mktValue: totalPortfolioValue,
          dailyPnL: totalDailyPnL,
          dailyPnLPercent,
          totalReturn: totalReturnAmt,
          totalReturnPercent,
        };
      });

      // Save to cache
      superinvestorsStatsCache = { timestamp: Date.now(), data: stats };
      res.json(stats);
    } catch (err: any) {
      console.error("Superinvestors stats calculation error:", err);
      if (superinvestorsStatsCache.data) {
        return res.json(superinvestorsStatsCache.data);
      }
      res.json({});
    }
  });

  // Route alias for portfolio stats requests
  app.all("/api/portfolio/stats", async (req, res) => {
    try {
      if (superinvestorsStatsCache.data) {
        return res.json({ status: "ok", stats: superinvestorsStatsCache.data });
      }
      res.json({ status: "ok", stats: {} });
    } catch {
      res.json({ status: "ok", stats: {} });
    }
  });

  // Fetch combined portfolio stats and allocations for a weighted combination of all superinvestors
  app.post("/api/superinvestors/combined", async (req, res) => {
    try {
      const { weights = {} } = req.body;

      // Ensure all superinvestors are present in weights, default to 0 if not specified
      const superinvestorKeys = Object.keys(SUPERINVESTORS);
      let totalWeightInput = 0;
      const cleanWeights: Record<string, number> = {};

      superinvestorKeys.forEach((key) => {
        const w = Number(weights[key]);
        cleanWeights[key] = isNaN(w) || w < 0 ? 0 : w;
        totalWeightInput += cleanWeights[key];
      });

      // If all weights are 0, use equal weights (1 for each)
      if (totalWeightInput === 0) {
        superinvestorKeys.forEach((key) => {
          cleanWeights[key] = 1;
        });
        totalWeightInput = superinvestorKeys.length;
      }

      // Normalize weights
      const normalizedWeights: Record<string, number> = {};
      superinvestorKeys.forEach((key) => {
        normalizedWeights[key] = cleanWeights[key] / totalWeightInput;
      });

      // Fetch all unique tickers across all superinvestors
      const uniqueTickers = new Set<string>();
      Object.values(SUPERINVESTORS).forEach((si) => {
        si.holdings.forEach((h) => {
          if (h.ticker && h.ticker.toUpperCase() !== "CASH") {
            uniqueTickers.add(h.ticker.toUpperCase());
          }
        });
      });

      const tickers = Array.from(uniqueTickers);
      let liveQuotes: Record<string, any> = {};

      if (tickers.length > 0) {
        try {
          const quotePromises = tickers.map(async (ticker) => {
            try {
              const yahooTicker = ticker.replace(/\./g, "-");
              const q: any = await yahooFinance.quote(yahooTicker, {}, { validateResult: false });
              if (!q) return null;
              
              let trailingPE: number | null = null;
              let forwardPE: number | null = null;
              let pegRatio: number | null = null;
              let evEbitda: number | null = null;
              let fiftyTwoWeekHigh: number | null = null;
              let targetMeanPrice: number | null = null;
              let targetHighPrice: number | null = null;
              let dividendRate: number | null = null;
              let fiftyDayAverage: number | null = null;
              let twoHundredDayAverage: number | null = null;

              try {
                const summary: any = await yahooFinance.quoteSummary(yahooTicker, {
                  modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "price"]
                }, { validateResult: false });
                
                if (summary) {
                  if (summary.summaryDetail) {
                    const sd = summary.summaryDetail;
                    if (sd.trailingPE && typeof sd.trailingPE === "object" && sd.trailingPE.raw !== undefined) {
                      trailingPE = sd.trailingPE.raw;
                    } else if (typeof sd.trailingPE === "number") {
                      trailingPE = sd.trailingPE;
                    }
                    if (sd.pegRatio && typeof sd.pegRatio === "object" && sd.pegRatio.raw !== undefined) {
                      pegRatio = sd.pegRatio.raw;
                    } else if (typeof sd.pegRatio === "number") {
                      pegRatio = sd.pegRatio;
                    }
                    if (sd.fiftyTwoWeekHigh && typeof sd.fiftyTwoWeekHigh === "object" && sd.fiftyTwoWeekHigh.raw !== undefined) {
                      fiftyTwoWeekHigh = sd.fiftyTwoWeekHigh.raw;
                    } else if (typeof sd.fiftyTwoWeekHigh === "number") {
                      fiftyTwoWeekHigh = sd.fiftyTwoWeekHigh;
                    }
                    if (sd.dividendRate && typeof sd.dividendRate === "object" && sd.dividendRate.raw !== undefined) {
                      dividendRate = sd.dividendRate.raw;
                    } else if (typeof sd.dividendRate === "number") {
                      dividendRate = sd.dividendRate;
                    } else if (sd.trailingAnnualDividendRate && typeof sd.trailingAnnualDividendRate === "object" && sd.trailingAnnualDividendRate.raw !== undefined) {
                      dividendRate = sd.trailingAnnualDividendRate.raw;
                    } else if (typeof sd.trailingAnnualDividendRate === "number") {
                      dividendRate = sd.trailingAnnualDividendRate;
                    }
                    if (sd.fiftyDayAverage && typeof sd.fiftyDayAverage === "object" && sd.fiftyDayAverage.raw !== undefined) {
                      fiftyDayAverage = sd.fiftyDayAverage.raw;
                    } else if (typeof sd.fiftyDayAverage === "number") {
                      fiftyDayAverage = sd.fiftyDayAverage;
                    }
                    if (sd.twoHundredDayAverage && typeof sd.twoHundredDayAverage === "object" && sd.twoHundredDayAverage.raw !== undefined) {
                      twoHundredDayAverage = sd.twoHundredDayAverage.raw;
                    } else if (typeof sd.twoHundredDayAverage === "number") {
                      twoHundredDayAverage = sd.twoHundredDayAverage;
                    }
                  }
                  if (summary.defaultKeyStatistics) {
                    const dks = summary.defaultKeyStatistics;
                    if (dks.forwardPE && typeof dks.forwardPE === "object" && dks.forwardPE.raw !== undefined) {
                      forwardPE = dks.forwardPE.raw;
                    } else if (typeof dks.forwardPE === "number") {
                      forwardPE = dks.forwardPE;
                    }
                    if (pegRatio === null) {
                      if (dks.pegRatio && typeof dks.pegRatio === "object" && dks.pegRatio.raw !== undefined) {
                        pegRatio = dks.pegRatio.raw;
                      } else if (typeof dks.pegRatio === "number") {
                        pegRatio = dks.pegRatio;
                      }
                    }
                    if (dks.enterpriseToEbitda && typeof dks.enterpriseToEbitda === "object" && dks.enterpriseToEbitda.raw !== undefined) {
                      evEbitda = dks.enterpriseToEbitda.raw;
                    } else if (typeof dks.enterpriseToEbitda === "number") {
                      evEbitda = dks.enterpriseToEbitda;
                    }
                    if (dividendRate === null && dks.trailingAnnualDividendRate) {
                      if (typeof dks.trailingAnnualDividendRate === "object" && dks.trailingAnnualDividendRate.raw !== undefined) {
                        dividendRate = dks.trailingAnnualDividendRate.raw;
                      } else if (typeof dks.trailingAnnualDividendRate === "number") {
                        dividendRate = dks.trailingAnnualDividendRate;
                      }
                    }
                  }
                  if (summary.financialData) {
                    const fd = summary.financialData;
                    if (fd.targetMeanPrice && typeof fd.targetMeanPrice === "object" && fd.targetMeanPrice.raw !== undefined) {
                      targetMeanPrice = fd.targetMeanPrice.raw;
                    } else if (typeof fd.targetMeanPrice === "number") {
                      targetMeanPrice = fd.targetMeanPrice;
                    }
                    if (fd.targetHighPrice && typeof fd.targetHighPrice === "object" && fd.targetHighPrice.raw !== undefined) {
                      targetHighPrice = fd.targetHighPrice.raw;
                    } else if (typeof fd.targetHighPrice === "number") {
                      targetHighPrice = fd.targetHighPrice;
                    }
                  }
                  if (forwardPE === null && summary.summaryDetail) {
                    const sd = summary.summaryDetail;
                    if (sd.forwardPE && typeof sd.forwardPE === "object" && sd.forwardPE.raw !== undefined) {
                      forwardPE = sd.forwardPE.raw;
                    } else if (typeof sd.forwardPE === "number") {
                      forwardPE = sd.forwardPE;
                    }
                  }
                }
                var priceInfo = extractPriceAndQuoteData(q, summary);
              } catch (summaryErr) {
                var priceInfo = extractPriceAndQuoteData(q);
              }

              return {
                symbol: ticker,
                yahooSymbol: yahooTicker,
                regularMarketPrice: priceInfo.price,
                regularMarketPriceRaw: priceInfo.regularMarketPrice,
                regularMarketPreviousClose: priceInfo.regularMarketPreviousClose,
                postMarketPrice: priceInfo.postMarketPrice,
                preMarketPrice: priceInfo.preMarketPrice,
                marketState: priceInfo.marketState,
                isAfterHoursPrice: priceInfo.isAfterHoursPrice,
                longName: q.longName || q.shortName || q.symbol,
                trailingPE: trailingPE !== null ? trailingPE : (q.trailingPE || q.trailingPe || null),
                forwardPE: forwardPE !== null ? forwardPE : (q.forwardPE || q.forwardPe || null),
                pegRatio: pegRatio !== null ? pegRatio : (q.pegRatio !== undefined ? q.pegRatio : null),
                evEbitda: evEbitda !== null ? evEbitda : null,
                fiftyTwoWeekHigh: fiftyTwoWeekHigh !== null ? fiftyTwoWeekHigh : (q.fiftyTwoWeekHigh || null),
                targetMeanPrice: targetMeanPrice !== null ? targetMeanPrice : null,
                targetHighPrice: targetHighPrice !== null ? targetHighPrice : null,
                dividendRate: dividendRate !== null ? dividendRate : (q.dividendRate || q.trailingAnnualDividendRate || null),
              };
            } catch (err) {
              return null;
            }
          });

          const resolvedQuotes = await Promise.all(quotePromises);
          resolvedQuotes.forEach((q) => {
            if (q && q.symbol) {
              liveQuotes[q.symbol.toUpperCase()] = q;
              if (q.yahooSymbol) {
                liveQuotes[q.yahooSymbol.toUpperCase()] = q;
              }
            }
          });
        } catch (apiError) {
          console.log("[Combined Info] Using fallback model for combined superinvestors");
        }
      }

      // Calculate the real total value of each superinvestor's portfolio based on fetched prices
      const siRealValues: Record<string, number> = {};
      Object.entries(SUPERINVESTORS).forEach(([key, si]) => {
        let totalValue = 0;
        si.holdings.forEach((h) => {
          const ticker = h.ticker.toUpperCase();
          if (ticker === "CASH") {
            totalValue += h.shares;
          } else {
            const quote = liveQuotes[ticker] || FALLBACK_QUOTES[ticker] || { regularMarketPrice: h.avgCost || 100 };
            totalValue += h.shares * quote.regularMarketPrice;
          }
        });
        siRealValues[key] = totalValue;
      });

      // Aggregate holdings of all superinvestors weighted by normalized weights
      const targetTotalPortfolioValue = 1000000000; // $1B combined base
      const combinedWeights: Record<string, number> = {}; // Ticker -> combined weight
      const combinedCostBasisNumerator: Record<string, number> = {}; // Ticker -> weighted cost basis numerator
      const combinedCostBasisDenominator: Record<string, number> = {}; // Ticker -> weighted cost basis denominator

      Object.entries(SUPERINVESTORS).forEach(([key, si]) => {
        const investorNormalizedWeight = normalizedWeights[key];
        if (investorNormalizedWeight === 0) return;

        const investorRealValue = siRealValues[key] || 1;

        si.holdings.forEach((h) => {
          const ticker = h.ticker.toUpperCase();
          let holdingMktValue = 0;

          if (ticker === "CASH") {
            holdingMktValue = h.shares;
          } else {
            const quote = liveQuotes[ticker] || FALLBACK_QUOTES[ticker] || { regularMarketPrice: h.avgCost || 100 };
            holdingMktValue = h.shares * quote.regularMarketPrice;
          }

          const holdingWeightInInvestor = holdingMktValue / investorRealValue;
          const weightedHoldingWeight = investorNormalizedWeight * holdingWeightInInvestor;

          combinedWeights[ticker] = (combinedWeights[ticker] || 0) + weightedHoldingWeight;

          combinedCostBasisNumerator[ticker] = (combinedCostBasisNumerator[ticker] || 0) + (weightedHoldingWeight * h.avgCost);
          combinedCostBasisDenominator[ticker] = (combinedCostBasisDenominator[ticker] || 0) + weightedHoldingWeight;
        });
      });

      // Now create virtual holdings
      const combinedHoldings: any[] = [];
      Object.entries(combinedWeights).forEach(([ticker, weight]) => {
        if (weight <= 0) return;
        const targetHoldingValue = weight * targetTotalPortfolioValue;
        
        let price = 1;
        if (ticker !== "CASH") {
          const quote = liveQuotes[ticker] || FALLBACK_QUOTES[ticker] || { regularMarketPrice: 100 };
          price = quote.regularMarketPrice;
        }

        const shares = targetHoldingValue / price;
        const avgCost = combinedCostBasisDenominator[ticker] > 0
          ? combinedCostBasisNumerator[ticker] / combinedCostBasisDenominator[ticker]
          : 1;

        combinedHoldings.push({
          ticker,
          shares,
          avgCost,
          isCash: ticker === "CASH"
        });
      });

      // Now map these combined holdings to the final positions structure
      const positions = combinedHoldings.map((h) => {
        const ticker = h.ticker.toUpperCase();
        if (ticker === "CASH") {
          return {
            ticker: "Cash",
            name: "US Dollar Cash Balance",
            price: 1,
            shares: h.shares,
            avgCost: 1,
            mktValue: h.shares,
            weight: (h.shares / targetTotalPortfolioValue) * 100,
            pe: null,
            fwdPe: null,
            peg: null,
            dailyPnL: 0,
            chgPct: 0,
            returnAmt: 0,
            returnPct: 0,
            isCash: true,
          };
        }

        const quoteSource = liveQuotes[ticker] || FALLBACK_QUOTES[ticker] || {
          regularMarketPrice: h.avgCost || 100,
          regularMarketPreviousClose: (h.avgCost || 100) * 0.98,
          longName: `${ticker} Corporation`,
          trailingPE: 20,
          forwardPE: 18,
          pegRatio: 1.2,
        };

        const price = quoteSource.regularMarketPrice;
        const prevClose = quoteSource.regularMarketPreviousClose || price * 0.99;
        const shares = h.shares;
        const avgCost = h.avgCost;

        const mktValue = shares * price;
        const costBasis = shares * avgCost;
        
        const dailyPnL = shares * (price - prevClose);
        const chgPct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
        
        const returnAmt = mktValue - costBasis;
        const returnPct = costBasis > 0 ? (returnAmt / costBasis) * 100 : 0;
        const finalWeight = (mktValue / targetTotalPortfolioValue) * 100;

        return {
          ticker,
          name: quoteSource.longName || ticker,
          price,
          shares,
          avgCost,
          mktValue,
          weight: finalWeight,
          pe: (quoteSource.trailingPE !== undefined && quoteSource.trailingPE !== null) ? quoteSource.trailingPE : null,
          fwdPe: (quoteSource.forwardPE !== undefined && quoteSource.forwardPE !== null) ? quoteSource.forwardPE : null,
          peg: (quoteSource.pegRatio !== undefined && quoteSource.pegRatio !== null) ? quoteSource.pegRatio : null,
          evEbitda: (quoteSource.evEbitda !== undefined && quoteSource.evEbitda !== null) ? quoteSource.evEbitda : null,
          dividendRate: (quoteSource.dividendRate !== undefined && quoteSource.dividendRate !== null) ? quoteSource.dividendRate : null,
          dailyPnL,
          chgPct,
          returnAmt,
          returnPct,
          isCash: false,
          fiftyTwoWeekHigh: (quoteSource.fiftyTwoWeekHigh !== undefined && quoteSource.fiftyTwoWeekHigh !== null) ? quoteSource.fiftyTwoWeekHigh : null,
          targetMeanPrice: (quoteSource.targetMeanPrice !== undefined && quoteSource.targetMeanPrice !== null) ? quoteSource.targetMeanPrice : null,
          fiftyDayAverage: (quoteSource.fiftyDayAverage !== undefined && quoteSource.fiftyDayAverage !== null) ? quoteSource.fiftyDayAverage : null,
          twoHundredDayAverage: (quoteSource.twoHundredDayAverage !== undefined && quoteSource.twoHundredDayAverage !== null) ? quoteSource.twoHundredDayAverage : null,
          targetHighPrice: (quoteSource.targetHighPrice !== undefined && quoteSource.targetHighPrice !== null) ? quoteSource.targetHighPrice : null,
        };
      });

      // Calculate totals
      const totalsMktValue = positions.reduce((sum, p) => sum + p.mktValue, 0);
      const totalsCostBasis = positions.reduce((sum, p) => sum + (p.shares * p.avgCost), 0);
      const totalsDailyPnL = positions.reduce((sum, p) => sum + p.dailyPnL, 0);
      const totalsDailyPnLPercent = (totalsMktValue - totalsDailyPnL) > 0 ? (totalsDailyPnL / (totalsMktValue - totalsDailyPnL)) * 100 : 0;
      const totalsTotalReturn = totalsMktValue - totalsCostBasis;
      const totalsTotalReturnPercent = totalsCostBasis > 0 ? (totalsTotalReturn / totalsCostBasis) * 100 : 0;

      res.json({
        positions,
        totals: {
          mktValue: totalsMktValue,
          costBasis: totalsCostBasis,
          dailyPnL: totalsDailyPnL,
          dailyPnLPercent: totalsDailyPnLPercent,
          totalReturn: totalsTotalReturn,
          totalReturnPercent: totalsTotalReturnPercent,
        }
      });
    } catch (err: any) {
      console.error("Combined superinvestors error:", err);
      res.status(500).json({ error: "Failed to calculate combined superinvestor stats", details: err.message });
    }
  });

  function calculatePiotroskiScoreFromSummary(summary: any, q: any): number {
    let score = 0;
    try {
      if (summary) {
        const fd = summary.financialData || {};
        const dks = summary.defaultKeyStatistics || {};
        
        const roa = typeof fd.returnOnAssets === "object" ? fd.returnOnAssets?.raw : fd.returnOnAssets;
        if (roa && roa > 0) score++;

        const ocf = typeof fd.operatingCashflow === "object" ? fd.operatingCashflow?.raw : fd.operatingCashflow;
        if (ocf && ocf > 0) score++;

        const fcf = typeof fd.freeCashflow === "object" ? fd.freeCashflow?.raw : fd.freeCashflow;
        if ((fcf && fcf > 0) || (ocf && ocf > (roa || 0) * 1000000)) score++;

        const profitMargins = typeof fd.profitMargins === "object" ? fd.profitMargins?.raw : fd.profitMargins;
        if (profitMargins && profitMargins > 0) score++;

        const currentRatio = typeof fd.currentRatio === "object" ? fd.currentRatio?.raw : fd.currentRatio;
        if (currentRatio && currentRatio >= 1.0) score++;

        const debtToEquity = typeof fd.debtToEquity === "object" ? fd.debtToEquity?.raw : fd.debtToEquity;
        if (debtToEquity !== undefined && debtToEquity < 150) score++;

        const shares = typeof dks.sharesOutstanding === "object" ? dks.sharesOutstanding?.raw : dks.sharesOutstanding;
        if (shares && shares > 0) score++;

        const grossMargins = typeof fd.grossMargins === "object" ? fd.grossMargins?.raw : fd.grossMargins;
        if (grossMargins && grossMargins > 0.3) score++;

        const revGrowth = typeof fd.revenueGrowth === "object" ? fd.revenueGrowth?.raw : fd.revenueGrowth;
        if (revGrowth && revGrowth > 0) score++;
      }
    } catch (e) {
      // fallback calculation
    }
    return Math.min(9, Math.max(1, score || 7));
  }

  // 2. Fetch real-time quotes with full stats and calculations
  app.post("/api/portfolio/quotes", async (req, res) => {
    const { holdings = [] } = req.body;

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return res.json({ positions: [], totals: { mktValue: 0, dailyPnL: 0, totalReturn: 0, costBasis: 0 } });
    }

    try {
      const tickers = holdings
        .filter((h: any) => h.ticker && h.ticker.toUpperCase() !== "CASH")
        .map((h: any) => h.ticker.toUpperCase());

      let liveQuotes: Record<string, any> = {};

      if (tickers.length > 0) {
        try {
          // Fetch quotes and quote summaries from Yahoo Finance in parallel
          const quotePromises = tickers.map(async (ticker) => {
            try {
              const yahooTicker = ticker.replace(/\./g, "-");
              // 1. Fetch basic quote for prices
              const q: any = await yahooFinance.quote(yahooTicker, {}, { validateResult: false });
              if (!q) return null;
              
              // 2. Fetch quoteSummary for valuation metrics
              let trailingPE: number | null = null;
              let forwardPE: number | null = null;
              let pegRatio: number | null = null;
              let evEbitda: number | null = null;
              let fiftyTwoWeekHigh: number | null = null;
              let targetMeanPrice: number | null = null;
              let targetHighPrice: number | null = null;
              let dividendRate: number | null = null;
              let fiftyDayAverage: number | null = null;
              let twoHundredDayAverage: number | null = null;
              
              try {
                const summary: any = await yahooFinance.quoteSummary(yahooTicker, {
                  modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "price"]
                }, { validateResult: false });
                
                if (summary) {
                  // Extract trailingPE and pegRatio and fiftyTwoWeekHigh from summaryDetail
                  if (summary.summaryDetail) {
                    const sd = summary.summaryDetail;
                    if (sd.trailingPE && typeof sd.trailingPE === "object" && sd.trailingPE.raw !== undefined) {
                      trailingPE = sd.trailingPE.raw;
                    } else if (typeof sd.trailingPE === "number") {
                      trailingPE = sd.trailingPE;
                    }
                    
                    if (sd.pegRatio && typeof sd.pegRatio === "object" && sd.pegRatio.raw !== undefined) {
                      pegRatio = sd.pegRatio.raw;
                    } else if (typeof sd.pegRatio === "number") {
                      pegRatio = sd.pegRatio;
                    }

                    if (sd.fiftyTwoWeekHigh && typeof sd.fiftyTwoWeekHigh === "object" && sd.fiftyTwoWeekHigh.raw !== undefined) {
                      fiftyTwoWeekHigh = sd.fiftyTwoWeekHigh.raw;
                    } else if (typeof sd.fiftyTwoWeekHigh === "number") {
                      fiftyTwoWeekHigh = sd.fiftyTwoWeekHigh;
                    }

                    if (sd.dividendRate && typeof sd.dividendRate === "object" && sd.dividendRate.raw !== undefined) {
                      dividendRate = sd.dividendRate.raw;
                    } else if (typeof sd.dividendRate === "number") {
                      dividendRate = sd.dividendRate;
                    } else if (sd.trailingAnnualDividendRate && typeof sd.trailingAnnualDividendRate === "object" && sd.trailingAnnualDividendRate.raw !== undefined) {
                      dividendRate = sd.trailingAnnualDividendRate.raw;
                    } else if (typeof sd.trailingAnnualDividendRate === "number") {
                      dividendRate = sd.trailingAnnualDividendRate;
                    }
                    if (sd.fiftyDayAverage && typeof sd.fiftyDayAverage === "object" && sd.fiftyDayAverage.raw !== undefined) {
                      fiftyDayAverage = sd.fiftyDayAverage.raw;
                    } else if (typeof sd.fiftyDayAverage === "number") {
                      fiftyDayAverage = sd.fiftyDayAverage;
                    }
                    if (sd.twoHundredDayAverage && typeof sd.twoHundredDayAverage === "object" && sd.twoHundredDayAverage.raw !== undefined) {
                      twoHundredDayAverage = sd.twoHundredDayAverage.raw;
                    } else if (typeof sd.twoHundredDayAverage === "number") {
                      twoHundredDayAverage = sd.twoHundredDayAverage;
                    }
                  }
                  
                  // Extract forwardPE and pegRatio from defaultKeyStatistics
                  if (summary.defaultKeyStatistics) {
                    const dks = summary.defaultKeyStatistics;
                    if (dks.forwardPE && typeof dks.forwardPE === "object" && dks.forwardPE.raw !== undefined) {
                      forwardPE = dks.forwardPE.raw;
                    } else if (typeof dks.forwardPE === "number") {
                      forwardPE = dks.forwardPE;
                    }

                    if (pegRatio === null) {
                      if (dks.pegRatio && typeof dks.pegRatio === "object" && dks.pegRatio.raw !== undefined) {
                        pegRatio = dks.pegRatio.raw;
                      } else if (typeof dks.pegRatio === "number") {
                        pegRatio = dks.pegRatio;
                      }
                    }

                    if (dks.enterpriseToEbitda && typeof dks.enterpriseToEbitda === "object" && dks.enterpriseToEbitda.raw !== undefined) {
                      evEbitda = dks.enterpriseToEbitda.raw;
                    } else if (typeof dks.enterpriseToEbitda === "number") {
                      evEbitda = dks.enterpriseToEbitda;
                    }
                  }

                  // Extract targetMeanPrice and targetHighPrice from financialData
                  if (summary.financialData) {
                    const fd = summary.financialData;
                    if (fd.targetMeanPrice && typeof fd.targetMeanPrice === "object" && fd.targetMeanPrice.raw !== undefined) {
                      targetMeanPrice = fd.targetMeanPrice.raw;
                    } else if (typeof fd.targetMeanPrice === "number") {
                      targetMeanPrice = fd.targetMeanPrice;
                    }

                    if (fd.targetHighPrice && typeof fd.targetHighPrice === "object" && fd.targetHighPrice.raw !== undefined) {
                      targetHighPrice = fd.targetHighPrice.raw;
                    } else if (typeof fd.targetHighPrice === "number") {
                      targetHighPrice = fd.targetHighPrice;
                    }
                  }
                  
                  // Fallback for forwardPE if not found in defaultKeyStatistics
                  if (forwardPE === null && summary.summaryDetail) {
                    const sd = summary.summaryDetail;
                    if (sd.forwardPE && typeof sd.forwardPE === "object" && sd.forwardPE.raw !== undefined) {
                      forwardPE = sd.forwardPE.raw;
                    } else if (typeof sd.forwardPE === "number") {
                      forwardPE = sd.forwardPE;
                    }
                  }
                }

                // Extract after-hours / effective price if market is closed or extended
                var priceInfo = extractPriceAndQuoteData(q, summary);
                var pScore = calculatePiotroskiScoreFromSummary(summary, q);
              } catch (summaryErr: any) {
                console.log(`[Summary Detail] Using fallback profile for ${yahooTicker}`, summaryErr);
                var priceInfo = extractPriceAndQuoteData(q);
                var pScore = 7;
              }
              
              return {
                symbol: ticker,
                yahooSymbol: yahooTicker,
                regularMarketPrice: priceInfo.price, // Uses after-hours price when closed/extended
                regularMarketPriceRaw: priceInfo.regularMarketPrice,
                regularMarketPreviousClose: priceInfo.regularMarketPreviousClose,
                postMarketPrice: priceInfo.postMarketPrice,
                preMarketPrice: priceInfo.preMarketPrice,
                marketState: priceInfo.marketState,
                isAfterHoursPrice: priceInfo.isAfterHoursPrice,
                longName: q.longName || q.shortName || q.symbol,
                trailingPE: trailingPE !== null ? trailingPE : (q.trailingPE || q.trailingPe || null),
                forwardPE: forwardPE !== null ? forwardPE : (q.forwardPE || q.forwardPe || null),
                pegRatio: pegRatio !== null ? pegRatio : (q.pegRatio !== undefined ? q.pegRatio : (q.priceToEarningsGrowth !== undefined ? q.priceToEarningsGrowth : null)),
                evEbitda: evEbitda !== null ? evEbitda : null,
                fiftyTwoWeekHigh: fiftyTwoWeekHigh !== null ? fiftyTwoWeekHigh : (q.fiftyTwoWeekHigh || null),
                targetMeanPrice: targetMeanPrice !== null ? targetMeanPrice : null,
                targetHighPrice: targetHighPrice !== null ? targetHighPrice : null,
                dividendRate: dividendRate !== null ? dividendRate : (q.dividendRate || q.trailingAnnualDividendRate || null),
                piotroskiScore: pScore,
                fiftyDayAverage: fiftyDayAverage !== null ? fiftyDayAverage : (q.fiftyDayAverage || null),
                twoHundredDayAverage: twoHundredDayAverage !== null ? twoHundredDayAverage : (q.twoHundredDayAverage || null),
              };
            } catch (err: any) {
              console.log(`[Quote Status] Live data unavailable for ticker ${ticker}, using fallback metrics: ${err?.message || err}`);
              return null;
            }
          });
          
          const resolvedQuotes = await Promise.all(quotePromises);
          resolvedQuotes.forEach((q) => {
            if (q && q.symbol) {
              liveQuotes[q.symbol.toUpperCase()] = q;
              if (q.yahooSymbol) {
                liveQuotes[q.yahooSymbol.toUpperCase()] = q;
              }
            }
          });
        } catch (apiError) {
          console.log("[Quotes Info] Active fallback metrics loaded for portfolio tickers");
        }
      }

      // Merge live data with our defaults or fallbacks
      const positions = holdings.map((h: any) => {
        const ticker = h.ticker.toUpperCase();
        if (ticker === "CASH") {
          return {
            ticker: "Cash",
            name: "US Dollar Cash Balance",
            price: 1,
            shares: h.shares,
            avgCost: 1,
            mktValue: h.shares,
            weight: 0,
            pe: null,
            fwdPe: null,
            peg: null,
            dailyPnL: 0,
            chgPct: 0,
            returnAmt: 0,
            returnPct: 0,
            isCash: true,
          };
        }
        if (ticker === "MARGIN_PAID") {
          return {
            ticker: "MARGIN_PAID",
            name: "Margin Loan Paid",
            price: 0,
            shares: h.shares,
            avgCost: 0,
            mktValue: 0,
            weight: 0,
            pe: null,
            fwdPe: null,
            peg: null,
            dailyPnL: 0,
            chgPct: 0,
            returnAmt: 0,
            returnPct: 0,
            isCash: false,
            isMargin: false
          };
        }

        // Retrieve quote from live results, fallback map, or mock random drift around standard prices to look real-time
        const quoteSource = liveQuotes[ticker] || FALLBACK_QUOTES[ticker] || {
          regularMarketPrice: h.avgCost || 100,
          regularMarketPreviousClose: (h.avgCost || 100) * 0.98,
          longName: h.company || h.name || `${ticker} Corporation`,
          trailingPE: 20,
          forwardPE: 18,
          pegRatio: 1.2,
        };

        const price = quoteSource.regularMarketPrice;
        const prevClose = quoteSource.regularMarketPreviousClose || price * 0.99;
        const shares = Number(h.shares) || 0;
        const avgCost = Number(h.avgCost) || 0;

        const mktValue = shares * price;
        const costBasis = shares * avgCost;
        
        // PnL / Returns
        const dailyPnL = shares * (price - prevClose);
        const chgPct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
        
        const returnAmt = mktValue - costBasis;
        const returnPct = costBasis > 0 ? (returnAmt / costBasis) * 100 : 0;

        return {
          ticker,
          name: h.company || h.name || quoteSource.longName || ticker,
          price,
          shares,
          avgCost,
          mktValue,
          weight: 0, // filled later
          pe: (quoteSource.trailingPE !== undefined && quoteSource.trailingPE !== null) ? quoteSource.trailingPE : null,
          fwdPe: (quoteSource.forwardPE !== undefined && quoteSource.forwardPE !== null) ? quoteSource.forwardPE : null,
          peg: (quoteSource.pegRatio !== undefined && quoteSource.pegRatio !== null) ? quoteSource.pegRatio : null,
          evEbitda: (quoteSource.evEbitda !== undefined && quoteSource.evEbitda !== null) ? quoteSource.evEbitda : null,
          dividendRate: (quoteSource.dividendRate !== undefined && quoteSource.dividendRate !== null) ? quoteSource.dividendRate : null,
          dailyPnL,
          chgPct,
          returnAmt,
          returnPct,
          isCash: false,
          isMargin: Boolean(h.isMargin),
          isAfterHoursPrice: !!quoteSource.isAfterHoursPrice,
          postMarketPrice: quoteSource.postMarketPrice || null,
          preMarketPrice: quoteSource.preMarketPrice || null,
          marketState: quoteSource.marketState || null,
          fiftyTwoWeekHigh: (quoteSource.fiftyTwoWeekHigh !== undefined && quoteSource.fiftyTwoWeekHigh !== null) ? quoteSource.fiftyTwoWeekHigh : null,
          targetMeanPrice: (quoteSource.targetMeanPrice !== undefined && quoteSource.targetMeanPrice !== null) ? quoteSource.targetMeanPrice : null,
          targetHighPrice: (quoteSource.targetHighPrice !== undefined && quoteSource.targetHighPrice !== null) ? quoteSource.targetHighPrice : null,
          fiftyDayAverage: (quoteSource.fiftyDayAverage !== undefined && quoteSource.fiftyDayAverage !== null) ? quoteSource.fiftyDayAverage : null,
          twoHundredDayAverage: (quoteSource.twoHundredDayAverage !== undefined && quoteSource.twoHundredDayAverage !== null) ? quoteSource.twoHundredDayAverage : null,
          piotroskiScore: (quoteSource.piotroskiScore !== undefined && quoteSource.piotroskiScore !== null) ? quoteSource.piotroskiScore : 7,
        };
      });

      // Calculate total portfolio value and position weights
      const totalPortfolioValue = positions.reduce((sum, p) => sum + p.mktValue, 0);
      const totalCostBasis = positions.reduce((sum, p) => sum + (p.shares * p.avgCost), 0);
      const totalDailyPnL = positions.reduce((sum, p) => sum + p.dailyPnL, 0);
      const totalReturnAmt = totalPortfolioValue - totalCostBasis;
      const totalReturnPct = totalCostBasis > 0 ? (totalReturnAmt / totalCostBasis) * 100 : 0;

      // Margin calculations: 6.25% effective annual rate charged monthly
      const marginPositions = positions.filter((p: any) => p.isMargin && !p.isCash);
      const marginPaidPos = positions.find((p: any) => p.ticker === "MARGIN_PAID");
      const marginPaidAmount = marginPaidPos ? marginPaidPos.shares : 0;
      
      const grossMarginCostBasis = marginPositions.reduce((sum: number, p: any) => sum + (p.shares * p.avgCost), 0);
      const marginCostBasis = Math.max(0, grossMarginCostBasis - marginPaidAmount);
      const marginMktValue = marginPositions.reduce((sum: number, p: any) => sum + p.mktValue, 0);
      const marginAnnualCost = marginCostBasis * 0.0625;
      const marginMonthlyCost = marginCostBasis * (Math.pow(1 + 0.0625, 1 / 12) - 1);

      positions.forEach((p) => {
        p.weight = totalPortfolioValue > 0 ? (p.mktValue / totalPortfolioValue) * 100 : 0;
      });

      res.json({
        positions,
        totals: {
          mktValue: totalPortfolioValue,
          costBasis: totalCostBasis,
          dailyPnL: totalDailyPnL,
          dailyPnLPercent: totalPortfolioValue > 0 ? (totalDailyPnL / (totalPortfolioValue - totalDailyPnL)) * 100 : 0,
          totalReturn: totalReturnAmt,
          totalReturnPercent: totalReturnPct,
          marginCostBasis,
          marginMktValue,
          marginAnnualCost,
          marginMonthlyCost,
        },
      });
    } catch (err: any) {
      console.error("Quotes calculation error:", err);
      res.status(500).json({ error: "Failed to calculate quotes", details: err.message });
    }
  });

  type SuperinvestorStatsItem = {
    mktValue: number;
    dailyPnL: number;
    dailyPnLPercent: number;
    score: number;
    grade: string;
    labelEN: string;
    labelES: string;
    dominantType: string;
  };

  // Cache for superinvestor stats with 2-minute TTL
  let cachedSuperinvestorStats: { timestamp: number; data: Record<string, SuperinvestorStatsItem> } | null = null;

  app.get("/api/superinvestors/stats", async (req, res) => {
    try {
      const now = Date.now();
      if (cachedSuperinvestorStats && (now - cachedSuperinvestorStats.timestamp < 120000)) {
        return res.json(cachedSuperinvestorStats.data);
      }

      // Collect top tickers across all funds to batch quote them
      const tickerSet = new Set<string>();
      Object.values(SUPERINVESTORS).forEach((si) => {
        si.holdings.forEach((h) => {
          if (h.ticker && h.ticker.toUpperCase() !== "CASH") {
            tickerSet.add(h.ticker.toUpperCase());
          }
        });
      });

      const tickers = Array.from(tickerSet);
      const quotesMap: Record<string, { price: number; prevClose: number }> = {};

      if (tickers.length > 0) {
        try {
          const quotes = await Promise.allSettled(
            tickers.map(async (t) => {
              const yt = t.replace(/\./g, "-");
              const q: any = await yahooFinance.quote(yt, {}, { validateResult: false });
              if (q && q.regularMarketPrice) {
                return {
                  ticker: t,
                  price: q.regularMarketPrice,
                  prevClose: q.regularMarketPreviousClose || (q.regularMarketPrice * 0.995)
                };
              }
              return null;
            })
          );

          quotes.forEach((r) => {
            if (r.status === "fulfilled" && r.value) {
              quotesMap[r.value.ticker] = {
                price: r.value.price,
                prevClose: r.value.prevClose
              };
            }
          });
        } catch (e) {
          console.warn("[Superinvestor Stats] Could not fetch live quotes, using baseline:", e);
        }
      }

      const result: Record<string, SuperinvestorStatsItem> = {};

      Object.entries(SUPERINVESTORS).forEach(([key, si]) => {
        let totalMktValue = 0;
        let totalDailyPnL = 0;

        si.holdings.forEach((h) => {
          const t = h.ticker.toUpperCase();
          const q = quotesMap[t];
          const shares = Number(h.shares) || 0;
          const avgCost = Number(h.avgCost) || 100;

          if (t === "CASH") {
            totalMktValue += shares;
          } else if (q) {
            const posValue = shares * q.price;
            totalMktValue += posValue;
            totalDailyPnL += shares * (q.price - q.prevClose);
          } else {
            const posValue = shares * avgCost;
            totalMktValue += posValue;
          }
        });

        if (totalMktValue === 0 && si.aum13F) {
          totalMktValue = si.aum13F * 1000000000;
        }

        const prevValue = totalMktValue - totalDailyPnL;
        const dailyPnLPercent = prevValue > 0 ? (totalDailyPnL / prevValue) * 100 : 0;
        const scoreInfo = SUPERINVESTOR_SCORES[key];

        result[key] = {
          mktValue: totalMktValue,
          dailyPnL: totalDailyPnL,
          dailyPnLPercent: isNaN(dailyPnLPercent) ? 0 : dailyPnLPercent,
          score: scoreInfo ? Math.ceil(scoreInfo.score) : 60,
          grade: scoreInfo ? scoreInfo.grade : "B",
          labelEN: scoreInfo ? scoreInfo.labelEN : "Balanced",
          labelES: scoreInfo ? scoreInfo.labelES : "Equilibrado",
          dominantType: scoreInfo ? scoreInfo.dominantType : "Compounder",
        };
      });

      cachedSuperinvestorStats = {
        timestamp: now,
        data: result,
      };

      res.json(result);
    } catch (err: any) {
      console.error("Superinvestors stats error:", err);
      const fallbackResult: Record<string, { mktValue: number; dailyPnL: number; dailyPnLPercent: number; score: number; grade: string; labelEN: string; labelES: string; dominantType: string }> = {};
      Object.entries(SUPERINVESTORS).forEach(([key, si]) => {
        const scoreInfo = SUPERINVESTOR_SCORES[key];
        fallbackResult[key] = {
          mktValue: (si.aum13F || 1) * 1000000000,
          dailyPnL: 0,
          dailyPnLPercent: 0,
          score: scoreInfo ? Math.ceil(scoreInfo.score) : 60,
          grade: scoreInfo ? scoreInfo.grade : "B",
          labelEN: scoreInfo ? scoreInfo.labelEN : "Balanced",
          labelES: scoreInfo ? scoreInfo.labelES : "Equilibrado",
          dominantType: scoreInfo ? scoreInfo.dominantType : "Compounder",
        };
      });
      res.json(fallbackResult);
    }
  });

  // In-memory cache for financials
  const financialsCache: Record<string, { data: { annual: any[]; quarterly: any[]; avgPe?: number | null; peHistory?: any[]; currentPrice?: number | null }; timestamp: number }> = {};
  const FINANCIALS_CACHE_TTL = 1000 * 60 * 30; // 30 mins

  async function fetchSingleTickerFinancials(rawTicker: string) {
    const sym = rawTicker.toUpperCase().trim();
    if (!sym || sym === "CASH") return { annual: [], quarterly: [], avgPe: null, peHistory: [], currentPrice: null };

    const cached = financialsCache[sym];
    if (cached && (Date.now() - cached.timestamp < FINANCIALS_CACHE_TTL)) {
      return cached.data;
    }

    try {
      const yahooTicker = sym.replace(/\./g, "-");
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 10);
      
      const [annual, quarterly, chart, quote] = await Promise.all([
        yahooFinance.fundamentalsTimeSeries(yahooTicker, {
          period1: startDate.toISOString().split("T")[0],
          module: "all",
          type: "annual"
        }).catch(() => []),
        yahooFinance.fundamentalsTimeSeries(yahooTicker, {
          period1: startDate.toISOString().split("T")[0],
          module: "all",
          type: "quarterly"
        }).catch(() => []),
        yahooFinance.chart(yahooTicker, {
          period1: startDate.toISOString().split("T")[0],
          interval: "1mo"
        }).catch(() => null),
        yahooFinance.quote(yahooTicker).catch(() => null)
      ]);
      
      const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
      const cleanAnnual = Array.isArray(annual) ? [...annual].sort(sortFn) : [];
      const cleanQuarterly = Array.isArray(quarterly) ? [...quarterly].sort(sortFn) : [];

      // Extract year-end closing prices from monthly quotes
      const yearCloses: Record<number, number> = {};
      const quotes = chart?.quotes || [];
      quotes.forEach((q: any) => {
        if (q && q.close && !isNaN(q.close)) {
          const d = new Date(q.date);
          const yr = d.getUTCFullYear();
          yearCloses[yr] = Number(q.close); // Later months in the same year overwrite earlier ones (ending on Dec close)
        }
      });

      const currentPrice = Number(quote?.regularMarketPrice || chart?.meta?.regularMarketPrice || quotes[quotes.length - 1]?.close || 0);
      const currentYear = 2026;

      // P/E History construction:
      // In total, 5 data points are used to calculate the AVG P/E:
      // 1. Current P/E (trailing P/E / current market P/E from quote)
      // 2. Up to 4 annual financial statements for diluted EPS (using year-end closing price / diluted EPS).
      // Note: Each company may have different fiscal year end dates (e.g. NVDA in Jan, MSFT in June, AAPL in Sept).
      // We do NOT filter out any of the 4 annual statements by date.
      const peHistory: Array<{ year: number | string; date: string; eps: number; price: number; pe: number; isCurrentYear: boolean; quarterDate?: string }> = [];

      // 1. Current P/E (1st data point)
      const currentPE = (typeof quote?.trailingPE === "number" && quote.trailingPE > 0)
        ? Number(quote.trailingPE)
        : (typeof quote?.forwardPE === "number" && quote.forwardPE > 0)
          ? Number(quote.forwardPE)
          : (FALLBACK_QUOTES[yahooTicker]?.trailingPE ?? null);

      if (currentPE && currentPE > 0) {
        const currentEps = (typeof quote?.epsTrailingTwelveMonths === "number" && !isNaN(quote.epsTrailingTwelveMonths))
          ? Number(quote.epsTrailingTwelveMonths)
          : (currentPrice > 0 ? Number((currentPrice / currentPE).toFixed(2)) : 0);

        peHistory.push({
          year: "Actual",
          date: new Date().toISOString(),
          eps: currentEps,
          price: Number(currentPrice.toFixed(2)),
          pe: Number(currentPE.toFixed(2)),
          isCurrentYear: true
        });
      }

      // 2. Up to 4 annual periods with diluted EPS (4 data points)
      const annualWithEps = cleanAnnual.filter((col: any) => {
        const eps = (typeof col.dilutedEPS === "number" && !isNaN(col.dilutedEPS))
          ? col.dilutedEPS
          : ((typeof col.basicEPS === "number" && !isNaN(col.basicEPS)) ? col.basicEPS : null);
        return typeof eps === "number" && !isNaN(eps) && eps > 0;
      }).slice(0, 4);

      annualWithEps.forEach((col: any) => {
        const d = new Date(col.date);
        const yr = d.getUTCFullYear();
        const eps = (typeof col.dilutedEPS === "number" && !isNaN(col.dilutedEPS))
          ? col.dilutedEPS
          : ((typeof col.basicEPS === "number" && !isNaN(col.basicEPS)) ? col.basicEPS : null);

        let price = yearCloses[yr];
        if (!price || isNaN(price) || price <= 0) {
          const targetTime = d.getTime();
          let closestQ: any = null;
          let minDiff = Infinity;
          for (const q of quotes) {
            if (q && q.close && !isNaN(q.close)) {
              const diff = Math.abs(new Date(q.date).getTime() - targetTime);
              if (diff < minDiff) {
                minDiff = diff;
                closestQ = q;
              }
            }
          }
          price = closestQ?.close || currentPrice;
        }

        if (price > 0 && typeof eps === "number" && eps > 0) {
          const pe = Number((price / eps).toFixed(2));
          col.yearClose = Number(price.toFixed(2));
          col.yearPe = pe;
          col.isCurrentYear = false;
          peHistory.push({
            year: yr,
            date: col.date,
            eps,
            price: Number(price.toFixed(2)),
            pe,
            isCurrentYear: false
          });
        }
      });

      // AVG P/E: Average of annual P/E values
      let avgPe: number | null = null;
      if (peHistory.length > 0) {
        const sumPe = peHistory.reduce((acc, item) => acc + item.pe, 0);
        avgPe = Number((sumPe / peHistory.length).toFixed(1));
      }

      const result = {
        annual: cleanAnnual,
        quarterly: cleanQuarterly,
        avgPe,
        peHistory,
        currentPrice: currentPrice || null
      };
      financialsCache[sym] = { data: result, timestamp: Date.now() };
      return result;
    } catch (e) {
      console.warn(`Could not fetch financials for ${sym}:`, e);
      return { annual: [], quarterly: [], avgPe: null, peHistory: [], currentPrice: null };
    }
  }

  // Calculate Diluted EPS CAGR from annual fundamentals
  function calculateDilutedEpsCagrFromAnnual(annual: any[]): number | null {
    if (!Array.isArray(annual) || annual.length < 2) return null;
    const sortFn = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
    const sortedAnnual = [...annual].sort(sortFn);

    const validCols = sortedAnnual
      .map((col, idx) => {
        let val: number | null = null;
        if (typeof col.dilutedEPS === "number" && !isNaN(col.dilutedEPS)) val = col.dilutedEPS;
        else if (typeof col.basicEPS === "number" && !isNaN(col.basicEPS)) val = col.basicEPS;
        return { col, val, idx };
      })
      .filter(item => typeof item.val === "number" && !isNaN(item.val as number));

    if (validCols.length >= 2) {
      const latestItem = validCols[0];
      if (latestItem.val && latestItem.val > 0) {
        const oldestPositive = [...validCols].reverse().find(item => item.val && item.val > 0 && item.idx > latestItem.idx);
        if (oldestPositive && oldestPositive.val && oldestPositive.val > 0) {
          const n = oldestPositive.idx - latestItem.idx;
          if (n > 0) {
            const cagr = (Math.pow(latestItem.val / oldestPositive.val, 1 / n) - 1) * 100;
            return Math.round(cagr * 10) / 10;
          }
        }
      }
    }
    return null;
  }

  // Fallback metric dictionary for known Large Caps with verified Positive EPS and Diluted EPS CAGRs
  const KNOWN_LARGE_CAP_METRICS: Record<string, { price: number; name: string; sector: string; mktCap: number; pe: number; eps: number; divYield: number; epsCagr: number }> = {
    MSFT: { price: 448.50, name: "Microsoft Corporation", sector: "Technology", mktCap: 3340000000000, pe: 35.2, eps: 12.74, divYield: 0.72, epsCagr: 18.2 },
    AAPL: { price: 228.30, name: "Apple Inc.", sector: "Technology", mktCap: 3480000000000, pe: 33.8, eps: 6.75, divYield: 0.44, epsCagr: 16.2 },
    NVDA: { price: 128.50, name: "NVIDIA Corporation", sector: "Technology", mktCap: 3150000000000, pe: 48.5, eps: 2.65, divYield: 0.08, epsCagr: 85.2 },
    GOOGL: { price: 174.20, name: "Alphabet Inc.", sector: "Communication", mktCap: 2150000000000, pe: 24.1, eps: 7.23, divYield: 0.46, epsCagr: 24.2 },
    AMZN: { price: 186.40, name: "Amazon.com Inc.", sector: "Consumer Discretionary", mktCap: 1940000000000, pe: 42.0, eps: 4.44, divYield: 0.0, epsCagr: 22.4 },
    META: { price: 535.80, name: "Meta Platforms Inc.", sector: "Communication", mktCap: 1360000000000, pe: 26.5, eps: 20.20, divYield: 0.38, epsCagr: 35.2 },
    TSM: { price: 172.00, name: "Taiwan Semiconductor Mfg.", sector: "Technology", mktCap: 890000000000, pe: 27.2, eps: 6.32, divYield: 1.15, epsCagr: 21.5 },
    AVGO: { price: 165.20, name: "Broadcom Inc.", sector: "Technology", mktCap: 780000000000, pe: 36.4, eps: 4.54, divYield: 1.30, epsCagr: 25.2 },
    V: { price: 284.40, name: "Visa Inc.", sector: "Financials", mktCap: 575000000000, pe: 29.8, eps: 9.54, divYield: 0.74, epsCagr: 15.8 },
    COST: { price: 885.00, name: "Costco Wholesale Corp.", sector: "Consumer Staples", mktCap: 392000000000, pe: 52.0, eps: 17.02, divYield: 0.52, epsCagr: 16.8 },
    LLY: { price: 920.00, name: "Eli Lilly and Company", sector: "Healthcare", mktCap: 870000000000, pe: 55.0, eps: 16.73, divYield: 0.58, epsCagr: 28.4 },
    UNH: { price: 568.20, name: "UnitedHealth Group Inc.", sector: "Healthcare", mktCap: 520000000000, pe: 24.6, eps: 23.10, divYield: 1.48, epsCagr: 15.2 },
    BKNG: { price: 4120.00, name: "Booking Holdings Inc.", sector: "Consumer Discretionary", mktCap: 140000000000, pe: 26.5, eps: 155.50, divYield: 0.85, epsCagr: 26.5 },
    AMAT: { price: 205.00, name: "Applied Materials Inc.", sector: "Technology", mktCap: 170000000000, pe: 23.5, eps: 8.72, divYield: 0.78, epsCagr: 19.2 },
    KLAC: { price: 720.00, name: "KLA Corporation", sector: "Technology", mktCap: 97000000000, pe: 29.5, eps: 24.40, divYield: 0.80, epsCagr: 22.8 },
    QCOM: { price: 168.50, name: "Qualcomm Inc.", sector: "Technology", mktCap: 188000000000, pe: 18.4, eps: 9.16, divYield: 2.02, epsCagr: 17.5 },
    NOW: { price: 890.00, name: "ServiceNow Inc.", sector: "Technology", mktCap: 185000000000, pe: 58.0, eps: 15.34, divYield: 0.0, epsCagr: 45.0 },
    CRM: { price: 275.00, name: "Salesforce Inc.", sector: "Technology", mktCap: 265000000000, pe: 34.0, eps: 8.09, divYield: 0.58, epsCagr: 28.0 },
    AXP: { price: 255.00, name: "American Express Co.", sector: "Financials", mktCap: 182000000000, pe: 19.5, eps: 13.10, divYield: 1.10, epsCagr: 16.4 },
    HD: { price: 382.40, name: "The Home Depot Inc.", sector: "Consumer Discretionary", mktCap: 380000000000, pe: 25.1, eps: 15.24, divYield: 2.35, epsCagr: 15.4 },
    TXN: { price: 202.00, name: "Texas Instruments Inc.", sector: "Technology", mktCap: 184000000000, pe: 31.2, eps: 6.47, divYield: 2.58, epsCagr: 15.1 },
    AMD: { price: 154.00, name: "Advanced Micro Devices", sector: "Technology", mktCap: 250000000000, pe: 44.0, eps: 3.50, divYield: 0.0, epsCagr: 18.5 },
    BABA: { price: 84.50, name: "Alibaba Group Holding", sector: "Consumer Discretionary", mktCap: 200000000000, pe: 9.8, eps: 8.62, divYield: 1.90, epsCagr: 18.0 },
    PYPL: { price: 72.40, name: "PayPal Holdings Inc.", sector: "Financials", mktCap: 74000000000, pe: 16.5, eps: 4.38, divYield: 0.0, epsCagr: 17.2 },
    LIN: { price: 460.00, name: "Linde plc", sector: "Materials", mktCap: 220000000000, pe: 32.0, eps: 14.38, divYield: 1.22, epsCagr: 15.6 },
    CI: { price: 345.00, name: "The Cigna Group", sector: "Healthcare", mktCap: 98000000000, pe: 13.6, eps: 25.37, divYield: 1.62, epsCagr: 15.8 },
    "BRK-B": { price: 452.10, name: "Berkshire Hathaway Inc.", sector: "Financials", mktCap: 980000000000, pe: 21.4, eps: 21.12, divYield: 0.0, epsCagr: 16.0 },
    JPM: { price: 215.60, name: "JPMorgan Chase & Co.", sector: "Financials", mktCap: 615000000000, pe: 12.2, eps: 17.67, divYield: 2.15, epsCagr: 15.5 },
  };

  // Helper to extract verified Positive EPS (BPA) from quote or annual filings
  function extractTickerEps(ticker: string, q: any, fin: any): number | null {
    if (q) {
      if (typeof q.epsTrailingTwelveMonths === "number" && !isNaN(q.epsTrailingTwelveMonths)) {
        return Math.round(q.epsTrailingTwelveMonths * 100) / 100;
      }
      if (typeof q.trailingEps === "number" && !isNaN(q.trailingEps)) {
        return Math.round(q.trailingEps * 100) / 100;
      }
      if (typeof q.epsCurrentYear === "number" && !isNaN(q.epsCurrentYear)) {
        return Math.round(q.epsCurrentYear * 100) / 100;
      }
    }
    if (fin && Array.isArray(fin.annual) && fin.annual.length > 0) {
      const latest = fin.annual[0];
      if (typeof latest.dilutedEPS === "number" && !isNaN(latest.dilutedEPS)) {
        return Math.round(latest.dilutedEPS * 100) / 100;
      }
      if (typeof latest.basicEPS === "number" && !isNaN(latest.basicEPS)) {
        return Math.round(latest.basicEPS * 100) / 100;
      }
    }
    const known = KNOWN_LARGE_CAP_METRICS[ticker];
    if (known) {
      if (typeof known.eps === "number" && known.eps > 0) return known.eps;
      if (known.pe > 0 && known.price > 0) return Math.round((known.price / known.pe) * 100) / 100;
    }
    return null;
  }

  // Fetch Yahoo Finance financials (fundamentalsTimeSeries) for single or multiple tickers
  app.post("/api/portfolio/financials", async (req, res) => {
    const { ticker, tickers } = req.body;
    const tickerList: string[] = Array.isArray(tickers)
      ? tickers.filter((t: any) => typeof t === "string" && t.trim() && t.toUpperCase() !== "CASH")
      : (ticker && typeof ticker === "string" ? [ticker.trim()] : []);

    if (tickerList.length === 0) {
      return res.status(400).json({ error: "Ticker or tickers array is required" });
    }

    try {
      const results: Record<string, { annual: any[]; quarterly: any[]; avgPe?: any; peHistory?: any[] }> = {};
      
      await Promise.all(
        tickerList.map(async (t) => {
          const sym = t.toUpperCase().trim();
          results[sym] = await fetchSingleTickerFinancials(sym);
        })
      );

      // If single ticker requested via 'ticker', also provide top-level annual/quarterly for backwards compatibility
      const firstSym = tickerList[0];
      const firstData = results[firstSym] || { annual: [], quarterly: [], avgPe: null, peHistory: [] };

      res.json({
        annual: firstData.annual,
        quarterly: firstData.quarterly,
        avgPe: firstData.avgPe,
        peHistory: firstData.peHistory,
        ...results
      });
    } catch (err: any) {
      console.error(`Failed to fetch portfolio financials:`, err);
      res.status(500).json({ error: "Failed to fetch financials", details: err.message });
    }
  });

  // 2.8. Comprehensive Single Stock Explorer Endpoint
  app.get("/api/stock/:symbol", async (req, res) => {
    const rawSymbol = req.params.symbol ? req.params.symbol.trim().toUpperCase() : "";
    if (!rawSymbol || rawSymbol === "CASH") {
      return res.status(400).json({ error: "Invalid symbol" });
    }

    const yahooSymbol = rawSymbol.replace(/\./g, "-");

    try {
      // Helper to safely extract raw number or string from summary fields
      const getVal = (val: any) => {
        if (val === undefined || val === null) return null;
        if (typeof val === "object" && val.raw !== undefined) return val.raw;
        return val;
      };

      // Query quote and quoteSummary concurrently
      const [quoteRes, summaryRes] = await Promise.allSettled([
        yahooFinance.quote(yahooSymbol, {}, { validateResult: false }),
        yahooFinance.quoteSummary(yahooSymbol, {
          modules: [
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "price",
            "assetProfile",
            "recommendationTrend",
            "calendarEvents",
            "earnings"
          ]
        }, { validateResult: false })
      ]);

      const q = quoteRes.status === "fulfilled" ? quoteRes.value : null;
      const summary = summaryRes.status === "fulfilled" ? summaryRes.value : null;

      const sd = summary?.summaryDetail || {};
      const dks = summary?.defaultKeyStatistics || {};
      const fd = summary?.financialData || {};
      const sp = summary?.price || {};
      const ap = summary?.assetProfile || {};
      const ce = summary?.calendarEvents || {};
      const rt = summary?.recommendationTrend?.trend || [];

      // Extract price and extended hours info
      const priceData = extractPriceAndQuoteData(q, summary);

      const price = priceData.price || getVal(sp.regularMarketPrice) || getVal(sd.regularMarketPrice) || FALLBACK_QUOTES[rawSymbol]?.regularMarketPrice || 100;
      const prevClose = priceData.regularMarketPreviousClose || getVal(sp.regularMarketPreviousClose) || getVal(sd.regularMarketPreviousClose) || price * 0.99;
      const change = Number((price - prevClose).toFixed(2));
      const changePct = prevClose > 0 ? Number((((price - prevClose) / prevClose) * 100).toFixed(2)) : 0;

      // Extract company profile
      const companyName = q?.longName || q?.shortName || getVal(sp.longName) || getVal(sp.shortName) || FALLBACK_QUOTES[rawSymbol]?.longName || `${rawSymbol} Inc.`;
      const sector = ap.sector || "Technology";
      const industry = ap.industry || "Software & Technology";
      const description = ap.longBusinessSummary || "";
      const website = ap.website || "";
      const country = ap.country || "United States";
      const city = ap.city || "";
      const employees = ap.fullTimeEmployees || null;
      const officers = Array.isArray(ap.companyOfficers) 
        ? ap.companyOfficers.slice(0, 5).map((o: any) => ({
            name: o.name,
            title: o.title,
            totalPay: getVal(o.totalPay),
            yearBorn: o.yearBorn || null
          }))
        : [];

      // Valuation & Metrics
      const trailingPE = getVal(sd.trailingPE) ?? getVal(q?.trailingPE) ?? FALLBACK_QUOTES[rawSymbol]?.trailingPE ?? null;
      const forwardPE = getVal(dks.forwardPE) ?? getVal(sd.forwardPE) ?? getVal(q?.forwardPE) ?? FALLBACK_QUOTES[rawSymbol]?.forwardPE ?? null;
      const pegRatio = getVal(dks.pegRatio) ?? getVal(sd.pegRatio) ?? getVal(q?.pegRatio) ?? FALLBACK_QUOTES[rawSymbol]?.pegRatio ?? null;
      const priceToSales = getVal(sd.priceToSalesTrailing12Months) ?? getVal(q?.priceToSales) ?? null;
      const priceToBook = getVal(dks.priceToBook) ?? getVal(q?.priceToBook) ?? null;
      const enterpriseValue = getVal(dks.enterpriseValue) ?? null;
      const evEbitda = getVal(dks.enterpriseToEbitda) ?? null;
      const marketCap = getVal(sp.marketCap) ?? getVal(sd.marketCap) ?? getVal(q?.marketCap) ?? null;
      const sharesOutstanding = getVal(dks.sharesOutstanding) ?? getVal(q?.sharesOutstanding) ?? null;
      const floatShares = getVal(dks.floatShares) ?? null;
      const shortPercentOfFloat = getVal(dks.shortPercentOfFloat) ?? null;
      const beta = getVal(sd.beta) ?? getVal(dks.beta) ?? getVal(q?.beta) ?? 1.0;

      // Price ranges
      const dayHigh = getVal(sd.dayHigh) ?? getVal(q?.regularMarketDayHigh) ?? price * 1.01;
      const dayLow = getVal(sd.dayLow) ?? getVal(q?.regularMarketDayLow) ?? price * 0.99;
      const dayOpen = getVal(sp.regularMarketOpen) ?? getVal(sd.regularMarketOpen) ?? getVal(q?.regularMarketOpen) ?? prevClose;
      const volume = getVal(sp.regularMarketVolume) ?? getVal(sd.regularMarketVolume) ?? getVal(q?.regularMarketVolume) ?? 0;
      const avgVolume = getVal(sd.averageVolume) ?? getVal(sd.averageDailyVolume3Month) ?? getVal(q?.averageDailyVolume3Month) ?? 0;
      const fiftyTwoWeekHigh = getVal(sd.fiftyTwoWeekHigh) ?? getVal(q?.fiftyTwoWeekHigh) ?? price * 1.25;
      const fiftyTwoWeekLow = getVal(sd.fiftyTwoWeekLow) ?? getVal(q?.fiftyTwoWeekLow) ?? price * 0.75;
      const fiftyDayAverage = getVal(sd.fiftyDayAverage) ?? getVal(q?.fiftyDayAverage) ?? null;
      const twoHundredDayAverage = getVal(sd.twoHundredDayAverage) ?? getVal(q?.twoHundredDayAverage) ?? null;

      // Profitability & Financial Health
      const grossMargins = getVal(fd.grossMargins) ?? null;
      const operatingMargins = getVal(fd.operatingMargins) ?? null;
      const profitMargins = getVal(fd.profitMargins) ?? null;
      const returnOnEquity = getVal(fd.returnOnEquity) ?? null;
      const returnOnAssets = getVal(fd.returnOnAssets) ?? null;
      const debtToEquity = getVal(fd.debtToEquity) ?? null;
      const currentRatio = getVal(fd.currentRatio) ?? null;
      const quickRatio = getVal(fd.quickRatio) ?? null;
      const totalCash = getVal(fd.totalCash) ?? null;
      const totalDebt = getVal(fd.totalDebt) ?? null;
      const freeCashflow = getVal(fd.freeCashflow) ?? null;
      const operatingCashflow = getVal(fd.operatingCashflow) ?? null;
      const totalRevenue = getVal(fd.totalRevenue) ?? null;
      const revenueGrowth = getVal(fd.revenueGrowth) ?? null;
      const earningsGrowth = getVal(fd.earningsGrowth) ?? null;

      // Helper to safely parse dates from Yahoo Finance (handles Date instances, seconds, or ms)
      const parseSafeDate = (val: any): string | null => {
        if (!val) return null;
        if (val instanceof Date) {
          return !isNaN(val.getTime()) ? val.toISOString().split("T")[0] : null;
        }
        if (typeof val === "number") {
          const d = new Date(val > 1e11 ? val : val * 1000);
          return !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : null;
        }
        if (typeof val === "string") {
          if (/^\d+$/.test(val)) {
            const num = Number(val);
            const d = new Date(num > 1e11 ? num : num * 1000);
            return !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : null;
          }
          const d = new Date(val);
          return !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : val;
        }
        return null;
      };

      // Dividends & Earnings
      const dividendRate = getVal(sd.dividendRate) ?? getVal(sd.trailingAnnualDividendRate) ?? getVal(q?.dividendRate) ?? null;
      const dividendYield = getVal(sd.dividendYield) ?? getVal(sd.trailingAnnualDividendYield) ?? (dividendRate && price > 0 ? (dividendRate / price) : null);
      const payoutRatio = getVal(sd.payoutRatio) ?? null;
      const rawExDate = getVal(sd.exDividendDate) ?? getVal(ce.exDividendDate);
      const exDividendDate = parseSafeDate(rawExDate);
      const trailingEps = getVal(dks.trailingEps) ?? getVal(q?.epsTrailingTwelveMonths) ?? null;
      const forwardEps = getVal(dks.forwardEps) ?? getVal(q?.epsForward) ?? null;

      // Target Price & Analysts
      const targetLowPrice = getVal(fd.targetLowPrice) ?? null;
      const targetMeanPrice = getVal(fd.targetMeanPrice) ?? null;
      const targetHighPrice = getVal(fd.targetHighPrice) ?? null;
      const recommendationKey = fd.recommendationKey || "none";
      const numberOfAnalystOpinions = getVal(fd.numberOfAnalystOpinions) ?? null;

      // Calendar & Next Earnings
      let nextEarningsDate = null;
      if (ce.earnings && ce.earnings.earningsDate && ce.earnings.earningsDate.length > 0) {
        nextEarningsDate = parseSafeDate(ce.earnings.earningsDate[0]);
      }

      // Piotroski score calculation
      const piotroskiScore = calculatePiotroskiScoreFromSummary(summary, q);

      res.json({
        symbol: rawSymbol,
        yahooSymbol,
        name: companyName,
        exchange: q?.exchange || sp.exchangeName || "US",
        currency: q?.currency || sp.currency || "USD",
        price,
        previousClose: prevClose,
        change,
        changePct,
        open: dayOpen,
        dayHigh,
        dayLow,
        volume,
        avgVolume,
        fiftyTwoWeekHigh,
        fiftyTwoWeekLow,
        fiftyDayAverage,
        twoHundredDayAverage,
        marketCap,
        enterpriseValue,
        beta,
        trailingPE,
        forwardPE,
        pegRatio,
        priceToSales,
        priceToBook,
        evEbitda,
        enterpriseToEbitda: evEbitda,
        grossMargins,
        operatingMargins,
        profitMargins,
        returnOnEquity,
        returnOnAssets,
        debtToEquity,
        currentRatio,
        quickRatio,
        totalCash,
        totalDebt,
        freeCashflow,
        operatingCashflow,
        totalRevenue,
        revenueGrowth,
        earningsGrowth,
        dividendRate,
        dividendYield,
        payoutRatio,
        exDividendDate,
        trailingEps,
        forwardEps,
        targetLowPrice,
        targetMeanPrice,
        targetHighPrice,
        recommendationKey,
        numberOfAnalystOpinions,
        recommendationTrends: rt,
        nextEarningsDate,
        piotroskiScore,
        sharesOutstanding,
        floatShares,
        shortPercentOfFloat,
        isAfterHoursPrice: priceData.isAfterHoursPrice,
        postMarketPrice: priceData.postMarketPrice,
        preMarketPrice: priceData.preMarketPrice,
        marketState: priceData.marketState,
        profile: {
          sector,
          industry,
          description,
          website,
          country,
          city,
          employees,
          officers
        }
      });
    } catch (err: any) {
      console.error(`Error in /api/stock/${rawSymbol}:`, err);
      // Return structured fallback
      const fallback = FALLBACK_QUOTES[rawSymbol] || {
        regularMarketPrice: 150,
        regularMarketPreviousClose: 148,
        longName: `${rawSymbol} Corporation`,
        trailingPE: 25,
        forwardPE: 22,
        pegRatio: 1.3
      };
      res.json({
        symbol: rawSymbol,
        yahooSymbol,
        name: fallback.longName || rawSymbol,
        exchange: "US",
        currency: "USD",
        price: fallback.regularMarketPrice,
        previousClose: fallback.regularMarketPreviousClose,
        change: Number((fallback.regularMarketPrice - fallback.regularMarketPreviousClose).toFixed(2)),
        changePct: Number((((fallback.regularMarketPrice - fallback.regularMarketPreviousClose) / fallback.regularMarketPreviousClose) * 100).toFixed(2)),
        open: fallback.regularMarketPreviousClose,
        dayHigh: fallback.regularMarketPrice * 1.01,
        dayLow: fallback.regularMarketPrice * 0.99,
        volume: 2500000,
        avgVolume: 3200000,
        fiftyTwoWeekHigh: fallback.regularMarketPrice * 1.2,
        fiftyTwoWeekLow: fallback.regularMarketPrice * 0.8,
        marketCap: fallback.regularMarketPrice * 1000000000,
        beta: 1.1,
        trailingPE: fallback.trailingPE,
        forwardPE: fallback.forwardPE,
        pegRatio: fallback.pegRatio,
        profile: {
          sector: "Technology",
          industry: "Technology & Software",
          description: `${fallback.longName} is a publicly traded company providing cutting edge products and enterprise services worldwide.`,
          website: "",
          country: "United States",
          employees: 15000,
          officers: []
        }
      });
    }
  });

  // 3. Historical performance chart
  app.get("/api/chart/:symbol", async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = (req.query.range as string) || "1M";

    // Build timeline dates
    const now = new Date();
    let startDate = new Date();
    let interval: "1d" | "1wk" | "1mo" = "1d";

    switch (timeframe) {
      case "1D":
        startDate.setDate(now.getDate() - 1);
        break;
      case "1W":
        startDate.setDate(now.getDate() - 7);
        break;
      case "1M":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "3M":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "6M":
        startDate.setMonth(now.getMonth() - 6);
        break;
      case "1Y":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case "5Y":
        startDate.setFullYear(now.getFullYear() - 5);
        interval = "1mo";
        break;
      case "10Y":
        startDate.setFullYear(now.getFullYear() - 10);
        interval = "1mo";
        break;
      case "YTD":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case "ALL":
        startDate.setFullYear(now.getFullYear() - 5);
        interval = "1mo";
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    try {
      let data: any[] = [];
      
      if (symbol !== "CASH" && symbol !== "PORTFOLIO") {
        try {
          const historicalData = await fetchSafeChartHistory(symbol, startDate, now, interval);
          if (historicalData && historicalData.length > 0) {
            data = historicalData.map((d: any) => ({
              date: d.date instanceof Date ? d.date.toISOString().split("T")[0] : String(d.date).split("T")[0],
              close: d.close,
            }));
          }
        } catch (apiError) {
          console.log(`[Chart Info] Loaded synthetic model for ${symbol}`);
        }
      }

      // Generate mock chart data if Yahoo Finance failed or if requested portfolio/cash
      if (data.length === 0) {
        const points =
          timeframe === "1W" ? 7 :
          timeframe === "1M" ? 30 :
          timeframe === "3M" ? 90 :
          timeframe === "6M" ? 180 :
          timeframe === "YTD" ? Math.max(30, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))) :
          timeframe === "1Y" ? 250 :
          timeframe === "5Y" ? 60 :
          timeframe === "10Y" ? 120 :
          timeframe === "ALL" ? 60 : 30;
        let baseValue = symbol === "CASH" ? 14000 : (FALLBACK_QUOTES[symbol]?.regularMarketPrice || 150);
        let currentVal = baseValue;
        
        for (let i = points; i >= 0; i--) {
          const date = new Date();
          if (timeframe === "5Y" || timeframe === "10Y" || timeframe === "ALL") {
            date.setMonth(now.getMonth() - i);
          } else {
            date.setDate(now.getDate() - i);
          }
          
          if (symbol === "CASH") {
            // Cash holds flat with tiny deposit variations
            currentVal += (Math.random() - 0.5) * 5;
          } else {
            // Stock drifts with standard random walk
            const volatility = symbol === "NVDA" ? 0.03 : 0.015;
            const change = currentVal * (Math.random() - 0.48) * volatility;
            currentVal += change;
          }

          data.push({
            date: date.toISOString().split("T")[0],
            close: Number(currentVal.toFixed(2)),
          });
        }
      }

      res.json(data);
    } catch (err: any) {
      console.error("Chart error:", err);
      res.status(500).json({ error: "Failed to load chart", details: err.message });
    }
  });

  // 3.5. Portfolio Comparison Performance Chart
  app.post("/api/portfolio/chart", async (req, res) => {
    try {
      const { symbol = "PORTFOLIO", timeframe = "1M", positions = [] } = req.body;
      const targetSymbol = symbol.toUpperCase();

      const now = new Date();
      let startDate = new Date();
      let interval: "1d" | "1wk" | "1mo" = "1d";

      switch (timeframe) {
        case "1D":
          startDate.setDate(now.getDate() - 1);
          break;
        case "1W":
          startDate.setDate(now.getDate() - 7);
          break;
        case "1M":
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "3M":
          startDate.setMonth(now.getMonth() - 3);
          break;
        case "6M":
          startDate.setMonth(now.getMonth() - 6);
          break;
        case "1Y":
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        case "5Y":
          startDate.setFullYear(now.getFullYear() - 5);
          interval = "1mo";
          break;
        case "10Y":
          startDate.setFullYear(now.getFullYear() - 10);
          interval = "1mo";
          break;
        case "YTD":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case "ALL":
          startDate.setFullYear(now.getFullYear() - 5);
          interval = "1mo";
          break;
        default:
          startDate.setMonth(now.getMonth() - 1);
      }

      // Collect required tickers
      const requiredTickers = new Set<string>(["VOO", "QQQ"]);
      if (targetSymbol === "PORTFOLIO") {
        positions.forEach((pos: any) => {
          if (pos.ticker && pos.ticker.toUpperCase() !== "CASH") {
            requiredTickers.add(pos.ticker.toUpperCase());
          }
        });
      } else if (targetSymbol !== "CASH") {
        requiredTickers.add(targetSymbol);
      }

      // Create a dictionary of current prices from frontend positions list to feed getHistoricalData
      const currentPriceMap: Record<string, number> = {};
      positions.forEach((pos: any) => {
        if (pos.ticker && pos.price) {
          currentPriceMap[pos.ticker.toUpperCase()] = pos.price;
        }
      });

      // Fetch all historical datasets in parallel
      const tickerList = Array.from(requiredTickers);
      const datasetPromises = tickerList.map(async (ticker) => {
        const prices = await getHistoricalData(
          ticker,
          startDate,
          now,
          interval,
          timeframe,
          currentPriceMap[ticker]
        );
        return { ticker, prices };
      });

      const fetchedDatasets = await Promise.all(datasetPromises);
      const datasets: Record<string, { date: string; close: number }[]> = {};
      fetchedDatasets.forEach((item) => {
        datasets[item.ticker] = item.prices;
      });

      // Collect all unique dates across all datasets and sort chronologically
      const allDatesSet = new Set<string>();
      Object.values(datasets).forEach((list) => {
        list.forEach((point) => {
          if (point.date) allDatesSet.add(point.date);
        });
      });

      const allDates = Array.from(allDatesSet).sort();

      if (allDates.length === 0) {
        return res.json([]);
      }

      // Align prices for each date using forward-fill
      const alignedPrices: Record<string, Record<string, number>> = {};
      tickerList.forEach((ticker) => {
        alignedPrices[ticker] = {};
        const list = datasets[ticker] || [];
        
        // Map available dates to prices
        const priceMap: Record<string, number> = {};
        list.forEach((pt) => {
          priceMap[pt.date] = pt.close;
        });

        let lastPrice = FALLBACK_QUOTES[ticker]?.regularMarketPrice || 150;
        if (ticker === "VOO") lastPrice = 450;
        if (ticker === "QQQ") lastPrice = 420;
        if (list.length > 0) {
          lastPrice = list[0].close;
        }

        // Fill all dates chronologically
        allDates.forEach((date) => {
          if (priceMap[date] !== undefined) {
            lastPrice = priceMap[date];
          }
          alignedPrices[ticker][date] = lastPrice;
        });
      });

      // Base date (t0) is the first date
      const t0 = allDates[0];

      // Calculate performance series
      const chartPoints = allDates.map((date) => {
        const point: any = { date };

        // 1. VOO cumulative return
        const voo_t = alignedPrices["VOO"][date];
        const voo_t0 = alignedPrices["VOO"][t0];
        point.voo = voo_t0 > 0 ? ((voo_t / voo_t0) - 1.0) * 100 : 0;

        // 2. QQQ cumulative return
        const qqq_t = alignedPrices["QQQ"][date];
        const qqq_t0 = alignedPrices["QQQ"][t0];
        point.qqq = qqq_t0 > 0 ? ((qqq_t / qqq_t0) - 1.0) * 100 : 0;

        // 3. Selection cumulative return
        if (targetSymbol === "PORTFOLIO") {
          // Weighted average of all positions
          let totalWeight = 0;
          let weightedSum = 0;

          positions.forEach((pos: any) => {
            const w = pos.weight || 0;
            totalWeight += w;

            if (pos.isCash || pos.ticker.toUpperCase() === "CASH") {
              // Cash performance is flat (relative performance = 1.0)
              weightedSum += w * 1.0;
            } else {
              const ticker = pos.ticker.toUpperCase();
              const p_t = alignedPrices[ticker] ? alignedPrices[ticker][date] : 100;
              const p_t0 = alignedPrices[ticker] ? alignedPrices[ticker][t0] : 100;
              const rel = p_t0 > 0 ? (p_t / p_t0) : 1.0;
              weightedSum += w * rel;
            }
          });

          const v_port = totalWeight > 0 ? (weightedSum / totalWeight) : 1.0;
          point.selection = (v_port - 1.0) * 100;
        } else if (targetSymbol === "CASH") {
          point.selection = 0.0;
        } else {
          // Individual stock performance
          const p_t = alignedPrices[targetSymbol] ? alignedPrices[targetSymbol][date] : 100;
          const p_t0 = alignedPrices[targetSymbol] ? alignedPrices[targetSymbol][t0] : 100;
          point.selection = p_t0 > 0 ? ((p_t / p_t0) - 1.0) * 100 : 0;
        }

        // Round to 2 decimal places
        point.voo = Number(point.voo.toFixed(2));
        point.qqq = Number(point.qqq.toFixed(2));
        point.selection = Number(point.selection.toFixed(2));

        return point;
      });

      res.json(chartPoints);
    } catch (err: any) {
      console.error("Portfolio comparison chart error:", err);
      res.status(500).json({ error: "Failed to generate comparison performance", details: err.message });
    }
  });

  // --- FX Rate Endpoint ---
  app.get("/api/fx", async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ error: "Missing from or to" });
      }
      
      const symbol = `${from}${to}=X`;
      if (from === "USD" && to === "USD") {
        return res.json({ rate: 1 });
      }

      const quote = await yahooFinance.quote(symbol);
      const rate = quote?.regularMarketPrice || null;
      
      if (!rate) {
        // Fallback or inverse if direct pair fails
        const inverseSymbol = `${to}${from}=X`;
        const inverseQuote = await yahooFinance.quote(inverseSymbol);
        if (inverseQuote?.regularMarketPrice) {
          return res.json({ rate: 1 / inverseQuote.regularMarketPrice });
        }
        return res.status(404).json({ error: "Rate not found" });
      }
      
      res.json({ rate });
    } catch (err: any) {
      console.error("FX Error:", err.message);
      res.status(500).json({ error: "Failed to fetch FX rate" });
    }
  });
}
