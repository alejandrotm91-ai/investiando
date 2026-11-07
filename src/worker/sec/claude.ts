// Llamada a Claude con salida JSON forzada por esquema, compartida por las capas 3 y 4 de la SEC.

import Anthropic from "@anthropic-ai/sdk";
import { fetchBudgetLeft, useFetchBudget } from "./client";

export const SEC_MODEL = "claude-opus-5-5";

export interface ClaudeEnv { ANTHROPIC_API_KEY?: string; ANTHROPIC_WORKSPACE_ID?: string }

export async function askClaudeJson<T>(
  env: ClaudeEnv,
  opts: { system: string; user: string; schema: object; maxTokens: number; effort: "low" | "medium" | "high" }
): Promise<{ data: T; usage: { input: number; output: number } }> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");
  const workspaceId = env.ANTHROPIC_WORKSPACE_ID?.trim();
  // Dentro de la tarea programada cada intento cuenta en el límite de conexiones: 1 reintento como mucho
  const limited = Number.isFinite(fetchBudgetLeft());
  if (limited) useFetchBudget(2);
  const client = new Anthropic({ apiKey, maxRetries: limited ? 1 : 3, ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}) });
  const msg = await client.beta.messages.create({
    model: SEC_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    output_config: { effort: opts.effort, format: { type: "json_schema", schema: opts.schema } },
    // Si los filtros de seguridad rechazan la solicitud, Anthropic la reintenta con otro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: opts.user }],
  } as any);
  if (msg.stop_reason === "refusal") throw new Error("El modelo rechazó la solicitud");
  if (msg.stop_reason === "max_tokens") throw new Error("Respuesta incompleta (max_tokens)");
  const txt = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return { data: JSON.parse(txt) as T, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}
