# Prueba rápida de las rutas de mercado del Worker (Fase 2).
# Uso: powershell -File scripts\smoke-market.ps1 [-Base https://investiando.alejandrotm91.workers.dev]
param([string]$Base = "https://investiando.alejandrotm91.workers.dev")
$ProgressPreference = 'SilentlyContinue'

$tests = @(
  @{ m = 'GET';  u = '/api/market/indices' },
  @{ m = 'GET';  u = '/api/market/sectors' },
  @{ m = 'GET';  u = '/api/market/top50' },
  @{ m = 'GET';  u = '/api/market/sector-top10' },
  @{ m = 'GET';  u = '/api/market/commodities-crypto' },
  @{ m = 'GET';  u = '/api/search?q=nvid' },
  @{ m = 'GET';  u = '/api/stock/NVDA' },
  @{ m = 'GET';  u = '/api/chart/NVDA?range=YTD' },
  @{ m = 'GET';  u = '/api/chart/AAPL?range=5Y' },
  @{ m = 'GET';  u = '/api/fx?from=EUR&to=USD' },
  @{ m = 'GET';  u = '/api/superinvestors/stats' },
  @{ m = 'GET';  u = '/api/portfolio/stats' },
  @{ m = 'POST'; u = '/api/portfolio/quotes'; b = '{"holdings":[{"ticker":"AAPL","shares":10,"avgCost":150},{"ticker":"MSFT","shares":5,"avgCost":300}]}' },
  @{ m = 'POST'; u = '/api/portfolio/financials'; b = '{"ticker":"NVDA"}' },
  @{ m = 'POST'; u = '/api/portfolio/financials'; b = '{"tickers":["AAPL","MSFT"]}' },
  @{ m = 'POST'; u = '/api/portfolio/chart'; b = '{"holdings":[{"ticker":"AAPL","shares":10,"avgCost":150}],"range":"1Y"}' },
  @{ m = 'POST'; u = '/api/superinvestors/combined'; b = '{"weights":{"buffett":1}}' },
  @{ m = 'POST'; u = '/api/earnings/calendar'; b = '{"tickers":["AAPL","NVDA"]}' }
)

foreach ($t in $tests) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $p = @{ Uri = "$Base$($t.u)"; Method = $t.m; UseBasicParsing = $true; TimeoutSec = 120 }
    if ($t.b) { $p.Body = $t.b; $p.ContentType = 'application/json' }
    $r = Invoke-WebRequest @p
    $txt = $r.Content
    "{0,-4} {1,-38} {2} {3,6} ms  {4,7} B  {5}" -f $t.m, $t.u, $r.StatusCode, $sw.ElapsedMilliseconds, $txt.Length, $txt.Substring(0, [Math]::Min(110, $txt.Length)).Replace("`n", " ")
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    "{0,-4} {1,-38} {2} {3,6} ms  ERROR {4}" -f $t.m, $t.u, $code, $sw.ElapsedMilliseconds, ("" + $_.ErrorDetails.Message).Substring(0, [Math]::Min(160, ("" + $_.ErrorDetails.Message).Length))
  }
}
