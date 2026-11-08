// Capa 5 de la SEC: KPIs operativos propios de cada empresa (viajes y reservas de Uber, suscriptores
// y ARM de Netflix…). No están en el XBRL: salen de las tablas del comunicado de resultados (anexo
// 99.1 del 8-K con Item 2.02), que Claude lee con salida JSON por esquema.
//
// - Cada empresa tiene su lista de KPIs (KPI_DEFS) con unidad y rango plausible.
// - De cada comunicado se extraen todos los trimestres de sus tablas (Uber: trimestre y mismo del
//   año anterior; Netflix: cinco trimestres), así un mismo trimestre suele venir de dos comunicados.
// - Validación: los ingresos de cada trimestre que trae el comunicado deben coincidir con los de la
//   SEC (capa 1). Un trimestre que no cuadra se descarta (unidades o periodo mal leídos, o ingresos
//   rehechos después); si no cuadra la mayoría, se rechaza el comunicado entero. Un KPI fuera de su
//   rango plausible se descarta.
// - Al leer: por trimestre y KPI manda el comunicado más reciente; "confirmado" si dos coinciden.

import { cik10, fetchBudgetLeft, secFetch } from "./client";
import { askClaudeJson, SEC_MODEL, type ClaudeEnv } from "./claude";
import { fetchPressRelease } from "./earnings";
import { getSecFinancials, isBudgetError, normTicker } from "./sync";
import { SEC_UNIVERSE } from "./universe";

export interface KpiDef {
  key: string;
  en: string;
  es: string;
  // millones (personas, viajes), millones de dólares, dólares, crecimiento interanual en %, cuota en %
  // (sin signo), unidades sueltas (vehículos, estaciones), GWh, días
  unit: "M" | "$M" | "$" | "%" | "share" | "n" | "GWh" | "d" | "kbd" | "mmcfd"; // kbd: miles de barriles/día; mmcfd: millones de pies cúbicos/día
  kind: "flow" | "stock" | "avg"; // suma del trimestre, saldo al cierre, media del trimestre
  range: [number, number]; // en su unidad; fuera de él se descarta
  hint: string; // cómo lo llama el comunicado (para Claude)
}
export interface KpiChart {
  id: string;
  en: string;
  es: string;
  type: "bar" | "stack" | "line";
  keys: string[];
  // KPIs calculados: viajes por usuario al mes, cociente keys[0] ÷ keys[1] ("take_rate": comisión
  // sobre reservas, TAC sobre ingresos publicitarios…) y márgenes brutos de cada par ingresos/coste (`series`)
  // "guidance": ingresos reales de cada trimestre (keys[0]) frente a la previsión que la empresa dio
  // para él en el trimestre anterior (keys[1] de ese trimestre)
  derived?: "per_user_month" | "take_rate" | "margins" | "guidance";
  series?: { key: string; en: string; es: string; rev: string; cost: string }[];
}
export interface CompanyKpis {
  kpis: KpiDef[];
  charts: KpiChart[];
  from?: string; // comunicados presentados desde esta fecha
  until?: string; // y hasta esta (Netflix dejó de publicar suscriptores en 2025)
  minChars?: number; // comunicados más cortos se saltan sin llamar a Claude (avisos de entregas de Tesla)
  revenueHint?: string; // qué cifra de ingresos usar para validar, si el comunicado trae varias (ExxonMobil)
  anchor?: "revenue" | "net_income"; // cifra para validar (Berkshire no da ingresos: beneficio neto)
  note?: { en: string; es: string };
}

export const KPI_DEFS: Record<string, CompanyKpis> = {
  UBER: {
    from: "2022-01-01",
    kpis: [
      { key: "mapcs", en: "Monthly active platform consumers", es: "Usuarios activos mensuales", unit: "M", kind: "avg", range: [50, 1000], hint: "Monthly Active Platform Consumers (MAPCs), in millions" },
      { key: "trips", en: "Trips", es: "Viajes y pedidos", unit: "M", kind: "flow", range: [300, 30000], hint: "Trips, in millions" },
      { key: "gross_bookings", en: "Gross bookings", es: "Reservas brutas", unit: "$M", kind: "flow", range: [5000, 500000], hint: "Gross Bookings total, in millions of USD" },
      { key: "gb_mobility", en: "Gross bookings · Mobility", es: "Reservas · Mobility", unit: "$M", kind: "flow", range: [1000, 300000], hint: "Gross Bookings of the Mobility segment, in millions of USD" },
      { key: "gb_delivery", en: "Gross bookings · Delivery", es: "Reservas · Delivery", unit: "$M", kind: "flow", range: [1000, 300000], hint: "Gross Bookings of the Delivery segment, in millions of USD" },
      { key: "gb_freight", en: "Gross bookings · Freight", es: "Reservas · Freight", unit: "$M", kind: "flow", range: [100, 50000], hint: "Gross Bookings of the Freight segment, in millions of USD" },
    ],
    charts: [
      { id: "gb", en: "Gross bookings by segment", es: "Reservas brutas por segmento", type: "stack", keys: ["gb_mobility", "gb_delivery", "gb_freight"] },
      { id: "trips", en: "Trips", es: "Viajes y pedidos", type: "bar", keys: ["trips"] },
      { id: "mapcs", en: "Monthly active consumers", es: "Usuarios activos mensuales", type: "bar", keys: ["mapcs"] },
      { id: "freq", en: "Trips per user per month", es: "Viajes por usuario al mes", type: "line", keys: ["trips", "mapcs"], derived: "per_user_month" },
      { id: "take", en: "Take rate (revenue ÷ gross bookings)", es: "Comisión (ingresos ÷ reservas)", type: "line", keys: ["revenue", "gross_bookings"], derived: "take_rate" },
    ],
  },
  // Visa no publica en el comunicado el volumen de pagos en dólares (solo su crecimiento)
  V: {
    from: "2023-01-01",
    kpis: [
      { key: "processed_tx", en: "Processed transactions", es: "Transacciones procesadas", unit: "M", kind: "flow", range: [20000, 300000], hint: "Total processed transactions in the quarter, in millions (e.g. 74.2 billion -> 74200)" },
      { key: "pv_growth", en: "Payments volume growth", es: "Crecimiento del volumen de pagos", unit: "%", kind: "avg", range: [-50, 100], hint: "Payments volume year-over-year growth in the quarter, constant-dollar basis, in % (e.g. 9)" },
      { key: "cb_growth", en: "Cross-border volume growth (ex intra-Europe)", es: "Crecimiento transfronterizo (sin intra-Europa)", unit: "%", kind: "avg", range: [-80, 200], hint: "Cross-border volume excluding intra-Europe, year-over-year growth in the quarter, constant-dollar basis, in %" },
      { key: "tx_growth", en: "Processed transactions growth", es: "Crecimiento de transacciones", unit: "%", kind: "avg", range: [-50, 100], hint: "Processed transactions year-over-year growth in the quarter, in %" },
    ],
    charts: [
      { id: "tx", en: "Processed transactions", es: "Transacciones procesadas", type: "bar", keys: ["processed_tx"] },
      { id: "growth", en: "Year-over-year growth (constant dollars)", es: "Crecimiento interanual (dólares constantes)", type: "line", keys: ["pv_growth", "cb_growth", "tx_growth"] },
    ],
  },
  MA: {
    from: "2023-01-01",
    kpis: [
      { key: "gdv", en: "Gross dollar volume", es: "Volumen bruto en dólares (GDV)", unit: "$M", kind: "flow", range: [500000, 10000000], hint: "Worldwide gross dollar volume (GDV, all credit, charge and debit programs) in the quarter, in millions of USD (e.g. $2,952 billion -> 2952000)" },
      { key: "gdv_us", en: "GDV · United States", es: "GDV · EE. UU.", unit: "$M", kind: "flow", range: [100000, 5000000], hint: "United States GDV (all programs) in the quarter, in millions of USD" },
      { key: "gdv_intl", en: "GDV · Rest of world", es: "GDV · Resto del mundo", unit: "$M", kind: "flow", range: [200000, 8000000], hint: "Worldwide less United States GDV (all programs) in the quarter, in millions of USD" },
      { key: "purchase_tx", en: "Purchase transactions", es: "Transacciones de compra", unit: "M", kind: "flow", range: [10000, 300000], hint: "Worldwide purchase transactions (all programs) in the quarter, in millions" },
      { key: "cards", en: "Cards", es: "Tarjetas", unit: "M", kind: "stock", range: [1000, 10000], hint: "Mastercard and Maestro-branded cards issued (worldwide, all programs) at end of quarter, in millions" },
      { key: "cb_growth", en: "Cross-border volume growth", es: "Crecimiento transfronterizo", unit: "%", kind: "avg", range: [-80, 200], hint: "Cross-border volume year-over-year growth in the quarter, local currency basis, in %" },
      { key: "switched_growth", en: "Switched transactions growth", es: "Crecimiento de transacciones procesadas", unit: "%", kind: "avg", range: [-50, 100], hint: "Switched transactions year-over-year growth in the quarter, in %" },
    ],
    charts: [
      { id: "gdv", en: "Gross dollar volume by region", es: "Volumen bruto (GDV) por región", type: "stack", keys: ["gdv_us", "gdv_intl"] },
      { id: "tx", en: "Purchase transactions", es: "Transacciones de compra", type: "bar", keys: ["purchase_tx"] },
      { id: "cards", en: "Cards", es: "Tarjetas", type: "bar", keys: ["cards"] },
      { id: "growth", en: "Year-over-year growth", es: "Crecimiento interanual", type: "line", keys: ["cb_growth", "switched_growth"] },
    ],
  },
  BKNG: {
    from: "2023-01-01",
    kpis: [
      { key: "room_nights", en: "Room nights", es: "Noches de hotel", unit: "M", kind: "flow", range: [50, 1500], hint: "Room nights sold in the quarter, in millions" },
      { key: "car_days", en: "Rental car days", es: "Días de alquiler de coche", unit: "M", kind: "flow", range: [3, 200], hint: "Rental car days sold in the quarter, in millions" },
      { key: "flights", en: "Flight tickets", es: "Billetes de avión", unit: "M", kind: "flow", range: [1, 200], hint: "Airline / flight tickets sold in the quarter, in millions" },
      { key: "gross_bookings", en: "Gross bookings", es: "Reservas brutas", unit: "$M", kind: "flow", range: [10000, 400000], hint: "Total gross bookings in the quarter, in millions of USD (e.g. $54.5 billion -> 54500)" },
      { key: "gb_merchant", en: "Gross bookings · Merchant", es: "Reservas · Merchant", unit: "$M", kind: "flow", range: [1000, 300000], hint: "Merchant gross bookings in the quarter, in millions of USD" },
      { key: "gb_agency", en: "Gross bookings · Agency", es: "Reservas · Agencia", unit: "$M", kind: "flow", range: [1000, 200000], hint: "Agency gross bookings in the quarter, in millions of USD" },
    ],
    charts: [
      { id: "gb", en: "Gross bookings (merchant / agency)", es: "Reservas brutas (merchant / agencia)", type: "stack", keys: ["gb_merchant", "gb_agency"] },
      { id: "nights", en: "Room nights", es: "Noches de hotel", type: "bar", keys: ["room_nights"] },
      { id: "cars", en: "Rental car days", es: "Días de alquiler de coche", type: "bar", keys: ["car_days"] },
      { id: "flights", en: "Flight tickets", es: "Billetes de avión", type: "bar", keys: ["flights"] },
      { id: "take", en: "Take rate (revenue ÷ gross bookings)", es: "Comisión (ingresos ÷ reservas)", type: "line", keys: ["revenue", "gross_bookings"], derived: "take_rate" },
    ],
  },
  // Apple no publica unidades desde 2019: margen bruto de productos y de servicios
  AAPL: {
    from: "2023-01-01",
    kpis: [
      { key: "products_rev", en: "Products net sales", es: "Ventas de productos", unit: "$M", kind: "flow", range: [20000, 300000], hint: "Products net sales in the quarter (three months), in millions of USD" },
      { key: "services_rev", en: "Services net sales", es: "Ventas de servicios", unit: "$M", kind: "flow", range: [5000, 200000], hint: "Services net sales in the quarter (three months), in millions of USD" },
      { key: "products_cost", en: "Products cost of sales", es: "Coste de productos", unit: "$M", kind: "flow", range: [10000, 250000], hint: "Products cost of sales in the quarter (three months), in millions of USD" },
      { key: "services_cost", en: "Services cost of sales", es: "Coste de servicios", unit: "$M", kind: "flow", range: [1000, 100000], hint: "Services cost of sales in the quarter (three months), in millions of USD" },
    ],
    charts: [
      {
        id: "gm", en: "Gross margin: products vs. services", es: "Margen bruto: productos frente a servicios", type: "line", keys: ["products_rev", "products_cost", "services_rev", "services_cost"], derived: "margins",
        series: [
          { key: "gm_products", en: "Products", es: "Productos", rev: "products_rev", cost: "products_cost" },
          { key: "gm_services", en: "Services", es: "Servicios", rev: "services_rev", cost: "services_cost" },
        ],
      },
      { id: "mix", en: "Net sales: products / services", es: "Ventas: productos / servicios", type: "stack", keys: ["products_rev", "services_rev"] },
    ],
  },
  AMZN: {
    from: "2023-01-01",
    kpis: [
      { key: "fcf_ttm", en: "Free cash flow (TTM)", es: "Flujo de caja libre (12 meses)", unit: "$M", kind: "avg", range: [-300000, 300000], hint: "Free cash flow for the trailing twelve months ending in that quarter, in millions of USD (negative if outflow)" },
      { key: "employees", en: "Employees", es: "Empleados", unit: "M", kind: "stock", range: [0.3, 5], hint: "Employees (full-time and part-time) at end of quarter, in millions (e.g. 1,638,000 -> 1.638)" },
      { key: "shipping", en: "Worldwide shipping costs", es: "Costes de envío", unit: "$M", kind: "flow", range: [5000, 150000], hint: "WW shipping costs in the quarter, in millions of USD" },
      { key: "units_growth", en: "Paid units growth", es: "Crecimiento de unidades vendidas", unit: "%", kind: "avg", range: [-50, 100], hint: "WW paid units year-over-year growth in the quarter, in %" },
      { key: "seller_mix", en: "Third-party seller unit mix", es: "Cuota de vendedores externos", unit: "share", kind: "avg", range: [20, 90], hint: "WW seller unit mix, % of WW paid units sold by third-party sellers, in % (e.g. 61)" },
    ],
    charts: [
      { id: "fcf", en: "Free cash flow (trailing 12 months)", es: "Flujo de caja libre (12 meses)", type: "bar", keys: ["fcf_ttm"] },
      { id: "units", en: "Paid units growth", es: "Crecimiento de unidades vendidas", type: "line", keys: ["units_growth"] },
      { id: "mix", en: "Third-party seller unit mix", es: "Cuota de vendedores externos", type: "line", keys: ["seller_mix"] },
      { id: "employees", en: "Employees", es: "Empleados", type: "bar", keys: ["employees"] },
      { id: "shipping", en: "Worldwide shipping costs", es: "Costes de envío", type: "bar", keys: ["shipping"] },
    ],
  },
  // El 8-K de entregas de Tesla (unos 3.000 caracteres, sin ingresos) se salta: los datos vienen en
  // la tabla de cinco trimestres de su presentación trimestral
  TSLA: {
    from: "2023-01-01",
    minChars: 10000,
    kpis: [
      { key: "deliveries", en: "Vehicle deliveries", es: "Entregas de vehículos", unit: "n", kind: "flow", range: [100000, 5000000], hint: "Total vehicle deliveries in the quarter (units)" },
      { key: "del_3y", en: "Deliveries · Model 3/Y", es: "Entregas · Model 3/Y", unit: "n", kind: "flow", range: [50000, 5000000], hint: "Model 3/Y deliveries in the quarter (units)" },
      { key: "del_other", en: "Deliveries · Other models", es: "Entregas · Otros modelos", unit: "n", kind: "flow", range: [0, 1000000], hint: "Other models deliveries in the quarter (units)" },
      { key: "production", en: "Vehicle production", es: "Producción de vehículos", unit: "n", kind: "flow", range: [100000, 5000000], hint: "Total vehicle production in the quarter (units)" },
      { key: "storage_gwh", en: "Energy storage deployed", es: "Almacenamiento instalado", unit: "GWh", kind: "flow", range: [0.5, 200], hint: "Energy storage deployed in the quarter, in GWh" },
      { key: "sc_connectors", en: "Supercharger connectors", es: "Conectores Supercharger", unit: "n", kind: "stock", range: [10000, 2000000], hint: "Supercharger connectors at end of quarter (count)" },
      { key: "fsd_subs", en: "Active FSD subscriptions", es: "Suscripciones FSD activas", unit: "M", kind: "stock", range: [0.05, 100], hint: "Active FSD subscriptions at end of quarter, in millions" },
      { key: "inventory_days", en: "Vehicle inventory (days of supply)", es: "Inventario (días de suministro)", unit: "d", kind: "avg", range: [1, 200], hint: "Global vehicle inventory, days of supply" },
    ],
    charts: [
      { id: "del", en: "Deliveries (Model 3/Y / other)", es: "Entregas (Model 3/Y / otros)", type: "stack", keys: ["del_3y", "del_other"] },
      { id: "storage", en: "Energy storage deployed", es: "Almacenamiento de energía instalado", type: "bar", keys: ["storage_gwh"] },
      { id: "prod", en: "Production", es: "Producción", type: "bar", keys: ["production"] },
      { id: "sc", en: "Supercharger connectors", es: "Conectores Supercharger", type: "bar", keys: ["sc_connectors"] },
      { id: "fsd", en: "Active FSD subscriptions", es: "Suscripciones FSD activas", type: "bar", keys: ["fsd_subs"] },
      { id: "inv", en: "Inventory (days of supply)", es: "Inventario (días de suministro)", type: "line", keys: ["inventory_days"] },
    ],
  },
  // Microsoft: casi todo en crecimientos; en dólares, Microsoft Cloud y la cartera contratada (RPO)
  MSFT: {
    from: "2023-01-01",
    kpis: [
      { key: "cloud_rev", en: "Microsoft Cloud revenue", es: "Ingresos de Microsoft Cloud", unit: "$M", kind: "flow", range: [10000, 600000], hint: "Microsoft Cloud revenue in the quarter, in millions of USD (e.g. $63.9 billion -> 63900)" },
      { key: "rpo", en: "Commercial remaining performance obligation", es: "Cartera comercial contratada (RPO)", unit: "$M", kind: "stock", range: [50000, 5000000], hint: "Commercial remaining performance obligation (RPO) at end of quarter, in millions of USD (e.g. $677 billion -> 677000)" },
      { key: "azure_growth", en: "Azure growth", es: "Crecimiento de Azure", unit: "%", kind: "avg", range: [-50, 300], hint: "Azure (and other cloud services) revenue year-over-year growth in the quarter, as reported (GAAP, not constant currency), in %" },
      { key: "m365c_growth", en: "Microsoft 365 commercial cloud growth", es: "Crecimiento de Microsoft 365 comercial", unit: "%", kind: "avg", range: [-50, 200], hint: "Microsoft 365 commercial cloud (formerly Office 365 commercial) revenue year-over-year growth, as reported, in %" },
      { key: "search_growth", en: "Search & ads ex-TAC growth", es: "Crecimiento de búsqueda sin TAC", unit: "%", kind: "avg", range: [-50, 200], hint: "Search and advertising revenue excluding traffic acquisition costs, year-over-year growth, as reported, in %" },
      { key: "xbox_growth", en: "Xbox content & services growth", es: "Crecimiento de contenidos Xbox", unit: "%", kind: "avg", range: [-80, 300], hint: "Xbox content and services revenue year-over-year growth, as reported, in %" },
    ],
    charts: [
      { id: "cloud", en: "Microsoft Cloud revenue", es: "Ingresos de Microsoft Cloud", type: "bar", keys: ["cloud_rev"] },
      { id: "rpo", en: "Commercial remaining performance obligation", es: "Cartera comercial contratada (RPO)", type: "bar", keys: ["rpo"] },
      { id: "growth", en: "Year-over-year growth", es: "Crecimiento interanual", type: "line", keys: ["azure_growth", "m365c_growth", "search_growth", "xbox_growth"] },
    ],
  },
  // Alphabet: los ingresos por línea ya están en Segmentos; aquí TAC, empleados y YouTube
  GOOGL: {
    from: "2023-01-01",
    kpis: [
      { key: "tac", en: "Traffic acquisition costs (TAC)", es: "Costes de adquisición de tráfico (TAC)", unit: "$M", kind: "flow", range: [3000, 150000], hint: "Total traffic acquisition costs (TAC) in the quarter, in millions of USD" },
      { key: "ads_rev", en: "Google advertising revenue", es: "Ingresos publicitarios de Google", unit: "$M", kind: "flow", range: [20000, 400000], hint: "Google advertising revenues (Search & other + YouTube ads + Google Network) in the quarter, in millions of USD" },
      { key: "youtube", en: "YouTube ads revenue", es: "Ingresos publicitarios de YouTube", unit: "$M", kind: "flow", range: [2000, 80000], hint: "YouTube ads revenues in the quarter, in millions of USD" },
      { key: "employees", en: "Employees", es: "Empleados", unit: "n", kind: "stock", range: [50000, 600000], hint: "Number of employees at end of quarter" },
    ],
    charts: [
      { id: "tacrate", en: "TAC as % of advertising revenue", es: "TAC sobre ingresos publicitarios", type: "line", keys: ["tac", "ads_rev"], derived: "take_rate" },
      { id: "youtube", en: "YouTube ads revenue", es: "Ingresos publicitarios de YouTube", type: "bar", keys: ["youtube"] },
      { id: "tac", en: "Traffic acquisition costs (TAC)", es: "Costes de adquisición de tráfico (TAC)", type: "bar", keys: ["tac"] },
      { id: "emp", en: "Employees", es: "Empleados", type: "bar", keys: ["employees"] },
    ],
  },
  META: {
    from: "2023-01-01",
    kpis: [
      { key: "dap", en: "Family daily active people (DAP)", es: "Usuarios activos diarios (DAP)", unit: "M", kind: "avg", range: [1000, 8000], hint: "Family daily active people (DAP), in millions (e.g. 3.64 billion -> 3640)" },
      { key: "impressions_growth", en: "Ad impressions growth", es: "Crecimiento de impresiones", unit: "%", kind: "avg", range: [-50, 200], hint: "Ad impressions year-over-year growth across the Family of Apps, in %" },
      { key: "price_growth", en: "Average price per ad growth", es: "Crecimiento del precio por anuncio", unit: "%", kind: "avg", range: [-80, 300], hint: "Average price per ad year-over-year growth, in % (negative if decrease)" },
      { key: "headcount", en: "Headcount", es: "Plantilla", unit: "n", kind: "stock", range: [10000, 300000], hint: "Headcount at end of quarter" },
    ],
    charts: [
      { id: "dap", en: "Family daily active people", es: "Usuarios activos diarios", type: "bar", keys: ["dap"] },
      { id: "ads", en: "Ad impressions vs. price per ad (YoY)", es: "Impresiones frente a precio por anuncio (interanual)", type: "line", keys: ["impressions_growth", "price_growth"] },
      { id: "hc", en: "Headcount", es: "Plantilla", type: "bar", keys: ["headcount"] },
    ],
  },
  // Nvidia: ingresos frente a su propia previsión del trimestre anterior, márgenes brutos y el
  // desglose de Data Center en cómputo y redes (solo en los comunicados que lo dan)
  NVDA: {
    from: "2023-01-01",
    kpis: [
      { key: "guidance_next", en: "Revenue outlook for next quarter", es: "Previsión de ingresos del trimestre siguiente", unit: "$M", kind: "flow", range: [1000, 2000000], hint: "Revenue outlook for the NEXT quarter given in this release (midpoint), in millions of USD (e.g. 'expected to be $108.0 billion, plus or minus 2%' -> 108000); attach it to the quarter being reported" },
      { key: "gm_gaap", en: "GAAP gross margin", es: "Margen bruto GAAP", unit: "share", kind: "avg", range: [20, 95], hint: "GAAP gross margin of the quarter, in % (e.g. 75.1)" },
      { key: "gm_nongaap", en: "Non-GAAP gross margin", es: "Margen bruto no GAAP", unit: "share", kind: "avg", range: [20, 95], hint: "Non-GAAP gross margin of the quarter, in %" },
      { key: "dc_compute", en: "Data Center · Compute", es: "Data Center · Cómputo", unit: "$M", kind: "flow", range: [500, 1000000], hint: "Data Center compute revenue in the quarter, in millions of USD (only if stated)" },
      { key: "dc_networking", en: "Data Center · Networking", es: "Data Center · Redes", unit: "$M", kind: "flow", range: [200, 500000], hint: "Data Center networking revenue in the quarter, in millions of USD (only if stated)" },
    ],
    charts: [
      { id: "guide", en: "Revenue vs. prior-quarter outlook", es: "Ingresos frente a la previsión del trimestre anterior", type: "bar", keys: ["revenue", "guidance_next"], derived: "guidance" },
      { id: "gm", en: "Gross margin", es: "Margen bruto", type: "line", keys: ["gm_gaap", "gm_nongaap"] },
      { id: "dc", en: "Data Center: compute / networking", es: "Data Center: cómputo / redes", type: "stack", keys: ["dc_compute", "dc_networking"] },
    ],
  },
  COST: {
    from: "2023-01-01",
    kpis: [
      { key: "comp_sales", en: "Comparable sales growth", es: "Crecimiento de ventas comparables", unit: "%", kind: "avg", range: [-30, 60], hint: "Total company comparable sales growth for the fiscal quarter (not the 4-5 week month, not year-to-date), as reported, in %" },
      { key: "comp_sales_adj", en: "Comparable sales growth (ex gas & FX)", es: "Ventas comparables (sin gasolina ni divisas)", unit: "%", kind: "avg", range: [-30, 60], hint: "Total company comparable sales growth for the fiscal quarter excluding the impacts of gasoline prices and foreign exchange (adjusted), in %" },
      { key: "traffic", en: "Comparable traffic growth", es: "Crecimiento de tráfico comparable", unit: "%", kind: "avg", range: [-30, 60], hint: "Worldwide comparable traffic (shopping frequency) growth in the quarter, in %" },
      { key: "digital_comp", en: "Digitally-enabled comparable sales growth", es: "Ventas digitales comparables", unit: "%", kind: "avg", range: [-50, 200], hint: "Digitally-enabled (e-commerce) comparable sales growth in the quarter, as reported, in %" },
      { key: "renewal_ww", en: "Membership renewal rate (worldwide)", es: "Tasa de renovación (mundial)", unit: "share", kind: "avg", range: [70, 100], hint: "Worldwide membership renewal rate at quarter end, in %" },
      { key: "renewal_uscn", en: "Membership renewal rate (US & Canada)", es: "Tasa de renovación (EE. UU. y Canadá)", unit: "share", kind: "avg", range: [70, 100], hint: "US and Canada membership renewal rate at quarter end, in %" },
      { key: "cardholders", en: "Total cardholders", es: "Titulares de tarjeta", unit: "M", kind: "stock", range: [50, 500], hint: "Total cardholders at quarter end, in millions" },
      { key: "exec_members", en: "Paid executive members", es: "Socios Executive", unit: "M", kind: "stock", range: [10, 200], hint: "Paid executive memberships at quarter end, in millions" },
      { key: "warehouses", en: "Warehouses", es: "Almacenes", unit: "n", kind: "stock", range: [500, 3000], hint: "Number of warehouses in operation at quarter end (total)" },
      { key: "membership_fees", en: "Membership fees", es: "Cuotas de socio", unit: "$M", kind: "flow", range: [500, 20000], hint: "Membership fees revenue in the fiscal quarter, in millions of USD" },
    ],
    charts: [
      { id: "comp", en: "Comparable sales, traffic and digital (YoY)", es: "Ventas comparables, tráfico y digital (interanual)", type: "line", keys: ["comp_sales", "comp_sales_adj", "traffic", "digital_comp"] },
      { id: "renew", en: "Membership renewal rate", es: "Tasa de renovación de socios", type: "line", keys: ["renewal_uscn", "renewal_ww"] },
      { id: "fees", en: "Membership fees", es: "Cuotas de socio", type: "bar", keys: ["membership_fees"] },
      { id: "card", en: "Total cardholders", es: "Titulares de tarjeta", type: "bar", keys: ["cardholders"] },
      { id: "exec", en: "Paid executive members", es: "Socios Executive", type: "bar", keys: ["exec_members"] },
      { id: "wh", en: "Warehouses", es: "Almacenes", type: "bar", keys: ["warehouses"] },
    ],
  },
  JPM: {
    from: "2023-01-01",
    kpis: [
      { key: "nii", en: "Net interest income", es: "Margen de intereses", unit: "$M", kind: "flow", range: [5000, 150000], hint: "Firmwide net interest income (reported) in the quarter, in millions of USD" },
      { key: "rotce", en: "ROTCE", es: "ROTCE", unit: "share", kind: "avg", range: [-20, 60], hint: "Return on tangible common equity (ROTCE) for the quarter as reported, in %" },
      { key: "cet1", en: "CET1 ratio (Standardized)", es: "Ratio CET1 (estándar)", unit: "share", kind: "stock", range: [5, 25], hint: "Standardized CET1 capital ratio at quarter end, in %" },
      { key: "avg_loans", en: "Average loans", es: "Préstamos medios", unit: "$M", kind: "avg", range: [300000, 6000000], hint: "Firmwide average loans in the quarter, in millions of USD (e.g. $1.6 trillion -> 1600000)" },
      { key: "avg_deposits", en: "Average deposits", es: "Depósitos medios", unit: "$M", kind: "avg", range: [500000, 8000000], hint: "Firmwide average deposits in the quarter, in millions of USD" },
      { key: "nco", en: "Net charge-offs", es: "Fallidos netos", unit: "$M", kind: "flow", range: [50, 50000], hint: "Firmwide net charge-offs in the quarter, in millions of USD" },
      { key: "card_nco_rate", en: "Card net charge-off rate", es: "Tasa de fallidos en tarjetas", unit: "share", kind: "avg", range: [0.1, 20], hint: "Card Services net charge-off rate in the quarter, in %" },
      { key: "tbvps", en: "Tangible book value per share", es: "Valor contable tangible por acción", unit: "$", kind: "stock", range: [20, 1000], hint: "Tangible book value per share at quarter end, in USD" },
    ],
    charts: [
      { id: "nii", en: "Net interest income", es: "Margen de intereses", type: "bar", keys: ["nii"] },
      { id: "ret", en: "ROTCE and CET1 ratio", es: "ROTCE y ratio CET1", type: "line", keys: ["rotce", "cet1"] },
      { id: "bal", en: "Average loans and deposits", es: "Préstamos y depósitos medios", type: "line", keys: ["avg_loans", "avg_deposits"] },
      { id: "nco", en: "Net charge-offs", es: "Fallidos netos", type: "bar", keys: ["nco"] },
      { id: "card", en: "Card net charge-off rate", es: "Tasa de fallidos en tarjetas", type: "line", keys: ["card_nco_rate"] },
      { id: "tbv", en: "Tangible book value per share", es: "Valor contable tangible por acción", type: "line", keys: ["tbvps"] },
    ],
  },
  WMT: {
    from: "2023-01-01",
    kpis: [
      { key: "us_comp", en: "Walmart U.S. comp sales (ex fuel)", es: "Ventas comparables Walmart EE. UU. (sin carburante)", unit: "%", kind: "avg", range: [-20, 40], hint: "Walmart U.S. comp sales growth excluding fuel for the quarter (13 weeks), in %" },
      { key: "us_transactions", en: "Walmart U.S. transactions", es: "Transacciones Walmart EE. UU.", unit: "%", kind: "avg", range: [-20, 40], hint: "Walmart U.S. comparable transactions growth in the quarter, in %" },
      { key: "us_ticket", en: "Walmart U.S. average ticket", es: "Ticket medio Walmart EE. UU.", unit: "%", kind: "avg", range: [-20, 40], hint: "Walmart U.S. comparable average ticket growth in the quarter, in %" },
      { key: "ecom_growth", en: "Global eCommerce growth", es: "Crecimiento del comercio electrónico", unit: "%", kind: "avg", range: [-50, 200], hint: "Global (Walmart Inc.) eCommerce sales growth in the quarter, in %" },
      { key: "ads_growth", en: "Global advertising growth", es: "Crecimiento de la publicidad", unit: "%", kind: "avg", range: [-50, 300], hint: "Global advertising business growth in the quarter, in %" },
      { key: "membership_growth", en: "Membership fee revenue growth", es: "Crecimiento de cuotas de socio", unit: "%", kind: "avg", range: [-50, 200], hint: "Global membership and other income / membership fee revenue growth in the quarter, in %" },
    ],
    charts: [
      { id: "comp", en: "Walmart U.S. comp sales, transactions and ticket", es: "Walmart EE. UU.: comparables, transacciones y ticket", type: "line", keys: ["us_comp", "us_transactions", "us_ticket"] },
      { id: "growth", en: "eCommerce, advertising and membership growth", es: "Crecimiento de e-commerce, publicidad y cuotas", type: "line", keys: ["ecom_growth", "ads_growth", "membership_growth"] },
    ],
  },
  HD: {
    from: "2023-01-01",
    kpis: [
      { key: "comp_sales", en: "Comparable sales growth", es: "Crecimiento de ventas comparables", unit: "%", kind: "avg", range: [-30, 50], hint: "Total comparable sales % change for the quarter (three months, not year-to-date)" },
      { key: "comp_transactions", en: "Comparable customer transactions", es: "Transacciones comparables", unit: "%", kind: "avg", range: [-30, 50], hint: "Comparable customer transactions % change for the quarter" },
      { key: "comp_ticket", en: "Comparable average ticket", es: "Ticket medio comparable", unit: "%", kind: "avg", range: [-30, 50], hint: "Comparable average ticket % change for the quarter" },
      { key: "transactions", en: "Customer transactions", es: "Transacciones de clientes", unit: "M", kind: "flow", range: [100, 2000], hint: "Customer transactions in the quarter, in millions" },
      { key: "avg_ticket", en: "Average ticket", es: "Ticket medio", unit: "$", kind: "avg", range: [30, 300], hint: "Average ticket in the quarter, in USD" },
      { key: "stores", en: "Stores", es: "Tiendas", unit: "n", kind: "stock", range: [1500, 4000], hint: "Total number of retail stores at quarter end" },
    ],
    charts: [
      { id: "comp", en: "Comparable sales, transactions and ticket", es: "Ventas comparables, transacciones y ticket", type: "line", keys: ["comp_sales", "comp_transactions", "comp_ticket"] },
      { id: "tx", en: "Customer transactions", es: "Transacciones de clientes", type: "bar", keys: ["transactions"] },
      { id: "ticket", en: "Average ticket", es: "Ticket medio", type: "line", keys: ["avg_ticket"] },
      { id: "stores", en: "Stores", es: "Tiendas", type: "bar", keys: ["stores"] },
    ],
  },
  // ExxonMobil: comunicados en el CIK nuevo (sociedad holding) y, los anteriores, en el antiguo
  XOM: {
    from: "2023-01-01",
    revenueHint: "revenue = 'Total revenues and other income' (not 'Sales and other operating revenue')",
    kpis: [
      { key: "production", en: "Oil-equivalent production", es: "Producción equivalente de petróleo", unit: "kbd", kind: "avg", range: [2000, 8000], hint: "Worldwide oil-equivalent production in the quarter, thousand oil-equivalent barrels per day (koebd)" },
      { key: "liquids", en: "Liquids production", es: "Producción de líquidos", unit: "kbd", kind: "avg", range: [1000, 6000], hint: "Worldwide net production of crude oil, NGL, bitumen and synthetic oil, thousand barrels per day (kbd)" },
      { key: "gas", en: "Natural gas production", es: "Producción de gas natural", unit: "mmcfd", kind: "avg", range: [3000, 20000], hint: "Worldwide net natural gas production available for sale, million cubic feet per day (mcfd)" },
      { key: "refinery", en: "Refinery throughput", es: "Crudo procesado en refinerías", unit: "kbd", kind: "avg", range: [1000, 7000], hint: "Worldwide refinery throughput, thousand barrels per day (kbd)" },
      { key: "us_liquids", en: "U.S. liquids production", es: "Producción de líquidos en EE. UU.", unit: "kbd", kind: "avg", range: [300, 4000], hint: "United States net liquids production, thousand barrels per day (kbd)" },
      { key: "earnings_ex", en: "Earnings excluding identified items", es: "Beneficio sin partidas identificadas", unit: "$M", kind: "flow", range: [-20000, 40000], hint: "Total company earnings excluding identified items (non-GAAP; excluding estimated timing effects if that is the headline measure) in the quarter, in millions of USD" },
    ],
    charts: [
      { id: "prod", en: "Oil-equivalent production", es: "Producción equivalente de petróleo", type: "bar", keys: ["production"] },
      { id: "liq", en: "Liquids production (worldwide / U.S.)", es: "Producción de líquidos (mundial / EE. UU.)", type: "line", keys: ["liquids", "us_liquids"] },
      { id: "gas", en: "Natural gas production", es: "Producción de gas natural", type: "bar", keys: ["gas"] },
      { id: "ref", en: "Refinery throughput", es: "Crudo procesado en refinerías", type: "bar", keys: ["refinery"] },
      { id: "earn", en: "Earnings excluding identified items", es: "Beneficio sin partidas identificadas", type: "bar", keys: ["earnings_ex"] },
    ],
  },
  // Berkshire: el comunicado solo trae beneficios (sin ingresos); se valida con el beneficio neto
  "BRK-B": {
    from: "2023-01-01",
    anchor: "net_income",
    kpis: [
      { key: "operating_earnings", en: "Operating earnings", es: "Beneficio operativo", unit: "$M", kind: "flow", range: [-10000, 60000], hint: "Operating earnings (after tax, excluding investment gains/losses) in the quarter, in millions of USD" },
      { key: "underwriting", en: "Insurance underwriting", es: "Suscripción de seguros", unit: "$M", kind: "flow", range: [-20000, 20000], hint: "Insurance-underwriting earnings (after tax) in the quarter, in millions of USD (negative if loss)" },
      { key: "insurance_investment", en: "Insurance investment income", es: "Inversiones de seguros", unit: "$M", kind: "flow", range: [0, 30000], hint: "Insurance-investment income earnings (after tax) in the quarter, in millions of USD" },
      { key: "bnsf", en: "BNSF", es: "BNSF", unit: "$M", kind: "flow", range: [-2000, 10000], hint: "BNSF earnings (after tax) in the quarter, in millions of USD" },
      { key: "bhe", en: "Berkshire Hathaway Energy", es: "Berkshire Hathaway Energy", unit: "$M", kind: "flow", range: [-5000, 10000], hint: "Berkshire Hathaway Energy earnings (after tax) in the quarter, in millions of USD" },
      { key: "other_businesses", en: "Manufacturing, service, retailing and other", es: "Industria, servicios, comercio y otros", unit: "$M", kind: "flow", range: [-10000, 20000], hint: "Sum of all remaining operating earnings lines (manufacturing, service and retailing, plus other/corporate) in the quarter, in millions of USD, so that underwriting + investment income + BNSF + BHE + this = operating earnings" },
      { key: "investment_gains", en: "Investment gains (losses)", es: "Plusvalías de inversiones", unit: "$M", kind: "flow", range: [-100000, 100000], hint: "Investment gains (losses), after tax, in the quarter, in millions of USD" },
    ],
    charts: [
      { id: "op", en: "Operating earnings by business", es: "Beneficio operativo por negocio", type: "stack", keys: ["underwriting", "insurance_investment", "bnsf", "bhe", "other_businesses"] },
      { id: "gains", en: "Investment gains (losses)", es: "Plusvalías (minusvalías) de inversiones", type: "bar", keys: ["investment_gains"] },
    ],
  },
  LLY: {
    from: "2023-01-01",
    kpis: [
      { key: "mounjaro", en: "Mounjaro", es: "Mounjaro", unit: "$M", kind: "flow", range: [10, 200000], hint: "Mounjaro worldwide revenue in the quarter, in millions of USD" },
      { key: "zepbound", en: "Zepbound", es: "Zepbound", unit: "$M", kind: "flow", range: [10, 200000], hint: "Zepbound worldwide revenue in the quarter, in millions of USD" },
      { key: "verzenio", en: "Verzenio", es: "Verzenio", unit: "$M", kind: "flow", range: [100, 20000], hint: "Verzenio worldwide revenue in the quarter, in millions of USD" },
      { key: "trulicity", en: "Trulicity", es: "Trulicity", unit: "$M", kind: "flow", range: [10, 20000], hint: "Trulicity worldwide revenue in the quarter, in millions of USD" },
      { key: "taltz", en: "Taltz", es: "Taltz", unit: "$M", kind: "flow", range: [50, 10000], hint: "Taltz worldwide revenue in the quarter, in millions of USD" },
      { key: "kisunla", en: "Kisunla", es: "Kisunla", unit: "$M", kind: "flow", range: [1, 20000], hint: "Kisunla worldwide revenue in the quarter, in millions of USD" },
      { key: "volume_effect", en: "Volume effect on revenue growth", es: "Efecto volumen en el crecimiento", unit: "%", kind: "avg", range: [-60, 300], hint: "Worldwide revenue change due to volume, year-over-year, in %" },
      { key: "price_effect", en: "Price effect on revenue growth", es: "Efecto precio en el crecimiento", unit: "%", kind: "avg", range: [-60, 60], hint: "Worldwide revenue change due to realized prices, year-over-year, in % (negative if decrease)" },
    ],
    charts: [
      { id: "tirz", en: "Tirzepatide: Mounjaro + Zepbound", es: "Tirzepatida: Mounjaro + Zepbound", type: "stack", keys: ["mounjaro", "zepbound"] },
      { id: "others", en: "Other key products", es: "Otros productos clave", type: "line", keys: ["verzenio", "trulicity", "taltz", "kisunla"] },
      { id: "pv", en: "Revenue growth: volume vs. price", es: "Crecimiento: volumen frente a precio", type: "line", keys: ["volume_effect", "price_effect"] },
    ],
  },
  UNH: {
    from: "2023-01-01",
    kpis: [
      { key: "mcr", en: "Medical care ratio", es: "Ratio de costes médicos", unit: "share", kind: "avg", range: [60, 100], hint: "Medical care ratio (medical costs as a percent of premiums) for the quarter, in % (e.g. 89.4)" },
      { key: "people_medical", en: "UnitedHealthcare people served (medical)", es: "Personas atendidas UnitedHealthcare (médico)", unit: "M", kind: "stock", range: [20, 100], hint: "Total UnitedHealthcare - Medical people served at quarter end, in millions (table is in thousands: 48,300 -> 48.3)" },
      { key: "people_commercial", en: "Commercial", es: "Comercial", unit: "M", kind: "stock", range: [10, 60], hint: "Total Commercial people served at quarter end, in millions" },
      { key: "people_ma", en: "Medicare Advantage", es: "Medicare Advantage", unit: "M", kind: "stock", range: [2, 20], hint: "Medicare Advantage people served at quarter end, in millions" },
      { key: "people_medicaid", en: "Medicaid", es: "Medicaid", unit: "M", kind: "stock", range: [2, 20], hint: "Medicaid people served at quarter end, in millions" },
      { key: "optum_health_consumers", en: "Optum Health consumers served", es: "Consumidores de Optum Health", unit: "M", kind: "stock", range: [10, 300], hint: "Optum Health consumers served at quarter end, in millions" },
      { key: "optum_rx_scripts", en: "Optum Rx adjusted scripts", es: "Recetas ajustadas de Optum Rx", unit: "M", kind: "flow", range: [100, 1500], hint: "Optum Rx quarterly adjusted scripts, in millions" },
    ],
    charts: [
      { id: "mcr", en: "Medical care ratio", es: "Ratio de costes médicos", type: "line", keys: ["mcr"] },
      { id: "people", en: "People served by plan type", es: "Personas atendidas por tipo de plan", type: "stack", keys: ["people_commercial", "people_ma", "people_medicaid"] },
      { id: "rx", en: "Optum Rx adjusted scripts", es: "Recetas ajustadas de Optum Rx", type: "bar", keys: ["optum_rx_scripts"] },
      { id: "oh", en: "Optum Health consumers served", es: "Consumidores de Optum Health", type: "bar", keys: ["optum_health_consumers"] },
    ],
  },
  AVGO: {
    from: "2023-01-01",
    kpis: [
      { key: "ai_semis", en: "AI semiconductor revenue", es: "Ingresos de semiconductores para IA", unit: "$M", kind: "flow", range: [500, 1000000], hint: "AI semiconductor revenue in the quarter, in millions of USD (only if stated, e.g. '$16.7 billion' -> 16700)" },
      { key: "fcf", en: "Free cash flow", es: "Flujo de caja libre", unit: "$M", kind: "flow", range: [-50000, 500000], hint: "Free cash flow in the quarter, in millions of USD" },
      { key: "guidance_next", en: "Revenue outlook for next quarter", es: "Previsión de ingresos del trimestre siguiente", unit: "$M", kind: "flow", range: [1000, 2000000], hint: "Revenue guidance for the NEXT quarter given in this release (midpoint if a range), in millions of USD; attach it to the quarter being reported; omit if only full-year guidance is given" },
    ],
    charts: [
      { id: "ai", en: "AI semiconductor revenue", es: "Semiconductores para IA", type: "bar", keys: ["ai_semis"] },
      { id: "guide", en: "Revenue vs. prior-quarter outlook", es: "Ingresos frente a la previsión del trimestre anterior", type: "bar", keys: ["revenue", "guidance_next"], derived: "guidance" },
      { id: "fcf", en: "Free cash flow", es: "Flujo de caja libre", type: "bar", keys: ["fcf"] },
    ],
  },
  ORCL: {
    from: "2023-01-01",
    kpis: [
      { key: "rpo", en: "Remaining performance obligations", es: "Cartera contratada (RPO)", unit: "$M", kind: "stock", range: [20000, 5000000], hint: "Remaining performance obligations (RPO) at quarter end, in millions of USD (e.g. $664 billion -> 664000)" },
      { key: "cloud_rev", en: "Total cloud revenue", es: "Ingresos cloud totales", unit: "$M", kind: "flow", range: [1000, 500000], hint: "Total cloud revenue (IaaS plus SaaS) in the quarter, in millions of USD" },
      { key: "oci_rev", en: "Cloud infrastructure (OCI) revenue", es: "Infraestructura cloud (OCI)", unit: "$M", kind: "flow", range: [300, 400000], hint: "Cloud infrastructure (IaaS / OCI) revenue in the quarter, in millions of USD (only if stated)" },
      { key: "oci_growth", en: "Cloud infrastructure growth", es: "Crecimiento de OCI", unit: "%", kind: "avg", range: [-50, 500], hint: "Cloud infrastructure (IaaS / OCI) revenue year-over-year growth in USD, in %" },
      { key: "fcf", en: "Free cash flow", es: "Flujo de caja libre", unit: "$M", kind: "flow", range: [-100000, 100000], hint: "Free cash flow for the quarter (not trailing four quarters), in millions of USD (negative if outflow); omit if only a trailing figure is given" },
    ],
    charts: [
      { id: "rpo", en: "Remaining performance obligations", es: "Cartera contratada (RPO)", type: "bar", keys: ["rpo"] },
      { id: "cloud", en: "Total cloud vs. infrastructure (OCI) revenue", es: "Cloud total frente a infraestructura (OCI)", type: "line", keys: ["cloud_rev", "oci_rev"] },
      { id: "oci", en: "Cloud infrastructure growth", es: "Crecimiento de la infraestructura cloud", type: "line", keys: ["oci_growth"] },
      { id: "fcf", en: "Free cash flow", es: "Flujo de caja libre", type: "bar", keys: ["fcf"] },
    ],
  },
  CRM: {
    from: "2023-01-01",
    kpis: [
      { key: "crpo", en: "Current remaining performance obligation", es: "Cartera contratada a 12 meses (cRPO)", unit: "$M", kind: "stock", range: [5000, 500000], hint: "Current remaining performance obligation (cRPO) at quarter end, in millions of USD" },
      { key: "rpo", en: "Remaining performance obligation", es: "Cartera contratada total (RPO)", unit: "$M", kind: "stock", range: [10000, 1000000], hint: "Total remaining performance obligation (RPO) at quarter end, in millions of USD" },
      { key: "subscription", en: "Subscription and support revenue", es: "Ingresos por suscripción y soporte", unit: "$M", kind: "flow", range: [3000, 300000], hint: "Subscription and support revenue in the quarter, in millions of USD" },
      { key: "ai_data_arr", en: "Agentforce + Data ARR", es: "ARR de Agentforce + Data", unit: "$M", kind: "stock", range: [10, 200000], hint: "Agentforce and Data Cloud / Data 360 annual recurring revenue (ARR) at quarter end, in millions of USD (only if stated)" },
      { key: "agentforce_arr", en: "Agentforce ARR", es: "ARR de Agentforce", unit: "$M", kind: "stock", range: [1, 200000], hint: "Agentforce annual recurring revenue (ARR) at quarter end, in millions of USD (only if stated)" },
      { key: "fcf", en: "Free cash flow", es: "Flujo de caja libre", unit: "$M", kind: "flow", range: [-20000, 100000], hint: "Free cash flow in the quarter, in millions of USD" },
      { key: "guidance_next", en: "Revenue outlook for next quarter", es: "Previsión de ingresos del trimestre siguiente", unit: "$M", kind: "flow", range: [1000, 2000000], hint: "Revenue guidance for the NEXT quarter given in this release (midpoint if a range), in millions of USD; attach it to the quarter being reported; omit if only full-year guidance is given" },
    ],
    charts: [
      { id: "rpo", en: "Remaining performance obligation (current / total)", es: "Cartera contratada (12 meses / total)", type: "line", keys: ["crpo", "rpo"] },
      { id: "arr", en: "Agentforce and Data ARR", es: "ARR de Agentforce y Data", type: "bar", keys: ["ai_data_arr", "agentforce_arr"] },
      { id: "sub", en: "Subscription and support revenue", es: "Suscripción y soporte", type: "bar", keys: ["subscription"] },
      { id: "guide", en: "Revenue vs. prior-quarter outlook", es: "Ingresos frente a la previsión del trimestre anterior", type: "bar", keys: ["revenue", "guidance_next"], derived: "guidance" },
      { id: "fcf", en: "Free cash flow", es: "Flujo de caja libre", type: "bar", keys: ["fcf"] },
    ],
  },
  AMD: {
    from: "2023-01-01",
    kpis: [
      { key: "guidance_next", en: "Revenue outlook for next quarter", es: "Previsión de ingresos del trimestre siguiente", unit: "$M", kind: "flow", range: [100, 2000000], hint: "Revenue guidance for the NEXT quarter given in this release (midpoint if a range), in millions of USD; attach it to the quarter being reported; omit if only full-year guidance is given" },
      { key: "gm_nongaap", en: "Non-GAAP gross margin", es: "Margen bruto no GAAP", unit: "share", kind: "avg", range: [20, 90], hint: "Non-GAAP gross margin of the quarter, in %" },
      { key: "dc_growth", en: "Data Center revenue growth", es: "Crecimiento de Data Center", unit: "%", kind: "avg", range: [-80, 500], hint: "Data Center segment revenue year-over-year growth in the quarter, in %" },
    ],
    charts: [
      { id: "guide", en: "Revenue vs. prior-quarter outlook", es: "Ingresos frente a la previsión del trimestre anterior", type: "bar", keys: ["revenue", "guidance_next"], derived: "guidance" },
      { id: "gm", en: "Non-GAAP gross margin", es: "Margen bruto no GAAP", type: "line", keys: ["gm_nongaap"] },
      { id: "dc", en: "Data Center revenue growth (YoY)", es: "Crecimiento de Data Center (interanual)", type: "line", keys: ["dc_growth"] },
    ],
  },
  ADBE: {
    from: "2023-01-01",
    kpis: [
      { key: "arr", en: "Total ARR", es: "ARR total", unit: "$M", kind: "stock", range: [5000, 300000], hint: "Total Adobe annualized recurring revenue (ARR) exiting the quarter, in millions of USD; if only Digital Media ARR is given (older releases), use it" },
      { key: "arr_growth", en: "ARR growth", es: "Crecimiento del ARR", unit: "%", kind: "avg", range: [-50, 200], hint: "Total (or Digital Media) ending ARR year-over-year growth, in %" },
      { key: "rpo", en: "Remaining performance obligations", es: "Cartera contratada (RPO)", unit: "$M", kind: "stock", range: [5000, 500000], hint: "Remaining performance obligations (RPO) exiting the quarter, in millions of USD" },
      { key: "crpo_share", en: "Current RPO (% of RPO)", es: "cRPO (% de la cartera)", unit: "share", kind: "stock", range: [20, 100], hint: "Current remaining performance obligations as a percent of RPO, in %" },
      { key: "ocf", en: "Operating cash flow", es: "Flujo de caja operativo", unit: "$M", kind: "flow", range: [-5000, 100000], hint: "Cash flows from operations in the quarter, in millions of USD" },
      { key: "guidance_next", en: "Revenue outlook for next quarter", es: "Previsión de ingresos del trimestre siguiente", unit: "$M", kind: "flow", range: [100, 2000000], hint: "Revenue guidance for the NEXT quarter given in this release (midpoint if a range), in millions of USD; attach it to the quarter being reported; omit if only full-year guidance is given" },
    ],
    charts: [
      { id: "arr", en: "Total ARR", es: "ARR total", type: "bar", keys: ["arr"] },
      { id: "growth", en: "ARR growth", es: "Crecimiento del ARR", type: "line", keys: ["arr_growth"] },
      { id: "rpo", en: "Remaining performance obligations", es: "Cartera contratada (RPO)", type: "bar", keys: ["rpo"] },
      { id: "guide", en: "Revenue vs. prior-quarter outlook", es: "Ingresos frente a la previsión del trimestre anterior", type: "bar", keys: ["revenue", "guidance_next"], derived: "guidance" },
      { id: "ocf", en: "Operating cash flow", es: "Flujo de caja operativo", type: "bar", keys: ["ocf"] },
    ],
  },
  PLTR: {
    from: "2023-01-01",
    kpis: [
      { key: "us_commercial", en: "U.S. commercial revenue", es: "Ingresos comerciales EE. UU.", unit: "$M", kind: "flow", range: [10, 100000], hint: "U.S. commercial revenue in the quarter, in millions of USD" },
      { key: "us_government", en: "U.S. government revenue", es: "Ingresos de gobierno EE. UU.", unit: "$M", kind: "flow", range: [50, 100000], hint: "U.S. government revenue in the quarter, in millions of USD" },
      { key: "tcv", en: "Total contract value closed", es: "Valor de contratos cerrados (TCV)", unit: "$M", kind: "flow", range: [50, 200000], hint: "Closed total contract value (TCV) in the quarter, in millions of USD" },
      { key: "us_comm_rdv", en: "U.S. commercial remaining deal value", es: "Valor pendiente de contratos comerciales EE. UU.", unit: "$M", kind: "stock", range: [50, 500000], hint: "U.S. commercial remaining deal value (RDV) at quarter end, in millions of USD" },
      { key: "deals_1m", en: "Deals of at least $1M", es: "Contratos de 1 M$ o más", unit: "n", kind: "flow", range: [5, 10000], hint: "Number of deals of at least $1 million closed in the quarter" },
      { key: "adj_fcf", en: "Adjusted free cash flow", es: "Flujo de caja libre ajustado", unit: "$M", kind: "flow", range: [-5000, 100000], hint: "Adjusted free cash flow in the quarter, in millions of USD" },
      { key: "rule40", en: "Rule of 40 score", es: "Regla del 40", unit: "share", kind: "avg", range: [-100, 400], hint: "Rule of 40 score for the quarter, in %" },
      { key: "guidance_next", en: "Revenue outlook for next quarter", es: "Previsión de ingresos del trimestre siguiente", unit: "$M", kind: "flow", range: [100, 2000000], hint: "Revenue guidance for the NEXT quarter given in this release (midpoint if a range), in millions of USD; attach it to the quarter being reported; omit if only full-year guidance is given" },
    ],
    charts: [
      { id: "us", en: "U.S. revenue: commercial / government", es: "Ingresos EE. UU.: comercial / gobierno", type: "stack", keys: ["us_commercial", "us_government"] },
      { id: "tcv", en: "Total contract value closed", es: "Valor de contratos cerrados (TCV)", type: "bar", keys: ["tcv"] },
      { id: "rdv", en: "U.S. commercial remaining deal value", es: "Valor pendiente comercial EE. UU.", type: "bar", keys: ["us_comm_rdv"] },
      { id: "deals", en: "Deals of at least $1M", es: "Contratos de 1 M$ o más", type: "bar", keys: ["deals_1m"] },
      { id: "r40", en: "Rule of 40 score", es: "Regla del 40", type: "line", keys: ["rule40"] },
      { id: "guide", en: "Revenue vs. prior-quarter outlook", es: "Ingresos frente a la previsión del trimestre anterior", type: "bar", keys: ["revenue", "guidance_next"], derived: "guidance" },
      { id: "fcf", en: "Adjusted free cash flow", es: "Flujo de caja libre ajustado", type: "bar", keys: ["adj_fcf"] },
    ],
  },
  NFLX: {
    from: "2020-01-01",
    until: "2025-02-28",
    note: {
      en: "Netflix stopped reporting paid memberships and ARM every quarter in 2025.",
      es: "Netflix dejó de publicar cada trimestre los suscriptores y el ARM en 2025.",
    },
    kpis: [
      { key: "memberships", en: "Paid memberships", es: "Suscripciones de pago", unit: "M", kind: "stock", range: [100, 1000], hint: "Global streaming paid memberships at end of quarter, in millions" },
      { key: "net_adds", en: "Paid net additions", es: "Altas netas", unit: "M", kind: "flow", range: [-30, 60], hint: "Global streaming paid net additions, in millions (negative if losses)" },
      { key: "arm", en: "Average revenue per membership (monthly)", es: "Ingreso medio por suscripción (mensual)", unit: "$", kind: "avg", range: [5, 40], hint: "Global average revenue per membership (ARM) per month, in USD; omit if only regional ARM is shown" },
      { key: "mem_ucan", en: "Memberships · US & Canada", es: "Suscripciones · EE. UU. y Canadá", unit: "M", kind: "stock", range: [20, 300], hint: "UCAN (United States and Canada) paid memberships, in millions" },
      { key: "mem_emea", en: "Memberships · EMEA", es: "Suscripciones · EMEA", unit: "M", kind: "stock", range: [20, 400], hint: "EMEA paid memberships, in millions" },
      { key: "mem_latam", en: "Memberships · LATAM", es: "Suscripciones · LATAM", unit: "M", kind: "stock", range: [10, 300], hint: "LATAM paid memberships, in millions" },
      { key: "mem_apac", en: "Memberships · APAC", es: "Suscripciones · APAC", unit: "M", kind: "stock", range: [5, 400], hint: "APAC (Asia-Pacific) paid memberships, in millions" },
      { key: "arm_ucan", en: "ARM · US & Canada", es: "ARM · EE. UU. y Canadá", unit: "$", kind: "avg", range: [5, 40], hint: "UCAN average revenue per membership per month, in USD" },
      { key: "arm_emea", en: "ARM · EMEA", es: "ARM · EMEA", unit: "$", kind: "avg", range: [3, 30], hint: "EMEA average revenue per membership per month, in USD" },
      { key: "arm_latam", en: "ARM · LATAM", es: "ARM · LATAM", unit: "$", kind: "avg", range: [2, 30], hint: "LATAM average revenue per membership per month, in USD" },
      { key: "arm_apac", en: "ARM · APAC", es: "ARM · APAC", unit: "$", kind: "avg", range: [2, 30], hint: "APAC average revenue per membership per month, in USD" },
    ],
    charts: [
      { id: "mem", en: "Paid memberships by region", es: "Suscripciones de pago por región", type: "stack", keys: ["mem_ucan", "mem_emea", "mem_latam", "mem_apac"] },
      { id: "adds", en: "Paid net additions", es: "Altas netas", type: "bar", keys: ["net_adds"] },
      { id: "arm", en: "Average revenue per membership (monthly)", es: "Ingreso medio por suscripción (mensual)", type: "line", keys: ["arm", "arm_ucan", "arm_emea", "arm_latam", "arm_apac"] },
    ],
  },
};

const MAX_TEXT = 120_000;
const DAY = 86400000;

// ---------------------------------------------------------------- extracción

interface Extract { quarters: { period_end: string; revenue?: number; net_income?: number; values: Record<string, number> }[] }

function schemaFor(defs: KpiDef[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["quarters"],
    properties: {
      quarters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["period_end", "values"],
          properties: {
            period_end: { type: "string", description: "Cierre del trimestre, AAAA-MM-DD (último día del mes)" },
            revenue: { type: "number", description: "Ingresos totales del trimestre, en millones de USD" },
            net_income: { type: "number", description: "Beneficio neto atribuible a los accionistas del trimestre (GAAP), en millones de USD" },
            values: {
              type: "object",
              additionalProperties: false,
              properties: Object.fromEntries(defs.map((d) => [d.key, { type: "number", description: d.hint }])),
            },
          },
        },
      },
    },
  };
}

const SYSTEM = `Extraes métricas operativas (KPIs) de comunicados de resultados trimestrales de empresas cotizadas de EE. UU. (anexo 99.1 de un 8-K).
Reglas:
- Devuelve un elemento por cada trimestre que aparezca en las tablas del comunicado (actual, mismo trimestre del año anterior y, si hay una tabla de varios trimestres, todos ellos).
- Solo cifras de un trimestre (tres meses). Nunca acumulados del año, cifras anuales ni previsiones.
- period_end: último día del último mes del trimestre (p. ej. Q4'23 → 2023-12-31; "three months ended September 30, 2026" → 2026-09-30).
- Respeta la unidad indicada en cada campo: si la tabla está en miles o en miles de millones, conviértelo.
- revenue: ingresos totales GAAP del trimestre en millones de USD (para comprobar las unidades).
- net_income: beneficio neto GAAP atribuible a los accionistas del trimestre, en millones de USD, si aparece.
- Si un KPI no aparece para ese trimestre, omítelo. No calcules ni estimes cifras que no estén en el texto.`;

// ---------------------------------------------------------------- cola y proceso

/**
 * 8-K de resultados (Item 2.02) presentados entre dos fechas. La lista "recent" de la SEC tiene los
 * últimos ~1.000 informes (Netflix: solo desde 2023, por sus muchos formularios 4); los anteriores
 * están en páginas aparte (`filings.files`), que se leen si la ventana llega hasta ellas.
 */
async function earnings8KBetween(cik: number, from: string, until: string, ua?: string) {
  const r = await secFetch(`https://data.sec.gov/submissions/CIK${cik10(cik)}.json`, ua);
  if (!r.ok) return [];
  const j: any = await r.json();
  const pages: any[] = [j.filings?.recent];
  for (const f of j.filings?.files ?? []) {
    if (f.filingTo < from || f.filingFrom > until) continue;
    const p = await secFetch(`https://data.sec.gov/submissions/${f.name}`, ua);
    if (p.ok) pages.push(await p.json());
  }
  const out = new Map<string, string>();
  for (const rec of pages) {
    for (let i = 0; i < (rec?.form?.length ?? 0); i++) {
      const d = rec.filingDate[i];
      if (rec.form[i] !== "8-K" || d < from || d > until || !String(rec.items?.[i] ?? "").split(",").includes("2.02")) continue;
      out.set(rec.accessionNumber[i], d);
    }
  }
  return [...out].map(([accn, filed]) => ({ accn, filed }));
}

/** Encola los 8-K de resultados de la empresa en su ventana de fechas. */
async function queueReleases(db: D1Database, ticker: string, cik: number, def: CompanyKpis, ua?: string) {
  const from = def.from ?? new Date(Date.now() - 3 * 365 * DAY).toISOString().slice(0, 10);
  // También los CIK anteriores (ExxonMobil y BlackRock pasaron a una sociedad holding nueva)
  const ciks = [cik, ...(SEC_UNIVERSE.find((u) => u.ticker === ticker)?.prev ?? [])];
  const list: { accn: string; filed: string; cik: number }[] = [];
  for (const c of ciks) for (const f of await earnings8KBetween(c, from, def.until ?? "9999-12-31", ua)) list.push({ ...f, cik: c });
  for (const f of list)
    await db
      .prepare("INSERT OR IGNORE INTO sec_kpis (accn, ticker, cik, filed, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)")
      .bind(f.accn, ticker, f.cik, f.filed, Date.now(), Date.now())
      .run();
  await db
    .prepare("INSERT INTO sec_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(`kpis_queue:${ticker}`, String(list.length), Date.now())
    .run();
}

/** Fecha del trimestre de la capa 1 más cercana (±10 días): las empresas cierran a fin de mes o en sábado. */
function matchQuarter(date: string, quarterly: { date: string }[]): string | null {
  const t = new Date(date + "T00:00:00Z").getTime();
  let best: string | null = null, gap = Infinity;
  for (const q of quarterly) {
    const g = Math.abs(new Date(q.date + "T00:00:00Z").getTime() - t);
    if (g < gap) (gap = g), (best = q.date);
  }
  return gap <= 10 * DAY ? best : null;
}

export interface KpiCheck { name: string; ok: boolean; detail: string }

/** Valida lo extraído: ingresos frente a la SEC y rangos plausibles. Devuelve los trimestres limpios. */
export function validateKpis(x: Extract, defs: KpiDef[], quarterly: { date: string; totalRevenue?: number | null; netIncome?: number | null }[], anchor: "revenue" | "net_income" = "revenue") {
  const checks: KpiCheck[] = [];
  const out: { date: string; revenue?: number; values: Record<string, number> }[] = [];
  let matched = 0, mismatched = 0;
  for (const q of x.quarters ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.period_end)) continue;
    const date = matchQuarter(q.period_end, quarterly) ?? q.period_end;
    const qp = quarterly.find((p) => p.date === date);
    const sec = anchor === "net_income" ? qp?.netIncome : qp?.totalRevenue;
    const mine = anchor === "net_income" ? q.net_income : q.revenue;
    if (typeof mine === "number" && typeof sec === "number" && (anchor === "net_income" ? sec !== 0 : sec > 0)) {
      // Ingresos redondeados en el comunicado (Booking da los trimestres anteriores en miles de millones
      // con un decimal): se admite el medio paso del redondeo
      const rounding = mine % 100 === 0 ? 50e6 : mine % 10 === 0 ? 5e6 : 0;
      const ok = Math.abs(mine * 1e6 - sec) <= Math.abs(sec) * 0.005 + 1e6 + rounding;
      const what = anchor === "net_income" ? "beneficio" : "ingresos";
      checks.push({ name: `${what} ${date}`, ok, detail: `comunicado ${mine} M; SEC ${(sec / 1e6).toFixed(0)} M${ok ? "" : ": trimestre descartado"}` });
      if (!ok) {
        mismatched++;
        continue;
      }
      matched++;
    }
    const values: Record<string, number> = {};
    for (const d of defs) {
      const v = q.values?.[d.key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (v < d.range[0] || v > d.range[1]) {
        checks.push({ name: `rango ${d.key} ${date}`, ok: false, detail: `${v} fuera de [${d.range.join(", ")}]: descartado` });
        continue;
      }
      values[d.key] = v;
    }
    if (Object.keys(values).length) out.push({ date, revenue: q.revenue, values });
  }
  // Rechazo: ningún trimestre comprobable, o no cuadra la mayoría
  const ok = matched > 0 && matched > mismatched && out.length > 0;
  if (matched + mismatched === 0) checks.push({ name: anchor === "net_income" ? "beneficio" : "ingresos", ok: false, detail: "ningún trimestre comparable con la SEC" });
  return { ok, checks, quarters: out };
}

export async function processKpiRelease(db: D1Database, env: ClaudeEnv & { SEC_USER_AGENT?: string }, accn: string): Promise<string> {
  const row = await db.prepare("SELECT * FROM sec_kpis WHERE accn = ?").bind(accn).first<any>();
  if (!row) return "missing";
  const def = KPI_DEFS[row.ticker];
  if (!def) return "no-defs";
  const set = (fields: Record<string, unknown>) => {
    const keys = Object.keys(fields);
    return db
      .prepare(`UPDATE sec_kpis SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE accn = ?`)
      .bind(...keys.map((k) => fields[k] as any), Date.now(), accn)
      .run();
  };
  try {
    const pr = await fetchPressRelease(row.cik, accn, env.SEC_USER_AGENT);
    if (!pr) {
      await set({ status: "error", error: "sin anexo 99.1" });
      return "error";
    }
    if (def.minChars && pr.text.length < def.minChars) {
      await set({ status: "skipped", error: `comunicado corto (${pr.text.length} caracteres): sin tablas de KPIs`, doc_url: pr.url });
      return "skipped";
    }
    const r = await askClaudeJson<Extract>(env, {
      system: SYSTEM,
      user: `Empresa: ${row.ticker}\n${def.revenueHint ? `Ingresos: ${def.revenueHint}\n` : ""}KPIs a extraer: ${def.kpis.map((d) => `${d.key} = ${d.hint}`).join("; ")}\n\nComunicado (8-K del ${row.filed}):\n${pr.text.slice(0, MAX_TEXT)}`,
      schema: schemaFor(def.kpis),
      maxTokens: 6000,
      effort: "low",
    });
    const fin = await getSecFinancials(db, row.ticker, { syncIfMissing: false });
    const v = validateKpis(r.data, def.kpis, fin?.quarterly ?? [], def.anchor);
    await set({
      status: v.ok ? "done" : "rejected",
      data: JSON.stringify({ quarters: v.quarters, model: SEC_MODEL }),
      checks: JSON.stringify(v.checks),
      doc_url: pr.url,
      usage: JSON.stringify({ ...r.usage, chars: Math.min(pr.text.length, MAX_TEXT) }),
      error: v.ok ? null : v.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join(" | ").slice(0, 500),
    });
    return v.ok ? "done" : "rejected";
  } catch (e: any) {
    if (isBudgetError(e)) return "budget";
    // Sin saldo en la cuenta de Anthropic: queda pendiente (no es culpa del comunicado)
    if (/credit balance/i.test(String(e?.message || e))) {
      await set({ status: "pending", error: "sin saldo en la cuenta de Anthropic" });
      return "no-credit";
    }
    // Región no admitida por la API (no debería pasar con el proxy de EE. UU.): se reintenta después
    if (/Request not allowed/i.test(String(e?.message || e))) {
      await set({ status: "pending", error: "región no admitida por la API de Anthropic" });
      return "no-credit";
    }
    await set({ status: "error", error: String(e?.message || e).slice(0, 500) });
    return "error";
  }
}

/** Tarea programada: encola comunicados nuevos (cada 12 h por empresa) y procesa hasta `max`. */
export async function runKpisCron(db: D1Database, env: ClaudeEnv & { SEC_USER_AGENT?: string }, max = 4): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const ticker of Object.keys(KPI_DEFS)) {
    if (fetchBudgetLeft() < 10) break;
    const meta = await db.prepare("SELECT updated_at FROM sec_meta WHERE key = ?").bind(`kpis_queue:${ticker}`).first<{ updated_at: number }>();
    if (meta && Date.now() - meta.updated_at < DAY / 2) continue;
    const c = await db.prepare("SELECT cik FROM sec_companies WHERE ticker = ?").bind(ticker).first<{ cik: number }>();
    if (!c) continue;
    await queueReleases(db, ticker, c.cik, KPI_DEFS[ticker], env.SEC_USER_AGENT).catch((e) => {
      if (isBudgetError(e)) throw e;
    });
    out[`queued:${ticker}`] = true;
  }
  // Errores pasajeros: se reintentan al cabo de un día
  const { results } = await db
    .prepare("SELECT accn FROM sec_kpis WHERE status = 'pending' OR (status = 'error' AND updated_at < ?) ORDER BY filed DESC LIMIT ?")
    .bind(Date.now() - DAY, max)
    .all<{ accn: string }>();
  for (const { accn } of results) {
    // Índice + comunicado (+ 99.2) + Claude con un reintento
    if (fetchBudgetLeft() < 8) break;
    out[accn] = await processKpiRelease(db, env, accn);
    if (out[accn] === "budget" || out[accn] === "no-credit") break;
  }
  return out;
}

// ---------------------------------------------------------------- lectura

export interface KpiPoint { date: string; values: Record<string, number>; confirmed: Record<string, boolean> }

// Otras clases de acciones de la misma empresa
const KPI_ALIASES: Record<string, string> = { GOOG: "GOOGL", "BRK-A": "BRK-B" };

export async function getKpis(db: D1Database, ticker: string) {
  const t = KPI_ALIASES[normTicker(ticker)] ?? normTicker(ticker);
  const def = KPI_DEFS[t];
  if (!def) return null;
  const { results } = await db
    .prepare("SELECT accn, filed, status, data, doc_url FROM sec_kpis WHERE ticker = ? ORDER BY filed DESC")
    .bind(t)
    .all<{ accn: string; filed: string; status: string; data: string | null; doc_url: string | null }>();
  // Por trimestre y KPI: el comunicado más reciente manda; confirmado si otro da la misma cifra (±0,5 %)
  const byDate = new Map<string, { values: Record<string, number>; seen: Record<string, number[]> }>();
  for (const r of results) {
    if (r.status !== "done" || !r.data) continue;
    for (const q of (JSON.parse(r.data).quarters ?? []) as { date: string; revenue?: number; values: Record<string, number> }[]) {
      const cur = byDate.get(q.date) ?? { values: {}, seen: {} };
      const vals = { ...q.values, ...(typeof q.revenue === "number" ? { revenue: q.revenue } : {}) };
      for (const [k, v] of Object.entries(vals)) {
        if (cur.values[k] === undefined) cur.values[k] = v;
        (cur.seen[k] ||= []).push(v);
      }
      byDate.set(q.date, cur);
    }
  }
  const points: KpiPoint[] = [...byDate]
    .map(([date, x]) => ({
      date,
      values: x.values,
      confirmed: Object.fromEntries(Object.entries(x.seen).map(([k, vs]) => [k, vs.filter((v) => Math.abs(v - x.values[k]) <= Math.abs(x.values[k]) * 0.005 + 0.01).length >= 2])),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const counts = results.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  return {
    ticker: t,
    kpis: def.kpis.map(({ key, en, es, unit, kind }) => ({ key, en, es, unit, kind })),
    charts: def.charts,
    note: def.note ?? null,
    points,
    releases: counts,
    latestRelease: results.find((r) => r.status === "done") ? { filed: results.find((r) => r.status === "done")!.filed, url: results.find((r) => r.status === "done")!.doc_url } : null,
  };
}
