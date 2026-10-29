# Prueba de punta a punta de usuarios y sesión (Fase 3) contra el Worker publicado.
# Crea una cuenta de prueba (correo @example.com), lee los códigos en D1 (no hay proveedor de correo
# configurado) y al final la borra.
# Uso: powershell -File scripts\smoke-auth.ps1 [-Base https://investiando.alejandrotm91.workers.dev]
param([string]$Base = "https://investiando.alejandrotm91.workers.dev")
$ProgressPreference = 'SilentlyContinue'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$email = "smoke-$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$pass1 = "Prueba-" + [guid]::NewGuid().ToString('N').Substring(0,10)
$pass2 = "Nueva-" + [guid]::NewGuid().ToString('N').Substring(0,10)
$fails = 0

function Call($method, $path, $body, $session, $headers) {
  $p = @{ Uri = "$Base$path"; Method = $method; UseBasicParsing = $true; TimeoutSec = 60 }
  if ($body) { $p.Body = ($body | ConvertTo-Json -Depth 10 -Compress); $p.ContentType = 'application/json' }
  if ($session) { $p.WebSession = $session }
  if ($headers) { $p.Headers = $headers }
  try { $r = Invoke-WebRequest @p; return @{ code = [int]$r.StatusCode; json = ($r.Content | ConvertFrom-Json) } }
  catch { $m = $_.ErrorDetails.Message; $j = $null; try { $j = $m | ConvertFrom-Json } catch {}; return @{ code = [int]$_.Exception.Response.StatusCode.value__; json = $j } }
}
function Check($name, $cond) { if ($cond) { "OK    $name" } else { "FALLO $name"; $script:fails++ } }
function D1($sql) { $o = npx wrangler d1 execute investiando-db --remote --json --command $sql 2>$null | Out-String; return ($o | ConvertFrom-Json)[0].results }

$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Call POST /api/auth/signup @{ name = "Smoke Test"; email = $email; password = $pass1 }
Check "registro" ($r.code -eq 200 -and $r.json.success)
$r = Call POST /api/auth/signup @{ name = "Smoke Test"; email = $email; password = $pass1 }
Check "registro duplicado rechazado" ($r.code -eq 400)
$r = Call POST /api/auth/signin @{ email = $email; password = $pass1 }
Check "login antes de verificar -> EMAIL_NOT_VERIFIED" ($r.code -eq 403 -and $r.json.code -eq "EMAIL_NOT_VERIFIED")
$r = Call POST /api/auth/verify @{ email = $email; code = "000000" }
Check "código incorrecto rechazado" ($r.code -eq 400)

$code = (D1 "SELECT verification_code AS c FROM users WHERE email = '$email'").c
$r = Call POST /api/auth/verify @{ email = $email; code = $code } $s
Check "verificación con código" ($r.code -eq 200 -and $r.json.token)
$token = $r.json.token

$r = Call POST /api/auth/me @{ token = $token }
Check "/me con token" ($r.code -eq 200 -and $r.json.user.email -eq $email)
$r = Call POST /api/auth/me @{ token = "user_token_user_123" }
Check "/me con token antiguo falsificado -> 401" ($r.code -eq 401)

$r = Call GET "/api/user/get-cloud-data?email=$email" $null $s
Check "leer datos propios (cookie)" ($r.code -eq 200 -and $r.json.data.portfolios.Count -ge 1)
$r = Call POST /api/user/save-cloud-data @{ email = $email; data = @{ watchlist = @("AAPL", "KO"); clave = "hack"; email = "otro@x.com" } } $s
Check "guardar datos propios" ($r.code -eq 200 -and $r.json.success)
$r = Call GET "/api/user/get-cloud-data" $null $s
Check "watchlist guardada y campos protegidos ignorados" (($r.json.data.watchlist -join ",") -eq "AAPL,KO" -and -not $r.json.data.clave -and $r.json.data.email -eq $email)
$r = Call GET "/api/user/get-cloud-data?email=alguien@gmail.com" $null $s
Check "leer datos de otro usuario -> 403" ($r.code -eq 403)
$r = Call GET "/api/user/get-cloud-data?email=$email"
Check "leer datos sin sesión -> 401" ($r.code -eq 401)
$r = Call POST /api/user/save-cloud-data @{ email = $email; data = @{ watchlist = @() } }
Check "guardar sin sesión -> 401" ($r.code -eq 401)

$r = Call POST /api/auth/signin @{ email = $email; password = "incorrecta" }
Check "login con contraseña incorrecta -> WRONG_PASSWORD" ($r.code -eq 401 -and $r.json.code -eq "WRONG_PASSWORD")
$r = Call POST /api/auth/signin @{ email = "noexiste-$email"; password = "x" }
Check "login usuario inexistente -> USER_NOT_FOUND" ($r.code -eq 404)

$r = Call POST /api/auth/forgot-request @{ email = $email }
Check "solicitar recuperación" ($r.code -eq 200)
$reset = (D1 "SELECT reset_code AS c FROM users WHERE email = '$email'").c
$r = Call POST /api/auth/forgot-reset @{ email = $email; code = $reset; newPassword = $pass2 }
Check "cambiar contraseña con código" ($r.code -eq 200)
$r = Call POST /api/auth/signin @{ email = $email; password = $pass1 }
Check "contraseña anterior ya no sirve" ($r.code -eq 401)
$s2 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Call POST /api/auth/signin @{ email = $email; password = $pass2 } $s2
Check "login con contraseña nueva" ($r.code -eq 200 -and $r.json.token)

$r = Call POST /api/auth/logout $null $s2
$r = Call GET "/api/user/get-cloud-data" $null $s2
Check "tras cerrar sesión, sin acceso" ($r.code -eq 401)

$stored = (D1 "SELECT password_hash AS h FROM users WHERE email = '$email'").h
Check "contraseña guardada cifrada" ($stored -like 'pbkdf2-sha256$*' -and $stored -notlike "*$pass2*")

D1 "DELETE FROM users WHERE email = '$email'" | Out-Null
"Cuenta de prueba borrada. Fallos: $fails"
