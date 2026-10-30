# Prueba de las rutas de IA (Fase 4) contra el Worker publicado. Cada llamada consulta a Claude
# y tiene coste. Crea una cuenta de prueba @example.com (la marca como verificada en D1), inicia
# sesión, llama una vez a cada ruta y al final borra la cuenta.
# Uso: powershell -File scripts\smoke-ai.ps1 [-Base https://investiando.alejandrotm91.workers.dev] [-Image ruta.png]
param([string]$Base = "https://investiando.alejandrotm91.workers.dev", [string]$Image = "")
$ProgressPreference = 'SilentlyContinue'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$email = "smoke-ai-$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$pass = "Prueba-" + [guid]::NewGuid().ToString('N').Substring(0,10)
$fails = 0

function Call($method, $path, $body, $session) {
  $p = @{ Uri = "$Base$path"; Method = $method; UseBasicParsing = $true; TimeoutSec = 300 }
  if ($body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 10 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  if ($session) { $p.WebSession = $session }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try { $r = Invoke-WebRequest @p; $txt = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()); return @{ code = [int]$r.StatusCode; text = $txt; ms = $sw.ElapsedMilliseconds } }
  catch { return @{ code = [int]$_.Exception.Response.StatusCode.value__; text = "" + $_.ErrorDetails.Message; ms = $sw.ElapsedMilliseconds } }
}
function Show($name, $r, $ok) {
  $t = $r.text -replace "\s+", " "
  "{0} {1,-28} {2} {3,6} ms  {4}" -f ($(if ($ok) { "OK   " } else { "FALLO" })), $name, $r.code, $r.ms, $t.Substring(0, [Math]::Min(150, $t.Length))
  if (-not $ok) { $script:fails++ }
}
function D1($sql) { $o = npx wrangler d1 execute investiando-db --remote --json --command $sql 2>$null | Out-String; return ($o | ConvertFrom-Json)[0].results }

$r = Call POST /api/chat @{ message = "hola" }
Show "IA sin sesión -> 401" $r ($r.code -eq 401)

$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Call POST /api/auth/signup @{ name = "Smoke IA"; email = $email; password = $pass } | Out-Null
D1 "UPDATE users SET email_verified = 1, verification_code = NULL WHERE email = '$email'" | Out-Null
$r = Call POST /api/auth/signin @{ email = $email; password = $pass } $s
Show "login" $r ($r.code -eq 200)

$holdings = @(@{ ticker = "AAPL"; shares = 10; avgCost = 150 }, @{ ticker = "MSFT"; shares = 5; avgCost = 300 })
$portfolio = @{ positions = @(@{ ticker = "AAPL"; name = "Apple"; shares = 10; price = 340; mktValue = 3400; weight = 60 }, @{ ticker = "MSFT"; name = "Microsoft"; shares = 5; price = 540; mktValue = 2700; weight = 40 }); totals = @{ mktValue = 6100 } }

$r = Call POST /api/chat @{ message = "¿Cuál es el principal riesgo de esta cartera? Responde en 2 frases."; history = @(); portfolio = $portfolio } $s
Show "chat" $r ($r.code -eq 200 -and ($r.text | ConvertFrom-Json).text.Length -gt 20)

$r = Call POST /api/news @{ tickers = @("NVDA", "MSFT"); language = "ES" } $s
$j = $r.text | ConvertFrom-Json
Show "news (búsqueda web)" $r ($r.code -eq 200 -and $j.news.Count -gt 0)
"      liveGrounded = $($j.liveGrounded) (true = noticias reales; false = datos de respaldo)"

$r = Call POST /api/financials-analysis @{ ticker = "AAPL"; financials = @{ annual = @(@{ date = "2025-09-30"; totalRevenue = 416000000000; grossProfit = 195000000000; operatingIncome = 133000000000; netIncome = 112000000000; freeCashFlow = 99000000000 }, @{ date = "2024-09-30"; totalRevenue = 391000000000; grossProfit = 180000000000; operatingIncome = 123000000000; netIncome = 94000000000; freeCashFlow = 108000000000 }) } } $s
Show "financials-analysis" $r ($r.code -eq 200)

$r = Call POST /api/hedgefund-analysis @{ portfolio = $portfolio } $s
Show "hedgefund-analysis" $r ($r.code -eq 200)

$r = Call POST /api/watchlist/scan-sector @{ sector = "Technology"; sectorEs = "Tecnología"; scoreType = "quality"; minScore = 70; matchedTickers = @("AAPL", "MSFT", "NVDA"); totalScanned = 20; language = "ES" } $s
Show "watchlist/scan-sector" $r ($r.code -eq 200)

$r = Call POST /api/portfolio/generate-ai @{ amount = 10000; strategyType = "balanced"; holdingsCount = 5; language = "ES" } $s
Show "portfolio/generate-ai" $r ($r.code -eq 200)

if ($Image -and (Test-Path $Image)) {
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Image))
  $r = Call POST /api/portfolio/extract-from-image @{ imageBase64 = "data:image/png;base64,$b64" } $s
  Show "portfolio/extract-from-image" $r ($r.code -eq 200)
}

D1 "DELETE FROM users WHERE email = '$email'" | Out-Null
"Cuenta de prueba borrada. Fallos: $fails"
