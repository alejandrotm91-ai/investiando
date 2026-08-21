import YahooFinanceClass from "yahoo-finance2";
let yahooFinance: any;
try {
  yahooFinance = new (YahooFinanceClass as any)();
} catch(e) {
  yahooFinance = YahooFinanceClass;
}
async function run() {
  const q = await yahooFinance.quote("MSFT", {}, { validateResult: false });
  console.log("quote 50:", q.fiftyDayAverage);
  console.log("quote 200:", q.twoHundredDayAverage);
  console.log("quote 52wk:", q.fiftyTwoWeekHigh);
}
run();
