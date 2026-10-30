import Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";

/**
 * IA de investiando con Claude (API de Anthropic). Único punto donde se elige el modelo.
 * La clave se guarda como secreto del Worker: npx wrangler secret put ANTHROPIC_API_KEY
 *
 * `generateContent` acepta los mismos parámetros que la función de Gemini de server.ts
 * (`generateGeminiContentWithRetry`) y devuelve `{ text }`, que es lo único que leen las rutas.
 * Así las rutas de IA se copian sin cambios. Traducción:
 *   - contents (texto o [{ role: "user" | "model", parts: [{ text } | { inlineData }] }]) → messages
 *   - config.systemInstruction → system
 *   - config.responseMimeType "application/json" → instrucción de responder solo JSON + limpieza
 *   - config.tools [{ googleSearch }] → búsqueda web de Claude (web_search)
 *   - temperature / topP / etc. se ignoran (la API actual de Claude ya no los acepta)
 */
export const MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

interface GeminiPart {
  text?: string;
  inlineData?: { data: string; mimeType?: string };
}
type GeminiContents = string | Array<string | { role?: string; parts?: GeminiPart[] }>;

export interface GenerateParams {
  contents: GeminiContents;
  config?: any;
  /** Nombre de modelo de Gemini en server.ts; se ignora. */
  primaryModel?: string;
  effort?: Effort;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const JSON_ONLY =
  "Responde únicamente con JSON válido: sin bloques de código, sin explicaciones y sin texto antes o después del JSON.";

function toBlocks(parts: GeminiPart[]): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      const mime = (p.inlineData.mimeType || "image/png").toLowerCase();
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: (IMAGE_TYPES.has(mime) ? mime : "image/png") as any, data: p.inlineData.data },
      });
    } else if (typeof p.text === "string" && p.text.trim()) {
      blocks.push({ type: "text", text: p.text });
    }
  }
  return blocks;
}

/** Convierte contents de Gemini a mensajes de Claude: alterna roles y empieza por el usuario. */
function toMessages(contents: GeminiContents): Anthropic.Beta.BetaMessageParam[] {
  const items = typeof contents === "string" ? [contents] : contents;
  const msgs: { role: "user" | "assistant"; content: Anthropic.Beta.BetaContentBlockParam[] }[] = [];
  for (const item of items) {
    const role = typeof item === "object" && item?.role === "model" ? "assistant" : "user";
    const blocks = typeof item === "string" ? toBlocks([{ text: item }]) : toBlocks(item?.parts || []);
    if (blocks.length === 0) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else msgs.push({ role, content: blocks });
  }
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  if (msgs.length === 0) throw new Error("La consulta a la IA está vacía.");
  if (msgs[msgs.length - 1].role === "assistant") msgs.push({ role: "user", content: [{ type: "text", text: "Continúa." }] });
  return msgs;
}

function systemText(config: any): string {
  const si = config?.systemInstruction;
  if (!si) return "";
  if (typeof si === "string") return si;
  if (Array.isArray(si?.parts)) return si.parts.map((p: any) => p?.text || "").join("\n");
  if (typeof si?.text === "string") return si.text;
  return "";
}

/** Saca el JSON de una respuesta: quita ``` y, si hace falta, recorta al objeto o lista exterior. */
function cleanJson(text: string): string {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    // sigue abajo
  }
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const a = stripped.indexOf(open);
    const b = stripped.lastIndexOf(close);
    if (a >= 0 && b > a) {
      const candidate = stripped.slice(a, b + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // prueba el otro tipo
      }
    }
  }
  return stripped;
}

export async function generateContent({ contents, config, effort = "medium" }: GenerateParams): Promise<{ text: string }> {
  const apiKey = (env as any).ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY en Cloudflare.");
  // El SDK ya reintenta errores temporales (429, 5xx, red).
  const client = new Anthropic({ apiKey, maxRetries: 3 });

  const wantsJson = String(config?.responseMimeType || "").toLowerCase() === "application/json";
  const useSearch = Array.isArray(config?.tools) && config.tools.some((t: any) => t && ("googleSearch" in t || "google_search" in t));
  const system = [systemText(config), wantsJson ? JSON_ONLY : ""].filter(Boolean).join("\n\n");

  const messages = toMessages(contents);
  let message: Anthropic.Beta.BetaMessage | null = null;

  // Con búsqueda web, el servidor puede pausar el turno (pause_turn): se reenvía tal cual para que siga.
  for (let attempt = 0; attempt < 4; attempt++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      output_config: { effort },
      // Si los filtros de seguridad rechazan la solicitud, Anthropic la reintenta con otro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(system ? { system } : {}),
      ...(useSearch ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] } : {}),
      messages,
    } as any);
    message = await stream.finalMessage();
    if (message.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: message.content as any });
  }

  if (!message) throw new Error("El modelo no respondió.");
  if (message.stop_reason === "refusal") throw new Error("El modelo rechazó la solicitud.");
  if (message.stop_reason === "max_tokens") throw new Error("La respuesta del modelo quedó incompleta (límite de longitud).");

  // Con búsqueda web, la respuesta final es el texto que viene después del último resultado de búsqueda.
  const blocks = message.content;
  let start = 0;
  blocks.forEach((b, i) => {
    if (b.type === "web_search_tool_result") start = i + 1;
  });
  let text = blocks
    .slice(start)
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("El modelo no devolvió texto.");

  if (wantsJson || useSearch) {
    const cleaned = cleanJson(text);
    // Solo se usa la versión recortada si de verdad era JSON; si no, el texto queda igual.
    try {
      JSON.parse(cleaned);
      text = cleaned;
    } catch {
      // texto libre
    }
  }
  return { text };
}
