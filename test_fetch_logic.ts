import YahooFinanceClass from "yahoo-finance2";
let yahooFinance: any;
try {
  yahooFinance = new (YahooFinanceClass as any)();
} catch(e) {
  yahooFinance = YahooFinanceClass;
}

async function fetchQuote(ticker: string) {
  const yahooTicker = ticker.replace('.', '-');
  try {
    const q: any = await yahooFinance.quote(yahooTicker, {}, { validateResult: false });
    const summary: any = await yahooFinance.quoteSummary(yahooTicker, {
      modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "price"]
    }, { validateResult: false });
    
    let fiftyDayAverage: number | null = null;
    let twoHundredDayAverage: number | null = null;
    let fiftyTwoWeekHigh: number | null = null;
    
    if (summary.summaryDetail) {
      const sd = summary.summaryDetail;
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
      if (sd.fiftyTwoWeekHigh && typeof sd.fiftyTwoWeekHigh === "object" && sd.fiftyTwoWeekHigh.raw !== undefined) {
        fiftyTwoWeekHigh = sd.fiftyTwoWeekHigh.raw;
      } else if (typeof sd.fiftyTwoWeekHigh === "number") {
        fiftyTwoWeekHigh = sd.fiftyTwoWeekHigh;
      }
    }
    
    return {
      ticker,
      fiftyDayAverage: fiftyDayAverage !== null ? fiftyDayAverage : (q.fiftyDayAverage || null),
      twoHundredDayAverage: twoHundredDayAverage !== null ? twoHundredDayAverage : (q.twoHundredDayAverage || null),
      fiftyTwoWeekHigh: fiftyTwoWeekHigh !== null ? fiftyTwoWeekHigh : (q.fiftyTwoWeekHigh || null),
    };
  } catch (err: any) {
    console.error("Error:", err);
    return null;
  }
}

fetchQuote("MSFT").then(console.log);
