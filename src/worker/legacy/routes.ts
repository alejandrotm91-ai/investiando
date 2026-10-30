// Rutas de datos de server.ts (mercado y IA), copiadas en las Fases 2 y 4.
// Cambios respecto al original:
//   - refrescos de caché en segundo plano con bg() (waitUntil de Cloudflare)
//   - tipos de Express sustituidos por los del adaptador
//   - generateGeminiContentWithRetry ahora llama a Claude (ver ../llm.ts); las rutas no cambian
// @ts-nocheck -- código heredado sin tipos estrictos; se revisa al limpiar server.ts.
import { getYahoo } from "../yahoo";
import { generateContent as generateGeminiContentWithRetry } from "../llm";
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

export function registerLegacyRoutes(app: LegacyApp) {
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

  // AI Portfolio Generator: Builds institutional portfolios with strict Large-Cap (> $20B) filter
  // and Diluted EPS CAGR > 15% requirement (except for the hypergrowth strategy).
  app.post("/api/portfolio/generate-ai", async (req, res) => {
    const {
      amount = 50000,
      strategyType = "balanced",
      strategyTypes,
      holdingsCount = 8,
      customNotes = "",
      language = "ES",
    } = req.body;

    const numAmount = Math.max(1000, Number(amount) || 50000);
    const numHoldings = Math.min(15, Math.max(4, Number(holdingsCount) || 8));
    const isES = language === "ES";

    // Normalize selected strategies into string[]
    let selectedKeys: string[] = [];
    if (Array.isArray(strategyTypes) && strategyTypes.length > 0) {
      selectedKeys = strategyTypes.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof strategyType === "string") {
      selectedKeys = strategyType.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (selectedKeys.length === 0) {
      selectedKeys = ["balanced"];
    }

    // Check if the portfolio is strictly the hypergrowth theme (exempt from EPS CAGR > 15% mandate)
    const isHypergrowthExempt = selectedKeys.length === 1 && selectedKeys[0] === "hypergrowth";

    const STRATEGY_METADATA: Record<string, { titleEN: string; titleES: string; descEN: string; descES: string; fallbackTickers: Array<{ ticker: string; weight: number; sector: string; rationaleES: string; rationaleEN: string }> }> = {
      balanced: {
        titleEN: "Balanced All-Weather Core Portfolio",
        titleES: "Portafolio Equilibrado Todo-Terreno",
        descEN: "Multi-sector asset allocation balancing growth engines, quality compounders, defensive pillars, and valuation discipline (Diluted EPS CAGR > 15%).",
        descES: "Diversificación multisectorial estratégica equilibrando crecimiento tecnológico, calidad compuesta y pilares defensivos (CAGR EPS Diluido > 15%).",
        fallbackTickers: [
          { ticker: "MSFT", weight: 16, sector: "Technology", rationaleES: "Motor tecnológico y de productividad con CAGR BPA Diluido superior al 18%.", rationaleEN: "Core enterprise productivity and cloud compounder with Diluted EPS CAGR > 18%." },
          { ticker: "AAPL", weight: 14, sector: "Technology", rationaleES: "Ecosistema masivo y servicios de alto margen con CAGR BPA Diluido > 16%.", rationaleEN: "Consumer premium hardware and high-margin services with Diluted EPS CAGR > 16%." },
          { ticker: "AMZN", weight: 13, sector: "Consumer Discretionary", rationaleES: "Líder en comercio global y nube con fuerte apalancamiento operativo y CAGR BPA > 22%.", rationaleEN: "E-commerce scale leader and AWS cloud provider with Diluted EPS CAGR > 22%." },
          { ticker: "GOOGL", weight: 13, sector: "Communication", rationaleES: "Monopolio publicitario y nube con CAGR BPA Diluido superior al 24%.", rationaleEN: "Search fortress and expanding cloud profitability with Diluted EPS CAGR > 24%." },
          { ticker: "V", weight: 12, sector: "Financials", rationaleES: "Red de pagos global con márgenes del 65%+ y CAGR BPA Diluido > 15%.", rationaleEN: "Global payments duopoly with > 65% operating margin and Diluted EPS CAGR > 15%." },
          { ticker: "COST", weight: 11, sector: "Consumer Staples", rationaleES: "Consumo esencial de calidad con retención del 93% y CAGR BPA > 16%.", rationaleEN: "Essential consumer fortress with 93% renewal rate and Diluted EPS CAGR > 16%." },
          { ticker: "LLY", weight: 11, sector: "Healthcare", rationaleES: "Líder farmacéutico con expansión masiva en ingresos y CAGR BPA > 28%.", rationaleEN: "Healthcare titan with robust pipeline and Diluted EPS CAGR > 28%." },
          { ticker: "UNH", weight: 10, sector: "Healthcare", rationaleES: "Mayor aseguradora de EE.UU. con flujo predecible y CAGR BPA > 15%.", rationaleEN: "Predictable healthcare services powerhouse with Diluted EPS CAGR > 15%." }
        ]
      },
      compounders: {
        titleEN: "High-Quality Compounders & Wide Moats",
        titleES: "Compounders de Alta Calidad & Fosos Defensivos",
        descEN: "Constructed with dominant market leaders possessing high ROIC, enduring pricing power, and Diluted EPS CAGR > 15%.",
        descES: "Construido con líderes globales de alto ROIC, ventajas competitivas duraderas y CAGR de BPA Diluido superior al 15%.",
        fallbackTickers: [
          { ticker: "MSFT", weight: 18, sector: "Technology", rationaleES: "Líder indiscutible en computación en la nube empresarial con ROIC > 30% y CAGR BPA > 18%.", rationaleEN: "Enterprise cloud titan with stellar ROIC and Diluted EPS CAGR > 18%." },
          { ticker: "AAPL", weight: 16, sector: "Technology", rationaleES: "Poder de fijación de precios masivo, ecosistema de 2B+ dispositivos y CAGR BPA > 16%.", rationaleEN: "Massive pricing power and extreme FCF generation with Diluted EPS CAGR > 16%." },
          { ticker: "GOOGL", weight: 15, sector: "Communication", rationaleES: "Monopolio publicitario en búsquedas con fuerte ventaja en IA y CAGR BPA > 24%.", rationaleEN: "Search advertising fortress with frontier AI infrastructure and Diluted EPS CAGR > 24%." },
          { ticker: "NVDA", weight: 13, sector: "Technology", rationaleES: "Estándar de facto en computación acelerada para IA con CAGR BPA > 80%.", rationaleEN: "De facto standard in accelerated computing for AI with massive EPS growth." },
          { ticker: "V", weight: 11, sector: "Financials", rationaleES: "Duopolio global de pagos con márgenes operativos superiores al 65% y CAGR BPA > 15%.", rationaleEN: "Global payments duopoly with > 65% operating margins and Diluted EPS CAGR > 15%." },
          { ticker: "COST", weight: 10, sector: "Consumer Staples", rationaleES: "Tasa de renovación del 93%, escala global inigualable y CAGR BPA > 16%.", rationaleEN: "93% membership renewal rate, extreme cost moat, and Diluted EPS CAGR > 16%." },
          { ticker: "LLY", weight: 9, sector: "Healthcare", rationaleES: "Líder en tratamientos metabólicos y oncología con CAGR BPA > 28%.", rationaleEN: "Premier metabolic therapeutics innovator with Diluted EPS CAGR > 28%." },
          { ticker: "UNH", weight: 8, sector: "Healthcare", rationaleES: "Mayor gestora de salud de EE.UU. con flujo predecible y CAGR BPA > 15%.", rationaleEN: "Largest US health services provider with highly predictable CAGR BPA > 15%." }
        ]
      },
      hypergrowth: {
        titleEN: "Hyper-Growth & AI Leaders (> $20B Large-Cap)",
        titleES: "Hipercrecimiento & Líderes de IA (> $20B Large-Cap)",
        descEN: "Focus on secular technological waves, semiconductor compute leaders, and cloud hyperscalers (Exempt from EPS CAGR > 15% threshold).",
        descES: "Enfocado en las mayores olas seculares tecnológicas, centros de datos de IA y gigantes de la nube (Exento de regla CAGR EPS > 15%).",
        fallbackTickers: [
          { ticker: "NVDA", weight: 20, sector: "Technology", rationaleES: "Motor central de la revolución de cómputo para IA generativa.", rationaleEN: "Core compute engine powering the global generative AI expansion." },
          { ticker: "AMZN", weight: 16, sector: "Consumer Discretionary", rationaleES: "AWS acelera crecimiento y el negocio de publicidad y e-commerce expanden márgenes.", rationaleEN: "AWS re-acceleration paired with high-margin advertising and retail margin expansion." },
          { ticker: "META", weight: 15, sector: "Communication", rationaleES: "Líder absoluto en monetización de IA aplicada a recomendaciones y publicidad digital.", rationaleEN: "Absolute leader in AI-driven content ranking and direct-response digital advertising." },
          { ticker: "AVGO", weight: 13, sector: "Technology", rationaleES: "Líder en networking para clústeres de IA y chips personalizados (ASICs).", rationaleEN: "Dominant player in high-speed AI data center networking and custom ASIC accelerators." },
          { ticker: "TSM", weight: 13, sector: "Technology", rationaleES: "Monopolio práctico en manufactura de semiconductores avanzados (< 3nm).", rationaleEN: "Near-monopoly in leading-edge semiconductor foundry manufacturing (< 3nm)." },
          { ticker: "NOW", weight: 9, sector: "Technology", rationaleES: "Plataforma de automatización empresarial para flujos de trabajo de IA.", rationaleEN: "Enterprise workflow automation platform with high retention and rapid organic expansion." },
          { ticker: "AMD", weight: 8, sector: "Technology", rationaleES: "Segundo competidor clave en GPUs para centros de datos y líder en CPUs x86 para servidores.", rationaleEN: "Leading secondary challenger in AI data center GPUs and server CPU market share winner." },
          { ticker: "CRM", weight: 6, sector: "Technology", rationaleES: "Líder mundial en software CRM integrando agentes de IA autónomos (Agentforce).", rationaleEN: "Global CRM software leader transitioning customers to autonomous enterprise AI agents." }
        ]
      },
      garp: {
        titleEN: "Growth at a Reasonable Price (GARP)",
        titleES: "Crecimiento a Precio Razonable (GARP)",
        descEN: "Optimal balance between double-digit earnings growth (Diluted EPS CAGR > 15%) and disciplined valuation multiples.",
        descES: "Equilibrio óptimo entre crecimiento de beneficios superior al 15% (CAGR BPA Diluido > 15%) y múltiplos de valoración moderados.",
        fallbackTickers: [
          { ticker: "GOOGL", weight: 16, sector: "Communication", rationaleES: "Crecimiento del 24%+ en BPA Diluido cotizando a un ratio PEG muy atractivo.", rationaleEN: "24%+ Diluted EPS growth trading at an attractive PEG ratio relative to tech peers." },
          { ticker: "META", weight: 15, sector: "Communication", rationaleES: "Eficiencia de costes estricta y crecimiento en publicidad con CAGR BPA > 35% y P/E razonable.", rationaleEN: "Disciplined cost structure and high cash conversion with Diluted EPS CAGR > 35%." },
          { ticker: "QCOM", weight: 14, sector: "Technology", rationaleES: "Líder en procesadores móviles y chips para PC con CAGR BPA > 17% y P/E moderado.", rationaleEN: "High-margin mobile/auto chip powerhouse with Diluted EPS CAGR > 17%." },
          { ticker: "AMAT", weight: 13, sector: "Technology", rationaleES: "Equipos para fabricación de chips avanzados con CAGR BPA > 19% y bajo P/E.", rationaleEN: "Semiconductor equipment leader with Diluted EPS CAGR > 19% and strong returns on capital." },
          { ticker: "BKNG", weight: 12, sector: "Consumer Discretionary", rationaleES: "Dominio global en viajes online con ROIC masivo y CAGR BPA > 26%.", rationaleEN: "Online travel giant with high ROIC, aggressive share repurchases, and Diluted EPS CAGR > 26%." },
          { ticker: "KLAC", weight: 11, sector: "Technology", rationaleES: "Control de procesos y metrología indispensable con CAGR BPA > 22%.", rationaleEN: "Yield inspection and metrology monopoly with Diluted EPS CAGR > 22%." },
          { ticker: "TXN", weight: 10, sector: "Technology", rationaleES: "Chips analógicos indispensables con CAGR BPA > 15% y alto retorno de capital.", rationaleEN: "Analog semiconductor champion with proven pricing power and Diluted EPS CAGR > 15%." },
          { ticker: "AMZN", weight: 9, sector: "Consumer Discretionary", rationaleES: "Expansión de márgenes en comercio y AWS con CAGR BPA > 22%.", rationaleEN: "Margin expansion in AWS and digital commerce with Diluted EPS CAGR > 22%." }
        ]
      },
      buffett: {
        titleEN: "Buffett Style - Wonderful Companies @ Fair Price",
        titleES: "Estilo Buffett - Negocios Extraordinarios a Precio Justo",
        descEN: "High cash generation, durable consumer franchises, and fortress balance sheets with Diluted EPS CAGR > 15%.",
        descES: "Filosofía value de calidad: alto flujo de caja libre, fidelidad de clientes y CAGR de BPA Diluido superior al 15%.",
        fallbackTickers: [
          { ticker: "AAPL", weight: 18, sector: "Technology", rationaleES: "Pilar definitivo gracias a su fidelidad de marca inigualable y CAGR BPA > 16%.", rationaleEN: "Core consumer franchise with extraordinary brand loyalty and Diluted EPS CAGR > 16%." },
          { ticker: "AXP", weight: 16, sector: "Financials", rationaleES: "Red de pagos premium cerrada con clientes de alto poder adquisitivo y CAGR BPA > 16%.", rationaleEN: "Spend-centric payment network with affluent cardholders and Diluted EPS CAGR > 16%." },
          { ticker: "BKNG", weight: 15, sector: "Consumer Discretionary", rationaleES: "Fuerte foso defensivo en viajes globales, enorme conversión a FCF y CAGR BPA > 26%.", rationaleEN: "High cash generator with massive consumer moat and Diluted EPS CAGR > 26%." },
          { ticker: "MSFT", weight: 14, sector: "Technology", rationaleES: "Ecosistema de software y nube con ventaja competitiva insuperable y CAGR BPA > 18%.", rationaleEN: "Enterprise moat and sticky recurring software cash flows with Diluted EPS CAGR > 18%." },
          { ticker: "GOOGL", weight: 13, sector: "Communication", rationaleES: "Monopolio en búsquedas con balance blindado de caja neta y CAGR BPA > 24%.", rationaleEN: "Search fortress balance sheet with net cash and Diluted EPS CAGR > 24%." },
          { ticker: "V", weight: 12, sector: "Financials", rationaleES: "Duopolio de pagos con márgenes operativos del 65% y CAGR BPA > 15%.", rationaleEN: "Payment infrastructure duopoly with > 65% operating margin and Diluted EPS CAGR > 15%." },
          { ticker: "COST", weight: 12, sector: "Consumer Staples", rationaleES: "Fidelidad de miembros inquebrantable, escala global y CAGR BPA > 16%.", rationaleEN: "Unrivaled membership loyalty and scale with Diluted EPS CAGR > 16%." }
        ]
      },
      dividends: {
        titleEN: "Dividend Growth & Defensive Champions",
        titleES: "Dividendos Crecientes & Campeones Defensivos",
        descEN: "Companies with consistent dividend growth and historical Diluted EPS CAGR > 15%.",
        descES: "Líderes de dividendo seguro y creciente respaldados por un CAGR de BPA Diluido superior al 15%.",
        fallbackTickers: [
          { ticker: "AVGO", weight: 18, sector: "Technology", rationaleES: "Crecimiento de dividendo de doble dígito respaldado por CAGR BPA > 25%.", rationaleEN: "High dividend growth supported by cash generation and Diluted EPS CAGR > 25%." },
          { ticker: "MSFT", weight: 16, sector: "Technology", rationaleES: "Crecimiento constante de dividendo con balance AAA y CAGR BPA > 18%.", rationaleEN: "Steady dividend grower with AAA balance sheet and Diluted EPS CAGR > 18%." },
          { ticker: "AAPL", weight: 15, sector: "Technology", rationaleES: "El mayor generador de recompras y dividendos del mundo con CAGR BPA > 16%.", rationaleEN: "Massive capital return engine with Diluted EPS CAGR > 16%." },
          { ticker: "V", weight: 14, sector: "Financials", rationaleES: "Crecimiento de dividendos a doble dígito por 15+ años y CAGR BPA > 15%.", rationaleEN: "Double-digit dividend growth record supported by Diluted EPS CAGR > 15%." },
          { ticker: "COST", weight: 13, sector: "Consumer Staples", rationaleES: "Crecimiento sostenido en dividendos ordinarios y especiales con CAGR BPA > 16%.", rationaleEN: "Robust recurring + special dividend compounder with Diluted EPS CAGR > 16%." },
          { ticker: "LLY", weight: 12, sector: "Healthcare", rationaleES: "Expansión rápida de dividendos apoyada en liderazgo farmacéutico y CAGR BPA > 28%.", rationaleEN: "Rapidly expanding dividend payout fueled by Diluted EPS CAGR > 28%." },
          { ticker: "UNH", weight: 12, sector: "Healthcare", rationaleES: "Crecimiento de dividendo de doble dígito y CAGR BPA > 15%.", rationaleEN: "Double-digit dividend grower with defensive cash flow and Diluted EPS CAGR > 15%." }
        ]
      },
      deepvalue: {
        titleEN: "Deep Value & High Cash Flow Yield",
        titleES: "Valor Profundo & Rendimiento de Flujo de Caja",
        descEN: "Large-cap leaders trading at attractive valuation multiples while maintaining Diluted EPS CAGR > 15%.",
        descES: "Líderes de gran capitalización cotizando con múltiplos atractivos y manteniendo un CAGR de BPA Diluido superior al 15%.",
        fallbackTickers: [
          { ticker: "GOOGL", weight: 18, sector: "Communication", rationaleES: "Valoración atractiva con ratio PEG por debajo de la media del mercado y CAGR BPA > 24%.", rationaleEN: "Deep value PEG multiple with fortress cash pile and Diluted EPS CAGR > 24%." },
          { ticker: "META", weight: 16, sector: "Communication", rationaleES: "Alto rendimiento de flujo de caja libre con recompras masivas y CAGR BPA > 35%.", rationaleEN: "High FCF yield and disciplined operating expenses with Diluted EPS CAGR > 35%." },
          { ticker: "QCOM", weight: 15, sector: "Technology", rationaleES: "Múltiplo P/E bajo respecto al sector y CAGR BPA > 17%.", rationaleEN: "Low valuation multiple with strong cash conversion and Diluted EPS CAGR > 17%." },
          { ticker: "AMAT", weight: 14, sector: "Technology", rationaleES: "Valoración atractiva en equipamiento de semiconductores con CAGR BPA > 19%.", rationaleEN: "High-return semiconductor equipment leader with Diluted EPS CAGR > 19%." },
          { ticker: "BKNG", weight: 13, sector: "Consumer Discretionary", rationaleES: "Generación masiva de caja con bajo ratio EV/EBITDA y CAGR BPA > 26%.", rationaleEN: "Massive cash flow yield and aggressive share count reduction with CAGR BPA > 26%." },
          { ticker: "AXP", weight: 12, sector: "Financials", rationaleES: "Múltiplo P/E moderado con crecimiento sólido de ingresos y CAGR BPA > 16%.", rationaleEN: "Modest earnings multiple with high-spending customer base and CAGR BPA > 16%." },
          { ticker: "KLAC", weight: 12, sector: "Technology", rationaleES: "Excelente conversión a caja y foso en metrología con CAGR BPA > 22%.", rationaleEN: "Top-tier cash conversion and inspection monopoly with Diluted EPS CAGR > 22%." }
        ]
      }
    };

    // Combine metadata for all selected strategies
    const selectedMetas = selectedKeys
      .map(k => STRATEGY_METADATA[k])
      .filter(Boolean);

    const activeMetas = selectedMetas.length > 0 ? selectedMetas : [STRATEGY_METADATA.balanced];

    let strategyTitleText = "";
    let strategyDescEN = "";
    let strategyDescES = "";

    if (activeMetas.length === 1) {
      strategyTitleText = isES ? activeMetas[0].titleES : activeMetas[0].titleEN;
      strategyDescEN = activeMetas[0].descEN;
      strategyDescES = activeMetas[0].descES;
    } else if (activeMetas.length === 2) {
      strategyTitleText = isES
        ? `${activeMetas[0].titleES} & ${activeMetas[1].titleES}`
        : `${activeMetas[0].titleEN} & ${activeMetas[1].titleEN}`;
      strategyDescEN = `Multi-style blend combining (${activeMetas[0].descEN}) with (${activeMetas[1].descEN}).`;
      strategyDescES = `Portafolio híbrido combinando (${activeMetas[0].descES}) con (${activeMetas[1].descES}).`;
    } else {
      strategyTitleText = isES
        ? `Portafolio Multi-Estilo (${activeMetas.length} Enfoques)`
        : `Multi-Style Institutional Portfolio (${activeMetas.length} Styles)`;
      strategyDescEN = `Strategic institutional synthesis across ${activeMetas.map(m => m.titleEN).join(", ")}.`;
      strategyDescES = `Síntesis institucional combinando ${activeMetas.map(m => m.titleES).join(", ")}.`;
    }

    let candidateHoldings: Array<{ ticker: string; weight: number; sector: string; rationale: string; name?: string; archetype?: string }> = [];
    let aiRationaleText = isES ? strategyDescES : strategyDescEN;

    // Try calling Gemini to generate an optimal custom allocation
    try {
      const epsMandatePrompt = `CRITICAL DILUTED EPS CAGR MANDATE (PRIORITY #1 - STRICT REQUIREMENT):
- MANDATORY POSITIVE DILUTED EPS CAGR (NON-NEGOTIABLE): EVERY SINGLE SELECTED TICKER MUST HAVE A POSITIVE HISTORICAL DILUTED EPS COMPOUND ANNUAL GROWTH RATE (CAGR > 0.0% / Diluted EPS Compound Annual Growth Rate strictly greater than zero).
- Any company with a negative, zero, or contracting Diluted EPS CAGR (CAGR <= 0.0%) is STRICTLY PROHIBITED AND DISQUALIFIED across all portfolio styles.
- DILUTED EPS CAGR THRESHOLD: ${
  isHypergrowthExempt
    ? `Because the chosen strategy is exclusively "Hyper-Growth & AI Leaders", companies undergoing massive secular scale are EXEMPT from the 15% historical Diluted EPS CAGR threshold, BUT THEY MUST STILL MAINTAIN A STRICTLY POSITIVE DILUTED EPS CAGR (> 0.0%).`
    : `EVERY SINGLE SELECTED COMPANY MUST have a historical Diluted EPS Compound Annual Growth Rate (CAGR) strictly GREATER THAN 15% (> 15.0% Diluted EPS CAGR). Any stock with Diluted EPS CAGR <= 15% is STRICTLY DISQUALIFIED.
- Examples of qualifying stocks with strong positive Diluted EPS CAGR (> 15%): NVDA, MSFT, AAPL, GOOGL, META, AMZN, AVGO, TSM, COST, V, LLY, UNH, BKNG, AMAT, KLAC, QCOM, NOW, CRM, AXP, HD, TXN.`
}`;

      const prompt = `You are a Chief Investment Officer and quantitative portfolio architect at a top-tier institutional asset management firm.
Task: Construct an optimal, institutional-grade equity portfolio allocation for a client investing exactly $${numAmount.toLocaleString()} USD.

CLIENT SPECIFICATIONS:
- Strategy Focus: ${strategyTitleText}
- Selected Styles & Directives: ${strategyDescEN}
- Target Number of Stocks: ${numHoldings} positions
- Custom User Preference: ${customNotes ? customNotes : "None"}
- Language: ${language}

CRITICAL RULES (NON-NEGOTIABLE):
1. STRICT LARGE-CAP MANDATE: Every single chosen stock MUST be a US Large-Cap stock with a Market Capitalization strictly ABOVE $20 Billion USD (> $20B Market Cap). Never include small-caps, micro-caps, or speculative penny stocks.
2. ${epsMandatePrompt}
3. ALLOCATION WEIGHTS: Provide exact percentage weights summing to 100%. Ensure positions are weighted sensibly (between 5% and 25% each).
4. HIGH CONVICTION: Select ONLY real, actively traded ticker symbols on US exchanges representing the chosen investment styles.
5. RATIONALE: Provide a crisp 1-sentence institutional investment thesis explaining why this Large-Cap company fits the selected styles and satisfies the criteria.

Respond strictly with valid JSON conforming to this schema:
{
  "strategyTitle": "${strategyTitleText}",
  "strategySummary": "A concise 2-sentence summary of the portfolio strategy and expected risk/reward profile in ${language}",
  "holdings": [
    {
      "ticker": "TICKER_SYMBOL",
      "name": "Company Full Name",
      "sector": "Sector Name",
      "weight": 15,
      "estimatedMarketCap": "$850B",
      "archetype": "High-Quality Compounder",
      "rationale": "One crisp sentence explaining the investment thesis and criteria fit."
    }
  ]
}`;

      const aiResponse = await generateGeminiContentWithRetry({
        contents: prompt,
        config: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });

      if (aiResponse && aiResponse.text) {
        const parsed = JSON.parse(aiResponse.text.trim());
        if (parsed && Array.isArray(parsed.holdings) && parsed.holdings.length >= 4) {
          candidateHoldings = parsed.holdings.slice(0, numHoldings).map((h: any) => ({
            ticker: String(h.ticker || "").toUpperCase().trim(),
            name: h.name,
            sector: h.sector || "Large Cap",
            weight: Number(h.weight) || (100 / parsed.holdings.length),
            rationale: isES ? (h.rationale || h.thesis || "") : (h.rationale || h.thesis || ""),
          }));
          if (parsed.strategySummary) {
            aiRationaleText = parsed.strategySummary;
          }
          if (parsed.strategyTitle) {
            strategyTitleText = parsed.strategyTitle;
          }
        }
      }
    } catch (aiErr) {
      console.warn("[Portfolio AI Generator] Gemini call failed or returned unparseable output, using institutional curated fallback:", aiErr);
    }

    // If Gemini didn't return valid candidates, blend the curated fallback lists across selected strategies
    if (candidateHoldings.length === 0) {
      const blendedTickersMap = new Map<string, { ticker: string; weight: number; sector: string; rationaleES: string; rationaleEN: string }>();
      
      // Round-robin selection from activeMetas fallback tickers
      const maxPerStrat = 8;
      for (let i = 0; i < maxPerStrat; i++) {
        for (const meta of activeMetas) {
          if (meta.fallbackTickers[i] && !blendedTickersMap.has(meta.fallbackTickers[i].ticker)) {
            blendedTickersMap.set(meta.fallbackTickers[i].ticker, meta.fallbackTickers[i]);
          }
          if (blendedTickersMap.size >= numHoldings) break;
        }
        if (blendedTickersMap.size >= numHoldings) break;
      }

      candidateHoldings = Array.from(blendedTickersMap.values()).slice(0, numHoldings).map((f) => ({
        ticker: f.ticker,
        weight: f.weight,
        sector: f.sector,
        rationale: isES ? f.rationaleES : f.rationaleEN,
      }));
    }

    // Query financials and real-time quotes in parallel to verify Diluted EPS CAGR & price
    const tickerFinancialsMap: Record<string, { annual: any[]; quarterly: any[] }> = {};
    const quoteMap: Record<string, any> = {};

    await Promise.all(
      candidateHoldings.map(async (item) => {
        const ticker = item.ticker;
        try {
          const [fin, q] = await Promise.all([
            fetchSingleTickerFinancials(ticker),
            yahooFinance && typeof yahooFinance.quote === "function"
              ? yahooFinance.quote(ticker.replace(/\./g, "-"), {}, { validateResult: false }).catch(() => null)
              : Promise.resolve(null)
          ]);
          if (fin) tickerFinancialsMap[ticker] = fin;
          if (q && q.symbol) quoteMap[ticker] = q;
        } catch (e) {
          // Handled gracefully
        }
      })
    );

    // List of reliable backup Large-Caps that strictly satisfy Positive Diluted EPS CAGR (> 15%)
    const QUALIFIED_BACKUP_TICKERS = [
      "MSFT", "AAPL", "NVDA", "GOOGL", "META", "AMZN", "AVGO", "TSM", "COST", "V", "LLY", "UNH", "BKNG", "AMAT", "KLAC", "QCOM", "NOW", "CRM", "AXP", "HD", "TXN"
    ];

    // Enforce POSITIVE DILUTED EPS CAGR MANDATE (> 0% strictly, and > 15% for non-hypergrowth)
    const finalCandidateHoldings: Array<{
      ticker: string;
      weight: number;
      sector: string;
      rationale: string;
      name?: string;
      archetype?: string;
      epsCagr: number | null;
      isCagrPositive: boolean;
    }> = [];
    const usedTickers = new Set<string>();

    for (let item of candidateHoldings) {
      const fin = tickerFinancialsMap[item.ticker];

      let epsCagr: number | null = null;
      if (fin && fin.annual && fin.annual.length >= 2) {
        epsCagr = calculateDilutedEpsCagrFromAnnual(fin.annual);
      }
      if (epsCagr === null && KNOWN_LARGE_CAP_METRICS[item.ticker]) {
        epsCagr = KNOWN_LARGE_CAP_METRICS[item.ticker].epsCagr;
      }

      // POSITIVE DILUTED EPS CAGR MANDATE (PRIORITY #1):
      // The Diluted EPS CAGR MUST be strictly positive (> 0.0%).
      // For non-hypergrowth themes, it must also satisfy > 15.0%. For hypergrowth, it must still be strictly positive (> 0.0%).
      const isCagrPositive = epsCagr !== null && epsCagr > 0;
      const failsCagr = isHypergrowthExempt
        ? !isCagrPositive
        : (epsCagr === null || epsCagr < 15.0);

      // If Diluted EPS CAGR fails positive/growth requirements, replace with a qualified Large-Cap
      if (failsCagr) {
        const backup = QUALIFIED_BACKUP_TICKERS.find(t => !usedTickers.has(t) && !candidateHoldings.some(c => c.ticker === t));
        if (backup) {
          const backupInfo = KNOWN_LARGE_CAP_METRICS[backup] || { name: backup, sector: "Large Cap", epsCagr: 18.0 };
          item = {
            ticker: backup,
            name: backupInfo.name,
            sector: backupInfo.sector,
            weight: item.weight,
            rationale: isES
              ? `Líder Large-Cap con CAGR BPA Diluido positivo de +${backupInfo.epsCagr}% y crecimiento de beneficios sostenido.`
              : `Large-Cap market leader with positive Diluted EPS CAGR of +${backupInfo.epsCagr}% and compounding earnings growth.`,
          };
          epsCagr = backupInfo.epsCagr;
        }
      }

      const verifiedCagr = (epsCagr !== null && epsCagr > 0) ? epsCagr : (KNOWN_LARGE_CAP_METRICS[item.ticker]?.epsCagr || 16.5);

      usedTickers.add(item.ticker);
      finalCandidateHoldings.push({
        ...item,
        epsCagr: verifiedCagr,
        isCagrPositive: true
      });
    }

    // Normalize weights to sum exactly to 100%
    const totalWeight = finalCandidateHoldings.reduce((sum, h) => sum + (h.weight || 0), 0);
    const normalizedHoldings = finalCandidateHoldings.map((h) => ({
      ...h,
      weight: totalWeight > 0 ? (h.weight / totalWeight) * 100 : (100 / finalCandidateHoldings.length),
    }));

    // Fetch quotes for any newly added backup tickers if not already fetched
    await Promise.all(
      normalizedHoldings.map(async (item) => {
        if (!quoteMap[item.ticker]) {
          try {
            if (yahooFinance && typeof yahooFinance.quote === "function") {
              const q: any = await yahooFinance.quote(item.ticker.replace(/\./g, "-"), {}, { validateResult: false });
              if (q && q.symbol) quoteMap[item.ticker] = q;
            }
          } catch (e) {
            // Handled
          }
        }
      })
    );

    const enrichedHoldings: any[] = [];
    let totalAllocatedDollars = 0;

    for (const item of normalizedHoldings) {
      const q = quoteMap[item.ticker];
      const defaultInfo = KNOWN_LARGE_CAP_METRICS[item.ticker];

      let livePrice = 100;
      let companyName = item.name || item.ticker;
      let marketCap = 50000000000;
      let sector = item.sector || "Large Cap";
      let pe: number | null = null;
      let divYield: number | null = null;

      if (q) {
        livePrice = Number(q.regularMarketPrice || q.price || q.previousClose || (defaultInfo ? defaultInfo.price : 100));
        companyName = q.longName || q.shortName || (defaultInfo ? defaultInfo.name : item.ticker);
        marketCap = Number(q.marketCap || (defaultInfo ? defaultInfo.mktCap : 50000000000));
        if (q.trailingPE) pe = Number(q.trailingPE);
        else if (q.forwardPE) pe = Number(q.forwardPE);
        else if (defaultInfo) pe = defaultInfo.pe;

        if (q.trailingAnnualDividendYield) divYield = Number(q.trailingAnnualDividendYield) * 100;
        else if (defaultInfo) divYield = defaultInfo.divYield;
      } else if (defaultInfo) {
        livePrice = defaultInfo.price;
        companyName = defaultInfo.name;
        marketCap = defaultInfo.mktCap;
        sector = defaultInfo.sector;
        pe = defaultInfo.pe;
        divYield = defaultInfo.divYield;
      }

      // Format market cap cleanly (e.g. $3.24T, $450.2B, $48.5B)
      let marketCapFormatted = "> $20B";
      if (marketCap >= 1000000000000) {
        marketCapFormatted = `$${(marketCap / 1000000000000).toFixed(2)}T`;
      } else if (marketCap >= 1000000000) {
        marketCapFormatted = `$${(marketCap / 1000000000).toFixed(1)}B`;
      }

      // Calculate allocation and shares to achieve 100% full allocation across equities
      const targetDollars = (item.weight / 100) * numAmount;
      let shares = Math.max(1, Math.round(targetDollars / livePrice));
      
      if (livePrice > targetDollars && numAmount < 50000) {
        shares = parseFloat((targetDollars / livePrice).toFixed(2));
      }

      const positionMktValue = Math.round(shares * livePrice * 100) / 100;
      totalAllocatedDollars += positionMktValue;

      enrichedHoldings.push({
        ticker: item.ticker,
        name: companyName,
        shares,
        avgCost: Math.round(livePrice * 100) / 100,
        currentPrice: Math.round(livePrice * 100) / 100,
        mktValue: positionMktValue,
        weight: item.weight,
        sector,
        marketCap,
        marketCapFormatted,
        pe,
        dividendYield: divYield,
        dilutedEpsCagr: item.epsCagr,
        isDilutedEpsCagrPositive: true,
        rationale: item.rationale,
        archetype: item.archetype || (strategyType === "compounders" ? "High-Quality Compounder" : "Large-Cap Leader"),
      });
    }

    // No cash position is allocated - 100% allocated directly across equities
    const cashRemaining = 0;

    // Compute aggregate summary metrics
    let weightedPeSum = 0;
    let weightedDivYieldSum = 0;
    let validPeWeight = 0;
    const sectorWeights: Record<string, number> = {};

    enrichedHoldings.forEach((h) => {
      const w = h.weight / 100;
      if (h.pe && h.pe > 0 && h.pe < 150) {
        weightedPeSum += h.pe * w;
        validPeWeight += w;
      }
      if (h.dividendYield && h.dividendYield > 0) {
        weightedDivYieldSum += h.dividendYield * w;
      }
      sectorWeights[h.sector] = (sectorWeights[h.sector] || 0) + h.weight;
    });

    const weightedPe = validPeWeight > 0 ? Math.round((weightedPeSum / validPeWeight) * 10) / 10 : 25.4;
    const weightedDivYield = Math.round(weightedDivYieldSum * 100) / 100;

    res.json({
      success: true,
      strategyTitle: strategyTitleText,
      strategyDescription: isES ? strategyDescES : strategyDescEN,
      totalTargetAmount: numAmount,
      totalAllocatedAmount: Math.round(totalAllocatedDollars * 100) / 100,
      cashRemaining,
      isHypergrowthExempt,
      epsCagrFilterApplied: !isHypergrowthExempt,
      dilutedEpsCagrPositiveVerified: true,
      holdings: enrichedHoldings,
      summaryMetrics: {
        weightedPe,
        weightedDivYield,
        sectorWeights,
        topHolding: enrichedHoldings[0]?.ticker || "MSFT",
      },
      aiRationale: aiRationaleText,
    });
  });

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

  // 3b. Tier-1 Financial News Endpoint with Search Grounding
  app.post("/api/news", async (req, res) => {
    const { tickers = [], language = "ES", filterTicker = "ALL", filterCategory = "ALL", forceRefresh = false } = req.body;

    // Standard list of active tickers if none passed
    const defaultTickers = ["NVDA", "MSFT", "META", "AVGO", "AMZN", "MAGS", "GOOGL", "IREN", "CRWV", "NBIS", "AAPL", "TSLA"];
    const targetTickers = Array.isArray(tickers) && tickers.length > 0 ? tickers : defaultTickers;

    const fallbackNews = [
      {
        id: "news_nvda_1",
        ticker: "NVDA",
        title: language === "ES" ? "NVIDIA amplía su liderazgo en infraestructura de IA con un nuevo contrato masivo de supercómputo" : "NVIDIA Expands AI Infrastructure Dominance with New Major Hyperscale Deal",
        summary: language === "ES" 
          ? "Analistas de Wall Street destacan que la demanda para las nuevas arquitecturas de chips Blackwell se mantiene 'extraordinariamente alta', superando las capacidades de producción para los próximos trimestres."
          : "Wall Street analysts highlight that demand for Blackwell chip architectures remains extraordinarily elevated, outstripping production capacity for upcoming quarters.",
        source: "Bloomberg",
        url: "https://www.bloomberg.com",
        publishedAt: language === "ES" ? "Hace 45 minutos" : "45 minutes ago",
        sentiment: "positive",
        category: "Product & AI",
        impactScore: 9.5,
        tickersRelated: ["NVDA", "MSFT", "AMZN", "MAGS"]
      },
      {
        id: "news_msft_1",
        ticker: "MSFT",
        title: language === "ES" ? "Microsoft Azure reporta un acelerado crecimiento impulsado por la monetización de servicios Copilot" : "Microsoft Azure Reports Accelerated Growth Driven by Copilot Monetization",
        summary: language === "ES"
          ? "Los ingresos de nube comercial continúan expandiéndose a doble dígito. Citigroup reitera recomendación de Compra con un objetivo de precio revisado al alza."
          : "Commercial cloud revenue continues expanding at double-digit rates. Citigroup reiterates Buy rating with raised price target.",
        source: "Reuters",
        url: "https://www.reuters.com",
        publishedAt: language === "ES" ? "Hace 2 horas" : "2 hours ago",
        sentiment: "positive",
        category: "Earnings",
        impactScore: 8.8,
        tickersRelated: ["MSFT", "GOOGL", "AMZN"]
      },
      {
        id: "news_crwv_1",
        ticker: "CRWV",
        title: language === "ES" ? "CoreWeave cierra ronda de refinanciamiento institucional para expandir centros de datos GPU" : "CoreWeave Secures Institutional Financing Round to Expand GPU Data Centers",
        summary: language === "ES"
          ? "La proveedora de infraestructura cloud para IA consolida nuevos acuerdos de capacidad con hyperscalers. Analistas elevan precio objetivo ante una mayor visibilidad de ingresos recurrentes."
          : "The AI cloud infrastructure provider secures new capacity deals with hyperscalers. Analysts lift price targets on enhanced recurring revenue visibility.",
        source: "The Wall Street Journal",
        url: "https://www.wsj.com",
        publishedAt: language === "ES" ? "Hace 3 horas" : "3 hours ago",
        sentiment: "positive",
        category: "M&A / Deals",
        impactScore: 8.5,
        tickersRelated: ["CRWV", "NVDA"]
      },
      {
        id: "news_nbis_1",
        ticker: "NBIS",
        title: language === "ES" ? "Nebius Group anuncia expansión de centros de cómputo de alta densidad en Europa y EE.UU." : "Nebius Group Announces High-Density Compute Data Center Expansion in Europe & US",
        summary: language === "ES"
          ? "Nebius reporta un fuerte incremento en contrataciones de capacidad de procesamiento AI en la nube, impulsando las estimaciones de crecimiento de ingresos operativos para el segundo semestre."
          : "Nebius reports surge in AI cloud processing capacity contracts, driving second-half operating revenue estimates higher.",
        source: "Financial Times",
        url: "https://www.ft.com",
        publishedAt: language === "ES" ? "Hace 4 horas" : "4 hours ago",
        sentiment: "positive",
        category: "Product & AI",
        impactScore: 8.2,
        tickersRelated: ["NBIS"]
      },
      {
        id: "news_iren_1",
        ticker: "IREN",
        title: language === "ES" ? "IREN Limited fortalece su transición a cómputo de alto rendimiento (HPC) y servicios GPU" : "IREN Limited Strengthens Transition to High-Performance Compute (HPC) and GPU Cloud Services",
        summary: language === "ES"
          ? "La compañía reporta eficiencias récord en sus instalaciones energéticas y una menor dependencia del minado tradicional de Bitcoin a favor del arrendamiento de clústeres Nvidia."
          : "Company reports record power efficiency at data sites and reduced dependency on Bitcoin mining in favor of Nvidia GPU cluster leasing.",
        source: "CNBC",
        url: "https://www.cnbc.com",
        publishedAt: language === "ES" ? "Hace 5 horas" : "5 hours ago",
        sentiment: "positive",
        category: "Analyst Rating",
        impactScore: 8.0,
        tickersRelated: ["IREN"]
      },
      {
        id: "news_fed_1",
        ticker: "GENERAL",
        title: language === "ES" ? "La Reserva Federal mantiene la vigilancia sobre la inflación mientras el mercado evalúa el ritmo de recortes de tasas" : "Federal Reserve Maintains Watchful Stance on Inflation as Market Gauges Rate Cut Pace",
        summary: language === "ES"
          ? "Los funcionarios de la Fed enfatizan la dependencia de datos macroeconómicos para futuras decisiones monetarias, manteniendo el rendimiento de los bonos del Tesoro a 10 años en rangos estables."
          : "Fed officials emphasize data dependency for future monetary shifts, keeping 10-year Treasury yields in steady ranges.",
        source: "Barron's",
        url: "https://www.barrons.com",
        publishedAt: language === "ES" ? "Hace 6 horas" : "6 hours ago",
        sentiment: "neutral",
        category: "Macro & Fed",
        impactScore: 9.0,
        tickersRelated: ["VOO", "QQQ", "MSFT", "NVDA", "AAPL"]
      },
      {
        id: "news_amzn_1",
        ticker: "AMZN",
        title: language === "ES" ? "Amazon AWS invierte $10B adicionales para infraestructura de centros de datos de IA" : "Amazon AWS Commits Additional $10B for AI Data Center Infrastructure",
        summary: language === "ES"
          ? "AWS busca atender la demanda masiva de entrenamiento y deducción de modelos LLM. JPMorgan mantiene sobreponderar con un catalizador alcista en márgenes operativos."
          : "AWS seeks to meet massive LLM training and inference demand. JPMorgan maintains Overweight with bullish margin expansion catalyst.",
        source: "Seeking Alpha",
        url: "https://seekingalpha.com",
        publishedAt: language === "ES" ? "Hace 7 horas" : "7 hours ago",
        sentiment: "positive",
        category: "Product & AI",
        impactScore: 8.4,
        tickersRelated: ["AMZN", "NVDA"]
      },
      {
        id: "news_meta_1",
        ticker: "META",
        title: language === "ES" ? "Meta Platforms proyecta mayores retornos en publicidad tras la integración profunda de Llama 3.5" : "Meta Platforms Projects Higher Ad Yields Following Deep Llama 3.5 Integration",
        summary: language === "ES"
          ? "La monetización de anuncios inteligentes en Instagram y WhatsApp muestra mejoras en engagement. Goldman Sachs eleva precio objetivo a 12 meses."
          : "AI ad targeting on Instagram and WhatsApp yields engagement gains. Goldman Sachs raises 12-month price target.",
        source: "MarketWatch",
        url: "https://www.marketwatch.com",
        publishedAt: language === "ES" ? "Hace 8 horas" : "8 hours ago",
        sentiment: "positive",
        category: "Product & AI",
        impactScore: 8.3,
        tickersRelated: ["META"]
      },
      {
        id: "news_googl_1",
        ticker: "GOOGL",
        title: language === "ES" ? "Alphabet acelera la monetización de Gemini Enterprise en Google Cloud Platform" : "Alphabet Accelerates Gemini Enterprise Monetization Across Google Cloud Platform",
        summary: language === "ES"
          ? "Adopción corporativa creció un 40% intertrimestral. Morgan Stanley resalta la sólida ventaja en TPU personalizadas para reducir costos de inferencia."
          : "Enterprise adoption grew 40% QoQ. Morgan Stanley highlights structural TPU cost advantages for inference workloads.",
        source: "Financial Times",
        url: "https://ft.com",
        publishedAt: language === "ES" ? "Hace 10 horas" : "10 hours ago",
        sentiment: "positive",
        category: "Earnings",
        impactScore: 8.1,
        tickersRelated: ["GOOGL", "NVDA"]
      }
    ];

    try {
      const prompt = `
Eres la API de Inteligencia Financiera para la terminal investiando.ai.
Tus usuarios requieren estar al tanto de las noticias MÁS RELEVANTES Y RECIENTES para los siguientes símbolos bursátiles de su portafolio/watchlist: ${targetTickers.join(", ")}.

INSTRUCCIONES Y FUENTES:
1. Debes rastrear y resumir noticias ÚNICAMENTE de fuentes financieras de primer nivel institucional: Bloomberg, Reuters, The Wall Street Journal (WSJ), Financial Times (FT), CNBC, Seeking Alpha, MarketWatch, Barron's, e Investopedia.
2. Cada noticia debe enfocarse en un evento de alto impacto (Resultados Financieros, Calificaciones de Analistas de Wall Street, M&A/Adquisiciones, Lanzamientos de Productos/IA, Decisiones Reguladoras, Políticas de la Reserva Federal o Dinámica Macro).
3. Idioma deseado de salida: ${language === "ES" ? "Español" : "Inglés"}.

FORMATO DE SALIDA ESTRICTO:
Debes responder ÚNICAMENTE con un objeto JSON válido (sin explicaciones previas ni texto introductorio) con esta estructura exacta:
{
  "news": [
    {
      "id": "string único",
      "ticker": "Símbolo principal (ej. NVDA, MSFT, CRWV, NBIS, IREN, GOOGL, META, AMZN, GENERAL)",
      "title": "Titular conciso, profesional y periodístico",
      "summary": "Resumen analítico de 2 a 3 oraciones explicando el catalizador, volumen o relevancia para el inversionista",
      "source": "Nombre exacto de la fuente de élite (ej. Bloomberg, Reuters, WSJ, CNBC, Financial Times, Seeking Alpha, MarketWatch, Barron's)",
      "url": "https://www.fuente.com",
      "publishedAt": "Tiempo relativo (ej. Hace 30 minutos, Hace 2 horas, Hoy)",
      "sentiment": "positive | negative | neutral",
      "category": "Earnings | Macro & Fed | M&A / Deals | Analyst Rating | Product & AI | Regulatory | Markets",
      "impactScore": número de 1.0 a 10.0,
      "tickersRelated": ["NVDA", "MSFT"]
    }
  ]
}
Recopila al menos 8 a 10 noticias verdaderamente relevantes de estas fuentes principales.
`;

      const response = await generateGeminiContentWithRetry({
        primaryModel: "gemini-3.7-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.3,
        },
      });

      let rawText = response.text || "";
      // Strip markdown code fences if present
      rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

      const parsed = JSON.parse(rawText);
      if (parsed && Array.isArray(parsed.news) && parsed.news.length > 0) {
        let filtered = parsed.news;
        if (filterTicker && filterTicker !== "ALL") {
          filtered = filtered.filter((n: any) => 
            n.ticker === filterTicker || (Array.isArray(n.tickersRelated) && n.tickersRelated.includes(filterTicker))
          );
        }
        if (filterCategory && filterCategory !== "ALL") {
          filtered = filtered.filter((n: any) => n.category === filterCategory);
        }
        return res.json({ news: filtered.length > 0 ? filtered : parsed.news, liveGrounded: true });
      }
    } catch (err: any) {
      // Quietly engage high-impact fallback news without flooding error logs
    }

    // Apply filtering on fallback data if search API didn't return
    let resultNews = fallbackNews;
    if (filterTicker && filterTicker !== "ALL") {
      resultNews = resultNews.filter((n: any) => 
        n.ticker === filterTicker || (Array.isArray(n.tickersRelated) && n.tickersRelated.includes(filterTicker))
      );
    }
    if (filterCategory && filterCategory !== "ALL") {
      resultNews = resultNews.filter((n: any) => n.category === filterCategory);
    }

    res.json({ news: resultNews.length > 0 ? resultNews : fallbackNews, liveGrounded: false });
  });

  // 4. AI Analyst Advisor with Gemini
  app.post("/api/chat", async (req, res) => {
    const { message, history = [], portfolio = null } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      let portfolioContext = "";
      if (portfolio && Array.isArray(portfolio.positions) && portfolio.positions.length > 0) {
        portfolioContext = `
A continuación se detallan las tenencias actuales de la cartera del usuario:
${portfolio.positions.map((p: any) => {
  if (p.isCash) {
    return `- Efectivo (Cash): Valor de Mercado $${p.mktValue.toFixed(2)} (Peso: ${p.weight.toFixed(1)}%)`;
  }
  return `- ${p.ticker} (${p.name}): ${p.shares} acciones, Costo Promedio $${p.avgCost.toFixed(2)}, Precio Actual $${p.price.toFixed(2)}, Valor de Mercado $${p.mktValue.toFixed(2)} (Peso: ${p.weight.toFixed(1)}%), P/E: ${p.pe || "N/A"}, PEG: ${p.peg || "N/A"}, Rendimiento Diario: ${p.chgPct.toFixed(2)}%, Retorno Total: $${p.returnAmt.toFixed(2)} (${p.returnPct.toFixed(2)}%)`;
}).join("\n")}

Resumen Total de Cartera:
- Valor Total: $${portfolio.totals.mktValue.toFixed(2)}
- Costo de Adquisición Total: $${portfolio.totals.costBasis.toFixed(2)}
- Retorno Total de la Cartera: $${portfolio.totals.totalReturn.toFixed(2)} (${portfolio.totals.totalReturnPercent.toFixed(2)}%)
- P&L Diario de la Cartera: $${portfolio.totals.dailyPnL.toFixed(2)} (${portfolio.totals.dailyPnLPercent.toFixed(2)}%)
`;
      } else {
        portfolioContext = "El usuario no tiene posiciones en su cartera todavía.";
      }

      const systemInstruction = `
Eres un analista financiero experto y asesor de inversiones de inteligencia artificial.
Tu objetivo es responder de forma profesional, analítica, clara y útil a las consultas del usuario sobre su cartera de inversiones y el mercado de valores.

Reglas de conducta:
1. Habla siempre en español.
2. Utiliza un tono analítico, sofisticado pero comprensible (sin tecnicismos innecesarios).
3. Utiliza la información provista en el contexto de la cartera para dar respuestas específicas y calculadas sobre su portafolio real.
4. Si el usuario te pregunta por recomendaciones, proporciona análisis basados en fundamentales (P/E, PEG, ponderaciones de riesgo, diversificación) y recuerda siempre añadir un descargo de responsabilidad amistoso al final informando que el análisis de IA es educativo y no constituye un consejo financiero regulado.
5. Usa formato Markdown para que las respuestas se lean con hermosa estructura, usando viñetas, negritas, y tablas cortas si es apropiado.
`;

      const formattedContents = [
        { role: "user", parts: [{ text: `${portfolioContext}\n\nConsulta del usuario: ${message}` }] }
      ];

      // If history is provided, we can map it to standard format (user/model)
      const chatHistory = history.map((h: any) => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.content }],
      }));

      const response = await generateGeminiContentWithRetry({
        primaryModel: "gemini-3.7-flash",
        contents: [...chatHistory, { role: "user", parts: [{ text: `${portfolioContext}\n\nConsulta del usuario: ${message}` }] }],
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.warn("Gemini API error (engaging chat fallback):", error?.message || error);
      
      // Provide intelligent context-aware reply
      const totalVal = portfolio?.totals?.mktValue ? `$${portfolio.totals.mktValue.toFixed(2)}` : "tu cartera";
      const totalRet = portfolio?.totals?.totalReturnPercent ? `${portfolio.totals.totalReturnPercent.toFixed(2)}%` : "0.0%";
      const topHoldings = portfolio?.positions?.filter((p: any) => !p.isCash).slice(0, 3).map((p: any) => p.ticker).join(", ") || "activos principales";
      
      const fallbackReply = `### 📊 Diagnóstico del Asesor de Inversiones

He analizado tu consulta en relación a tu cartera actual (${totalVal}, con un retorno acumulado del **${totalRet}**):

- **Asignación Principal:** Tus mayores posiciones activas (${topHoldings}) concentran el peso de tu exposición al mercado.
- **Diversificación:** Se recomienda revisar periódicamente los múltiplos de valoración (P/E y PEG) y asegurar un balance adecuado entre crecimiento y estabilidad.
- **Gestión de Liquidez:** Mantener un colchón de efectivo permite aprovechar correcciones de mercado para promediar a la baja en empresas de alta calidad.

*Nota: Este análisis automatizado es estrictamente formativo y educativo.*`;

      return res.json({ text: fallbackReply });
    }
  });

  app.post("/api/financials-analysis", async (req, res) => {
    const { ticker, financials } = req.body;
    if (!ticker || !financials) {
      return res.status(400).json({ error: "Ticker and financials data are required" });
    }
    
    try {
      const systemInstruction = `Eres un analista financiero experto de un hedge fund top (CFA).
Tu objetivo es realizar un análisis ejecutivo de una compañía ordenado estrictamente de "Top-Line a Bottom-Line" (de arriba a abajo en el estado de resultados y flujo de caja).

Debes incluir OBLIGATORIAMENTE 4 tarjetas en este ORDEN ESTRICTO:
1. **Total Revenue / Ventas Totales (Top-Line)**: Análisis del crecimiento o tendencia de la facturación/ventas de la empresa.
2. **Márgenes (Gross, Operating, Net Margins)**: Análisis de la expansión, estabilidad o contracción de los márgenes de beneficio.
3. **Flujo de Caja (Cash Flow)**: Análisis de la generación de Operating Cash Flow y Free Cash Flow (FCF).
4. **Estructura Financiera & Deuda / Salud de Balance**: Análisis de la deuda total, posición de caja y apalancamiento financiero.

Debes devolver tu análisis EXCLUSIVAMENTE en formato JSON válido, sin texto adicional ni bloques markdown de código.
La estructura del JSON debe ser un array de objetos "tarjeta" (cards), donde cada objeto contiene los siguientes campos:
- "title": Título corto y profesional (ej. "Crecimiento de Ventas Totales", "Expansión de Margen Operativo", "Fuerte Generación de FCF", "Solvencia y Posición de Caja").
- "metric": Métrica clave analizada (ej. "Total Revenue", "Margen Operativo", "Free Cash Flow", "Deuda / Caja").
- "trend": Solo puede ser "positive", "negative", o "neutral".
- "explanation": Explicación ejecutiva, muy concreta y directa de 1 a 2 oraciones con cifras clave o dinamismos relevantes.
- "iconType": "revenue", "margin", "cashflow", o "debt".`;

      const promptContext = `Por favor, analiza la siguiente compañía: ${ticker}.
Aquí tienes los datos financieros resumidos (en JSON):
${JSON.stringify(financials).substring(0, 5000)}

Asegúrate de incluir las 4 tarjetas en el ORDEN ESTRICTO Top-Line to Bottom-Line:
1. Total Revenue
2. Márgenes
3. Flujo de Caja
4. Deuda / Estructura Financiera

Devuelve SOLO un array JSON válido con la estructura solicitada.`;

      const response = await generateGeminiContentWithRetry({
        primaryModel: "gemini-3.7-flash",
        contents: [{ role: "user", parts: [{ text: promptContext }] }],
        config: {
          systemInstruction,
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.warn("Gemini API financials analysis error (engaging deterministic fundamental engine):", error?.message || error);

      // Algorithmic Fallback: Calculate Top-Line to Bottom-Line metrics directly from the financials data
      try {
        const annualData = Array.isArray(financials.annual) ? financials.annual : [];
        const latest = annualData[0] || {};
        const prior = annualData[1] || {};

        const revLatest = Number(latest.revenue || 0);
        const revPrior = Number(prior.revenue || 0);
        const revGrowth = revPrior > 0 ? ((revLatest - revPrior) / revPrior) * 100 : 0;

        const opIncLatest = Number(latest.operatingIncome || 0);
        const netIncLatest = Number(latest.netIncome || 0);
        const opMargin = revLatest > 0 ? (opIncLatest / revLatest) * 100 : 0;
        const netMargin = revLatest > 0 ? (netIncLatest / revLatest) * 100 : 0;

        const fcfLatest = Number(latest.fcf || 0);
        const cashLatest = Number(latest.cash || 0);
        const debtLatest = Number(latest.debt || 0);

        const formatB = (val: number) => {
          const abs = Math.abs(val);
          if (abs >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
          if (abs >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
          return `$${val.toLocaleString()}`;
        };

        const cards = [
          {
            title: revGrowth >= 0 ? "Expansión Sólida de Ingresos" : "Contracción Moderada de Ventas",
            metric: "Total Revenue (Top-Line)",
            trend: revGrowth > 5 ? "positive" : revGrowth >= 0 ? "neutral" : "negative",
            explanation: `Ingresos anuales de ${formatB(revLatest)} reflejando una variación del ${revGrowth >= 0 ? "+" : ""}${revGrowth.toFixed(1)}% interanual.`,
            iconType: "revenue"
          },
          {
            title: opMargin >= 15 ? "Márgenes de Alta Calidad Operativa" : "Márgenes Operativos Bajo Control",
            metric: "Margen Operativo & Neto",
            trend: opMargin >= 15 ? "positive" : opMargin >= 5 ? "neutral" : "negative",
            explanation: `Margen operativo del ${opMargin.toFixed(1)}% y margen neto del ${netMargin.toFixed(1)}%, demostrando disciplina de costos.`,
            iconType: "margin"
          },
          {
            title: fcfLatest > 0 ? "Generación Positiva de Free Cash Flow" : "Presión en Flujo de Caja Libre",
            metric: "Free Cash Flow (FCF)",
            trend: fcfLatest > 0 ? "positive" : "negative",
            explanation: `Flujo de caja libre anual de ${formatB(fcfLatest)}, asegurando capacidad para reinversión y retorno al accionista.`,
            iconType: "cashflow"
          },
          {
            title: cashLatest >= debtLatest ? "Balance Sólido (Caja Neta Positiva)" : "Apalancamiento Moderado",
            metric: "Estructura de Capital & Deuda",
            trend: cashLatest >= debtLatest ? "positive" : debtLatest < cashLatest * 2 ? "neutral" : "negative",
            explanation: `Posición de liquidez con ${formatB(cashLatest)} en efectivo frente a ${formatB(debtLatest)} de deuda total.`,
            iconType: "debt"
          }
        ];

        return res.json({ text: JSON.stringify(cards) });
      } catch (fallbackErr: any) {
        return res.json({
          text: JSON.stringify([
            {
              title: "Análisis Top-Line de Ingresos",
              metric: "Total Revenue",
              trend: "positive",
              explanation: "Facturación sostenida alineada con las expectativas del sector de referencia.",
              iconType: "revenue"
            },
            {
              title: "Estructura de Márgenes",
              metric: "Márgenes Operativos",
              trend: "positive",
              explanation: "Rendimiento y eficiencia operativa estables en el ciclo actual.",
              iconType: "margin"
            },
            {
              title: "Flujo de Caja Libre",
              metric: "Free Cash Flow",
              trend: "positive",
              explanation: "Generación de efectivo suficiente para el mantenimiento de operaciones.",
              iconType: "cashflow"
            },
            {
              title: "Solvencia y Posición de Balance",
              metric: "Caja y Deuda",
              trend: "neutral",
              explanation: "Estructura patrimonial equilibrada con monitoreo de liquidez adecuado.",
              iconType: "debt"
            }
          ])
        });
      }
    }
  });

  // 4b. Hedge Fund Institutional Research Memo Endpoint with Gemini
  app.post("/api/hedgefund-analysis", async (req, res) => {
    const { portfolio = null } = req.body;

    if (!portfolio || !Array.isArray(portfolio.positions) || portfolio.positions.length === 0) {
      return res.status(400).json({ error: "Portfolio data is required and must contain active positions" });
    }

    try {
      const positionsText = portfolio.positions.map((p: any) => {
        if (p.isCash) {
          return `- Efectivo (Cash Buffer): Valor de Mercado $${p.mktValue.toFixed(2)} (Peso: ${p.weight.toFixed(1)}%)`;
        }
        return `- ${p.ticker} (${p.name}): ${p.shares} acciones, Costo Promedio $${p.avgCost.toFixed(2)}, Precio Actual $${p.price.toFixed(2)}, Valor de Mercado $${p.mktValue.toFixed(2)} (Peso: ${p.weight.toFixed(1)}%), P/E: ${p.pe || "N/A"}, PEG: ${p.peg || "N/A"}, Variación Diaria: ${p.chgPct.toFixed(2)}%, Retorno Total: $${p.returnAmt.toFixed(2)} (${p.returnPct.toFixed(2)}%)`;
      }).join("\n");

      const totalsText = `
Resumen Consolidado:
- Valor de Mercado Total (AUM): $${portfolio.totals.mktValue.toFixed(2)}
- Costo de Inversión Total: $${portfolio.totals.costBasis.toFixed(2)}
- Retorno Absoluto del Portafolio: $${portfolio.totals.totalReturn.toFixed(2)} (${portfolio.totals.totalReturnPercent.toFixed(2)}%)
- P&L Diario Consolidado: $${portfolio.totals.dailyPnL.toFixed(2)} (${portfolio.totals.dailyPnLPercent.toFixed(2)}%)
`;

      const systemInstruction = `
Eres un Managing Director y Chief Investment Officer (CIO) de un Hedge Fund global de élite (estilo Citadel, Point72 o Millennium).
Tu misión es redactar un memorándum de investigación institucional privado, extremadamente riguroso, crítico y de calidad "state-of-the-art" para el Comité de Inversiones sobre la cartera activa que te presenta el usuario.

REGLAS DE CONDUCTA Y ESTILO:
1. Habla siempre en un español impecable, sofisticado, elegante, y de alto nivel técnico bursátil.
2. Evita consejos condescendientes, advertencias genéricas de principiantes, o frases hechas del tipo "invierte con cuidado". Queremos un análisis clínico y cuantitativo de nivel institucional.
3. Sé incisivo. Si la cartera está sobreexpuesta a megacaps tecnológicas, diagnostica la "burbuja de correlación" o la dependencia extrema del factor "crecimiento/momentum".
4. Usa terminología cuantitativa real de hedge funds: 'Alfa', 'Beta implícito', 'Volatilidad de cola (Tail Risk)', 'Drawdown máximo potencial', 'Exposición factorial de estilo', 'Prima de riesgo de renta variable', 'Asimetría positiva/negativa de retornos', 'Ratio Sharpe/Sortino', etc.
5. Formatea la respuesta strictly con Markdown utilizando encabezados claros (##), tablas y viñetas para crear un documento extremadamente legible y visualmente impresionante.

ESTRUCTURA OBLIGATORIA DEL MEMORÁNDUM:

# MEMORÁNDUM DE INVESTIGACIÓN DE PORTAFOLIO (PRIVADO - COMITÉ DE INVERSIÓN)
*Para: Comité de Inversiones de Aethelgard Alpha Management*
*De: CIO & Senior Portfolio Manager*
*Fecha: Con fecha de hoy*
*Asunto: Diagnóstico Crítico de Posicionamiento de Activos y Estrategias de Arbitraje de Riesgo*

## 1. RESUMEN EJECUTIVO Y TESIS DE CONVICCIÓN
[Analiza la arquitectura general del portafolio. ¿Es un fondo agresivo, un index tracker encubierto, o una apuesta altamente concentrada? Relaciona el posicionamiento con la coyuntura macroeconómica actual (ciclos de tasas de interés de la Reserva Federal, inflación latente, y el ciclo de capital en semiconductores e inteligencia artificial).]

## 2. EXPOSICIÓN FACTORIAL Y ANÁLISIS DE CORRELACIÓN CRUZADA
[Evalúa en qué factores de riesgo está invertida realmente esta cartera (Growth, Momentum, Quality, Value, Low Volatility). Explica por qué la correlación cruzada entre las posiciones puede provocar que el portafolio se comporte como un solo activo de alta beta durante eventos de desapalancamiento.]

## 3. ATRIBUCIÓN DE ACTIVO POR ACTIVO (ALPHA VS. BETA)
[Proporciona un desglose quirúrgico de los activos más representativos del portafolio del usuario. Evalúa si las métricas de valoración como P/E y PEG justifican la asignación de capital o si están sobrevaloradas. Separa de forma analítica el Alfa real del activo del Beta que le proporciona el mercado.]

## 4. ESTRATEGIA DE COBERTURA (HEDGING) Y TRADING DE COLA
[Especifica recomendaciones operativas exactas para mitigar drawdowns graves. Por ejemplo: opciones PUT sobre el índice Nasdaq-100 (QQQ) con delta de 0.20, contratos de futuros cortos para inmunizar el beta de las megacaps, o ratios óptimos de efectivo líquido en este régimen de volatilidad.]

## 5. EL ESLABÓN PERDIDO (WHAT'S MISSING)
[Diagnostica críticamente qué clases de activos, sectores o geografías están COMPLETAMENTE AUSENTES en este portafolio pero que un portfolio manager senior de hedge fund añadiría de inmediato para optimizar la frontera eficiente (ej. oro físico, bonos soberanos de corta duración para capturar rendimientos libres de riesgo, energía tradicional para cobertura de commodities, o exposición geográfica en mercados asiáticos/emergentes).]

## 6. VEREDICTO FINAL Y ACCIONES RECOMENDADAS
[Termina con una tabla resumida de decisiones del Comité (COMPRAR / MANTENER / RECORTAR / REDUCIR) para las posiciones clave y una conclusión final de rebalanceo cuantitativo.]
`;

      const response = await generateGeminiContentWithRetry({
        primaryModel: "gemini-3.7-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Carga las siguientes posiciones actuales de la cartera del usuario para realizar el memorándum técnico institucional:\n\n${positionsText}\n\n${totalsText}\n\nPor favor, produce el memorándum en español de nivel Senior CIO.`
              }
            ]
          }
        ],
        config: {
          systemInstruction,
          temperature: 0.8,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.warn("Hedge Fund Analysis Fallback:", error?.message || error);
      
      const topPositions = portfolio.positions.filter((p: any) => !p.isCash);
      const totalAUM = portfolio.totals.mktValue.toFixed(2);
      const returnPct = portfolio.totals.totalReturnPercent.toFixed(2);

      return res.json({
        text: `# MEMORÁNDUM DE INVESTIGACIÓN INSTITUCIONAL (COMITÉ DE INVERSIÓN)
*Para: Comité de Inversiones*
*De: Chief Investment Officer (CIO) & Senior Portfolio Manager*
*Asunto: Diagnóstico Cuantitativo de Posicionamiento y Gestión Factorial de Riesgo*

---

## 1. RESUMEN EJECUTIVO Y ARQUITECTURA DE CARTERA
El portafolio administrado cuenta con un valor consolidado de **$${totalAUM}** y una rentabilidad acumulada del **${returnPct}%**. La distribución de capital refleja una estrategia predominantemente inclinada hacia factores de **Crecimiento (Growth)** y **Calidad (Quality)**.

## 2. DESGLOSE FACTORIAL Y CONCENTRACIÓN
- **Concentración de Capital:** Las principales posiciones (${topPositions.slice(0, 3).map((p: any) => p.ticker).join(", ")}) representan el núcleo motor del alfa de la cartera.
- **Correlación de Mercado:** La cartera exhibe una sensibilidad correlacionada a las condiciones de liquidez global y expectativas de tasas de interés.

## 3. ATRIBUCIÓN Y EVALUACIÓN POR ACTIVO
| Ticker | Peso Cartera | Retorno (%) | Valoración | Veredicto Comité |
| :--- | :--- | :--- | :--- | :--- |
${topPositions.map((p: any) => `| **${p.ticker}** | ${p.weight.toFixed(1)}% | ${p.returnPct >= 0 ? "+" : ""}${p.returnPct.toFixed(1)}% | ${p.pe ? `${p.pe}x P/E` : "Moderada"} | **MANTENER / HOLD** |`).join("\n")}

## 4. GESTIÓN DE RIESGO Y COBERTURA (HEDGING)
- **Amortiguador de Liquidez:** Mantener un ratio de efectivo táctico mínimo entre el 5% y el 12% para absorber volatilidad de corto plazo.
- **Control de Drawdown:** Vigilar zonas de soporte clave en los índices directores (S&P 500 y NASDAQ-100).

## 5. VEREDICTO FINAL DEL COMITÉ
Recomendamos mantener el sesgo de alta calidad, ejecutando rebalanceos sistemáticos cuando las ponderaciones individuales superen los umbrales de tolerancia de riesgo.`
      });
    }
  });

  // 4c. S&P 500 Sector Scanner AI Analysis Endpoint
  app.post("/api/watchlist/scan-sector", async (req, res) => {
    const { sector, sectorEs, scoreType, minScore, matchedTickers = [], totalScanned = 20, language = "ES" } = req.body;

    if (!sector) {
      return res.status(400).json({ error: "Sector parameter is required" });
    }

    const isSpanish = language === "ES";
    const scoreTypeLabel = scoreType === "growth" 
      ? (isSpanish ? "Score Growth" : "Growth Score")
      : scoreType === "quality" 
        ? (isSpanish ? "Score Quality" : "Quality Score")
        : scoreType === "stability"
          ? (isSpanish ? "Score Stability" : "Stability Score")
          : scoreType === "valuation"
            ? (isSpanish ? "Score Valuation" : "Valuation Score")
            : (isSpanish ? "Score General" : "Overall Score");

    try {
      const tickersFormatted = matchedTickers.map((t: any, idx: number) => {
        return `${idx + 1}. **${t.symbol}** (${t.name}): Score General = ${t.scoreGeneral ?? "N/A"}, Score Growth = ${t.scoreGrowth ?? "N/A"}, Score Quality = ${t.scoreQuality ?? "N/A"}, Score Stability = ${t.scoreStability ?? "N/A"}, Score Valuation = ${t.scoreValuation ?? "N/A"}${t.price ? `, Precio: $${t.price}` : ""}${t.changePct !== undefined ? `, Var: ${t.changePct > 0 ? "+" : ""}${t.changePct}%` : ""}${t.pe ? `, P/E: ${t.pe}` : ""}`;
      }).join("\n");

      const systemInstruction = isSpanish
        ? `Eres un Analista Financiero Senior e Investigador de Estrategia de Renta Variable enfocado en el S&P 500.
Tu objetivo es analizar los resultados de un escáner sectorial cuantitativo que ha evaluado las TOP 20 empresas del sector "${sectorEs || sector}" del S&P 500 buscando aquellas que superan un umbral de ${scoreTypeLabel} >= ${minScore}.

REGLAS DE PRESENTACIÓN Y ESTILO:
1. Responde en español financiero profesional, directo y conciso.
2. Utiliza formato Markdown con títulos (##), listas con viñetas y resaltados en negrita.
3. Analiza las compañías escaneadas que cumplen el criterio y explica por qué sus métricas factoriales (Growth, Quality, etc.) destacan en el contexto sectorial actual.
4. Si no hubo ninguna empresa que superó el umbral o si hay pocas, analiza brevemente la razón (ej. requisitos de valoración exigentes o ciclos sectoriales) y menciona las más cercanas.

ESTRUCTURA SUGERIDA:
## 🔍 Resumen del Escaneo Sectorial: ${sectorEs || sector}
[Análisis de la salud cuantitativa del sector y cuántas de las top 20 superaron el filtro de ${scoreTypeLabel} >= ${minScore}]

## 🌟 Tickers Destacados y Fundamentos Clave
[Para las mejores 2-3 empresas calificadas, explica sus ventajas competitivas, aceleradores de ingresos o calidad de márgenes que justifican su puntuación]

## ⚠️ Factores de Riesgo y Sensibilidad Macro
[Vientos en contra del sector a monitorear: tasas de interés, presiones de costos o valuación]

## 💡 Veredicto para Watchlist
[Recomendaciones puntuales sobre cuáles agregar inmediatamente a la Watchlist y bajo qué condiciones de precio o soporte]`
        : `You are a Senior Equity Research Analyst specializing in the S&P 500 index.
Your goal is to analyze the results of a quantitative sector scanner that evaluated the TOP 20 companies in the "${sector}" sector searching for those matching ${scoreTypeLabel} >= ${minScore}.

STYLE & FORMATTING:
1. Provide a professional, concise, and structured financial analysis in English.
2. Use Markdown headings (##), bullet points, and bold emphasis.
3. Evaluate the scanned candidates, highlighting their factor drivers (Growth, Quality, etc.) in the current sector context.

STRUCTURE:
## 🔍 Sector Scan Summary: ${sector}
## 🌟 Top Matching Candidates & Thesis
## ⚠️ Key Sector Risks & Macro Catalysts
## 💡 Watchlist Recommendation`;

      const userPrompt = isSpanish
        ? `Resultados del Escaneo Sectorial del S&P 500:
- Sector: ${sectorEs || sector}
- Criterio de Selección: ${scoreTypeLabel} >= ${minScore}
- Total Empresas Escaneadas del Sector: ${totalScanned}
- Empresas que superan el umbral: ${matchedTickers.length}

Empresas Calificadas:
${tickersFormatted.length > 0 ? tickersFormatted : "(Ninguna empresa del sector superó el umbral especificado de " + minScore + ")"}

Por favor, genera un análisis ejecutivo profesional del sector y sus mejores candidatos.`
        : `S&P 500 Sector Scan Results:
- Sector: ${sector}
- Filter Criterion: ${scoreTypeLabel} >= ${minScore}
- Total Companies Scanned: ${totalScanned}
- Companies Matching Threshold: ${matchedTickers.length}

Matching Companies:
${tickersFormatted.length > 0 ? tickersFormatted : "(No companies in this sector exceeded the threshold of " + minScore + ")"}

Please provide a professional executive summary and sector analysis.`;

      const response = await generateGeminiContentWithRetry({
        primaryModel: "gemini-3.7-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }]
          }
        ],
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.warn("Sector Scanner Analysis Fallback:", error?.message || error);
      
      const sectorName = sectorEs || sector;
      const count = matchedTickers.length;

      const fallbackText = isSpanish
        ? `## 🔍 Resumen del Escaneo Sectorial: ${sectorName}
Se evaluaron **${totalScanned} empresas** líderes del sector, identificando **${count} candidata(s)** que cumplen con el criterio cuantitativo **${scoreTypeLabel} ≥ ${minScore}**.

## 🌟 Tickers Destacados y Fundamentos Clave
${matchedTickers.length > 0 
  ? matchedTickers.slice(0, 4).map((t: any) => `- **${t.symbol}** (${t.name}): Destaca con una puntuación destacada en su perfil factorial y sólidos fundamentos operativos.`).join("\n")
  : "- Ninguna compañía superó el filtro exigente en este ciclo, lo que denota una valoración exigente o márgenes comprimidos en el sector."}

## ⚠️ Factores de Riesgo y Sensibilidad Macro
- **Entorno de Tipos de Interés:** Sensibilidad a la curva de rendimientos y coste de capital.
- **Competencia y Márgenes:** Monitorear la capacidad de fijación de precios frente a la inflación de costes.

## 💡 Veredicto para Watchlist
${matchedTickers.length > 0 
  ? `Se aconseja añadir a seguimiento las principales calificadas (${matchedTickers.slice(0, 2).map((t: any) => t.symbol).join(", ")}) vigilando retrocesos técnicos hacia zonas de soporte para optimizar el ratio riesgo/recompensa.`
  : "Monitorear posibles correcciones que sitúen los múltiplos en niveles más atractivos para su inclusión."}`
        : `## 🔍 Sector Scan Summary: ${sector}
Evaluated **${totalScanned} top companies** in the sector, finding **${count} matching candidate(s)** satisfying **${scoreTypeLabel} ≥ ${minScore}**.

## 🌟 Top Matching Candidates
${matchedTickers.length > 0 
  ? matchedTickers.slice(0, 4).map((t: any) => `- **${t.symbol}** (${t.name}): Strong factor ranking with robust operational fundamentals.`).join("\n")
  : "- No companies surpassed the current screening threshold."}

## 💡 Watchlist Recommendation
Focus on top screened names during technical pullbacks to optimize entry risk/reward.`;

      res.json({ text: fallbackText });
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

  // --- AI Image Extraction Endpoint ---
  app.post("/api/portfolio/extract-from-image", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing imageBase64" });
      }

      // Check if imageBase64 starts with data:image/...;base64,
      let inlineData = imageBase64;
      let mimeType = "image/png";
      if (imageBase64.startsWith("data:")) {
        const parts = imageBase64.split(";base64,");
        mimeType = parts[0].replace("data:", "");
        inlineData = parts[1];
      }

      const systemInstruction = "You are an AI specialized in reading financial portfolio screenshots. Given an image, extract the stock tickers and the quantity of shares. Return the data STRICTLY as a JSON array of objects with 'ticker' (string) and 'shares' (number). DO NOT include markdown formatting or any other text. Example: [{\"ticker\": \"AAPL\", \"shares\": 10}, {\"ticker\": \"MSFT\", \"shares\": 5.5}]";

      const promptText = "Extract the portfolio positions from this screenshot.";

      const response = await generateGeminiContentWithRetry({
        primaryModel: "gemini-3.7-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              {
                inlineData: {
                  data: inlineData,
                  mimeType: mimeType
                }
              }
            ]
          }
        ],
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });

      const jsonString = response.text || "[]";
      let parsed = [];
      try {
        parsed = JSON.parse(jsonString);
      } catch (e) {
        // cleanup possible markdown backticks if responseMimeType didn't stick
        const cleaned = jsonString.replace(/```json\n/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      }
      
      res.json(parsed);
    } catch (err: any) {
      console.error("Error extracting from image:", err);
      res.status(500).json({ error: err.message || "Failed to process image" });
    }
  });
}
