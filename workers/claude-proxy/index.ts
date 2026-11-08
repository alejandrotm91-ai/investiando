// Proxy de la API de Claude con ubicación fija en EE. UU. (placement en wrangler.jsonc).
//
// Las tareas programadas de Cloudflare se ejecutan en cualquier centro de datos con capacidad
// libre, y desde algunas regiones la API de Anthropic responde 403 "Request not allowed". Este
// Worker solo se alcanza por el enlace de servicio CLAUDE_PROXY del Worker principal (sin dirección
// pública) y reenvía tal cual las peticiones a api.anthropic.com desde su ubicación fija.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Diagnóstico: desde dónde sale este Worker (centro de datos y país)
    if (url.pathname === "/__trace") {
      const r = await fetch("https://www.cloudflare.com/cdn-cgi/trace");
      const t = await r.text();
      const own = (request as any).cf ? `cf.colo=${(request as any).cf.colo} ` : "";
      return new Response(`${own}${t.split("\n").filter((l) => /^(colo|loc)=/.test(l)).join(" ") || `status ${r.status}: ${t.slice(0, 120)}`}`);
    }
    if (url.hostname !== "api.anthropic.com") return new Response("forbidden", { status: 403 });
    return fetch(new Request(url.toString(), request));
  },
};
