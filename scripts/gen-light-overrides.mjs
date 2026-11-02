// Genera las reglas del modo claro para las clases de color "oscuras" que usa el código.
// Uso: node scripts/gen-light-overrides.mjs   (reescribe el bloque marcado en src/index.css)
//
// El modo claro funciona con la clase .light en <html> y reglas que traducen las clases oscuras
// de Tailwind a los colores del tema. Escribirlas a mano dejaba fuera muchos colores sueltos
// (bg-[#0b0d14], bg-[#0f111a]/70…), con texto oscuro sobre fondo casi negro. Este script recorre
// src/, mide la luminosidad de cada color de fondo y genera:
//  - fondos oscuros neutros → var(--theme-card) (o var(--theme-sidebar) si son semitransparentes)
//  - degradados que parten de tonos oscuros → colores del tema
//  - textos pastel (sky-300, amber-300…), legibles sobre negro pero no sobre blanco → tono 700
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CSS = path.join(ROOT, "src/index.css");
const START = "/* === light-overrides:start (generado por scripts/gen-light-overrides.mjs) === */";
const END = "/* === light-overrides:end === */";

// Paleta neutra de Tailwind (oscuros) en hex, para medir luminosidad.
const NAMED = {
  "slate-600": "#475569", "slate-700": "#334155", "slate-750": "#283548", "slate-800": "#1e293b", "slate-850": "#172033", "slate-900": "#0f172a", "slate-950": "#020617", "slate-955": "#01040f",
  "gray-700": "#374151", "gray-800": "#1f2937", "gray-900": "#111827", "gray-950": "#030712",
  "zinc-800": "#27272a", "zinc-900": "#18181b", "zinc-950": "#09090b",
  "neutral-800": "#262626", "neutral-900": "#171717", "neutral-950": "#0a0a0a",
  "black": "#000000",
};
// Tono oscuro para cada familia de color pastel (Tailwind 700).
const DARK_700 = {
  sky: "#0369a1", amber: "#b45309", purple: "#7e22ce", blue: "#1d4ed8", indigo: "#4338ca", violet: "#6d28d9",
  pink: "#be185d", teal: "#0f766e", cyan: "#0e7490", orange: "#c2410c", lime: "#4d7c0f", fuchsia: "#a21caf",
  yellow: "#a16207", green: "#15803d", red: "#b91c1c",
};

const hexToRgb = (h) => {
  let x = h.replace("#", "");
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
// "Oscuro neutro": muy poca luz y poco color (grises, negros y azules noche del tema oscuro).
const isDarkNeutral = (hex, limit = 0.06) => { const rgb = hexToRgb(hex); return lum(rgb) < limit && (sat(rgb) < 0.55 || Math.max(...rgb) < 48); };
// Familias de color (para fondos de color muy oscuro: bg-emerald-950/20 → tinte suave del 700)
const TINT_SHADES = new Set(["800", "900", "950"]);

// Escapa un nombre de clase de Tailwind para usarlo en un selector CSS.
const esc = (cls) => cls.replace(/([\[\]#\/:.%(),])/g, "\\$1");

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== "worker") walk(p); }
    else if (/\.(tsx|ts)$/.test(f)) files.push(p);
  }
})(path.join(ROOT, "src"));
const source = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");

const classes = new Set(source.match(/(?:hover:|group-hover:|focus:)?(?:bg|from|via|to|text|border|divide)-(?:\[#[0-9a-fA-F]{3,8}\]|[a-z]+-\d{2,3}|black)(?:\/\d{1,3})?/g) || []);

const bgSolid = [], bgSoft = [], bgHover = [], gradients = { from: [], via: [], to: [] }, texts = {}, borders = [], divides = [], tints = {}, tintBorders = {};
for (const full of classes) {
  const m = full.match(/^(hover:|group-hover:|focus:)?(bg|from|via|to|text|border|divide)-(\[#([0-9a-fA-F]{3,8})\]|([a-z]+-\d{2,3}|black))(?:\/(\d{1,3}))?$/);
  if (!m) continue;
  const [, variant, kind, , hex, named, alpha] = m;
  const color = hex ? `#${hex.slice(0, 6)}` : NAMED[named];
  if (kind === "text") {
    const fam = named?.match(/^([a-z]+)-(100|200|300|400)$/);
    if (!variant && fam && DARK_700[fam[1]]) (texts[DARK_700[fam[1]]] ||= []).push(full);
    continue;
  }
  // Fondos y bordes de color muy oscuro (emerald-950, rose-900…): tinte suave del mismo color.
  const fam = named?.match(/^([a-z]+)-(\d{3})$/);
  if (!variant && fam && DARK_700[fam[1] === "emerald" ? "green" : fam[1] === "rose" ? "red" : fam[1]] && TINT_SHADES.has(fam[2])) {
    const base = DARK_700[fam[1] === "emerald" ? "green" : fam[1] === "rose" ? "red" : fam[1]];
    if (kind === "bg") (tints[base] ||= []).push(full);
    if (kind === "border") (tintBorders[base] ||= []).push(full);
    continue;
  }
  if (kind === "border" || kind === "divide") {
    if (!variant && color && isDarkNeutral(color, 0.09)) (kind === "border" ? borders : divides).push(full);
    continue;
  }
  if (!color || !isDarkNeutral(color)) continue;
  if (kind === "bg") {
    if (variant) bgHover.push(full);
    else if (alpha && Number(alpha) < 80) bgSoft.push(full);
    else bgSolid.push(full);
  } else if (!variant) {
    gradients[kind].push(full);
  }
}

const sel = (list, suffix = "") => list.sort().map((c) => `.light .${esc(c)}${suffix}`).join(",\n");
let css = `${START}\n/* No editar a mano: node scripts/gen-light-overrides.mjs */\n`;
if (bgSolid.length) css += `${sel(bgSolid)} {\n  background-color: var(--theme-card) !important;\n}\n`;
if (bgSoft.length) css += `${sel(bgSoft)} {\n  background-color: var(--theme-sidebar) !important;\n}\n`;
if (bgHover.length) css += `${sel(bgHover, ":hover")} {\n  background-color: var(--theme-card-hover) !important;\n}\n`;
if (gradients.from.length) css += `${sel(gradients.from)} {\n  --tw-gradient-from: var(--theme-card) !important;\n}\n`;
if (gradients.via.length) css += `${sel(gradients.via)} {\n  --tw-gradient-via: var(--theme-card) !important;\n}\n`;
if (gradients.to.length) css += `${sel(gradients.to)} {\n  --tw-gradient-to: var(--theme-sidebar) !important;\n}\n`;
for (const [dark, list] of Object.entries(texts)) css += `${sel(list)} {\n  color: ${dark} !important;\n}\n`;
for (const [dark, list] of Object.entries(tints)) css += `${sel(list)} {\n  background-color: color-mix(in srgb, ${dark} 9%, var(--theme-card)) !important;\n}\n`;
for (const [dark, list] of Object.entries(tintBorders)) css += `${sel(list)} {\n  border-color: color-mix(in srgb, ${dark} 30%, var(--theme-border)) !important;\n}\n`;
if (borders.length) css += `${sel(borders)} {\n  border-color: var(--theme-border) !important;\n}\n`;
if (divides.length) {
  const divSel = divides.sort().map((c) => ".light ." + esc(c) + " > :not(:last-child)").join(",\n");
  css += `${divSel} {\n  border-color: var(--theme-border) !important;\n}\n`;
}
// Velos de las ventanas emergentes (fixed inset-0 + backdrop-blur): siguen siendo semitransparentes
// para que se vea la página detrás; más específico que las reglas anteriores.
css += `.light .fixed.inset-0[class*="backdrop-blur"][class*="bg-"] {\n  background-color: rgba(27, 25, 23, 0.35) !important;\n}\n`;
css += `${END}`;

let file = fs.readFileSync(CSS, "utf8");
const a = file.indexOf(START), b = file.indexOf(END);
if (a >= 0 && b > a) file = file.slice(0, a) + css + file.slice(b + END.length);
else {
  // Primera vez: justo después del bloque de variables .light { … }, para que las reglas
  // específicas escritas a mano más abajo (con selectores más concretos) sigan mandando.
  const i = file.indexOf("/* Dynamic Skin Overrides for Light Mode */");
  file = file.slice(0, i) + css + "\n\n" + file.slice(i);
}
fs.writeFileSync(CSS, file);
console.log(`bordes ${borders.length + divides.length}, tintes ${Object.values(tints).flat().length + Object.values(tintBorders).flat().length}, fondos sólidos ${bgSolid.length}, semitransparentes ${bgSoft.length}, hover ${bgHover.length}, degradados ${gradients.from.length + gradients.via.length + gradients.to.length}, textos ${Object.values(texts).flat().length}`);
