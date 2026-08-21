import YahooFinanceClass from "yahoo-finance2";
let yahooFinance;
try {
  yahooFinance = new (YahooFinanceClass as any)();
} catch(e) {
  yahooFinance = YahooFinanceClass;
}
async function run() {
  const q = await yahooFinance.quote("MSFT", {}, { validateResult: false });
  console.log("quote fiftyDayAverage:", (q as any).fiftyDayAverage);
  console.log("quote fiftyTwoWeekHigh:", (q as any).fiftyTwoWeekHigh);
  console.log("quote twoHundredDayAverage:", (q as any).twoHundredDayAverage);
  
  const summary = await yahooFinance.quoteSummary("MSFT", { modules: ["summaryDetail"] }, { validateResult: false });
  console.log("summaryDetail fiftyDayAverage:", (summary as any).summaryDetail.fiftyDayAverage);
  console.log("summaryDetail twoHundredDayAverage:", (summary as any).summaryDetail.twoHundredDayAverage);
}
run();
