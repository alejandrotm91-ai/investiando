# Plan de Implementación: 3-Statement Financial Model Interconectado

Este documento especifica la arquitectura, lógica financiera y diseño de interfaz para integrar un **Modelo Financiero Integrado de Tres Estados (3-Statement Model)** en el modal de detalle de cada compañía a partir de sus estados financieros reportados en la plataforma.

---

## 1. Análisis de Requisitos y Decisiones Confirmadas

A partir de las respuestas del usuario y el análisis de los estados financieros reportados (161 métricas anuales y trimestrales disponibles vía `/api/portfolio/financials` y Yahoo Finance):

1. **Ubicación en la Interfaz**:
   - Pestaña dedicada **"3-Statement" / "Modelo 3 Estados"** dentro del modal de detalle de ticker (`StockDetailPanel`), con acceso directo para cualquier acción del portafolio, watchlist o explorador de mercado.
2. **Dinamismo y Horizonte de Proyección**:
   - Modelo dinámico a **5 años de proyección (E)** con base en los periodos históricos reportados (**A**).
   - **Drivers y supuestos editables**: Crecimiento de ingresos (Revenue Growth %), Margen Bruto / Margen Operativo %, Tasa Impositiva Efectiva %, Capex como % de Ventas, D&A como % de Ventas, y Variación de Capital de Trabajo Neto (NWC % de Ventas).
   - **Escenarios preconfigurados con un clic**:
     - **Base**: Proyección guiada por los promedios y tendencias históricas reportadas.
     - **Bull (Alcista)**: Aceleración de ventas (+300-500 bps), expansión de márgenes operativos (+150-250 bps) y mayor eficiencia de capital.
     - **Bear (Bajista)**: Desaceleración macroeconómica, compresión de margen operativo y mayor costo impositivo/financiero.
     - **Personalizado (Custom)**: Ajuste granular celda por celda o slider de supuestos.
3. **Conexión con Valoración y Solvencia**:
   - Cálculo automático del **Flujo de Caja Libre Desapalancado (Unlevered Free Cash Flow - UFCF = NOPAT + D&A − Capex − ΔNWC)** proyectado.
   - Enlace directo con la metodología **DCF (Discounted Cash Flow)** según la memoria de cálculo institucional de la plataforma (`AGENTS.md`), derivando Valor Intrínseco por acción, Enterprise Value y Equity Bridge.
   - Panel de **Ratios Proyectados de Solvencia y Salud**: Net Debt / EBITDA, Cobertura de Intereses (Interest Coverage), Current Ratio, y Deuda / Equity a lo largo de los 5 años proyectados.

---

## 2. Arquitectura Matemática y Mecánica de Interconexión Contable

El núcleo del modelo garantiza la coherencia contable mediante el entrelazado estricto de los tres estados:

```
┌────────────────────────────────────────────────────────┐
│             1. INCOME STATEMENT (P&L)                  │
│ Revenue → Gross Profit → Operating Income (EBIT)       │
│ → Interest Expense → Pretax Income → NET INCOME        │
└──────────────────────────┬─────────────────────────────┘
                           │
             Net Income    │   D&A Add-back
             fluye a CFO   │   fluye a CFO
                           ▼
┌────────────────────────────────────────────────────────┐
│             2. CASH FLOW STATEMENT (CFS)               │
│ CFO: Net Income + D&A − ΔNWC                           │
│ CFI: Capital Expenditures (Capex)                      │
│ CFF: Net Debt Issuance/Repayment − Dividends           │
│ ────────────────────────────────────────────────────── │
│ NET CHANGE IN CASH = CFO + CFI + CFF                   │
│ ENDING CASH = Beginning Cash + Net Change in Cash      │
└────────────┬─────────────────────────────┬─────────────┘
             │                             │
    Ending Cash                            │ Capex incrementa PP&E
    actualiza Caja                         │ Retained Earnings =
    en Balance                             │ Prior RE + Net Income − Div
             ▼                             ▼
┌────────────────────────────────────────────────────────┐
│             3. BALANCE SHEET (BS)                      │
│ ASSETS = Cash + Accounts Receivable + Inventory + PP&E │
│ LIABILITIES = Accounts Payable + Total Debt            │
│ EQUITY = Common Stock + Retained Earnings              │
│ ────────────────────────────────────────────────────── │
│ BALANCE CHECK: Total Assets − (Liabilities + Equity) = 0
└────────────────────────────────────────────────────────┘
```

### Reglas de cuadre y consistencia:
- **Ending Cash**: El saldo final de caja del Cash Flow Statement se asigna directamente a `Cash & Cash Equivalents` en el Balance Sheet.
- **PP&E Neto**: $\text{PP\&E}_t = \text{PP\&E}_{t-1} + \text{Capex}_t - \text{D\&A}_t$.
- **Retained Earnings**: $\text{RE}_t = \text{RE}_{t-1} + \text{Net Income}_t - \text{Dividends}_t$.
- **Balance Check (Cuadre de Balance)**: Indicador visual en tiempo real que valida que $\Delta(\text{Assets} - (\text{Liabilities} + \text{Equity})) = 0$.

---

## 3. Diseño Visual y Experiencia de Usuario (UI/UX)

Siguiendo las pautas de diseño institucional de SaaS financiero (`3_saas_dashboard.md` y `frontend-design`):

1. **Sub-Navegación Limpia y Sin "Slop"**:
   - Barra superior con selector de escenarios: `Base`, `Bull`, `Bear`, `Personalizado`.
   - Botón de alternancia entre vistas:
     - **Vista Todo-en-Uno (Compact Integrated Model)**
     - **P&L (Estado de Resultados)**
     - **Balance Sheet (Balance General)**
     - **Cash Flow (Flujo de Caja)**
     - **Supuestos & Drivers (Forecast Assumptions)**
     - **Puente DCF & Ratios de Solvencia**
2. **Tablas Financieras de Alta Densidad**:
   - Tipografía monoespaciada para cifras numéricas (`font-mono tabular-nums`).
   - Diferenciación visual clara de columnas:
     - Periodos históricos reportados (ej. `2021A`, `2022A`, `2023A`, `2024A`) con fondo sobrio y tipografía neutra.
     - Periodos proyectados (ej. `2025E`, `2026E`, `2027E`, `2028E`, `2029E`) con encabezado destacado y cifras dinámicas.
   - Filas de totales y subtotales con bordes superiores finos (`border-t border-slate-700 font-bold`).
3. **Panel de Control de Drivers (Supuestos)**:
   - Sliders e inputs directos para modificar tasas de crecimiento y márgenes, con actualización inmediata de los 3 estados en tiempo real sin recargar la página.
4. **Verificador de Cuadre de Balance**:
   - Badge de estado contable: `Balance Check: Cuadrado ($0.00)` en verde esmeralda.

---

## 4. Plan de Archivos y Componentes

### 1. `src/utils/threeStatementModel.ts` (Nuevo Módulo)
- Parser de datos financieros reportados (`annual` y `quarterly` de Yahoo Finance).
- Extracción normalizada de líneas contables base:
  - Ingresos, Costo de Ventas, Margen Bruto, Gastos Operativos, EBITDA, D&A, EBIT, Intereses, Impuestos, Ingreso Neto.
  - Caja, Cuentas por Cobrar, Inventarios, Activo Corriente, PP&E, Activo Total.
  - Cuentas por Pagar, Deuda a Corto y Largo Plazo, Pasivo Total.
  - Capital Social, Utilidades Retenidas, Patrimonio Neto.
  - Flujo Operativo (CFO), Capex, Flujo de Inversión (CFI), Deuda Emitida/Pagada, Dividendos, Flujo Financiero (CFF).
- Motor de cálculo proyectivo a 5 años (Drivers a Proyecciones).
- Algoritmo de interconexión contable y verificación de cuadre.
- Extracción de UFCF proyectado y conexión con WACC y DCF según `AGENTS.md`.

### 2. `src/components/ThreeStatementModelView.tsx` (Nuevo Componente)
- Componente de interfaz de usuario rico e interactivo:
  - Selector de vista de estados y escenarios.
  - Grilla financiera editable y reactiva.
  - Panel lateral o colapsable de Supuestos / Drivers clave.
  - Gráficos comparativos de evolución (Ingresos vs. FCF proyectado, Evolución de Márgenes, Apalancamiento Deuda Neta/EBITDA).
  - Tarjeta de enlace al DCF (Valor intrínseco resultante y margen de seguridad vs. precio actual de mercado).

### 3. `src/components/HoldingsTable.tsx` (Integración)
- Agregar pestaña `"3-Statement"` en `StockDetailPanel` con icono de hoja financiera o reporte contable (`FileSpreadsheet` o `Layers`).
- Renderizado condicional de `ThreeStatementModelView` pasando el ticker, precio actual, financials reportados y datos del mercado.
- Soporte para idioma ES / EN y temas Dark / Light.

---

## 5. Criterios de Verificación y Testing

1. **Prueba de Extracción de Datos**:
   - Verificar la ingesta correcta de los 3 estados reportados para tickers de gran capitalización (ej. AAPL, MSFT, NVDA) y empresas con deuda/caja neta variada.
2. **Prueba de Interconexión Contable**:
   - Comprobar que en cada uno de los 5 años proyectados:
     $$\text{Total Assets} = \text{Total Liabilities} + \text{Stockholders' Equity}$$
   - Confirmar que $\Delta \text{Cash}$ del estado de flujos sea exactamente igual a $\text{Cash}_t - \text{Cash}_{t-1}$ del balance.
3. **Prueba de Reactividad de Escenarios**:
   - Modificar un supuesto (ej. crecimiento de ingresos de 10% a 15%) y verificar que se recalculen instantáneamente P&L, Cash Flow, Balance, UFCF y el Fair Value del DCF.
4. **Validación de Compilación y Linter**:
   - Ejecutar `compile_applet` y `lint_applet` asegurando 0 errores de tipado en TypeScript.
