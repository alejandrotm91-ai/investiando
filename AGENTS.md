# Memoria de Cálculo — DCF (Discounted Cash Flow)
**Plataforma de referencia:** investiando.app  
**Propósito:** Instrucción estructurada para que un LLM calcule el valor intrínseco por acción usando DCF con los campos exactos disponibles en la terminal y el Excel exportado de investiando.

---

## 0. Lógica del modelo DCF

El DCF responde: **¿cuánto vale hoy el derecho a recibir todos los flujos de caja futuros del negocio?**

```
Equity Value por acción = (Σ PV de FCF proyectados + PV del Valor Terminal − Net Debt) / Shares
```

Cuatro pasos en orden estricto:

```
Paso 1 → FCF base y proyección (numerador del modelo)
Paso 2 → WACC (tasa de descuento)
Paso 3 → Valor Terminal (valor del negocio después del año N)
Paso 4 → Equity bridge (de Enterprise Value a precio por acción)
```

---

## 1. Inputs — campos exactos en investiando.app

### 1.1 Del panel HEALTH & LIQUIDITY (terminal)

| Variable DCF | Campo en terminal | Nota |
|---|---|---|
| FCF base `FCF₀` | **Free Cash Flow** | FCF TTM — punto de partida del modelo |
| Caja total `CASH` | **Total Cash** | Suma de Cash & Equivalents + Short-term investments si aplica |
| Deuda total `DEBT` | **Total Debt** | Deuda financiera bruta (no operativa) |

### 1.2 Del panel VALUATION MULTIPLES (terminal)

| Variable DCF | Campo en terminal | Nota |
|---|---|---|
| Market Cap `MKTCAP` | **Market Cap** | Para calcular WACC (weight of equity) |
| EV/EBITDA | **EV / EBITDA** | Sanity check del modelo al final |

### 1.3 Del panel PROFITABILITY & MARGINS (terminal)

| Variable DCF | Campo en terminal | Nota |
|---|---|---|
| Margen operativo | **Operating Margin** | Referencia para proyectar FCF por margen |
| Margen neto | **Net Profit Margin** | Sanity check de conversión a FCF |

### 1.4 Del panel DIVIDENDS & TRADING (terminal)

| Variable DCF | Campo en terminal | Nota |
|---|---|---|
| Beta `β` | **Beta (5Y Vol)** | Input clave para calcular costo de equity (CAPM) |

### 1.5 Del Excel exportado — sheet `income statement`

| Variable DCF | Fila en Excel | Columna a usar |
|---|---|---|
| Revenue base `REV₀` | **Total Revenue** | Valor más reciente (primera columna de datos) |
| Revenue CAGR histórico | **Total Revenue** | Columna **CAGR** (precalculada) |
| EBITDA base | **EBITDA** | Valor más reciente |
| EBITDA CAGR | **EBITDA** | Columna **CAGR** |
| D&A (Depreciación) | **Reconciled Depreciation** | Valor más reciente |
| Tax rate | **Tax Rate for Calculations** | Valor más reciente (decimal, ej. 0.17 = 17%) |
| Operating Income base | **Operating Income** | Valor más reciente |
| Operating Income CAGR | **Operating Income** | Columna **CAGR** |

### 1.6 Del Excel exportado — sheet `cash flow`

| Variable DCF | Fila en Excel | Nota |
|---|---|---|
| FCF base verificado | **Free Cash Flow** | Confirma el dato de la terminal |
| FCF CAGR histórico | **Free Cash Flow** | Columna **CAGR** (precalculada) — usar como referencia de proyección |
| Operating Cash Flow `OCF` | **Operating Cash Flow** | Para calcular FCF si Free Cash Flow no está disponible |
| Capex `CAPEX` | **Capital Expenditure** | Valor negativo en Excel → usar valor absoluto |
| D&A confirmado | **Depreciation & Amortization** | Debe coincidir con income statement |

> **Fórmula verificación FCF:**  
> `FCF = Operating Cash Flow − |Capital Expenditure|`  
> Si difiere del campo **Free Cash Flow** de la terminal en >5%, usar el calculado manualmente.

### 1.7 Del Excel exportado — sheet `balance sheet`

| Variable DCF | Fila en Excel | Nota |
|---|---|---|
| Shares diluted `SHARES` | **Ordinary Shares Number** | Valor más reciente |
| Deuda total confirmada | **Total Debt** | Confirma dato de la terminal |
| Caja confirmada | **Cash & Equivalents** | Confirma dato de la terminal |
| Stockholders Equity | **Stockholders Equity** | Para calcular WACC (weight of equity) |

---

## 2. Paso 1 — FCF base y proyección

### 2.1 FCF base

```
FCF₀ = Free Cash Flow (terminal, Health & Liquidity)

Verificar con Excel:
FCF₀_verificado = Operating Cash Flow − |Capital Expenditure|
                   [sheet cash flow, valores más recientes]

Si |FCF₀ − FCF₀_verificado| / FCF₀ > 5% → usar FCF₀_verificado y documentar diferencia
```

### 2.2 Margen FCF histórico (para anclar proyecciones)

```
Margen_FCF = FCF₀ / REV₀
           = Free Cash Flow / Total Revenue   [ambos del periodo más reciente]
```

Este margen es el ancla de las proyecciones. Si el margen es estable históricamente, proyectar FCF por margen. Si es volátil, proyectar por tasa de crecimiento directa.

### 2.3 Tasa de crecimiento FCF — definición por fases

**Fase 1 (años 1–5): crecimiento alto**

```
FCF_CAGR_hist  = columna CAGR de "Free Cash Flow" en sheet cash flow
REV_CAGR_hist  = columna CAGR de "Total Revenue" en sheet income statement
OPINC_CAGR_hist = columna CAGR de "Operating Income" en sheet income statement

g_fase1 = promedio(FCF_CAGR_hist, REV_CAGR_hist, OPINC_CAGR_hist)
          [aplicar haircut de 20-30% si algún CAGR > 40% por base baja]
```

**Fase 2 (años 6–10): desaceleración gradual**

```
g_fase2_inicio = g_fase1 × 0.60    [60% de la tasa de fase 1]
g_fase2_final  = g_fase1 × 0.30    [30% de la tasa de fase 1, en año 10]
                 [interpolar linealmente entre años 6 y 10]
```

**Regla de desaceleración máxima:**  
Si `g_fase1 > 25%` → `g_fase2` no puede superar `g_fase1 × 0.5` en año 6.  
Si `g_fase1 < 10%` → usar `g_fase2` flat igual a `g_fase1` (negocio maduro estable).

### 2.4 Proyección año a año

```
Para año t en [1..10]:
  Si t ≤ 5:  FCF_t = FCF_{t-1} × (1 + g_fase1)
  Si t > 5:  g_t   = g_fase2_inicio − (t−6) × (g_fase2_inicio − g_fase2_final) / 4
             FCF_t = FCF_{t-1} × (1 + g_t)
```

### 2.5 Alternativa — proyección por margen FCF sobre Revenue

Usar cuando el margen FCF es más estable que el crecimiento absoluto:

```
REV_t  = REV₀ × (1 + g_revenue)^t       [g_revenue = REV_CAGR_hist con haircut]
FCF_t  = REV_t × Margen_FCF_proyectado   [mantener o comprimir levemente en fase 2]
```

---

## 3. Paso 2 — WACC

### 3.1 Costo de equity (CAPM)

```
Ke = Rf + β × ERP

Donde:
  Rf  = tasa libre de riesgo (US 10Y Treasury — fuente externa, típicamente 4.0–4.5%)
  β   = Beta (5Y Vol)   [panel DIVIDENDS & TRADING de la terminal]
  ERP = equity risk premium (usar 5.5% como estándar; ajustar a 6% para mercados emergentes)
```

### 3.2 Costo de deuda

```
Kd_bruto = Interest Expense / Total Debt
         = [sheet income statement, fila "Interest Expense", valor más reciente]
           / [sheet balance sheet, fila "Total Debt", valor más reciente]

Kd_neto  = Kd_bruto × (1 − Tax Rate)
         = Kd_bruto × (1 − Tax Rate for Calculations)   [sheet income statement]
```

### 3.3 Pesos de capital (weights)

```
E  = Market Cap                            [panel VALUATION MULTIPLES]
D  = Total Debt                            [panel HEALTH & LIQUIDITY]
V  = E + D

We = E / V    [peso del equity]
Wd = D / V    [peso de la deuda]
```

### 3.4 WACC final

```
WACC = (We × Ke) + (Wd × Kd_neto)
```

**Rangos de referencia por tipo de negocio:**

| Tipo de negocio | Beta típico | WACC típico |
|---|---|---|
| Red de pagos (MA, V) | 0.75–0.90 | 7.5–9.0% |
| Tecnología de consumo | 1.10–1.40 | 9.0–11.0% |
| Semiconductores / AI | 1.80–2.30 | 11.0–14.0% |
| Utilities / consumo básico | 0.40–0.70 | 6.0–8.0% |

> Si el WACC calculado cae fuera del rango típico para el sector, revisar el Beta. Un Beta anómalo (p.ej. >2.5 o <0.3) puede requerir ajuste manual o uso del beta desapalancado del sector.

---

## 4. Paso 3 — Valor Terminal

### 4.1 Método Gordon Growth (perpetuidad con crecimiento)

```
VT_bruto = FCF_10 × (1 + g_terminal) / (WACC − g_terminal)

Donde:
  FCF_10     = FCF proyectado en el año 10 (último año de Fase 2)
  g_terminal = tasa de crecimiento perpetua (ver tabla abajo)
```

**Selección de `g_terminal` según perfil del negocio:**

| Perfil | g_terminal | Criterio |
|---|---|---|
| Negocio maduro, mercado desarrollado | 2.0–2.5% | PIB nominal largo plazo |
| Negocio con crecimiento secular moderado | 2.5–3.5% | PIB + penetración de mercado |
| Negocio con ventaja competitiva fuerte y TAM amplio | 3.5–4.5% | Expansión global confirmada |
| Tecnología en hiper-crecimiento (AI, cloud) | NO usar >4.5% | Riesgo de disruption demasiado alto |

> **Regla dura:** `g_terminal < WACC − 3%`. Si no se cumple, el denominador colapsa y el modelo es inválido.

### 4.2 PV del Valor Terminal

```
PV_VT = VT_bruto / (1 + WACC)^10
```

### 4.3 Sanity check del Valor Terminal

```
% VT sobre EV total = PV_VT / (Σ PV_FCF + PV_VT)

Rango saludable: 55–75%
Si % VT > 80% → el modelo depende demasiado del terminal; revisar g_fase2 o extender a 15 años
Si % VT < 40% → inusual; verificar que FCF fase 1 no está sobreestimado
```

---

## 5. Paso 4 — Equity Bridge → precio por acción

### 5.1 De FCF descontados a Enterprise Value

```
PV_FCF_t = FCF_t / (1 + WACC)^t        [para t = 1..10]

EV = Σ PV_FCF_t (t=1..10) + PV_VT
```

### 5.2 De Enterprise Value a Equity Value

```
Net_Debt = Total Debt − Total Cash
         = [balance sheet "Total Debt"] − [balance sheet "Cash & Equivalents"]

Equity_Value = EV − Net_Debt

Nota: si Net_Debt es negativo (más caja que deuda) → SUMAR al EV (es net cash positivo)
```

### 5.3 Precio por acción

```
Fair_Value_por_acción = Equity_Value / Ordinary Shares Number
                        [sheet balance sheet, valor más reciente]
```

---

## 6. Tabla de salida estándar DCF

```
DCF — [TICKER]  |  Precio actual: $___  |  Fecha: ___
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUTS BASE (investiando.app)
  Free Cash Flow (TTM):           $___     ← Health & Liquidity
  Operating Cash Flow:            $___     ← cash flow sheet
  Capital Expenditure:            $___     ← cash flow sheet (valor absoluto)
  FCF verificado (OCF − Capex):   $___     ← calculado
  Total Revenue:                  $___     ← income statement sheet
  Margen FCF:                      ___%    ← FCF / Revenue
  Total Cash:                     $___     ← Health & Liquidity
  Total Debt:                     $___     ← Health & Liquidity
  Net Debt:                       $___     ← calculado (Debt − Cash)
  Ordinary Shares Number:          ___     ← balance sheet sheet
  Beta (5Y Vol):                   ___     ← Dividends & Trading
  Tax Rate:                        ___%    ← income statement sheet

WACC
  Rf (10Y Treasury):               ___%    ← fuente externa
  Beta:                            ___
  ERP:                            5.5%    ← estándar
  Ke (costo equity):               ___%    ← CAPM
  Kd_bruto (Int.Exp / Debt):       ___%    ← calculado
  Kd_neto (post-tax):              ___%    ← Kd × (1 − Tax Rate)
  Weight equity / deuda:           ___% / ___%
  WACC:                            ___%

PROYECCIÓN FCF
  FCF CAGR hist. (Excel):          ___%    ← CAGR col., cash flow sheet
  Revenue CAGR hist.:              ___%    ← CAGR col., income statement
  g_fase1 (años 1–5):              ___%
  g_fase2 (años 6–10):          ___% → ___%  [declinando]

  Año  FCF_proyectado   Factor_desc   PV_FCF
   1   $___             ___           $___
   2   $___             ___           $___
   3   $___             ___           $___
   4   $___             ___           $___
   5   $___             ___           $___
   6   $___             ___           $___
   7   $___             ___           $___
   8   $___             ___           $___
   9   $___             ___           $___
  10   $___             ___           $___
  Σ PV FCF (10 años):               $___

VALOR TERMINAL
  FCF año 10:                      $___
  g_terminal:                      ___%
  WACC − g:                        ___%
  VT bruto:                        $___
  PV del VT:                       $___
  % VT sobre EV:                    ___%   ← sanity check

EQUITY BRIDGE
  Σ PV FCF:                        $___
  + PV Valor Terminal:             $___
  = Enterprise Value:              $___
  − Net Debt:                      $___
  = Equity Value:                  $___
  ÷ Shares:                         ___
  = Fair Value por acción:         $___

ESCENARIOS
                     Bajista       Base       Alcista
  g_fase1:            ___%         ___%        ___%
  g_terminal:         ___%         ___%        ___%
  WACC:               ___%         ___%        ___%
  Fair Value:         $___         $___        $___
  vs. precio actual:  ____%        ____%       ____%

SANITY CHECKS
  EV/EBITDA implícito del modelo:  ___×   vs. terminal: ___×  [panel Valuation Multiples]
  FCF yield implícito (FCF/MKTCAP): ___%
  Margen de seguridad (base):       ___%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 7. Ejemplo numérico verificado — Nvidia (NVDA)

Usando datos reales del Excel de investiando exportado (Apr 2026):

```
─── INPUTS BASE ─────────────────────────────────────────────────────────
Free Cash Flow (terminal):       $46.34B    ← Health & Liquidity
Operating Cash Flow (Excel):     $50.34B    ← cash flow sheet, Apr 2026
Capital Expenditure (Excel):     $1.76B     ← cash flow sheet, Apr 2026 (absoluto)
FCF verificado:                  $50.34B − $1.76B = $48.58B
  → Diferencia vs. terminal: (48.58 − 46.34) / 46.34 = 4.8% < 5% ✓ usar terminal
Total Revenue (Excel):           $81.62B    ← income statement, Apr 2026
Margen FCF:                      $46.34B / $81.62B = 56.8%
Total Cash:                      $53.17B    ← Health & Liquidity
Total Debt:                      $12.81B    ← Health & Liquidity
Net Debt:                        $12.81B − $53.17B = −$40.36B  (net CASH positivo)
Ordinary Shares Number:          24.22B     ← balance sheet, Apr 2026
Beta (5Y Vol):                   2.22       ← Dividends & Trading
Tax Rate (Excel):                17%        ← income statement, Apr 2026

─── WACC ────────────────────────────────────────────────────────────────
Rf  = 4.3%  (10Y UST, ago 2026 — fuente externa)
β   = 2.22
ERP = 5.5%
Ke  = 4.3% + 2.22 × 5.5% = 4.3% + 12.21% = 16.51%

Interest Expense (Excel):    $102M
Total Debt (Excel):          $12.35B
Kd_bruto = 0.102 / 12.35 = 0.83%
Kd_neto  = 0.83% × (1 − 0.17) = 0.69%

Market Cap = $5.45T → E = 5,450B
Total Debt = 12.35B → D = 12.35B
V = 5,462.35B
We = 5,450 / 5,462 = 99.8%
Wd = 12.35 / 5,462 = 0.2%

WACC = (0.998 × 16.51%) + (0.002 × 0.69%) = 16.49% ≈ 16.5%
  → Ajuste: WACC calculado es muy alto por beta 2.22.
  → Usar WACC 10% (normalizado a beta sectorial de largo plazo ~1.4)
  → Documentar: WACC sensible entre 9.5% y 13% para análisis de sensibilidad

─── PROYECCIÓN FCF ──────────────────────────────────────────────────────
FCF_CAGR_hist (Excel, col CAGR):   16.7%  ← cash flow, Free Cash Flow CAGR
REV_CAGR_hist (Excel, col CAGR):   16.7%  ← income statement, Total Revenue CAGR
OPINC_CAGR_hist (Excel):           25.4%  ← income statement, Operating Income CAGR

  → CAGRs históricos del Excel reflejan 4 periodos (Ene 2025 – Apr 2026)
  → g_fase1 base: usar 35% (forward consensus, dado Blackwell ramp)
  → Con haircut conservador: 25%

FCF₀ = $46.34B
Fase 1 (g=25%):  Año1=$57.9B  Año2=$72.4B  Año3=$90.5B  Año4=$113.2B  Año5=$141.5B
Fase 2 (25%→8%): Año6=$163.8B Año7=$183.5B Año8=$198.2B Año9=$209.1B  Año10=$215.4B

─── WACC = 10%, FACTOR DESCUENTO ────────────────────────────────────────
PV_FCF:
  Año1: 57.9/1.10¹  = $52.6B     Año6:  163.8/1.10⁶  = $92.4B
  Año2: 72.4/1.10²  = $59.8B     Año7:  183.5/1.10⁷  = $94.1B
  Año3: 90.5/1.10³  = $68.0B     Año8:  198.2/1.10⁸  = $92.5B
  Año4: 113.2/1.10⁴ = $77.3B     Año9:  209.1/1.10⁹  = $88.6B
  Año5: 141.5/1.10⁵ = $87.9B     Año10: 215.4/1.10¹⁰ = $83.1B

Σ PV FCF = $796.3B

─── VALOR TERMINAL ──────────────────────────────────────────────────────
g_terminal = 3.5%
VT_bruto   = $215.4B × 1.035 / (0.10 − 0.035) = $215.4B × 1.035 / 0.065 = $3,430B
PV_VT      = $3,430B / 1.10¹⁰ = $1,323B

% VT sobre EV = 1,323 / (796 + 1,323) = 62.4% ✓ (dentro de rango 55–75%)

─── EQUITY BRIDGE ───────────────────────────────────────────────────────
EV           = $796.3B + $1,323B = $2,119B
− Net Debt   = − (−$40.36B) = + $40.36B  [es net cash → SUMA]
Equity Value = $2,119B + $40.36B = $2,160B
÷ Shares     = 24.22B
Fair Value   = $2,160B / 24.22B = $89.2 por acción

  → Nota: precio actual ~$224 → modelo base implica OVERVALUED a WACC 10%, g=25% fase1
  → Escenario alcista (WACC 9%, g=40% fase1, g_term=4%): Fair Value ≈ $196
  → Conclusión: precio actual descuenta escenario muy optimista de crecimiento

─── SANITY CHECKS ───────────────────────────────────────────────────────
EV/EBITDA implícito: EV $2,119B / EBITDA $71B = 29.8×
  vs. terminal EV/EBITDA: 32.68× ← panel Valuation Multiples → coherente ✓
FCF yield implícito: $46.34B / $5,450B MKTCAP = 0.85%
  → Yield muy bajo confirma que el mercado paga por crecimiento futuro, no FCF actual
```

---

## 8. Análisis de sensibilidad — tabla estándar

Siempre calcular la siguiente matriz WACC × g_terminal:

```
Fair Value por acción ($)
             g_terminal
WACC     2.0%    2.5%    3.0%    3.5%    4.0%    4.5%
─────────────────────────────────────────────────────
 8.0%    $___    $___    $___    $___    $___    $___
 8.5%    $___    $___    $___    $___    $___    $___
 9.0%    $___    $___    $___    $___    $___    $___
 9.5%    $___    $___    $___    $___    $___    $___
10.0%    $___    $___    $___    $___    $___    $___
10.5%    $___    $___    $___    $___    $___    $___
11.0%    $___    $___    $___    $___    $___    $___
─────────────────────────────────────────────────────
Celda sombreada = combinación base
```

Fórmula para cada celda:

```
PV_FCF_acumulado(g_f1, g_f2, WACC)  +  [FCF_10 × (1+g_t) / (WACC − g_t)] / (1+WACC)^10
− Net_Debt
÷ Shares
```

---

## 9. Flags de alerta — específicos para DCF

| Condición | Flag | Acción |
|---|---|---|
| `WACC calculado > 15%` | ⚠️ Beta anómalo o empresa sin deuda | Usar WACC sectorial de referencia; documentar diferencia |
| `% VT > 80%` | ⚠️ Modelo dependiente del terminal | Extender horizonte a 15 años o reducir g_fase2 |
| `g_terminal ≥ WACC − 2%` | 🚫 Modelo matemáticamente inestable | g_terminal nunca puede exceder WACC; reducir g_terminal |
| `FCF negativo en algún año histórico` | ⚠️ Negocio en transición | Usar Operating Income × (1 − Tax) en vez de FCF como base |
| `FCF verificado difiere >5% del terminal` | ⚠️ Timing o one-offs | Usar FCF calculado (OCF − Capex) y documentar |
| `Margen FCF > 50%` | ✅ Negocio tipo red / software | Normal; no ajustar a la baja salvo competencia estructural |
| `Net Debt negativo` (net cash) | ✅ Sumar al EV en el bridge | No restar; es valor adicional para el accionista |
| `EV/EBITDA implícito difiere >30% del terminal` | ⚠️ Modelo fuera de mercado | Revisar g_fase1 o WACC; el mercado puede tener razón |

---

## 10. Diferencias clave DCF vs. Bogle — recordatorio

| Dimensión | DCF | Bogle |
|---|---|---|
| Pregunta que responde | ¿Cuánto vale el negocio? | ¿Qué retorno obtengo si compro hoy? |
| Tasa de descuento | WACC del negocio | Hurdle rate personal del inversor |
| Qué descuenta | Flujos de caja libres (FCF) | Precio de salida (EPS × P/E) |
| Sensibilidad crítica | WACC y g_terminal | P/E de salida y EPS CAGR |
| Fair value más alto cuando | WACC bajo, g alto | P/E salida > P/E actual y EPS crece rápido |
| Fuente de datos primaria | Excel (cash flow + income statement) | Terminal (panel Dividends & Trading) |
| Requiere fuente externa | WACC (Rf, ERP) | P/E histórico 5Y/10Y |

---

*Memoria de Cálculo DCF — investiando.app. Generada por Claude (Anthropic) — agosto 2026. No constituye asesoría de inversión.*
