// Capa 2 de la SEC: ingresos (y beneficio operativo si se publica) por segmento, producto y
// geografía, leídos del XBRL de cada 10-Q/10-K. La API companyfacts no los trae: solo da cifras
// consolidadas, así que se lee el XBRL de cada informe (archivo *_htm.xml).
//
// Dificultades y cómo se resuelven:
//  - Cada empresa estructura distinto. Se usan tres ejes estándar: StatementBusinessSegmentsAxis
//    (segmentos), srt:ProductOrServiceAxis (productos) y srt:StatementGeographicalAxis (geografía).
//    Se aceptan contextos con solo ese eje, o ese eje + ConsolidationItemsAxis = OperatingSegments.
//  - Totales mezclados con su desglose (Apple: "Products" e iPhone/Mac/iPad; Nvidia: "Data Center" e
//    Hyperscale/AI Clouds). En cada periodo se elige el desglose más detallado cuya suma coincide
//    con los ingresos consolidados oficiales (búsqueda de subconjuntos).
//  - Si ningún desglose suma el total (segmentos antes de eliminaciones entre segmentos), se muestran
//    todos y se indica la cobertura.
//  - Trimestres: el 10-Q da 3 meses y acumulado; el T4 = ejercicio − 9 meses, como en la capa 1.
//  - Reorganizaciones: los informes nuevos repiten los periodos anteriores con la estructura nueva
//    (Microsoft 2026); manda el informe más reciente de cada periodo.

import type { SecPeriod } from "./normalize";

export type AxisKey = "segment" | "product" | "geography";

const AXES: Record<string, AxisKey> = {
  "us-gaap:StatementBusinessSegmentsAxis": "segment",
  "srt:ProductOrServiceAxis": "product",
  "srt:StatementGeographicalAxis": "geography",
  // Hasta 2018 estos ejes (y ConsolidationItemsAxis) llevaban el prefijo us-gaap
  "us-gaap:ProductOrServiceAxis": "product",
  "us-gaap:StatementGeographicalAxis": "geography",
};
const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenuesNetOfInterestExpense",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet", // antes de la norma de ingresos de 2018 (ASC 606): 10-K de 2017 y anteriores
  "SalesRevenueGoodsNet", // ventas de productos antes de 2018 (Pfizer)
];
const OI_TAG = "OperatingIncomeLoss";
const GENERIC_SUFFIX = /^(equipment|inc|incorporated|corp|corporation|co|company|llc|ltd|plc|systems?|group|business|division|unit)$/;
const AGGREGATE_MEMBER = /:ReportableSegmentAggregationBeforeOtherOperatingSegmentMember$/;
const TAGS = new Set([...REVENUE_TAGS, OI_TAG]);

/** Cifra de un miembro en un periodo: [eje, miembro, etiqueta, inicio, fin, valor, presentado] */
export type SegFact = [AxisKey, string, string, string, string, number, string];

const attr = (s: string, name: string) => s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/**
 * Cifras por segmento/producto/geografía de un informe XBRL. Si un miembro aparece a la vez solo
 * con su eje y con "segmentos operativos" (Caterpillar: ventas externas frente a ventas con las de
 * otros segmentos), `prefer` elige la variante; sin él, la que aparece primero.
 */
export function parseSegmentFacts(xml: string, filed: string, prefer?: "ops" | "plain"): SegFact[] {
  const ctx = new Map<string, { axis: AxisKey; member: string; start: string; end: string; via?: string; half?: string; ops: boolean }>();
  const ctxRe = /<(?:[\w-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?context>/g;
  const raw: { id: string; body: string; dims: string[][] }[] = [];
  const productMembers = new Set<string>();
  // Contextos con cifras de ingresos (para ver qué productos aparecen en ellas)
  const revCtx = new Set<string>();
  for (const m of xml.matchAll(/<us-gaap:(\w+)\b([^>]*?)>[^<]*<\/us-gaap:\1>/g)) {
    if (TAGS.has(m[1]) && m[1] !== OI_TAG) revCtx.add(attr(m[2], "contextRef") ?? "");
  }
  for (const m of xml.matchAll(ctxRe)) {
    const id = attr(m[1], "id");
    const body = m[2];
    if (!id || /typedMember/.test(body)) continue;
    const dims = [...body.matchAll(/<(?:[\w-]+:)?explicitMember[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*</g)].map((x) => [x[1], x[2]]);
    if (revCtx.has(id)) for (const [d, mem] of dims) if (AXES[d] === "product") productMembers.add(mem);
    raw.push({ id, body, dims });
  }
  // Un solo producto en las cifras de ingresos (Chevron: "OilAndGas" en todas) no informa de nada: se ignora
  const soleProduct = productMembers.size === 1 ? [...productMembers][0] : null;
  for (const { id, body, dims: all } of raw) {
    const dims = soleProduct ? all.filter(([d, mem]) => !(AXES[d] === "product" && mem === soleProduct)) : all;
    const main = dims.filter(([d]) => AXES[d]);
    // "Segmento declarado" (Caterpillar 2019-2022): junto al eje de segmentos no cambia la cifra y
    // se ignora; con geografía es la suma de los segmentos, no las ventas de la región.
    const subseg = ([d, m]: string[]) => /:SubsegmentsConsolidationItemsAxis$/.test(d) && /:ReportableSubsegmentsMember$/.test(m);
    const rest = dims.filter((x) => !AXES[x[0]] && !(subseg(x) && main.length === 1 && AXES[main[0][0]] === "segment"));
    // Geografía cruzada con un producto (Netflix: países × "Streaming"): se guarda aparte y solo se
    // usa si no hay cifra geográfica pura y el producto es único (ver más abajo).
    // Segmento × (EE. UU. | fuera de EE. UU.) (Chevron desde 2023): las dos mitades se suman si el
    // informe no da el segmento solo.
    let via: string | undefined;
    let half: string | undefined;
    if (main.length === 2 && rest.length === 0) {
      const geo = main.find(([d]) => AXES[d] === "geography");
      const prod = main.find(([d]) => AXES[d] === "product");
      const seg = main.find(([d]) => AXES[d] === "segment");
      if (geo && seg && /^(country:US|us-gaap:NonUsMember)$/.test(geo[1])) {
        half = geo[1];
        main.splice(0, 2, seg);
      } else {
        if (!geo || !prod) continue;
        via = prod[1];
        main.splice(0, 2, geo);
      }
    }
    if (main.length !== 1) continue;
    // Miembro estándar "suma de los segmentos declarados" (Chevron desde 2023): es un total, no un segmento
    if (AGGREGATE_MEMBER.test(main[0][1])) continue;
    // Solo el eje, o el eje + "segmentos operativos" (Apple, UnitedHealth)
    if (rest.length > 1 || (rest.length === 1 && !(/:ConsolidationItemsAxis$/.test(rest[0][0]) && /:OperatingSegmentsMember$/.test(rest[0][1])))) continue;
    const start = body.match(/<(?:[\w-]+:)?startDate>\s*([\d-]+)\s*</)?.[1];
    const end = body.match(/<(?:[\w-]+:)?endDate>\s*([\d-]+)\s*</)?.[1];
    if (!start || !end) continue;
    ctx.set(id, { axis: AXES[main[0][0]], member: main[0][1], start, end, via, half, ops: rest.length === 1 });
  }
  const out: SegFact[] = [];
  const seen = new Map<string, { i: number; ops: boolean }>();
  const crossed = new Map<string, { fact: SegFact; via: Set<string> }>();
  const halves = new Map<string, { fact: SegFact; parts: Map<string, number> }>();
  const factRe = /<us-gaap:(\w+)\b([^>]*?)>([^<]*)<\/us-gaap:\1>/g;
  for (const m of xml.matchAll(factRe)) {
    const [, tag, attrs, raw] = m;
    if (!TAGS.has(tag)) continue;
    const c = ctx.get(attr(attrs, "contextRef") ?? "");
    const val = Number(raw.trim());
    if (!c || !Number.isFinite(val)) continue;
    const key = `${c.axis}|${c.member}|${tag}|${c.start}|${c.end}`;
    if (c.half) {
      const cur = halves.get(key) ?? { fact: [c.axis, c.member, tag, c.start, c.end, 0, filed] as SegFact, parts: new Map<string, number>() };
      cur.parts.set(c.half, val);
      halves.set(key, cur);
      continue;
    }
    if (c.via) {
      const cur = crossed.get(key);
      if (cur) cur.via.add(c.via);
      else crossed.set(key, { fact: [c.axis, c.member, tag, c.start, c.end, val, filed], via: new Set([c.via]) });
      continue;
    }
    const prev = seen.get(key);
    if (prev) {
      if (prefer && prev.ops !== c.ops && c.ops === (prefer === "ops")) {
        out[prev.i] = [c.axis, c.member, tag, c.start, c.end, val, filed];
        prev.ops = c.ops;
      }
      continue;
    }
    seen.set(key, { i: out.length, ops: c.ops });
    out.push([c.axis, c.member, tag, c.start, c.end, val, filed]);
  }
  for (const [key, x] of crossed) if (!seen.has(key) && x.via.size === 1) out.push(x.fact);
  for (const [key, x] of halves) {
    if (seen.has(key) || x.parts.size !== 2) continue;
    const f = [...x.fact] as SegFact;
    f[5] = [...x.parts.values()].reduce((a, b) => a + b, 0);
    out.push(f);
  }
  return out;
}

/** Etiquetas de los miembros (archivo *_lab.xml del informe): "aapl:IPhoneMember" → "iPhone". */
export function parseLabels(labXml: string, wanted: Set<string>): Record<string, string> {
  const locs = new Map<string, string>(); // xlink:label del localizador → nombre local
  for (const m of labXml.matchAll(/<(?:[\w-]+:)?loc\b([^>]*)\/?>/g)) {
    const href = attr(m[1], "xlink:href");
    const lab = attr(m[1], "xlink:label");
    const name = href?.split("#")[1];
    if (lab && name) locs.set(lab, name.replace(/^([a-z0-9-]+)_/i, "$1:"));
  }
  const arcs = new Map<string, string[]>(); // localizador → etiquetas
  for (const m of labXml.matchAll(/<(?:[\w-]+:)?labelArc\b([^>]*)\/?>/g)) {
    const from = attr(m[1], "xlink:from");
    const to = attr(m[1], "xlink:to");
    if (from && to) arcs.set(from, [...(arcs.get(from) ?? []), to]);
  }
  const texts = new Map<string, { role: string; text: string }[]>();
  for (const m of labXml.matchAll(/<(?:[\w-]+:)?label\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?label>/g)) {
    const lab = attr(m[1], "xlink:label");
    if (!lab) continue;
    const role = attr(m[1], "xlink:role") ?? "";
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    texts.set(lab, [...(texts.get(lab) ?? []), { role, text }]);
  }
  const out: Record<string, string> = {};
  for (const [loc, name] of locs) {
    if (!wanted.has(name)) continue;
    const all = (arcs.get(loc) ?? []).flatMap((l) => texts.get(l) ?? []);
    const pick = all.find((t) => /terseLabel$/.test(t.role)) ?? all.find((t) => /\/label$/.test(t.role)) ?? all[0];
    if (pick) out[name] = pick.text.replace(/\s*\[Member\]$/i, "").replace(/\s+(Segment|Member)$/i, "").trim();
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\u00a0/g, " ");
}

const COUNTRIES: Record<string, string> = {
  US: "United States", CN: "China", JP: "Japan", TW: "Taiwan", GB: "United Kingdom", DE: "Germany", FR: "France",
  IN: "India", CA: "Canada", KR: "South Korea", IE: "Ireland", SG: "Singapore", MX: "Mexico", BR: "Brazil",
  NL: "Netherlands", CH: "Switzerland", HK: "Hong Kong", AU: "Australia", IT: "Italy", ES: "Spain", IL: "Israel",
  MY: "Malaysia", NonUs: "International",
};

/**
 * Etiqueta de un miembro. En los países estándar la etiqueta del informe puede venir de otro
 * contexto (Caterpillar: "U.S. Plans" por sus pensiones; AT&T: "Domestic equities"): entonces, nombre fijo.
 */
export function memberLabel(id: string, labels: Record<string, string>): string {
  const own = labels[id];
  if (own && (/^country:/.test(id) || id === "us-gaap:NonUsMember") && /\b(plans?|pensions?|equit(y|ies)|securities|bonds?|funds?)\b/i.test(own))
    return humanize(id);
  return own || humanize(id);
}

/** Nombre legible a partir del miembro XBRL si el informe no trae etiqueta. */
export function humanize(member: string): string {
  const local = member.split(":").pop()!.replace(/Member$/, "").replace(/Segment$/, "");
  if (COUNTRIES[local]) return COUNTRIES[local];
  return local
    .replace(/ThreeSixFive/g, " 365 ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\bAnd\b/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------- construcción por periodos

export interface SegPeriod {
  date: string;
  start: string;
  kind: "Q" | "FY";
  fiscalYear: number;
  fiscalQuarter: number | null;
  revenue: Record<string, number>; // miembro → ingresos
  operatingIncome: Record<string, number>; // miembro → beneficio operativo (si lo hay)
  total: number | null; // ingresos consolidados oficiales del periodo
  matched: boolean; // el desglose suma el total
  recast?: boolean; // cifras rehechas con la estructura actual, del 8-K de reorganización (capa 4)
  src?: string; // fecha del informe más reciente del que salen las cifras
  derived?: boolean; // alguna cifra calculada por diferencia de acumulados (T4 = año − 9 meses)
}

export interface SegAxis {
  tag: string;
  members: { id: string; label: string }[];
  periods: SegPeriod[];
  recast?: RecastRef; // 8-K de reorganización usado para los periodos con recast = true
}

/** 8-K con el histórico rehecho tras una reorganización (capa 4, recast.ts). */
export interface RecastRef { axis: AxisKey; filed: string; accn: string; url: string | null }

export interface SegmentData {
  asOf: string | null; // último informe usado
  axes: Partial<Record<AxisKey, SegAxis>>;
}

const DAY = 86400000;
const nextDay = (d: string) => new Date(new Date(d + "T00:00:00Z").getTime() + DAY).toISOString().slice(0, 10);

/**
 * Desglose más detallado cuya suma coincide con el total (±0,3 %) y que no mezcla un total con sus
 * propias partes (Oracle: "Software" junto a "Support" y "License"). null si no hay ninguno.
 */
function bestSubset(vals: [string, number][], target: number, confirmParent: (parent: string, kids: string[]) => boolean = () => true): string[] | null {
  let list = vals;
  if (list.length > 18) list = [...list].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 18);
  const n = list.length;
  if (n === 0) return null;
  const tol = Math.abs(target) * 0.003 + 1e6;
  const sums = new Float64Array(1 << n);
  const pop = (m: number) => { let c = 0; for (; m; m &= m - 1) c++; return c; };
  const matches: number[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const low = mask & -mask;
    sums[mask] = sums[mask ^ low] + list[31 - Math.clz32(low)][1];
    if (Math.abs(sums[mask] - target) <= tol) matches.push(mask);
  }
  // ¿Algún miembro del desglose es la suma de otros dos o más del mismo desglose?
  const hasParent = (mask: number) => {
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const v = list[i][1];
      const t = Math.abs(v) * 0.002 + 1e5;
      const rest = mask & ~(1 << i);
      for (let sub = rest; sub; sub = (sub - 1) & rest) {
        if ((sub & (sub - 1)) && Math.abs(sums[sub] - v) <= t) {
          const kids = list.filter((_, k) => sub & (1 << k)).map(([id]) => id);
          if (confirmParent(list[i][0], kids)) return true;
        }
      }
    }
    return false;
  };
  matches.sort((a, b) => pop(b) - pop(a));
  const best = matches.find((m) => !hasParent(m));
  if (best === undefined) return null;
  return list.filter((_, i) => best & (1 << i)).map(([id]) => id);
}

interface PeriodRef { date: string; start: string; kind: "Q" | "FY"; fiscalYear: number; fiscalQuarter: number | null; total: number | null }

/**
 * Agrupa las cifras por periodo (calendario fiscal de la capa 1) y elige el desglose de cada eje.
 */
export function buildSegments(facts: SegFact[], annual: SecPeriod[], quarterly: SecPeriod[], labels: Record<string, string>, asOf: string | null, recasts: RecastRef[] = []): SegmentData {
  // Cifra más reciente por (eje, miembro, etiqueta, inicio, fin), con los renombres unificados
  const latest = new Map<string, SegFact>();
  for (const f of applyAliases(facts, labels)) {
    if (AGGREGATE_MEMBER.test(f[1])) continue; // guardado antes de que el lector lo descartara
    const k = `${f[0]}|${f[1]}|${f[2]}|${f[3]}|${f[4]}`;
    const cur = latest.get(k);
    if (!cur || f[6] >= cur[6]) latest.set(k, f);
  }
  // `usedFiled`: fecha del informe más reciente entre las cifras usadas en el último cálculo
  let usedFiled = "";
  const val = (axis: string, member: string, tag: string, start: string, end: string) => {
    const f = latest.get(`${axis}|${member}|${tag}|${start}|${end}`);
    if (f && f[6] > usedFiled) usedFiled = f[6];
    return f?.[5];
  };

  // Periodos: ejercicios y trimestres, con el inicio del ejercicio de cada trimestre
  const fyStart = new Map<number, string>();
  for (const a of annual) fyStart.set(a.fiscalYear, a.startDate);
  for (const q of quarterly) if (q.fiscalQuarter === 1 && !fyStart.has(q.fiscalYear)) fyStart.set(q.fiscalYear, q.startDate);
  const qByYear = new Map<number, SecPeriod[]>();
  for (const q of quarterly) qByYear.set(q.fiscalYear, [...(qByYear.get(q.fiscalYear) ?? []), q]);
  for (const list of qByYear.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const refs: PeriodRef[] = [
    ...quarterly.map((q) => ({ date: q.date, start: q.startDate, kind: "Q" as const, fiscalYear: q.fiscalYear, fiscalQuarter: q.fiscalQuarter, total: typeof q.totalRevenue === "number" ? q.totalRevenue : null })),
    ...annual.map((a) => ({ date: a.date, start: a.startDate, kind: "FY" as const, fiscalYear: a.fiscalYear, fiscalQuarter: null, total: typeof a.totalRevenue === "number" ? a.totalRevenue : null })),
  ];

  // Valor de un miembro en un periodo: directo; si no, acumulado − acumulado anterior (T4 = año − 9M)
  let usedDerived = false;
  const periodValue = (axis: string, member: string, tag: string, p: PeriodRef): number | undefined => {
    const direct = val(axis, member, tag, p.start, p.date);
    if (direct !== undefined || p.kind === "FY") return direct;
    usedDerived = true;
    const fs = fyStart.get(p.fiscalYear);
    const qs = qByYear.get(p.fiscalYear) ?? [];
    const i = qs.findIndex((q) => q.date === p.date);
    if (!fs || i <= 0) return undefined;
    const cum = (end: string, idx: number): number | undefined => {
      const c = val(axis, member, tag, fs, end);
      if (c !== undefined) return c;
      if (idx === 0) return val(axis, member, tag, fs, end);
      const prev = cum(qs[idx - 1].date, idx - 1);
      const q = val(axis, member, tag, nextDay(qs[idx - 1].date), end);
      return prev !== undefined && q !== undefined ? prev + q : undefined;
    };
    const now = cum(p.date, i);
    const before = cum(qs[i - 1].date, i - 1);
    return now !== undefined && before !== undefined ? now - before : undefined;
  };

  const out: SegmentData = { asOf, axes: {} };
  for (const axis of ["segment", "product", "geography"] as AxisKey[]) {
    const membersOf = new Map<string, Set<string>>(); // etiqueta → miembros
    for (const f of latest.values()) {
      if (f[0] !== axis) continue;
      if (!membersOf.has(f[2])) membersOf.set(f[2], new Set());
      membersOf.get(f[2])!.add(f[1]);
    }
    const recast = recasts.find((r) => r.axis === axis);
    const candidates: { tag: string; periods: SegPeriod[]; score: number }[] = [];
    for (const tag of REVENUE_TAGS) {
      const members = membersOf.get(tag);
      if (!members || members.size === 0) continue;
      const periods: SegPeriod[] = [];
      let matchedCount = 0;
      const newestOf: string[] = [];
      const derivedOf: Set<string>[] = [];
      const perPeriod = refs.map((p) => {
        const found: [string, number, string][] = [];
        const derived = new Set<string>();
        for (const m of members) {
          usedFiled = "";
          usedDerived = false;
          const v = periodValue(axis, m, tag, p);
          if (v !== undefined) found.push([m, v, usedFiled]);
          if (v !== undefined && usedDerived) derived.add(m);
        }
        derivedOf.push(derived);
        // Reorganizaciones: manda el informe más reciente que publica el periodo. Los miembros que
        // ese informe ya no usa (segmentos antiguos) se descartan para ese periodo.
        // Si hay cifras publicadas directamente, las calculadas (T4 = año − 9 meses, que pueden mezclar
        // informes de antes y después de una reorganización) no deciden cuál es el más reciente
        const direct = found.filter((f) => !derived.has(f[0]));
        const pool = direct.length ? direct : found;
        const newest = pool.reduce((mx, f) => (f[2] > mx ? f[2] : mx), "");
        newestOf.push(newest);
        return pool.filter((f) => f[2] === newest).map(([m, v]) => [m, v] as [string, number]);
      });
      // Un miembro es el total de otros solo si coincide con su suma en al menos dos periodos
      // (una coincidencia puntual no cuenta: Azure ≈ 365 Cloud + Xbox en un trimestre de Microsoft)
      const maps = perPeriod.map((v) => new Map(v));
      const freq = new Map<string, number>();
      for (const v of perPeriod) for (const [m] of v) freq.set(m, (freq.get(m) ?? 0) + 1);
      const confirmParent = (parent: string, kids: string[]) => {
        let hits = 0;
        for (const mp of maps) {
          const pv = mp.get(parent);
          if (pv === undefined || kids.some((k) => !mp.has(k))) continue;
          const sum = kids.reduce((acc, k) => acc + mp.get(k)!, 0);
          if (Math.abs(sum - pv) <= Math.abs(pv) * 0.002 + 1e5 && ++hits >= 2) return true;
        }
        return false;
      };
      const choices = refs.map((p, pi) => (perPeriod[pi].length && p.total !== null ? bestSubset(perPeriod[pi], p.total, confirmParent) : null));
      // Productos/geografía que no cuadran: valen las mismas líneas que en al menos dos periodos que sí
      // cuadran, si cubren entre el 90 % y el 100 % de los ingresos (Netflix hasta 2022: regiones solo de
      // streaming, el DVD aparte). La diferencia se muestra aparte.
      const structures = new Map<string, number>();
      for (const c of choices) if (c && c.length >= 2) structures.set([...c].sort().join("|"), (structures.get([...c].sort().join("|")) ?? 0) + 1);
      const confirmed = [...structures].filter(([, n]) => n >= 2).map(([k]) => k.split("|")).sort((a, b) => b.length - a.length);
      const partialOf = (vals: [string, number][], total: number | null) => {
        if (!total || total <= 0) return null;
        const mp = new Map(vals);
        for (const st of confirmed) {
          if (!st.every((m) => mp.has(m))) continue;
          const sum = st.reduce((a, m) => a + mp.get(m)!, 0);
          if (sum >= total * 0.9 && sum <= total * 1.003) return st;
        }
        return null;
      };
      for (const [pi, p] of refs.entries()) {
        const vals = perPeriod[pi];
        if (vals.length === 0) continue;
        const chosen = choices[pi];
        const partial = !chosen && axis !== "segment" ? partialOf(vals, p.total) : null;
        // Sin coincidencia: un solo miembro no es un desglose (p. ej. "ReportableSegment")
        if (!chosen && !partial && (vals.length < 2 || axis !== "segment")) continue; // productos/geografía: solo si cuadra
        const use = new Set(chosen ?? partial ?? withoutParents(vals, labels, freq, confirmParent));
        if (use.size < 2) continue; // una sola línea no es un desglose
        const revenue: Record<string, number> = {};
        const oi: Record<string, number> = {};
        for (const [m, v] of vals) if (use.has(m)) revenue[m] = v;
        for (const m of use) {
          const o = periodValue(axis, m, OI_TAG, p);
          if (o !== undefined) oi[m] = o;
        }
        if (chosen) matchedCount++;
        const sp: SegPeriod = { date: p.date, start: p.start, kind: p.kind, fiscalYear: p.fiscalYear, fiscalQuarter: p.fiscalQuarter, revenue, operatingIncome: oi, total: p.total, matched: !!chosen };
        if (recast && newestOf[pi] === `${recast.filed}R`) sp.recast = true; // recastKey() en recast.ts
        sp.src = newestOf[pi];
        if ([...use].some((m) => derivedOf[pi].has(m))) sp.derived = true;
        periods.push(sp);
      }
      if (periods.length === 0) continue;
      const score = matchedCount * 1000 + periods.length;
      candidates.push({ tag, periods, score });
    }
    // La etiqueta con más periodos que cuadran manda; los periodos que solo tienen otra etiqueta
    // (años antiguos con "SalesRevenueNet", un año en que la empresa cambió de etiqueta) se añaden
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) continue;
    const bestAxis: SegAxis = { tag: candidates[0].tag, members: [], periods: [...candidates[0].periods] };
    for (const c of candidates.slice(1)) {
      for (const p of c.periods) if (!bestAxis.periods.some((q) => q.date === p.date && q.kind === p.kind)) bestAxis.periods.push(p);
    }
    if (recast && bestAxis.periods.some((x) => x.recast)) bestAxis.recast = recast;
    // Productos y geografía solo si algún periodo cuadra con el total (si no, es un desglose parcial)
    if (axis !== "segment" && !bestAxis.periods.some((p) => p.matched)) continue;
    // Eje desfasado: su último periodo es de hace más de 15 meses respecto al último de la empresa
    const newestCompany = refs.reduce((m, r) => (r.date > m ? r.date : m), "");
    const newestAxis = bestAxis.periods.reduce((m, r) => (r.date > m ? r.date : m), "");
    if (newestCompany && new Date(newestCompany).getTime() - new Date(newestAxis).getTime() > 456 * DAY) continue;
    // Una sola línea de negocio en todos los periodos no aporta nada
    const ids = new Set(bestAxis.periods.flatMap((p) => Object.keys(p.revenue)));
    if (ids.size < 2) continue;
    // Orden: por ingresos del periodo más reciente (los que ya no existen, al final)
    const latestP = [...bestAxis.periods].sort((a, b) => b.date.localeCompare(a.date))[0];
    bestAxis.members = [...ids]
      .sort((a, b) => (latestP.revenue[b] ?? -Infinity) - (latestP.revenue[a] ?? -Infinity))
      .map((id) => ({ id, label: memberLabel(id, labels) }));
    bestAxis.periods.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === "FY" ? 1 : -1));
    out.axes[axis] = bestAxis;
  }
  return out;
}

/**
 * Sin desglose que cuadre (eliminaciones entre segmentos): se quitan los miembros "padre" cuyo
 * nombre encabeza el de otros dos o más y que valen al menos lo que el mayor de ellos
 * (UnitedHealth: "Optum" frente a "Optum Rx", "Optum Health" y "Optum Insight").
 */
function withoutParents(
  vals: [string, number][],
  labels: Record<string, string>,
  freq: Map<string, number>,
  confirm: (parent: string, kids: string[]) => boolean
): string[] {
  const name = (id: string) => memberLabel(id, labels).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 0.002 + 1e5;
  // Suma de otras dos o más líneas (Caterpillar 2016-2017: "Machinery, Energy & Transportation"
  // = Construction + Resource + Energy & Transportation), confirmado en dos periodos y con un nombre
  // de agregado: contiene el de una de las partes o dice "total"/"reportable" (si no, las
  // coincidencias numéricas quitarían segmentos de verdad)
  const isSum = (id: string, v: number) => {
    const n = name(id);
    const aggregate = /\b(total|reportable)\b/.test(n);
    const o = vals.filter(([k, x]) => k !== id && x > 0 && x < v);
    if (o.length < 2 || o.length > 12) return false;
    for (let mask = 1; mask < 1 << o.length; mask++) {
      if ((mask & (mask - 1)) === 0) continue; // al menos dos
      let sum = 0;
      for (let i = 0; i < o.length; i++) if (mask & (1 << i)) sum += o[i][1];
      if (!near(sum, v)) continue;
      const kids = o.filter((_, i) => mask & (1 << i)).map(([k]) => k);
      if ((aggregate || kids.some((k) => name(k).length >= 4 && n.includes(name(k)))) && confirm(id, kids)) return true;
    }
    return false;
  };
  const kept = vals.filter(([id, v]) => {
    const n = name(id);
    // Líneas de total ("Total sales and revenues from reportable segments" de Caterpillar)
    if (/^total\b/.test(n) && vals.length > 2) return false;
    const kids = vals.filter(([o]) => o !== id && name(o).startsWith(n + " "));
    if (kids.length >= 2 && v >= Math.max(...kids.map(([, x]) => x))) return false;
    return !(vals.length > 2 && isSum(id, v));
  });
  // Dos miembros con el mismo nombre en un periodo: el que aparece en más periodos
  const byName = new Map<string, string>();
  for (const [id] of kept) {
    const n = normLabel(memberLabel(id, labels));
    const prev = byName.get(n);
    if (!prev || (freq.get(id) ?? 0) > (freq.get(prev) ?? 0)) byName.set(n, id);
  }
  return kept.filter(([id]) => byName.get(normLabel(memberLabel(id, labels))) === id).map(([id]) => id);
}

/** Nombre normalizado para comparar etiquetas ("Datacenter" = "Data Center", "&" = "and"). */
export const normLabel = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/\b(operating|reportable|segments?|member|and)\b/g, "").replace(/[^a-z0-9]/g, "");

/**
 * Renombres: el mismo segmento con otro miembro XBRL según el informe (Texas Instruments en el 10-K
 * frente a sus 10-Q, "OptumRx" → "Optum Rx", "Commercial Operating" → "Commercial"). Dos miembros del
 * mismo eje son el mismo si nunca aparecen en el mismo informe, ninguna cifra de un periodo común
 * difiere más de un 1 % y o bien se llaman igual o bien coinciden en algún periodo común.
 * Devuelve miembro antiguo → miembro más reciente.
 */
export function memberAliases(facts: SegFact[], labels: Record<string, string>): Map<string, string> {
  interface Info { axis: AxisKey; filed: Set<string>; last: string; vals: Map<string, number> }
  const info = new Map<string, Info>();
  for (const f of facts) {
    const k = `${f[0]}|${f[1]}`;
    let x = info.get(k);
    if (!x) info.set(k, (x = { axis: f[0], filed: new Set(), last: "", vals: new Map() }));
    x.filed.add(f[6]);
    if (f[6] > x.last) x.last = f[6];
    x.vals.set(`${f[2]}|${f[3]}|${f[4]}`, f[5]);
  }
  const ids = [...info.keys()];
  const alias = new Map<string, string>();
  const best = new Map<string, number>();
  for (const a of ids) {
    for (const b of ids) {
      const A = info.get(a)!, B = info.get(b)!;
      if (a === b || A.axis !== B.axis || A.last >= B.last) continue; // a = antiguo, b = reciente
      if ([...A.filed].some((d) => B.filed.has(d))) continue;
      let same = 0, bad = false;
      for (const [k, v] of A.vals) {
        const w = B.vals.get(k);
        if (w === undefined) continue;
        if (Math.abs(v - w) <= Math.abs(w) * 0.0005 + 5e5) same++;
        else if (Math.abs(v - w) > Math.abs(w) * 0.01) bad = true;
      }
      if (bad) continue;
      const ma = a.slice(a.indexOf("|") + 1), mb = b.slice(b.indexOf("|") + 1);
      const la = normLabel(memberLabel(ma, labels)), lb = normLabel(memberLabel(mb, labels));
      // Mismo nombre, o el mismo más una palabra genérica (Chevron: "Upstream Equipment" → "Upstream";
      // "Collins Aerospace Systems"). Otros añadidos cambian el alcance ("Client" → "Client and Gaming").
      const [short, long] = la.length <= lb.length ? [la, lb] : [lb, la];
      const prefix = short.length >= 5 && short !== long && long.startsWith(short) && GENERIC_SUFFIX.test(long.slice(short.length));
      const score = (la && la === lb ? 100 : prefix ? 50 : 0) + same;
      if (score === 0 || (la !== lb && !prefix && same === 0)) continue;
      if (score > (best.get(a) ?? 0)) {
        best.set(a, score);
        alias.set(a, b);
      }
    }
  }
  // Resultado por miembro, siguiendo cadenas (a → b → c)
  const out = new Map<string, string>();
  for (const a of alias.keys()) {
    let t = alias.get(a)!;
    for (let i = 0; i < 5 && alias.has(t); i++) t = alias.get(t)!;
    out.set(a, t);
  }
  return out;
}

/** Aplica los renombres: las cifras de miembros antiguos pasan al miembro actual. */
export function applyAliases(facts: SegFact[], labels: Record<string, string>): SegFact[] {
  const alias = memberAliases(facts, labels);
  if (alias.size === 0) return facts;
  return facts.map((f) => {
    const t = alias.get(`${f[0]}|${f[1]}`);
    return t ? ([f[0], t.slice(t.indexOf("|") + 1), f[2], f[3], f[4], f[5], f[6]] as SegFact) : f;
  });
}

/** Miembros de las cifras (para pedir sus etiquetas). */
export function membersIn(facts: SegFact[]): Set<string> {
  return new Set(facts.map((f) => f[1]));
}
