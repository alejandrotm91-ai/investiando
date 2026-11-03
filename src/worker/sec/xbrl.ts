// Lee el XBRL de un informe concreto (archivo *_htm.xml del 10-Q/10-K) y devuelve sus cifras en
// el mismo formato que la API "companyfacts". Se usa cuando esa API no incluye un informe ya
// presentado (pasa: Visa, Citi o NextEra tenían 10-Q de hace meses sin procesar).
// Solo cifras de la empresa en conjunto (sin dimensiones: segmentos, clases de acción…).

import type { CompanyFacts, SecFact } from "./normalize";

interface Ctx {
  start?: string;
  end: string;
}

const attr = (s: string, name: string) => s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

export function parseXbrlInstance(xml: string, meta: { accn: string; form: string; filed: string }): CompanyFacts["facts"] {
  // Contextos sin dimensiones
  const ctx = new Map<string, Ctx>();
  const ctxRe = /<(?:[\w-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?context>/g;
  for (const m of xml.matchAll(ctxRe)) {
    const id = attr(m[1], "id");
    const body = m[2];
    if (!id || /<(?:[\w-]+:)?(segment|scenario)\b/.test(body)) continue;
    const inst = body.match(/<(?:[\w-]+:)?instant>\s*([\d-]+)\s*</)?.[1];
    const start = body.match(/<(?:[\w-]+:)?startDate>\s*([\d-]+)\s*</)?.[1];
    const end = body.match(/<(?:[\w-]+:)?endDate>\s*([\d-]+)\s*</)?.[1];
    if (inst) ctx.set(id, { end: inst });
    else if (start && end) ctx.set(id, { start, end });
  }
  // Unidades: USD, USD/shares, shares
  const units = new Map<string, string>();
  const unitRe = /<(?:[\w-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?unit>/g;
  for (const m of xml.matchAll(unitRe)) {
    const id = attr(m[1], "id");
    if (!id) continue;
    const measures = [...m[2].matchAll(/<(?:[\w-]+:)?measure>\s*([^<\s]+)\s*</g)].map((x) => x[1].split(":").pop()!);
    if (/divide/.test(m[2]) && measures.length === 2) units.set(id, `${measures[0]}/${measures[1]}`);
    else if (measures.length === 1) units.set(id, measures[0]);
  }
  // Cifras us-gaap
  const facts: CompanyFacts["facts"] = { "us-gaap": {} };
  const gaap = facts["us-gaap"];
  const factRe = /<us-gaap:(\w+)\b([^>]*?)(?:\/>|>([^<]*)<\/us-gaap:\1>)/g;
  for (const m of xml.matchAll(factRe)) {
    const [, tag, attrs, raw] = m;
    if (raw === undefined || /xsi:nil="true"/.test(attrs)) continue;
    const c = ctx.get(attr(attrs, "contextRef") ?? "");
    const unit = units.get(attr(attrs, "unitRef") ?? "");
    const val = Number(raw.trim());
    if (!c || !unit || !Number.isFinite(val)) continue;
    const f: SecFact = { end: c.end, val, accn: meta.accn, form: meta.form, filed: meta.filed };
    if (c.start) f.start = c.start;
    const node = (gaap[tag] ||= { units: {} });
    const list = (node.units[unit] ||= []);
    if (!list.some((x) => x.start === f.start && x.end === f.end)) list.push(f);
  }
  return facts;
}
