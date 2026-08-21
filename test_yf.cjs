const yahooFinance = require('yahoo-finance2').default;
async function run() {
  const q = await yahooFinance.quote("MSFT", {}, { validateResult: false });
  console.log("quote fiftyDayAverage:", q.fiftyDayAverage);
  console.log("quote fiftyTwoWeekHigh:", q.fiftyTwoWeekHigh);
  console.log("quote twoHundredDayAverage:", q.twoHundredDayAverage);
  
  const summary = await yahooFinance.quoteSummary("MSFT", { modules: ["summaryDetail"] }, { validateResult: false });
  console.log("summaryDetail fiftyDayAverage:", summary.summaryDetail.fiftyDayAverage);
  console.log("summaryDetail twoHundredDayAverage:", summary.summaryDetail.twoHundredDayAverage);
}
run();
