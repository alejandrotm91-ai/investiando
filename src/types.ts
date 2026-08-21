export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  isCash?: boolean;
  isMargin?: boolean;
}

export interface Position {
  ticker: string;
  name: string;
  price: number;
  shares: number;
  avgCost: number;
  mktValue: number;
  weight: number;
  pe: number | null;
  fwdPe: number | null;
  peg: number | null;
  dividendRate?: number | null;
  evEbitda?: number | null;
  dailyPnL: number;
  chgPct: number;
  returnAmt: number;
  returnPct: number;
  isCash: boolean;
  isMargin?: boolean;
  fiftyTwoWeekHigh?: number | null;
  targetMeanPrice?: number | null;
  targetHighPrice?: number | null;
  isAfterHoursPrice?: boolean;
  marketState?: string | null;
  postMarketPrice?: number | null;
  preMarketPrice?: number | null;
  piotroskiScore?: number | null;
  fiftyDayAverage?: number | null;
  twoHundredDayAverage?: number | null;
}

export interface PortfolioTotals {
  mktValue: number;
  costBasis: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  marginCostBasis?: number;
  marginMktValue?: number;
  marginAnnualCost?: number;
  marginMonthlyCost?: number;
}

export interface PortfolioData {
  positions: Position[];
  totals: PortfolioTotals;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface ChartDataPoint {
  date: string;
  close?: number;
  selection?: number;
  voo?: number;
  qqq?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: string;
}

export interface UserPortfolio {
  id: string;
  name: string;
  holdings: Holding[];
  createdAt?: string;
  updatedAt?: string;
}

export type TabType = "summary" | "holdings" | "analyst" | "score" | "whatif" | "askai" | "hedgefund" | "analysis";

export type SidebarTabType = "market" | "portfolios" | "stocks" | "watchlist" | "earnings" | "support" | "account" | "logout";

