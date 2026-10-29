import YahooFinanceClass from "yahoo-finance2";

// Misma configuración que server.ts: cabeceras de navegador y sin validación estricta
// (Yahoo cambia sus respuestas a menudo y la validación hace fallar consultas válidas).
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

let instance: any = null;

// Una sola instancia por Worker: guarda la cookie y el "crumb" de Yahoo entre consultas.
export function getYahoo(): any {
  if (instance) return instance;
  const Ctor: any = (YahooFinanceClass as any).default ?? YahooFinanceClass;
  const yf = new Ctor({
    suppressNotices: ["yahooSurvey", "ripHistorical"],
    validation: { logErrors: false, logOptionsErrors: false },
    fetchOptions: { headers: BROWSER_HEADERS },
  });
  instance = yf;
  return yf;
}
