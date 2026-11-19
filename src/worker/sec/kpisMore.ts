// KPIs operativos de las 69 empresas del universo que no estaban en KPI_DEFS (capa 5). Se fusionan en
// KPI_DEFS (kpis.ts). Cada `hint` describe la cifra con el nombre que usa el comunicado (anexo 99.1),
// revisado en su último 8-K de resultados (noviembre de 2026). Unidades: "$M" millones de USD,
// "M" millones (personas, cuentas…), "$" USD, "%" crecimiento interanual en puntos, "share" porcentaje
// de nivel (márgenes, ratios), "n" unidades sueltas, "kbd" miles de barriles/día.
import type { CompanyKpis, KpiDef, KpiChart } from "./kpis";

type R = [number, number];
const usd = (key: string, en: string, es: string, hint: string, range: R = [-500000, 5000000], kind: KpiDef["kind"] = "flow"): KpiDef => ({ key, en, es, unit: "$M", kind, range, hint: `${hint}, in millions of USD (e.g. '$2.4 billion' -> 2400)` });
const lvl = (key: string, en: string, es: string, hint: string, range: R = [-100, 200], kind: KpiDef["kind"] = "avg"): KpiDef => ({ key, en, es, unit: "share", kind, range, hint: `${hint}, in % (e.g. 52.3)` });
const gr = (key: string, en: string, es: string, hint: string, range: R = [-80, 300]): KpiDef => ({ key, en, es, unit: "%", kind: "avg", range, hint: `${hint}, year-over-year % change for the quarter (three months, not year-to-date), e.g. 'up 7%' -> 7` });
const dol = (key: string, en: string, es: string, hint: string, range: R, kind: KpiDef["kind"] = "stock"): KpiDef => ({ key, en, es, unit: "$", kind, range, hint: `${hint}, in USD` });
const num = (key: string, en: string, es: string, hint: string, range: R, kind: KpiDef["kind"] = "flow"): KpiDef => ({ key, en, es, unit: "n", kind, range, hint });
const mil = (key: string, en: string, es: string, hint: string, range: R, kind: KpiDef["kind"] = "stock"): KpiDef => ({ key, en, es, unit: "M", kind, range, hint: `${hint}, in millions (e.g. '1,243 thousand' -> 1.243; '48.6 million' -> 48.6)` });
const ch = (id: string, en: string, es: string, type: KpiChart["type"], keys: string[], extra: Partial<KpiChart> = {}): KpiChart => ({ id, en, es, type, keys, ...extra });

// Previsión de ingresos del trimestre siguiente (gráfico "ingresos frente a la previsión", como NVDA)
const guide = (): KpiDef => usd("guidance_next", "Revenue outlook for next quarter", "Previsión de ingresos del trimestre siguiente", "Revenue outlook for the NEXT quarter given in this release (midpoint of the range), attach it to the quarter being reported", [100, 2000000]);
const guideChart = () => ch("guide", "Revenue vs. prior-quarter outlook", "Ingresos frente a la previsión del trimestre anterior", "bar", ["revenue", "guidance_next"], { derived: "guidance" });
const gmG = () => lvl("gm_gaap", "GAAP gross margin", "Margen bruto GAAP", "GAAP gross margin of the quarter", [0, 100]);
const gmN = () => lvl("gm_nongaap", "Non-GAAP gross margin", "Margen bruto no GAAP", "Non-GAAP (adjusted) gross margin of the quarter", [0, 100]);
const opmN = (label = "Non-GAAP operating margin") => lvl("opm_nongaap", label, "Margen operativo ajustado", `${label} of the quarter`, [-100, 100]);
const fcf = (label = "Free cash flow") => usd("fcf", label, "Flujo de caja libre", `${label} for the quarter (three months; omit if only year-to-date or trailing twelve months)`);
const gmChart = () => ch("gm", "Gross margin (GAAP / non-GAAP)", "Margen bruto (GAAP / no GAAP)", "line", ["gm_gaap", "gm_nongaap"]);
const fcfChart = () => ch("fcf", "Free cash flow", "Flujo de caja libre", "bar", ["fcf"]);

// Semiconductores y hardware que dan previsión trimestral
const chipCo = (extra: KpiDef[] = [], extraCharts: KpiChart[] = []): CompanyKpis => ({
  from: "2023-01-01",
  kpis: [guide(), gmG(), gmN(), opmN(), fcf(), ...extra],
  charts: [guideChart(), gmChart(), ch("opm", "Non-GAAP operating margin", "Margen operativo ajustado", "line", ["opm_nongaap"]), fcfChart(), ...extraCharts],
});

// Bancos
const bank = (o: { loans: R; deposits: R; extra?: KpiDef[]; extraCharts?: KpiChart[]; card?: boolean }): CompanyKpis => ({
  from: "2023-01-01",
  kpis: [
    usd("nii", "Net interest income", "Margen de intereses", "Net interest income in the quarter (firmwide, as reported)", [100, 200000]),
    lvl("nim", "Net interest margin", "Margen de interés neto (NIM)", "Net interest margin (taxable-equivalent if that is the headline) of the quarter", [0.5, 15]),
    lvl("cet1", "CET1 ratio", "Ratio CET1", "Common Equity Tier 1 (CET1) capital ratio at quarter end (standardized approach if both are given)", [4, 30], "stock"),
    lvl("rotce", "ROTCE", "ROTCE", "Return on average tangible common equity (ROTCE) for the quarter", [-40, 80]),
    usd("avg_loans", "Average loans", "Préstamos medios", "Average total loans in the quarter, even if rounded (e.g. '$1,033.4 billion' -> 1033400)", o.loans, "avg"),
    usd("avg_deposits", "Average deposits", "Depósitos medios", "Average total deposits in the quarter, even if rounded", o.deposits, "avg"),
    lvl("nco_rate", "Net charge-off rate", "Tasa de fallidos netos", "Net charge-offs as % of average loans (annualized) in the quarter", [0, 15]),
    lvl("efficiency", "Efficiency ratio", "Ratio de eficiencia", "Efficiency ratio (noninterest expense / revenue) of the quarter, as reported", [20, 120]),
    dol("tbvps", "Tangible book value per share", "Valor contable tangible por acción", "Tangible book value per common share at quarter end", [5, 1000]),
    ...(o.extra || []),
  ],
  charts: [
    ch("nii", "Net interest income", "Margen de intereses", "bar", ["nii"]),
    ch("nim", "Net interest margin", "Margen de interés neto", "line", ["nim"]),
    ch("ret", "ROTCE and CET1 ratio", "ROTCE y ratio CET1", "line", ["rotce", "cet1"]),
    ch("bal", "Average loans and deposits", "Préstamos y depósitos medios", "line", ["avg_loans", "avg_deposits"]),
    ch("credit", "Net charge-off rate", "Tasa de fallidos netos", "line", ["nco_rate"]),
    ch("eff", "Efficiency ratio", "Ratio de eficiencia", "line", ["efficiency"]),
    ch("tbv", "Tangible book value per share", "Valor contable tangible por acción", "line", ["tbvps"]),
    ...(o.extraCharts || []),
  ],
});

// Farmacéuticas: ventas de sus productos principales
const pharma = (products: [string, string, string][], groups: { id: string; en: string; es: string; keys: string[] }[], minChars?: number): CompanyKpis => ({
  from: "2023-01-01",
  ...(minChars ? { minChars } : {}),
  kpis: products.map(([key, name, extra]) => usd(key, name, name, `${name}${extra ? ` (${extra})` : ""} worldwide sales in the quarter`, [0, 200000])),
  charts: groups.map((g) => ch(g.id, g.en, g.es, "line", g.keys)),
});


export const KPI_DEFS_MORE: Record<string, CompanyKpis> = {
  // ------------------------------------------------------------ semiconductores y hardware
  MU: chipCo(),
  INTC: chipCo([], []),
  AMAT: chipCo(),
  LRCX: chipCo(),
  TXN: {
    from: "2023-01-01",
    kpis: [guide(), gmG(), usd("fcf_ttm", "Free cash flow (trailing 12 months)", "Flujo de caja libre (12 meses)", "Free cash flow for the trailing 12 months as stated in the release", [-50000, 100000], "stock"), lvl("fcf_ttm_margin", "Free cash flow % of revenue (12 months)", "Flujo de caja libre % de ingresos (12 meses)", "Free cash flow as a percentage of revenue for the trailing 12 months", [-50, 80], "stock")],
    charts: [guideChart(), ch("gm", "GAAP gross margin", "Margen bruto GAAP", "line", ["gm_gaap"]), ch("fcf", "Free cash flow (trailing 12 months)", "Flujo de caja libre (12 meses)", "bar", ["fcf_ttm"]), ch("fcfm", "Free cash flow % of revenue (12 months)", "Flujo de caja libre % de ingresos (12 meses)", "line", ["fcf_ttm_margin"])],
  },
  KLAC: chipCo(),
  ADI: {
    from: "2023-01-01",
    kpis: [guide(), gmG(), lvl("gm_nongaap", "Adjusted gross margin", "Margen bruto ajustado", "Adjusted gross margin percentage of the quarter", [0, 100]), lvl("opm_nongaap", "Adjusted operating margin", "Margen operativo ajustado", "Adjusted operating margin of the quarter", [-100, 100]), usd("fcf_ttm", "Free cash flow (trailing 12 months)", "Flujo de caja libre (12 meses)", "Free cash flow on a trailing twelve-month basis", [-50000, 100000], "stock")],
    charts: [guideChart(), gmChart(), ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_nongaap"]), ch("fcf", "Free cash flow (trailing 12 months)", "Flujo de caja libre (12 meses)", "bar", ["fcf_ttm"])],
  },
  QCOM: {
    from: "2023-01-01",
    kpis: [
      guide(),
      usd("qct_handsets", "QCT · Handsets", "QCT · Móviles", "QCT handsets revenue in the quarter", [0, 100000]),
      usd("qct_auto", "QCT · Automotive", "QCT · Automoción", "QCT automotive revenue in the quarter", [0, 50000]),
      usd("qct_iot", "QCT · IoT", "QCT · IoT", "QCT IoT (internet of things) revenue in the quarter", [0, 50000]),
      usd("qtl", "QTL (licensing)", "QTL (licencias)", "QTL licensing revenue in the quarter", [0, 50000]),
    ],
    charts: [guideChart(), ch("qct", "QCT revenue by market", "Ingresos QCT por mercado", "stack", ["qct_handsets", "qct_auto", "qct_iot"]), ch("qtl", "QTL licensing revenue", "Ingresos de licencias (QTL)", "bar", ["qtl"])],
  },
  ANET: {
    from: "2023-01-01",
    kpis: [guide(), gmG(), gmN(), lvl("opm_gaap", "GAAP operating margin", "Margen operativo GAAP", "GAAP operating margin of the quarter", [-100, 100]), opmN()],
    charts: [guideChart(), gmChart(), ch("opm", "Operating margin (GAAP / non-GAAP)", "Margen operativo (GAAP / no GAAP)", "line", ["opm_gaap", "opm_nongaap"])],
  },
  DELL: {
    from: "2023-01-01",
    kpis: [guide(), fcf("Adjusted free cash flow"), usd("ai_orders", "AI server orders", "Pedidos de servidores de IA", "AI-optimized server orders (bookings) in the quarter, only if stated", [0, 500000]), usd("ai_backlog", "AI server backlog", "Cartera de servidores de IA", "AI-optimized server backlog at quarter end, only if stated", [0, 500000], "stock"), usd("ai_shipments", "AI server shipments", "Envíos de servidores de IA", "AI-optimized server shipments (revenue) in the quarter, only if stated", [0, 500000])],
    charts: [guideChart(), fcfChart(), ch("ai", "AI servers: orders, shipments and backlog", "Servidores de IA: pedidos, envíos y cartera", "line", ["ai_orders", "ai_shipments", "ai_backlog"])],
  },
  WDC: chipCo(),
  APH: {
    from: "2023-01-01",
    kpis: [guide(), usd("orders", "Orders", "Pedidos", "Orders (bookings) in the quarter", [0, 200000]), num("book_to_bill", "Book-to-bill", "Book-to-bill", "Book-to-bill ratio of the quarter (e.g. '1.19:1' -> 1.19)", [0.3, 3], "avg"), gr("organic_growth", "Organic sales growth", "Crecimiento orgánico de ventas", "Organic (constant currency, excluding acquisitions) sales growth"), lvl("opm_nongaap", "Adjusted operating margin", "Margen operativo ajustado", "Adjusted operating margin of the quarter", [-50, 80]), fcf()],
    charts: [guideChart(), ch("orders", "Orders", "Pedidos", "bar", ["orders"]), ch("btb", "Book-to-bill", "Book-to-bill", "line", ["book_to_bill"]), ch("org", "Organic sales growth", "Crecimiento orgánico", "line", ["organic_growth"]), fcfChart()],
  },
  CSCO: {
    from: "2023-01-01",
    kpis: [guide(), gmN(), opmN(), usd("rpo", "Remaining performance obligations", "Obligaciones de desempeño pendientes (RPO)", "Remaining performance obligations (RPO) at quarter end", [0, 500000], "stock"), gr("product_orders", "Product orders growth", "Crecimiento de pedidos de producto", "Total product orders growth"), usd("arr", "Annualized recurring revenue", "Ingresos recurrentes anualizados (ARR)", "Total annualized recurring revenue (ARR) at quarter end, only if stated", [0, 200000], "stock")],
    charts: [guideChart(), ch("gm", "Non-GAAP gross and operating margin", "Margen bruto y operativo no GAAP", "line", ["gm_nongaap", "opm_nongaap"]), ch("rpo", "RPO and ARR", "RPO y ARR", "line", ["rpo", "arr"]), ch("orders", "Product orders growth", "Crecimiento de pedidos de producto", "line", ["product_orders"])],
  },
  // ------------------------------------------------------------ software y servicios
  PANW: {
    from: "2023-01-01",
    kpis: [guide(), usd("ngs_arr", "Next-Generation Security ARR", "ARR de Next-Generation Security", "Next-Generation Security ARR at quarter end", [0, 200000], "stock"), usd("rpo", "Remaining performance obligations", "Obligaciones de desempeño pendientes (RPO)", "Remaining performance obligations at quarter end", [0, 300000], "stock"), fcf("Free cash flow (non-GAAP)")],
    charts: [guideChart(), ch("arr", "Next-Generation Security ARR", "ARR de Next-Generation Security", "bar", ["ngs_arr"]), ch("rpo", "Remaining performance obligations", "Obligaciones de desempeño pendientes", "bar", ["rpo"]), fcfChart()],
  },
  CRWD: {
    from: "2023-01-01",
    kpis: [guide(), usd("arr", "Ending ARR", "ARR al cierre", "Ending annual recurring revenue (ARR) at quarter end", [0, 200000], "stock"), usd("net_new_arr", "Net new ARR", "ARR neto nuevo", "Net new ARR added in the quarter", [-10000, 50000]), lvl("sub_gm_nongaap", "Non-GAAP subscription gross margin", "Margen bruto de suscripción no GAAP", "Non-GAAP subscription gross margin of the quarter", [0, 100]), fcf()],
    charts: [guideChart(), ch("arr", "Ending ARR", "ARR al cierre", "bar", ["arr"]), ch("nnarr", "Net new ARR", "ARR neto nuevo", "bar", ["net_new_arr"]), ch("gm", "Non-GAAP subscription gross margin", "Margen bruto de suscripción no GAAP", "line", ["sub_gm_nongaap"]), fcfChart()],
  },
  IBM: {
    from: "2023-01-01",
    kpis: [usd("adj_ebitda", "Adjusted EBITDA", "EBITDA ajustado", "Adjusted EBITDA for the quarter", [0, 100000]), lvl("adj_ebitda_margin", "Adjusted EBITDA margin", "Margen EBITDA ajustado", "Adjusted EBITDA margin of the quarter", [0, 80]), usd("genai_book", "Generative AI book of business", "Cartera de IA generativa", "Generative AI book of business (inception to date) as stated, only if given", [0, 200000], "stock"), fcf()],
    charts: [ch("ebitda", "Adjusted EBITDA and margin", "EBITDA ajustado", "bar", ["adj_ebitda"]), ch("ebitdam", "Adjusted EBITDA margin", "Margen EBITDA ajustado", "line", ["adj_ebitda_margin"]), ch("genai", "Generative AI book of business", "Cartera de IA generativa", "bar", ["genai_book"]), fcfChart()],
  },
  ACN: {
    from: "2023-01-01",
    kpis: [guide(), usd("bookings", "New bookings", "Nuevas contrataciones", "Total new bookings in the quarter", [0, 200000]), usd("bookings_consulting", "Consulting new bookings", "Contrataciones de consultoría", "Consulting new bookings in the quarter", [0, 100000]), usd("bookings_managed", "Managed services new bookings", "Contrataciones de servicios gestionados", "Managed Services new bookings in the quarter", [0, 100000]), lvl("opm_nongaap", "Adjusted operating margin", "Margen operativo ajustado", "Adjusted (or GAAP if no adjusted figure) operating margin of the quarter", [0, 50]), fcf()],
    charts: [guideChart(), ch("book", "New bookings: consulting / managed services", "Contrataciones: consultoría / servicios gestionados", "stack", ["bookings_consulting", "bookings_managed"], { total: "bookings" }), ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_nongaap"]), fcfChart()],
  },
  // ------------------------------------------------------------ bancos y brókeres
  BAC: bank({ loans: [500000, 3000000], deposits: [1000000, 4000000] }),
  WFC: bank({ loans: [500000, 2500000], deposits: [800000, 3000000] }),
  C: bank({ loans: [300000, 1500000], deposits: [800000, 3000000] }),
  COF: bank({
    loans: [150000, 1000000],
    deposits: [150000, 1000000],
    extra: [usd("card_loans", "Credit card average loans", "Préstamos medios de tarjetas", "Credit Card segment average loans in the quarter", [50000, 600000], "avg")],
    extraCharts: [ch("card", "Credit card average loans", "Préstamos medios de tarjetas", "bar", ["card_loans"])],
  }),
  GS: {
    from: "2023-01-01",
    kpis: [lvl("roe", "Return on equity (annualized)", "Rentabilidad sobre el patrimonio (ROE)", "Annualized return on average common shareholders' equity (ROE) for the quarter", [-30, 60]), dol("bvps", "Book value per share", "Valor contable por acción", "Book value per common share at quarter end", [50, 2000]), usd("aus", "Assets under supervision", "Activos bajo supervisión", "Total assets under supervision (AUS) at quarter end, even if rounded (e.g. '$3.5 trillion' -> 3500000)", [500000, 10000000], "stock"), lvl("efficiency", "Efficiency ratio", "Ratio de eficiencia", "Efficiency ratio of the quarter (omit if only year-to-date)", [20, 120]), lvl("cet1", "CET1 ratio", "Ratio CET1", "Standardized Common Equity Tier 1 capital ratio at quarter end", [4, 30], "stock")],
    charts: [ch("roe", "Return on equity", "ROE", "line", ["roe"]), ch("bv", "Book value per share", "Valor contable por acción", "line", ["bvps"]), ch("aus", "Assets under supervision", "Activos bajo supervisión", "bar", ["aus"]), ch("eff", "Efficiency ratio and CET1", "Eficiencia y CET1", "line", ["efficiency", "cet1"])],
  },
  MS: {
    from: "2023-01-01",
    kpis: [lvl("rotce", "ROTCE", "ROTCE", "Return on average tangible common equity (ROTCE) for the quarter", [-30, 80]), lvl("efficiency", "Expense efficiency ratio", "Ratio de eficiencia", "Firm expense efficiency ratio of the quarter", [30, 120]), dol("tbvps", "Tangible book value per share", "Valor contable tangible por acción", "Tangible book value per common share at quarter end", [10, 500]), usd("wm_nna", "Wealth Management net new assets", "Activos netos nuevos (Wealth Management)", "Wealth Management net new assets in the quarter, even if given in billions (e.g. '$81 billion' -> 81000)", [-200000, 500000]), usd("wm_client_assets", "Wealth Management client assets", "Activos de clientes (Wealth Management)", "Wealth Management total client assets at quarter end, even if in billions or trillions", [500000, 20000000], "stock"), usd("im_aum", "Investment Management AUM", "Activos gestionados (Investment Management)", "Investment Management assets under management or supervision (AUM) at quarter end", [100000, 5000000], "stock")],
    charts: [ch("ret", "ROTCE and efficiency ratio", "ROTCE y ratio de eficiencia", "line", ["rotce", "efficiency"]), ch("tbv", "Tangible book value per share", "Valor contable tangible por acción", "line", ["tbvps"]), ch("nna", "Wealth Management net new assets", "Activos netos nuevos (Wealth Management)", "bar", ["wm_nna"]), ch("assets", "Client assets and AUM", "Activos de clientes y gestionados", "line", ["wm_client_assets", "im_aum"])],
  },
  SCHW: {
    from: "2023-01-01",
    kpis: [usd("core_nna", "Core net new assets", "Activos netos nuevos (core)", "Core net new assets in the quarter, even if in billions (e.g. '$190.4 billion' -> 190400)", [-200000, 1000000]), usd("client_assets", "Total client assets", "Activos totales de clientes", "Total client assets at quarter end, even if in trillions (e.g. '$11.6 trillion' -> 11600000)", [1000000, 30000000], "stock"), mil("new_accounts", "New brokerage accounts", "Nuevas cuentas de corretaje", "New brokerage accounts opened in the quarter", [0.1, 10], "flow"), mil("active_accounts", "Active brokerage accounts", "Cuentas de corretaje activas", "Active brokerage accounts at quarter end", [10, 100]), lvl("nim", "Net interest margin", "Margen de interés neto", "Net interest margin of the quarter", [0.5, 6]), mil("dats", "Daily average trades", "Operaciones diarias medias", "Daily average trading volume in the quarter", [1, 50], "avg")],
    charts: [ch("nna", "Core net new assets", "Activos netos nuevos", "bar", ["core_nna"]), ch("ca", "Total client assets", "Activos totales de clientes", "bar", ["client_assets"]), ch("acc", "Brokerage accounts: active / new", "Cuentas de corretaje: activas / nuevas", "line", ["active_accounts", "new_accounts"]), ch("nim", "Net interest margin", "Margen de interés neto", "line", ["nim"]), ch("dats", "Daily average trades", "Operaciones diarias medias", "bar", ["dats"])],
  },
  AXP: {
    from: "2023-01-01",
    kpis: [usd("billed_business", "Billed business", "Volumen facturado", "Worldwide billed business (card member spending) in the quarter, even if in billions", [50000, 2000000]), gr("billed_growth", "Billed business growth (FX-adjusted)", "Crecimiento del volumen facturado", "Billed business growth, FX-adjusted if both are given"), usd("cm_loans", "Card Member loans", "Préstamos a titulares", "Total Card Member loans at quarter end", [20000, 500000], "stock"), mil("cards_proprietary", "Proprietary cards-in-force", "Tarjetas propias en circulación", "Total proprietary cards-in-force at quarter end", [10, 300]), lvl("write_off", "Net write-off rate (principal only)", "Tasa de fallidos netos", "Card Member loans net write-off rate, principal losses only, consumer and small business", [0, 15])],
    charts: [ch("bb", "Billed business", "Volumen facturado", "bar", ["billed_business"]), ch("bbg", "Billed business growth", "Crecimiento del volumen facturado", "line", ["billed_growth"]), ch("loans", "Card Member loans", "Préstamos a titulares", "bar", ["cm_loans"]), ch("cards", "Proprietary cards-in-force", "Tarjetas propias", "line", ["cards_proprietary"]), ch("wo", "Net write-off rate", "Tasa de fallidos", "line", ["write_off"])],
  },
  IBKR: {
    from: "2023-01-01",
    kpis: [mil("accounts", "Customer accounts", "Cuentas de clientes", "Customer accounts at quarter end (e.g. '5.58 million' -> 5.58)", [0.5, 50]), mil("darts", "Daily average revenue trades (DARTs)", "Operaciones diarias con ingresos (DARTs)", "Total customer DARTs in the quarter (e.g. '3,550 thousand' -> 3.55)", [0.2, 50], "avg"), usd("customer_equity", "Customer equity", "Patrimonio de clientes", "Customer equity at quarter end, even if in billions", [50000, 5000000], "stock"), usd("margin_loans", "Customer margin loans", "Préstamos de margen a clientes", "Customer margin loans at quarter end, even if in billions", [5000, 1000000], "stock"), lvl("pretax_margin", "Pretax profit margin", "Margen antes de impuestos", "Reported (or adjusted if only that) pretax profit margin of the quarter", [0, 100])],
    charts: [ch("acc", "Customer accounts", "Cuentas de clientes", "bar", ["accounts"]), ch("darts", "DARTs", "DARTs", "bar", ["darts"]), ch("eq", "Customer equity and margin loans", "Patrimonio de clientes y préstamos de margen", "line", ["customer_equity", "margin_loans"]), ch("pm", "Pretax profit margin", "Margen antes de impuestos", "line", ["pretax_margin"])],
  },
  // ------------------------------------------------------------ gestoras, seguros, datos y servicios
  BLK: {
    from: "2023-01-01",
    kpis: [usd("aum", "Assets under management", "Activos gestionados", "Total AUM at quarter end, even if in trillions (e.g. '$15.5 trillion' -> 15500000)", [3000000, 40000000], "stock"), usd("net_inflows", "Long-term net inflows", "Entradas netas", "Total net inflows in the quarter, even if in billions (e.g. '$205 billion' -> 205000)", [-500000, 1000000]), lvl("organic_fee_growth", "Organic base fee growth (annualized)", "Crecimiento orgánico de comisiones base", "Annualized organic base fee growth in the quarter", [-30, 50]), lvl("opm_adj", "Operating margin, as adjusted", "Margen operativo ajustado", "Operating margin, as adjusted, of the quarter", [0, 80])],
    charts: [ch("aum", "Assets under management", "Activos gestionados", "bar", ["aum"]), ch("flows", "Net inflows", "Entradas netas", "bar", ["net_inflows"]), ch("fee", "Organic base fee growth", "Crecimiento orgánico de comisiones", "line", ["organic_fee_growth"]), ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_adj"])],
  },
  BX: {
    from: "2023-01-01",
    kpis: [usd("aum", "Total AUM", "Activos gestionados", "Total assets under management at quarter end, even if in billions (e.g. '$1,368.3 billion' -> 1368300)", [500000, 5000000], "stock"), usd("fee_aum", "Fee-earning AUM", "Activos que generan comisiones", "Fee-earning AUM at quarter end", [300000, 4000000], "stock"), usd("inflows", "Inflows", "Entradas", "Total inflows in the quarter", [0, 500000]), usd("de", "Distributable earnings", "Beneficio distribuible", "Total segment distributable earnings in the quarter", [0, 20000]), usd("fre", "Fee-related earnings", "Beneficio de comisiones (FRE)", "Fee-related earnings in the quarter", [0, 20000])],
    charts: [ch("aum", "Total and fee-earning AUM", "Activos gestionados", "line", ["aum", "fee_aum"]), ch("in", "Inflows", "Entradas", "bar", ["inflows"]), ch("earn", "Distributable and fee-related earnings", "Beneficio distribuible y de comisiones", "line", ["de", "fre"])],
  },
  CB: {
    from: "2023-01-01",
    kpis: [lvl("combined_ratio", "P&C combined ratio", "Ratio combinado (P&C)", "Property and casualty combined ratio of the quarter (as reported, including catastrophe losses)", [50, 150]), lvl("combined_ratio_cay", "P&C current accident year combined ratio ex-CAT", "Ratio combinado año en curso sin catástrofes", "P&C current accident year combined ratio excluding catastrophe losses", [50, 130]), gr("npw_growth", "P&C net premiums written growth", "Crecimiento de primas netas emitidas (P&C)", "P&C net premiums written growth (constant dollars if both are given)"), usd("core_oi", "Core operating income", "Beneficio operativo core", "Core operating income in the quarter", [-5000, 20000]), dol("tbvps", "Tangible book value per share", "Valor contable tangible por acción", "Tangible book value per share at quarter end", [20, 1000])],
    charts: [ch("cr", "Combined ratio (reported / current accident year ex-CAT)", "Ratio combinado (publicado / año en curso sin catástrofes)", "line", ["combined_ratio", "combined_ratio_cay"]), ch("npw", "Net premiums written growth", "Crecimiento de primas", "line", ["npw_growth"]), ch("coi", "Core operating income", "Beneficio operativo core", "bar", ["core_oi"]), ch("tbv", "Tangible book value per share", "Valor contable tangible por acción", "line", ["tbvps"])],
  },
  PGR: {
    from: "2023-01-01",
    note: { en: "Progressive also publishes monthly results; only quarterly figures are used.", es: "Progressive publica también resultados mensuales; solo se usan las cifras trimestrales." },
    kpis: [lvl("combined_ratio", "Combined ratio (quarter)", "Ratio combinado (trimestre)", "Companywide GAAP combined ratio for the QUARTER (not the single month); omit if the release only covers a month", [50, 150]), usd("npw", "Net premiums written (quarter)", "Primas netas emitidas (trimestre)", "Companywide net premiums written for the QUARTER (not the month); omit if only monthly", [1000, 100000]), mil("pif", "Policies in force", "Pólizas en vigor", "Total companywide policies in force at quarter end (e.g. '35,962.2 thousand' -> 35.9622)", [5, 200])],
    charts: [ch("cr", "Combined ratio", "Ratio combinado", "line", ["combined_ratio"]), ch("npw", "Net premiums written", "Primas netas emitidas", "bar", ["npw"]), ch("pif", "Policies in force", "Pólizas en vigor", "line", ["pif"])],
  },
  SPGI: {
    from: "2023-01-01",
    kpis: [lvl("opm_adj", "Adjusted operating margin", "Margen operativo ajustado", "Adjusted operating margin of the quarter", [0, 80]), gr("organic_growth", "Organic constant-currency revenue growth", "Crecimiento orgánico a tipo constante", "Organic constant currency revenue growth"), usd("subscription", "Subscription revenue", "Ingresos por suscripción", "Subscription revenue in the quarter, only if stated", [0, 50000])],
    charts: [ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_adj"]), ch("org", "Organic constant-currency growth", "Crecimiento orgánico", "line", ["organic_growth"]), ch("sub", "Subscription revenue", "Ingresos por suscripción", "bar", ["subscription"])],
  },
  ADP: {
    from: "2023-01-01",
    kpis: [gr("pays_per_control", "Pays per control growth", "Crecimiento de nóminas por cliente (pays per control)", "U.S. pays per control growth"), { key: "peo_wse", en: "PEO average worksite employees (thousands)", es: "Empleados medios en PEO (miles)", unit: "n", kind: "avg", range: [200, 2000], hint: "Average worksite employees paid by PEO Services in the quarter, in THOUSANDS (e.g. 'about 771,000' -> 771)" }, lvl("ebit_margin_adj", "Adjusted EBIT margin", "Margen EBIT ajustado", "Adjusted EBIT margin of the quarter", [0, 60]), usd("client_funds_interest", "Interest on client funds", "Intereses de fondos de clientes", "Interest on funds held for clients in the quarter", [0, 10000])],
    charts: [ch("ppc", "Pays per control growth", "Crecimiento de nóminas por cliente", "line", ["pays_per_control"]), ch("peo", "PEO average worksite employees (thousands)", "Empleados medios en PEO (miles)", "bar", ["peo_wse"]), ch("ebit", "Adjusted EBIT margin", "Margen EBIT ajustado", "line", ["ebit_margin_adj"]), ch("int", "Interest on client funds", "Intereses de fondos de clientes", "bar", ["client_funds_interest"])],
  },
  // ------------------------------------------------------------ salud
  JNJ: pharma(
    [["darzalex", "Darzalex", "including Darzalex Faspro"], ["tremfya", "Tremfya", ""], ["stelara", "Stelara", ""], ["carvykti", "Carvykti", ""], ["erleada", "Erleada", ""], ["spravato", "Spravato", ""], ["rybrevant", "Rybrevant", "including Lazcluze if combined"]],
    [{ id: "big", en: "Largest products", es: "Productos principales", keys: ["darzalex", "stelara", "tremfya"] }, { id: "new", en: "Growth products", es: "Productos en crecimiento", keys: ["carvykti", "erleada", "spravato", "rybrevant"] }]
  ),
  AMGN: pharma(
    [["repatha", "Repatha", ""], ["evenity", "EVENITY", ""], ["prolia", "Prolia", ""], ["tezspire", "TEZSPIRE", ""], ["blincyto", "BLINCYTO", ""], ["imdelltra", "IMDELLTRA", "tarlatamab"], ["enbrel", "Enbrel", ""], ["otezla", "Otezla", ""]],
    [{ id: "growth", en: "Growth products", es: "Productos en crecimiento", keys: ["repatha", "evenity", "tezspire", "blincyto", "imdelltra"] }, { id: "mature", en: "Mature products", es: "Productos maduros", keys: ["prolia", "enbrel", "otezla"] }]
  ),
  GILD: pharma(
    [["biktarvy", "Biktarvy", ""], ["descovy", "Descovy", ""], ["yeztugo", "Yeztugo", "lenacapavir for PrEP"], ["veklury", "Veklury", ""], ["trodelvy", "Trodelvy", ""], ["yescarta", "Yescarta", ""], ["livdelzi", "Livdelzi", ""]],
    [{ id: "hiv", en: "HIV: Biktarvy / Descovy / Yeztugo", es: "VIH: Biktarvy / Descovy / Yeztugo", keys: ["biktarvy", "descovy", "yeztugo"] }, { id: "other", en: "Oncology, liver and COVID", es: "Oncología, hígado y COVID", keys: ["trodelvy", "yescarta", "livdelzi", "veklury"] }]
  ),
  BMY: pharma(
    [["eliquis", "Eliquis", ""], ["opdivo", "Opdivo", "including Opdivo Qvantig"], ["reblozyl", "Reblozyl", ""], ["camzyos", "Camzyos", ""], ["breyanzi", "Breyanzi", ""], ["cobenfy", "Cobenfy", ""], ["revlimid", "Revlimid", ""], ["opdualag", "Opdualag", ""]],
    [{ id: "big", en: "Largest products", es: "Productos principales", keys: ["eliquis", "opdivo", "revlimid"] }, { id: "growth", en: "Growth portfolio", es: "Cartera de crecimiento", keys: ["reblozyl", "camzyos", "breyanzi", "cobenfy", "opdualag"] }]
  ),
  ABT: {
    from: "2023-01-01",
    kpis: [gr("organic", "Comparable (organic) sales growth", "Crecimiento comparable de ventas", "Total company comparable (organic) sales growth"), gr("devices", "Medical Devices comparable growth", "Dispositivos médicos: crecimiento comparable", "Worldwide Medical Devices comparable sales growth"), gr("diagnostics", "Diagnostics comparable growth", "Diagnóstico: crecimiento comparable", "Worldwide Diagnostics comparable sales growth"), gr("nutrition", "Nutrition comparable growth", "Nutrición: crecimiento comparable", "Worldwide Nutrition comparable sales growth"), gr("epd", "Established Pharmaceuticals comparable growth", "Farmacéuticos establecidos: crecimiento comparable", "Worldwide Established Pharmaceutical Products comparable sales growth"), usd("libre", "FreeStyle Libre sales", "Ventas de FreeStyle Libre", "Continuous Glucose Monitors / FreeStyle Libre worldwide sales in the quarter", [0, 50000])],
    charts: [ch("org", "Comparable sales growth", "Crecimiento comparable de ventas", "line", ["organic"]), ch("seg", "Comparable growth by business", "Crecimiento comparable por negocio", "line", ["devices", "diagnostics", "nutrition", "epd"]), ch("libre", "FreeStyle Libre sales", "Ventas de FreeStyle Libre", "bar", ["libre"])],
  },
  TMO: {
    from: "2023-01-01",
    kpis: [gr("organic", "Organic revenue growth", "Crecimiento orgánico", "Organic revenue growth"), lvl("opm_adj", "Adjusted operating margin", "Margen operativo ajustado", "Adjusted operating margin of the quarter", [0, 60]), fcf("Free cash flow (non-GAAP)")],
    charts: [ch("org", "Organic revenue growth", "Crecimiento orgánico", "line", ["organic"]), ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_adj"]), fcfChart()],
  },
  DHR: {
    from: "2023-01-01",
    kpis: [gr("core_growth", "Core revenue growth", "Crecimiento de ingresos core", "Non-GAAP core revenue growth for the total company"), lvl("opm_adj", "Adjusted operating margin", "Margen operativo ajustado", "Adjusted operating profit margin of the quarter, only if stated", [0, 60]), fcf("Free cash flow (non-GAAP)")],
    charts: [ch("core", "Core revenue growth", "Crecimiento core", "line", ["core_growth"]), ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_adj"]), fcfChart()],
  },
  ISRG: {
    from: "2023-01-01",
    kpis: [gr("procedures", "Worldwide procedure growth", "Crecimiento de procedimientos", "Worldwide procedures growth (da Vinci and Ion combined, or da Vinci if only that)"), gr("dv_procedures", "da Vinci procedure growth", "Crecimiento de procedimientos da Vinci", "Worldwide da Vinci procedures growth"), num("systems_placed", "da Vinci systems placed", "Sistemas da Vinci instalados", "Number of da Vinci surgical systems placed in the quarter", [50, 2000]), num("installed_base", "da Vinci installed base", "Base instalada da Vinci", "da Vinci surgical system installed base at quarter end", [3000, 30000], "stock")],
    charts: [ch("proc", "Procedure growth (total / da Vinci)", "Crecimiento de procedimientos (total / da Vinci)", "line", ["procedures", "dv_procedures"]), ch("placed", "Systems placed", "Sistemas instalados", "bar", ["systems_placed"]), ch("base", "Installed base", "Base instalada", "bar", ["installed_base"])],
  },
  MDT: {
    from: "2023-01-01",
    kpis: [gr("organic", "Organic revenue growth", "Crecimiento orgánico", "Worldwide organic revenue growth"), gr("cardio", "Cardiovascular organic growth", "Cardiovascular: crecimiento orgánico", "Cardiovascular Portfolio organic revenue growth"), gr("neuro", "Neuroscience organic growth", "Neurociencia: crecimiento orgánico", "Neuroscience Portfolio organic revenue growth"), gr("medsurg", "Medical Surgical organic growth", "Médico-quirúrgico: crecimiento orgánico", "Medical Surgical Portfolio organic revenue growth"), gr("diabetes", "Diabetes organic growth", "Diabetes: crecimiento orgánico", "Diabetes organic revenue growth")],
    charts: [ch("org", "Organic revenue growth", "Crecimiento orgánico", "line", ["organic"]), ch("port", "Organic growth by portfolio", "Crecimiento orgánico por cartera", "line", ["cardio", "neuro", "medsurg", "diabetes"])],
  },
  SYK: {
    from: "2023-01-01",
    kpis: [gr("organic", "Organic net sales growth", "Crecimiento orgánico de ventas", "Consolidated organic net sales growth"), gr("medsurg", "MedSurg and Neurotechnology organic growth", "MedSurg y Neurotecnología: crecimiento orgánico", "MedSurg and Neurotechnology organic net sales growth"), gr("ortho", "Orthopaedics organic growth", "Ortopedia: crecimiento orgánico", "Orthopaedics organic net sales growth")],
    charts: [ch("org", "Organic net sales growth", "Crecimiento orgánico", "line", ["organic", "medsurg", "ortho"])],
  },
  // ------------------------------------------------------------ consumo
  PG: {
    from: "2023-01-01",
    kpis: [gr("organic", "Organic sales growth", "Crecimiento orgánico de ventas", "Total company organic sales growth"), gr("volume", "Organic volume", "Volumen orgánico", "Total company organic volume change"), num("price", "Pricing impact (pts)", "Efecto precio (puntos)", "Total company price impact on net sales in percentage points (e.g. '+1%' -> 1)", [-20, 30], "avg"), num("mix", "Mix impact (pts)", "Efecto mix (puntos)", "Total company mix impact on net sales in percentage points", [-20, 20], "avg")],
    charts: [ch("org", "Organic sales growth", "Crecimiento orgánico", "line", ["organic"]), ch("drv", "Drivers: volume, price and mix", "Palancas: volumen, precio y mix", "line", ["volume", "price", "mix"])],
  },
  PEP: {
    from: "2023-01-01",
    kpis: [gr("organic", "Organic revenue growth", "Crecimiento orgánico de ingresos", "Total company organic revenue growth"), num("pricing", "Effective net pricing (pts)", "Precio neto efectivo (puntos)", "Total company effective net pricing impact in percentage points", [-20, 40], "avg"), gr("food_volume", "Convenient foods organic volume", "Volumen orgánico de alimentación", "Convenient foods organic volume change, total company"), gr("bev_volume", "Beverages organic volume", "Volumen orgánico de bebidas", "Beverages organic volume change, total company")],
    charts: [ch("org", "Organic revenue growth and pricing", "Crecimiento orgánico y precio", "line", ["organic", "pricing"]), ch("vol", "Organic volume: foods / beverages", "Volumen orgánico: alimentación / bebidas", "line", ["food_volume", "bev_volume"])],
  },
  PM: {
    from: "2023-01-01",
    kpis: [gr("organic", "Organic net revenue growth", "Crecimiento orgánico de ingresos", "Total net revenues growth excluding currency and acquisitions (organic)"), { key: "total_volume", en: "Total shipment volume (bn units)", es: "Volumen total enviado (miles de millones de unidades)", unit: "n", kind: "flow", range: [50, 300], hint: "Total shipment volume (cigarettes + heated tobacco units + oral) in the quarter, in BILLIONS of units/equivalents" }, { key: "htu_volume", en: "Heated tobacco unit shipments (bn)", es: "Unidades de tabaco calentado enviadas (miles de millones)", unit: "n", kind: "flow", range: [5, 100], hint: "Heated tobacco unit (HTU) shipment volume in the quarter, in BILLIONS of units" }, lvl("smokefree_share", "Smoke-free share of net revenues", "Peso del negocio sin humo en ingresos", "Smoke-free products as % of total net revenues in the quarter", [0, 100]), num("zyn_cans", "ZYN shipments in the U.S. (m cans)", "Envíos de ZYN en EE. UU. (millones de latas)", "ZYN nicotine pouch shipment volume in the United States in the quarter, in millions of cans", [10, 2000])],
    charts: [ch("org", "Organic net revenue growth", "Crecimiento orgánico", "line", ["organic"]), ch("vol", "Shipment volume: total / heated tobacco", "Volumen: total / tabaco calentado", "line", ["total_volume", "htu_volume"]), ch("sf", "Smoke-free share of net revenues", "Peso del negocio sin humo", "line", ["smokefree_share"]), ch("zyn", "ZYN U.S. shipments", "Envíos de ZYN en EE. UU.", "bar", ["zyn_cans"])],
  },
  MO: {
    from: "2023-01-01",
    kpis: [gr("cig_volume", "Domestic cigarette shipment volume", "Volumen de cigarrillos enviado (EE. UU.)", "Smokeable products segment reported domestic cigarette shipment volume change"), gr("cig_volume_adj", "Cigarette volume adjusted for trade inventory", "Volumen de cigarrillos ajustado por inventario", "Domestic cigarette shipment volume change when adjusted for trade inventory movements and other factors"), gr("cigar_volume", "Cigar shipment volume", "Volumen de puros enviado", "Reported cigar shipment volume change"), lvl("marlboro_share", "Marlboro retail share", "Cuota de Marlboro", "Marlboro retail share of the total cigarette category in the quarter", [20, 60]), num("on_cans", "on! oral nicotine shipments (m cans)", "Envíos de on! (millones de latas)", "on! nicotine pouch shipment volume in the quarter, in millions of cans, only if stated", [1, 1000])],
    charts: [ch("vol", "Cigarette shipment volume (reported / adjusted)", "Volumen de cigarrillos (publicado / ajustado)", "line", ["cig_volume", "cig_volume_adj"]), ch("cigar", "Cigar shipment volume", "Volumen de puros", "line", ["cigar_volume"]), ch("share", "Marlboro retail share", "Cuota de Marlboro", "line", ["marlboro_share"]), ch("on", "on! shipments", "Envíos de on!", "bar", ["on_cans"])],
  },
  MCD: {
    from: "2023-01-01",
    kpis: [gr("comp_global", "Global comparable sales", "Ventas comparables globales", "Global comparable sales change"), gr("comp_us", "U.S. comparable sales", "Ventas comparables EE. UU.", "U.S. comparable sales change"), gr("comp_iom", "International Operated Markets comparable sales", "Ventas comparables mercados operados internacionales", "International Operated Markets segment comparable sales change"), gr("comp_idl", "International Developmental Licensed comparable sales", "Ventas comparables mercados con licencia", "International Developmental Licensed Markets & Corporate segment comparable sales change"), gr("systemwide", "Systemwide sales growth (constant currency)", "Crecimiento de ventas de todo el sistema", "Global systemwide sales growth in constant currencies")],
    charts: [ch("comp", "Comparable sales by segment", "Ventas comparables por segmento", "line", ["comp_global", "comp_us", "comp_iom", "comp_idl"]), ch("sys", "Systemwide sales growth", "Crecimiento de ventas del sistema", "line", ["systemwide"])],
  },
  TJX: {
    from: "2023-01-01",
    kpis: [gr("comp", "Consolidated comparable sales", "Ventas comparables consolidadas", "Consolidated comparable store sales change"), gr("comp_marmaxx", "Marmaxx comparable sales", "Ventas comparables Marmaxx", "Marmaxx (U.S.) comparable sales change"), gr("comp_homegoods", "HomeGoods comparable sales", "Ventas comparables HomeGoods", "HomeGoods (U.S.) comparable sales change"), gr("comp_canada", "TJX Canada comparable sales", "Ventas comparables TJX Canadá", "TJX Canada comparable sales change"), gr("comp_intl", "TJX International comparable sales", "Ventas comparables TJX Internacional", "TJX International (Europe & Australia) comparable sales change"), num("stores", "Stores", "Tiendas", "Total number of stores at quarter end", [3000, 8000], "stock")],
    charts: [ch("comp", "Comparable sales by division", "Ventas comparables por división", "line", ["comp", "comp_marmaxx", "comp_homegoods", "comp_canada", "comp_intl"]), ch("stores", "Stores", "Tiendas", "bar", ["stores"])],
  },
  LOW: {
    from: "2023-01-01",
    kpis: [gr("comp_sales", "Comparable sales", "Ventas comparables", "Comparable sales change for the quarter"), gr("comp_transactions", "Comparable customer transactions", "Transacciones comparables", "Comparable customer transactions change, only if stated"), gr("comp_ticket", "Comparable average ticket", "Ticket medio comparable", "Comparable average ticket change, only if stated"), num("stores", "Stores", "Tiendas", "Number of stores operated at quarter end", [1500, 2500], "stock"), dol("sales_sqft", "Sales per square foot", "Ventas por pie cuadrado", "Sales per square foot (trailing as reported)", [100, 1000])],
    charts: [ch("comp", "Comparable sales, transactions and ticket", "Ventas comparables, transacciones y ticket", "line", ["comp_sales", "comp_transactions", "comp_ticket"]), ch("stores", "Stores", "Tiendas", "bar", ["stores"]), ch("sqft", "Sales per square foot", "Ventas por pie cuadrado", "line", ["sales_sqft"])],
  },
  // ------------------------------------------------------------ telecomunicaciones
  VZ: {
    from: "2023-01-01",
    kpis: [num("phone_net_adds", "Postpaid phone net additions (thousands)", "Altas netas de móviles de contrato (miles)", "Consumer + Business (total) postpaid phone net additions in the quarter, in THOUSANDS (e.g. '406,000' -> 406; losses negative)", [-2000, 3000]), lvl("phone_churn", "Postpaid phone churn", "Bajas de móviles de contrato", "Total (or Consumer if only that) postpaid phone churn rate in the quarter", [0, 5]), num("broadband_net_adds", "Broadband net additions (thousands)", "Altas netas de banda ancha (miles)", "Total broadband net additions in the quarter, in THOUSANDS", [-1000, 2000]), num("fwa_net_adds", "Fixed wireless access net additions (thousands)", "Altas netas de acceso inalámbrico fijo (miles)", "Fixed wireless access net additions in the quarter, in THOUSANDS", [-500, 2000]), lvl("ebitda_margin", "Adjusted EBITDA margin", "Margen EBITDA ajustado", "Consolidated adjusted EBITDA margin of the quarter", [10, 70])],
    charts: [ch("phone", "Postpaid phone net additions", "Altas netas de móviles de contrato", "bar", ["phone_net_adds"]), ch("churn", "Postpaid phone churn", "Bajas de móviles de contrato", "line", ["phone_churn"]), ch("bb", "Broadband net additions (total / FWA)", "Altas netas de banda ancha (total / inalámbrica fija)", "line", ["broadband_net_adds", "fwa_net_adds"]), ch("ebitda", "Adjusted EBITDA margin", "Margen EBITDA ajustado", "line", ["ebitda_margin"])],
  },
  TMUS: {
    from: "2023-01-01",
    kpis: [num("account_net_adds", "Postpaid net account additions (thousands)", "Altas netas de cuentas de contrato (miles)", "Postpaid net account additions in the quarter, in THOUSANDS", [-500, 2000]), num("phone_net_adds", "Postpaid phone net additions (thousands)", "Altas netas de móviles de contrato (miles)", "Postpaid phone net customer additions in the quarter, in THOUSANDS, only if stated", [-1000, 3000]), lvl("phone_churn", "Postpaid phone churn", "Bajas de móviles de contrato", "Postpaid phone churn in the quarter", [0, 5]), num("broadband_net_adds", "High speed internet net additions (thousands)", "Altas netas de internet de alta velocidad (miles)", "High Speed Internet (5G broadband + fiber) net customer additions in the quarter, in THOUSANDS", [-500, 2000]), usd("core_ebitda", "Core adjusted EBITDA", "EBITDA ajustado core", "Core Adjusted EBITDA in the quarter", [1000, 50000]), fcf("Adjusted free cash flow")],
    charts: [ch("acc", "Postpaid net additions (accounts / phones)", "Altas netas de contrato (cuentas / móviles)", "line", ["account_net_adds", "phone_net_adds"]), ch("churn", "Postpaid phone churn", "Bajas de móviles de contrato", "line", ["phone_churn"]), ch("bb", "High speed internet net additions", "Altas netas de internet", "bar", ["broadband_net_adds"]), ch("ebitda", "Core adjusted EBITDA", "EBITDA ajustado core", "bar", ["core_ebitda"]), fcfChart()],
  },
  T: {
    from: "2023-01-01",
    kpis: [num("phone_net_adds", "Postpaid phone net additions (thousands)", "Altas netas de móviles de contrato (miles)", "Mobility postpaid phone net adds in the quarter, in THOUSANDS", [-1000, 3000]), lvl("phone_churn", "Postpaid phone churn", "Bajas de móviles de contrato", "Mobility postpaid phone churn in the quarter", [0, 5]), num("fiber_net_adds", "AT&T Fiber net additions (thousands)", "Altas netas de fibra (miles)", "AT&T Fiber net adds in the quarter, in THOUSANDS", [-200, 2000]), num("internet_air_net_adds", "AT&T Internet Air net additions (thousands)", "Altas netas de Internet Air (miles)", "AT&T Internet Air (fixed wireless) net adds in the quarter, in THOUSANDS, only if stated", [-200, 2000]), dol("arpu", "Postpaid phone ARPU", "ARPU de móviles de contrato", "Mobility postpaid phone ARPU in the quarter", [20, 100], "avg"), fcf()],
    charts: [ch("phone", "Postpaid phone net additions", "Altas netas de móviles de contrato", "bar", ["phone_net_adds"]), ch("churn", "Postpaid phone churn", "Bajas de móviles de contrato", "line", ["phone_churn"]), ch("fiber", "Fiber and Internet Air net additions", "Altas netas de fibra e Internet Air", "line", ["fiber_net_adds", "internet_air_net_adds"]), ch("arpu", "Postpaid phone ARPU", "ARPU de móviles de contrato", "line", ["arpu"]), fcfChart()],
  },
  // ------------------------------------------------------------ industria y defensa
  GE: {
    from: "2023-01-01",
    kpis: [usd("orders", "Total orders", "Pedidos totales", "GE Aerospace total orders in the quarter", [1000, 200000]), num("leap_deliveries", "LEAP engine deliveries", "Entregas de motores LEAP", "LEAP engine deliveries in the quarter (units), only if stated", [50, 3000]), lvl("opm_adj", "Adjusted operating profit margin", "Margen operativo ajustado", "Adjusted (total company) operating profit margin of the quarter", [0, 50]), fcf()],
    charts: [ch("orders", "Orders", "Pedidos", "bar", ["orders"]), ch("leap", "LEAP engine deliveries", "Entregas de motores LEAP", "bar", ["leap_deliveries"]), ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_adj"]), fcfChart()],
  },
  CAT: {
    from: "2023-01-01",
    kpis: [usd("backlog", "Backlog", "Cartera de pedidos", "Order backlog at quarter end, even if in billions (e.g. '$39.9 billion' -> 39900)", [5000, 300000], "stock"), lvl("opm_adj", "Adjusted operating profit margin", "Margen operativo ajustado", "Adjusted operating profit margin of the quarter", [0, 50]), fcf("ME&T free cash flow")],
    charts: [ch("backlog", "Backlog", "Cartera de pedidos", "bar", ["backlog"]), ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_adj"]), fcfChart()],
  },
  RTX: {
    from: "2023-01-01",
    kpis: [usd("backlog", "Total backlog", "Cartera de pedidos total", "Company backlog at quarter end, even if in billions", [50000, 1000000], "stock"), usd("backlog_commercial", "Commercial backlog", "Cartera comercial", "Commercial backlog at quarter end", [20000, 800000], "stock"), usd("backlog_defense", "Defense backlog", "Cartera de defensa", "Defense backlog at quarter end", [20000, 800000], "stock"), gr("organic", "Organic sales growth", "Crecimiento orgánico de ventas", "Organic sales growth"), fcf()],
    charts: [ch("backlog", "Backlog: commercial / defense", "Cartera: comercial / defensa", "stack", ["backlog_commercial", "backlog_defense"], { total: "backlog" }), ch("org", "Organic sales growth", "Crecimiento orgánico", "line", ["organic"]), fcfChart()],
  },
  GEV: {
    from: "2023-01-01",
    kpis: [usd("orders", "Orders", "Pedidos", "Total orders in the quarter, even if in billions", [1000, 200000]), usd("backlog", "Backlog (RPO)", "Cartera de pedidos (RPO)", "Total backlog / remaining performance obligation at quarter end, even if in billions", [10000, 1000000], "stock"), { key: "gas_gw", en: "Gas Power backlog and slot reservations (GW)", es: "Cartera y reservas de turbinas de gas (GW)", unit: "n", kind: "stock", range: [5, 500], hint: "Gas Power equipment backlog plus slot reservation agreements at quarter end, in gigawatts (GW)" }, lvl("ebitda_margin", "Adjusted EBITDA margin", "Margen EBITDA ajustado", "Adjusted EBITDA margin of the quarter", [-30, 50]), fcf()],
    charts: [ch("orders", "Orders", "Pedidos", "bar", ["orders"]), ch("backlog", "Backlog", "Cartera de pedidos", "bar", ["backlog"]), ch("gw", "Gas Power backlog and slot reservations (GW)", "Cartera y reservas de gas (GW)", "bar", ["gas_gw"]), ch("ebitda", "Adjusted EBITDA margin", "Margen EBITDA ajustado", "line", ["ebitda_margin"]), fcfChart()],
  },
  LMT: {
    from: "2023-01-01",
    kpis: [usd("backlog", "Backlog", "Cartera de pedidos", "Total backlog at quarter end, even if in billions (e.g. '$292.0 billion' -> 292000)", [50000, 1000000], "stock"), usd("segment_op", "Business segment operating profit", "Beneficio operativo de los segmentos", "Total business segment operating profit in the quarter", [-5000, 20000]), fcf()],
    charts: [ch("backlog", "Backlog", "Cartera de pedidos", "bar", ["backlog"]), ch("op", "Business segment operating profit", "Beneficio operativo de los segmentos", "bar", ["segment_op"]), fcfChart()],
  },
  BA: {
    from: "2023-01-01",
    kpis: [num("deliveries", "Commercial airplane deliveries", "Entregas de aviones comerciales", "Commercial Airplanes deliveries in the quarter (units)", [10, 400]), usd("backlog", "Total company backlog", "Cartera de pedidos total", "Total company backlog at quarter end, even if in billions", [100000, 2000000], "stock"), num("bca_backlog_units", "Commercial airplane backlog (airplanes)", "Cartera de aviones comerciales (unidades)", "Commercial Airplanes backlog in number of airplanes, only if stated", [1000, 10000], "stock"), lvl("bca_margin", "Commercial Airplanes operating margin", "Margen operativo de aviones comerciales", "Commercial Airplanes operating margin of the quarter", [-200, 50]), fcf("Free cash flow (non-GAAP)")],
    charts: [ch("del", "Commercial airplane deliveries", "Entregas de aviones comerciales", "bar", ["deliveries"]), ch("backlog", "Total backlog", "Cartera de pedidos", "bar", ["backlog"]), ch("units", "Commercial airplane backlog (airplanes)", "Cartera de aviones (unidades)", "line", ["bca_backlog_units"]), ch("bca", "Commercial Airplanes operating margin", "Margen de aviones comerciales", "line", ["bca_margin"]), fcfChart()],
  },
  ETN: {
    from: "2023-01-01",
    kpis: [gr("organic", "Organic sales growth", "Crecimiento orgánico de ventas", "Organic sales growth"), lvl("segment_margin", "Segment margin", "Margen de los segmentos", "Total segment margins of the quarter", [0, 50]), gr("backlog_electrical", "Electrical backlog growth", "Crecimiento de la cartera eléctrica", "Electrical (total) backlog growth year over year, only if stated", [-60, 300]), gr("backlog_aero", "Aerospace backlog growth", "Crecimiento de la cartera aeroespacial", "Aerospace backlog growth year over year, only if stated", [-60, 300])],
    charts: [ch("org", "Organic sales growth", "Crecimiento orgánico", "line", ["organic"]), ch("sm", "Segment margin", "Margen de los segmentos", "line", ["segment_margin"]), ch("bl", "Backlog growth: Electrical / Aerospace", "Crecimiento de la cartera: eléctrica / aeroespacial", "line", ["backlog_electrical", "backlog_aero"])],
  },
  PH: {
    from: "2023-01-01",
    kpis: [gr("organic", "Organic sales growth", "Crecimiento orgánico de ventas", "Organic sales growth (total company)"), lvl("segment_margin_adj", "Adjusted segment operating margin", "Margen operativo ajustado de los segmentos", "Adjusted segment operating margin of the quarter", [0, 50]), gr("orders", "Orders growth", "Crecimiento de pedidos", "Total company orders growth (percent change), only if stated", [-60, 200]), fcf("Free cash flow")],
    charts: [ch("org", "Organic sales growth and orders", "Crecimiento orgánico y pedidos", "line", ["organic", "orders"]), ch("sm", "Adjusted segment operating margin", "Margen ajustado de los segmentos", "line", ["segment_margin_adj"]), fcfChart()],
  },
  DE: {
    from: "2023-01-01",
    kpis: [lvl("ppa_margin", "Production & Precision Ag operating margin", "Margen operativo de agricultura de producción y precisión", "Production & Precision Agriculture operating margin of the quarter", [-30, 50]), lvl("sat_margin", "Small Ag & Turf operating margin", "Margen operativo de agricultura pequeña y césped", "Small Agriculture & Turf operating margin of the quarter", [-30, 50]), lvl("cf_margin", "Construction & Forestry operating margin", "Margen operativo de construcción y forestal", "Construction & Forestry operating margin of the quarter", [-30, 50]), usd("equipment_sales", "Equipment operations net sales", "Ventas netas de equipos", "Equipment operations net sales in the quarter", [1000, 100000])],
    charts: [ch("margins", "Operating margin by segment", "Margen operativo por segmento", "line", ["ppa_margin", "sat_margin", "cf_margin"]), ch("sales", "Equipment operations net sales", "Ventas netas de equipos", "bar", ["equipment_sales"])],
  },
  UNP: {
    from: "2023-01-01",
    kpis: [lvl("operating_ratio", "Operating ratio", "Ratio operativo", "Operating ratio of the quarter (adjusted if that is the headline; lower is better)", [40, 90]), mil("carloads", "Business volumes (carloads)", "Volumen (vagones)", "Total business volumes (carloads) in the quarter (e.g. '2,082 thousand' -> 2.082)", [1, 5], "flow"), dol("rev_per_car", "Average revenue per car", "Ingreso medio por vagón", "Average revenue per car in the quarter", [1000, 6000], "avg"), fcf()],
    charts: [ch("or", "Operating ratio", "Ratio operativo", "line", ["operating_ratio"]), ch("vol", "Carloads", "Vagones", "bar", ["carloads"]), ch("arpc", "Average revenue per car", "Ingreso medio por vagón", "line", ["rev_per_car"]), fcfChart()],
  },
  LIN: {
    from: "2023-01-01",
    kpis: [usd("backlog", "Project backlog", "Cartera de proyectos", "Sale-of-gas project backlog at quarter end, even if in billions", [1000, 50000], "stock"), lvl("opm_adj", "Adjusted operating margin", "Margen operativo ajustado", "Adjusted operating profit margin of the quarter", [0, 50]), usd("ocf", "Operating cash flow", "Flujo de caja operativo", "Operating cash flow in the quarter", [0, 20000])],
    charts: [ch("bl", "Project backlog", "Cartera de proyectos", "bar", ["backlog"]), ch("opm", "Adjusted operating margin", "Margen operativo ajustado", "line", ["opm_adj"]), ch("ocf", "Operating cash flow", "Flujo de caja operativo", "bar", ["ocf"])],
  },
  // ------------------------------------------------------------ energía, utilities e inmobiliario
  NEE: {
    from: "2023-01-01",
    kpis: [{ key: "origination_gw", en: "New renewables & storage origination (GW)", es: "Nuevos contratos renovables y almacenamiento (GW)", unit: "n", kind: "flow", range: [0.1, 30], hint: "Gigawatts (GW) of new renewables and storage projects added to the backlog (origination) by NextEra Energy Resources in the quarter" }, { key: "backlog_gw", en: "Renewables & storage backlog (GW)", es: "Cartera renovable y de almacenamiento (GW)", unit: "n", kind: "stock", range: [5, 200], hint: "NextEra Energy Resources renewables and storage backlog in gigawatts (GW) at quarter end, only if stated" }, gr("fpl_capital", "FPL regulatory capital employed growth", "Crecimiento del capital regulado de FPL", "FPL regulatory capital employed growth year over year", [-20, 50])],
    charts: [ch("orig", "New origination (GW)", "Nuevos contratos (GW)", "bar", ["origination_gw"]), ch("bl", "Backlog (GW)", "Cartera (GW)", "line", ["backlog_gw"]), ch("fpl", "FPL regulatory capital growth", "Crecimiento del capital regulado de FPL", "line", ["fpl_capital"])],
  },
  WELL: {
    from: "2023-01-01",
    kpis: [gr("ssnoi", "Same store NOI growth", "Crecimiento del NOI comparable", "Total portfolio year-over-year same store NOI (SSNOI) growth"), gr("sho_ssnoi", "Seniors Housing Operating SSNOI growth", "SSNOI de residencias operadas", "Seniors Housing Operating (SHO) portfolio same store NOI growth"), dol("ffo_ps", "Normalized FFO per share", "FFO normalizado por acción", "Normalized FFO attributable to common stockholders per diluted share for the QUARTER", [0.1, 5], "flow")],
    charts: [ch("ssnoi", "Same store NOI growth (total / SHO)", "Crecimiento del NOI comparable (total / residencias)", "line", ["ssnoi", "sho_ssnoi"]), ch("ffo", "Normalized FFO per share", "FFO normalizado por acción", "bar", ["ffo_ps"])],
  },
  PLD: {
    from: "2023-01-01",
    kpis: [lvl("occupancy", "Average occupancy", "Ocupación media", "Average occupancy of the operating portfolio in the quarter", [80, 100]), lvl("rent_change", "Net effective rent change", "Variación de la renta efectiva neta", "Net effective rent change on rollover (share of Prologis) in the quarter", [-50, 150]), dol("core_ffo_ps", "Core FFO per share", "Core FFO por acción", "Core FFO per diluted share for the QUARTER", [0.2, 5], "flow"), gr("ssnoi_cash", "Cash same store NOI growth", "Crecimiento del NOI comparable en caja", "Cash same store NOI change (share of Prologis)", [-30, 50])],
    charts: [ch("occ", "Average occupancy", "Ocupación media", "line", ["occupancy"]), ch("rent", "Net effective rent change", "Variación de la renta efectiva", "line", ["rent_change"]), ch("ffo", "Core FFO per share", "Core FFO por acción", "bar", ["core_ffo_ps"]), ch("noi", "Cash same store NOI growth", "NOI comparable en caja", "line", ["ssnoi_cash"])],
  },
  CVX: {
    from: "2023-01-01",
    kpis: [{ key: "production", en: "Net oil-equivalent production", es: "Producción neta equivalente", unit: "kbd", kind: "avg", range: [1500, 6000], hint: "Worldwide net oil-equivalent production in the quarter, thousand barrels of oil-equivalent per day (MBOED)" }, { key: "us_production", en: "U.S. net oil-equivalent production", es: "Producción neta en EE. UU.", unit: "kbd", kind: "avg", range: [500, 4000], hint: "United States net oil-equivalent production, MBOED, only if stated" }, fcf("Free cash flow"), usd("cffo", "Cash flow from operations", "Flujo de caja operativo", "Cash flow from operations (CFFO) in the quarter", [-10000, 100000])],
    charts: [ch("prod", "Net oil-equivalent production (total / U.S.)", "Producción equivalente (total / EE. UU.)", "line", ["production", "us_production"]), ch("cf", "Cash flow from operations and free cash flow", "Flujo de caja operativo y libre", "line", ["cffo", "fcf"])],
  },
  COP: {
    from: "2023-01-01",
    kpis: [{ key: "production", en: "Production", es: "Producción", unit: "kbd", kind: "avg", range: [1000, 5000], hint: "Total company production in the quarter, thousand barrels of oil equivalent per day (MBOED)" }, { key: "l48_production", en: "Lower 48 production", es: "Producción Lower 48", unit: "kbd", kind: "avg", range: [300, 3000], hint: "Lower 48 production, MBOED" }, fcf()],
    charts: [ch("prod", "Production (total / Lower 48)", "Producción (total / Lower 48)", "line", ["production", "l48_production"]), fcfChart()],
  },
  MPC: {
    from: "2023-01-01",
    kpis: [{ key: "throughput", en: "Total refinery throughput", es: "Crudo procesado total", unit: "kbd", kind: "avg", range: [1000, 5000], hint: "Total refinery throughputs (crude oil + other charge and blendstocks), thousand barrels per day (mbpd)" }, lvl("utilization", "Crude capacity utilization", "Utilización de la capacidad de crudo", "Refining & Marketing crude capacity utilization of the quarter", [50, 110]), dol("rm_margin", "R&M margin per barrel", "Margen de refino por barril", "Refining & Marketing margin per barrel of total throughput in the quarter", [0, 60], "avg"), dol("refining_cost", "Refining operating costs per barrel", "Coste operativo de refino por barril", "Refining operating costs per barrel in the quarter", [1, 20], "avg"), usd("adj_ebitda", "Adjusted EBITDA", "EBITDA ajustado", "Total adjusted EBITDA in the quarter", [-5000, 50000])],
    charts: [ch("thr", "Refinery throughput", "Crudo procesado", "bar", ["throughput"]), ch("util", "Crude capacity utilization", "Utilización de capacidad", "line", ["utilization"]), ch("margin", "R&M margin and operating cost per barrel", "Margen de refino y coste por barril", "line", ["rm_margin", "refining_cost"]), ch("ebitda", "Adjusted EBITDA", "EBITDA ajustado", "bar", ["adj_ebitda"])],
  },
};

