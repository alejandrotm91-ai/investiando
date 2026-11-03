// Universo inicial de la capa SEC: las 100 mayores empresas del S&P 500 por capitalización.
// Lista aproximada (noviembre de 2026): capitalización de Yahoo sobre los grandes valores de EE. UU.
// del índice; la composición exacta del S&P 500 cambia y no se publica en EDGAR. Los tickers que no
// están aquí (carteras y watchlists de usuarios) se cargan bajo demanda la primera vez que se piden.
//
// prev: CIK anteriores de la misma empresa. ExxonMobil pasó a una sociedad holding nueva en 2026 y
// su historial de 10-K/10-Q sigue en el CIK antiguo de Exxon Mobil Corp. Igual BlackRock (holding
// nueva en 2024; antes "BlackRock Inc.", hoy BlackRock Finance).

export interface UniverseEntry {
  ticker: string;
  cik: number;
  prev?: number[];
}

export const SEC_UNIVERSE_AS_OF = "2026-11-03";

export const SEC_UNIVERSE: UniverseEntry[] = [
  { ticker: "NVDA", cik: 1045810 }, // NVIDIA Corporation
  { ticker: "AAPL", cik: 320193 }, // Apple Inc.
  { ticker: "MSFT", cik: 789019 }, // Microsoft Corporation
  { ticker: "GOOGL", cik: 1652044 }, // Alphabet Inc.
  { ticker: "AMZN", cik: 1018724 }, // Amazon.com, Inc.
  { ticker: "AVGO", cik: 1730168 }, // Broadcom Inc.
  { ticker: "TSLA", cik: 1318605 }, // Tesla, Inc.
  { ticker: "META", cik: 1326801 }, // Meta Platforms, Inc.
  { ticker: "LLY", cik: 59478 }, // Eli Lilly and Company
  { ticker: "BRK-B", cik: 1067983 }, // Berkshire Hathaway Inc.
  { ticker: "WMT", cik: 104169 }, // Walmart Inc.
  { ticker: "MU", cik: 723125 }, // Micron Technology, Inc.
  { ticker: "JPM", cik: 19617 }, // JPMorgan Chase & Co.
  { ticker: "AMD", cik: 2488 }, // Advanced Micro Devices, Inc.
  { ticker: "V", cik: 1403161 }, // Visa Inc.
  { ticker: "XOM", cik: 2115436, prev: [34088] }, // ExxonMobil Holdings Corporation
  { ticker: "JNJ", cik: 200406 }, // Johnson & Johnson
  { ticker: "MA", cik: 1141391 }, // Mastercard Incorporated
  { ticker: "ABBV", cik: 1551152 }, // AbbVie Inc.
  { ticker: "COST", cik: 909832 }, // Costco Wholesale Corporation
  { ticker: "CVX", cik: 93410 }, // Chevron Corporation
  { ticker: "PLTR", cik: 1321655 }, // Palantir Technologies Inc.
  { ticker: "KO", cik: 21344 }, // The Coca-Cola Company
  { ticker: "CSCO", cik: 858877 }, // Cisco Systems, Inc.
  { ticker: "ORCL", cik: 1341439 }, // Oracle Corporation
  { ticker: "PG", cik: 80424 }, // The Procter & Gamble Company
  { ticker: "MRK", cik: 310158 }, // Merck & Co., Inc.
  { ticker: "UNH", cik: 731766 }, // UnitedHealth Group Incorporated
  { ticker: "BAC", cik: 70858 }, // Bank of America Corporation
  { ticker: "GE", cik: 40545 }, // GE Aerospace
  { ticker: "HD", cik: 354950 }, // The Home Depot, Inc.
  { ticker: "INTC", cik: 50863 }, // Intel Corporation
  { ticker: "PM", cik: 1413329 }, // Philip Morris International Inc.
  { ticker: "AMAT", cik: 6951 }, // Applied Materials, Inc.
  { ticker: "PANW", cik: 1327567 }, // Palo Alto Networks, Inc.
  { ticker: "LRCX", cik: 707549 }, // Lam Research Corporation
  { ticker: "MS", cik: 895421 }, // Morgan Stanley
  { ticker: "TXN", cik: 97476 }, // Texas Instruments Incorporated
  { ticker: "CAT", cik: 18230 }, // Caterpillar Inc.
  { ticker: "RTX", cik: 101829 }, // RTX Corporation
  { ticker: "GS", cik: 886982 }, // The Goldman Sachs Group, Inc.
  { ticker: "DELL", cik: 1571996 }, // Dell Technologies Inc.
  { ticker: "NFLX", cik: 1065280 }, // Netflix, Inc.
  { ticker: "TMO", cik: 97745 }, // Thermo Fisher Scientific Inc.
  { ticker: "WFC", cik: 72971 }, // Wells Fargo & Company
  { ticker: "CRWD", cik: 1535527 }, // CrowdStrike Holdings, Inc.
  { ticker: "AMGN", cik: 318154 }, // Amgen Inc.
  { ticker: "GEV", cik: 1996810 }, // GE Vernova Inc.
  { ticker: "LIN", cik: 1707925 }, // Linde plc
  { ticker: "IBM", cik: 51143 }, // International Business Machines Corporation
  { ticker: "AXP", cik: 4962 }, // American Express Company
  { ticker: "ANET", cik: 1596532 }, // Arista Networks, Inc.
  { ticker: "GILD", cik: 882095 }, // Gilead Sciences, Inc.
  { ticker: "ADI", cik: 6281 }, // Analog Devices, Inc.
  { ticker: "APH", cik: 820313 }, // Amphenol Corporation
  { ticker: "KLAC", cik: 319201 }, // KLA Corporation
  { ticker: "C", cik: 831001 }, // Citigroup Inc.
  { ticker: "DIS", cik: 1744489 }, // The Walt Disney Company
  { ticker: "ABT", cik: 1800 }, // Abbott Laboratories
  { ticker: "BLK", cik: 2012383, prev: [1364742] }, // BlackRock, Inc.
  { ticker: "PEP", cik: 77476 }, // PepsiCo, Inc.
  { ticker: "VZ", cik: 732712 }, // Verizon Communications Inc.
  { ticker: "MCD", cik: 63908 }, // McDonald's Corporation
  { ticker: "CRM", cik: 1108524 }, // Salesforce, Inc.
  { ticker: "UNP", cik: 100885 }, // Union Pacific Corporation
  { ticker: "DE", cik: 315189 }, // Deere & Company
  { ticker: "NEE", cik: 753308 }, // NextEra Energy, Inc.
  { ticker: "WELL", cik: 766704 }, // Welltower Inc.
  { ticker: "COP", cik: 1163165 }, // ConocoPhillips
  { ticker: "QCOM", cik: 804328 }, // QUALCOMM Incorporated
  { ticker: "PFE", cik: 78003 }, // Pfizer Inc.
  { ticker: "TMUS", cik: 1283699 }, // T-Mobile US, Inc.
  { ticker: "DHR", cik: 313616 }, // Danaher Corporation
  { ticker: "ISRG", cik: 1035267 }, // Intuitive Surgical, Inc.
  { ticker: "ACN", cik: 1467373 }, // Accenture plc
  { ticker: "SCHW", cik: 316709 }, // The Charles Schwab Corporation
  { ticker: "ETN", cik: 1551182 }, // Eaton Corporation plc
  { ticker: "TJX", cik: 109198 }, // The TJX Companies, Inc.
  { ticker: "LMT", cik: 936468 }, // Lockheed Martin Corporation
  { ticker: "T", cik: 732717 }, // AT&T Inc.
  { ticker: "BX", cik: 1393818 }, // Blackstone Inc.
  { ticker: "CB", cik: 896159 }, // Chubb Limited
  { ticker: "BA", cik: 12927 }, // The Boeing Company
  { ticker: "UBER", cik: 1543151 }, // Uber Technologies, Inc.
  { ticker: "SPGI", cik: 64040 }, // S&P Global Inc.
  { ticker: "PGR", cik: 80661 }, // The Progressive Corporation
  { ticker: "IBKR", cik: 1381197 }, // Interactive Brokers Group, Inc.
  { ticker: "WDC", cik: 106040 }, // Western Digital Corporation
  { ticker: "COF", cik: 927628 }, // Capital One Financial Corporation
  { ticker: "BMY", cik: 14272 }, // Bristol-Myers Squibb Company
  { ticker: "MO", cik: 764180 }, // Altria Group, Inc.
  { ticker: "MDT", cik: 1613103 }, // Medtronic plc
  { ticker: "PLD", cik: 1045609 }, // Prologis, Inc.
  { ticker: "LOW", cik: 60667 }, // Lowe's Companies, Inc.
  { ticker: "PH", cik: 76334 }, // Parker-Hannifin Corporation
  { ticker: "SBUX", cik: 829224 }, // Starbucks Corporation
  { ticker: "SYK", cik: 310764 }, // Stryker Corporation
  { ticker: "MPC", cik: 1510295 }, // Marathon Petroleum Corporation
  { ticker: "ADP", cik: 8670 }, // Automatic Data Processing, Inc.
  { ticker: "BKNG", cik: 1075531 }, // Booking Holdings Inc.
];
