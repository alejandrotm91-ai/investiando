import YahooFinance from 'yahoo-finance2';
async function test() {
  const yahooFinance = new (YahooFinance as any)();
  const res = await yahooFinance.fundamentalsTimeSeries('AAPL', {period1: '2023-01-01', module: 'all', type: 'annual'});
  console.log(res.map((r: any) => r.date));
}
test();
