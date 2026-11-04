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
};
const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenuesNetOfInterestExpense",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
];
const OI_TAG = "OperatingIncomeLoss";
const TAGS = new Set([...REVENUE_TAGS, OI_TAG]);

/** Cifra de un miembro en un periodo: [eje, miembro, etiqueta, inicio, fin, valor, presentado] */
export type SegFact = [AxisKey, string, string, string, string, number, string];

const attr = (s: string, name: string) => s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** Cifras por segmento/producto/geografía de un informe XBRL. */
export function parseSegmentFacts(xml: string, filed: string): SegFact[] {
  const ctx = new Map<string, { axis: AxisKey; member: string; start: string; end: string; via?: string }>();
  const ctxRe = /<(?:[\w-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?context>/g;
  for (const m of xml.matchAll(ctxRe)) {
    const id = attr(m[1], "id");
    const body = m[2];
    if (!id || /typedMember/.test(body)) continue;
    const dims = [...body.matchAll(/<(?:[\w-]+:)?explicitMember[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*</g)].map((x) => [x[1], x[2]]);
    const main = dims.filter(([d]) => AXES[d]);
    const rest = dims.filter(([d]) => !AXES[d]);
    // Geografía cruzada con un producto (Netflix: países × "Streaming"): se guarda aparte y solo se
    // usa si no hay cifra geográfica pura y el producto es único (ver más abajo).
    let via: string | undefined;
    if (main.length === 2 && rest.length === 0) {
      const geo = main.find(([d]) => AXES[d] === "geography");
      const prod = main.find(([d]) => AXES[d] === "product");
      if (!geo || !prod) continue;
      via = prod[1];
      main.splice(0, 2, geo);
    }
    if (main.length !== 1) continue;
    // Solo el eje, o el eje + "segmentos operativos" (Apple, UnitedHealth)
    if (rest.length > 1 || (rest.length === 1 && !(rest[0][0] === "srt:ConsolidationItemsAxis" && /OperatingSegmentsMember$/.test(rest[0][1])))) continue;
    const start = body.match(/<(?:[\w-]+:)?startDate>\s*([\d-]+)\s*</)?.[1];
    const end = body.match(/<(?:[\w-]+:)?endDate>\s*([\d-]+)\s*</)?.[1];
    if (!start || !end) continue;
    ctx.set(id, { axis: AXES[main[0][0]], member: main[0][1], start, end, via });
  }
  const out: SegFact[] = [];
  const seen = new Set<string>();
  const crossed = new Map<string, { fact: SegFact; via: Set<string> }>();
  const factRe = /<us-gaap:(\w+)\b([^>]*?)>([^<]*)<\/us-gaap:\1>/g;
  for (const m of xml.matchAll(factRe)) {
    const [, tag, attrs, raw] = m;
    if (!TAGS.has(tag)) continue;
    const c = ctx.get(attr(attrs, "contextRef") ?? "");
    const val = Number(raw.trim());
    if (!c || !Number.isFinite(val)) continue;
    const key = `${c.axis}|${c.member}|${tag}|${c.start}|${c.end}`;
    if (c.via) {
      const cur = crossed.get(key);
      if (cur) cur.via.add(c.via);
      else crossed.set(key, { fact: [c.axis, c.member, tag, c.start, c.end, val, filed], via: new Set([c.via]) });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([c.axis, c.member, tag, c.start, c.end, val, filed]);
  }
  for (const [key, x] of crossed) if (!seen.has(key) && x.via.size === 1) out.push(x.fact);
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

/** Nombre legible a partir del miembro XBRL si el informe no trae etiqueta. */
export function humanize(member: string): string {
  const local = member.split(":").pop()!.replace(/Member$/, "").replace(/Segment$/, "");
  if (COUNTRIES[local]) return COUNTRIES[local];
  return local
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\bAnd\b/g, "&")
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
}

export interface SegAxis {
  tag: string;
  members: { id: string; label: string }[];
  periods: SegPeriod[];
}

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
export function buildSegments(facts: SegFact[], annual: SecPeriod[], quarterly: SecPeriod[], labels: Record<string, string>, asOf: string | null): SegmentData {
  // Cifra más reciente por (eje, miembro, etiqueta, inicio, fin)
  const latest = new Map<string, SegFact>();
  for (const f of facts) {
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
  const periodValue = (axis: string, member: string, tag: string, p: PeriodRef): number | undefined => {
    const direct = val(axis, member, tag, p.start, p.date);
    if (direct !== undefined || p.kind === "FY") return direct;
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
    let bestAxis: SegAxis | null = null;
    let bestScore = -1;
    for (const tag of REVENUE_TAGS) {
      const members = membersOf.get(tag);
      if (!members || members.size === 0) continue;
      const periods: SegPeriod[] = [];
      let matchedCount = 0;
      const perPeriod = refs.map((p) => {
        const found: [string, number, string][] = [];
        for (const m of members) {
          usedFiled = "";
          const v = periodValue(axis, m, tag, p);
          if (v !== undefined) found.push([m, v, usedFiled]);
        }
        // Reorganizaciones: manda el informe más reciente que publica el periodo. Los miembros que
        // ese informe ya no usa (segmentos antiguos) se descartan para ese periodo.
        const newest = found.reduce((mx, f) => (f[2] > mx ? f[2] : mx), "");
        return found.filter((f) => f[2] === newest).map(([m, v]) => [m, v] as [string, number]);
      });
      // Un miembro es el total de otros solo si coincide con su suma en al menos dos periodos
      // (una coincidencia puntual no cuenta: Azure ≈ 365 Cloud + Xbox en un trimestre de Microsoft)
      const maps = perPeriod.map((v) => new Map(v));
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
      for (const [pi, p] of refs.entries()) {
        const vals = perPeriod[pi];
        if (vals.length === 0) continue;
        const chosen = p.total !== null ? bestSubset(vals, p.total, confirmParent) : null;
        // Sin coincidencia: un solo miembro no es un desglose (p. ej. "ReportableSegment")
        if (!chosen && (vals.length < 2 || axis !== "segment")) continue; // productos/geografía: solo si cuadra
        const use = new Set(chosen ?? withoutParents(vals, labels));
        if (use.size < 2) continue; // una sola línea no es un desglose
        const revenue: Record<string, number> = {};
        const oi: Record<string, number> = {};
        for (const [m, v] of vals) if (use.has(m)) revenue[m] = v;
        for (const m of use) {
          const o = periodValue(axis, m, OI_TAG, p);
          if (o !== undefined) oi[m] = o;
        }
        if (chosen) matchedCount++;
        periods.push({ date: p.date, start: p.start, kind: p.kind, fiscalYear: p.fiscalYear, fiscalQuarter: p.fiscalQuarter, revenue, operatingIncome: oi, total: p.total, matched: !!chosen });
      }
      if (periods.length === 0) continue;
      const score = matchedCount * 1000 + periods.length;
      if (score > bestScore) {
        bestScore = score;
        bestAxis = { tag, members: [], periods };
      }
    }
    if (!bestAxis) continue;
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
      .map((id) => ({ id, label: labels[id] || humanize(id) }));
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
function withoutParents(vals: [string, number][], labels: Record<string, string>): string[] {
  const name = (id: string) => (labels[id] || humanize(id)).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  return vals
    .filter(([id, v]) => {
      const n = name(id);
      const kids = vals.filter(([o]) => o !== id && name(o).startsWith(n + " "));
      return !(kids.length >= 2 && v >= Math.max(...kids.map(([, x]) => x)));
    })
    .map(([id]) => id);
}

/** Miembros de las cifras (para pedir sus etiquetas). */
export function membersIn(facts: SegFact[]): Set<string> {
  return new Set(facts.map((f) => f[1]));
}
