import React, { useState } from "react";

// Páginas legales públicas (/terms, /privacy, /refunds). Paddle las revisa antes de aprobar la cuenta:
// deben nombrar a Paddle como revendedor (Merchant of Record) y explicar prueba, renovación y reembolsos.
// LEGAL_NAME y CONTACT: datos del titular, a completar antes de pasar a producción.

export const LEGAL_NAME = "investiando.app";
export const CONTACT = "Ayuda y Soporte (dentro de la app)";
const UPDATED = "2026-11-16";

type Kind = "terms" | "privacy" | "refunds";
type Lang = "EN" | "ES";

const DOCS: Record<Kind, Record<Lang, { title: string; sections: [string, string[]][] }>> = {
  terms: {
    ES: {
      title: "Términos del servicio",
      sections: [
        ["1. El servicio", [`${LEGAL_NAME} ("investiando") es una plataforma web de información y análisis de inversiones con fines educativos: datos de mercado, estados financieros de la SEC, modelos de valoración y herramientas para seguir una cartera.`, "investiando no es un asesor financiero ni un intermediario. Nada de lo que muestra es una recomendación de compra o venta. Las decisiones de inversión son tuyas y conllevan riesgo de pérdida."]],
        ["2. Cuenta", ["Necesitas una cuenta con un correo verificado. Eres responsable de mantener tu contraseña segura y de la actividad de tu cuenta.", "Podemos suspender cuentas que hagan un uso abusivo del servicio (por ejemplo, extracción masiva de datos o intentos de acceso no autorizado)."]],
        ["3. Planes y pagos", ["El plan gratuito no tiene coste. El plan Pro cuesta 6,50 USD al mes o 60 USD al año e incluye 7 días de prueba gratis.", "Los pagos los procesa Paddle.com Market Limited (\"Paddle\"), que actúa como revendedor autorizado (Merchant of Record) de investiando: Paddle es el vendedor ante ti, emite las facturas y gestiona los impuestos aplicables. Al pagar aceptas también los términos de compra de Paddle (paddle.com/legal/checkout-buyer-terms).", "La suscripción se renueva automáticamente al final de cada periodo hasta que la canceles. Si cancelas durante la prueba no se te cobra nada. Puedes cancelar en cualquier momento desde Mi Cuenta → Gestionar suscripción; el acceso Pro sigue hasta el final del periodo pagado."]],
        ["4. Datos y disponibilidad", ["Los datos provienen de fuentes de terceros (SEC, proveedores de mercado) y pueden tener retrasos o errores. Las funciones con IA pueden producir resultados inexactos.", "Hacemos lo posible por mantener el servicio disponible, pero no lo garantizamos sin interrupciones."]],
        ["5. Responsabilidad", ["En la medida que permita la ley, investiando no responde de pérdidas derivadas del uso de la información del servicio. Nuestra responsabilidad total se limita a lo que hayas pagado en los 12 meses anteriores."]],
        ["6. Cambios", ["Podemos actualizar estos términos; los cambios importantes se avisarán en la app o por correo. Si sigues usando el servicio después, aceptas la nueva versión."]],
        ["7. Contacto", [`Para cualquier consulta: ${CONTACT}.`]],
      ],
    },
    EN: {
      title: "Terms of Service",
      sections: [
        ["1. The service", [`${LEGAL_NAME} ("investiando") is a web platform providing investment information and analysis for educational purposes: market data, SEC financial statements, valuation models and portfolio tools.`, "investiando is not a financial adviser or broker. Nothing it shows is a recommendation to buy or sell. Investment decisions are yours and involve risk of loss."]],
        ["2. Account", ["You need an account with a verified email. You are responsible for keeping your password safe and for activity on your account.", "We may suspend accounts that abuse the service (for example, bulk data scraping or unauthorized access attempts)."]],
        ["3. Plans and payments", ["The Free plan costs nothing. The Pro plan costs USD 6.50 per month or USD 60 per year and includes a 7-day free trial.", "Payments are processed by Paddle.com Market Limited (\"Paddle\"), which acts as investiando's authorized reseller (Merchant of Record): Paddle is the seller to you, issues invoices and handles applicable taxes. By paying you also accept Paddle's buyer terms (paddle.com/legal/checkout-buyer-terms).", "Subscriptions renew automatically at the end of each period until cancelled. If you cancel during the trial you are not charged. You can cancel anytime from My Account → Manage subscription; Pro access continues until the end of the paid period."]],
        ["4. Data and availability", ["Data comes from third-party sources (SEC, market data providers) and may be delayed or contain errors. AI features may produce inaccurate results.", "We do our best to keep the service available but do not guarantee it will be uninterrupted."]],
        ["5. Liability", ["To the extent permitted by law, investiando is not liable for losses arising from use of the information in the service. Our total liability is limited to what you paid in the previous 12 months."]],
        ["6. Changes", ["We may update these terms; material changes will be announced in the app or by email. Continuing to use the service means you accept the new version."]],
        ["7. Contact", [`For any question: ${CONTACT}.`]],
      ],
    },
  },
  privacy: {
    ES: {
      title: "Política de privacidad",
      sections: [
        ["1. Qué datos guardamos", ["Tu nombre, tu correo y tu contraseña cifrada (nunca la guardamos en claro).", "Los datos que introduces en la app: carteras, posiciones, watchlist y preferencias.", "Datos técnicos mínimos para el funcionamiento y la seguridad (por ejemplo, registros de acceso)."]],
        ["2. Pagos", ["No vemos ni guardamos los datos de tu tarjeta. Los pagos los gestiona Paddle, que nos informa del estado de tu suscripción (prueba, activa, cancelada) y de un identificador de cliente."]],
        ["3. Para qué los usamos", ["Para darte el servicio, mantener tu cuenta, enviarte correos de verificación y recuperación de contraseña y avisos importantes sobre el servicio. No vendemos tus datos."]],
        ["4. Proveedores", ["Cloudflare (alojamiento y base de datos), Paddle (pagos), el proveedor de correo con el que enviamos los avisos y Anthropic (funciones con IA, que reciben solo los datos necesarios para cada consulta)."]],
        ["5. Tus derechos", ["Puedes pedir acceso, corrección o eliminación de tus datos, y la baja de tu cuenta, desde la sección de Ayuda y Soporte. Conservamos los datos mientras tengas cuenta y los borramos cuando la eliminas, salvo los que la ley obligue a conservar."]],
        ["6. Cookies", ["Usamos una cookie de sesión necesaria para mantenerte conectado y el almacenamiento local del navegador para tus preferencias. No usamos cookies publicitarias."]],
      ],
    },
    EN: {
      title: "Privacy Policy",
      sections: [
        ["1. Data we keep", ["Your name, email and hashed password (never stored in plain text).", "Data you enter in the app: portfolios, holdings, watchlist and preferences.", "Minimal technical data needed for operation and security (such as access logs)."]],
        ["2. Payments", ["We never see or store your card details. Payments are handled by Paddle, which tells us your subscription status (trial, active, cancelled) and a customer identifier."]],
        ["3. How we use it", ["To provide the service, keep your account, send verification and password-reset emails and important service notices. We do not sell your data."]],
        ["4. Providers", ["Cloudflare (hosting and database), Paddle (payments), our email provider and Anthropic (AI features, which receive only the data needed for each request)."]],
        ["5. Your rights", ["You can ask to access, correct or delete your data, or close your account, from the Help and Support section. We keep data while you have an account and delete it when you close it, except where the law requires otherwise."]],
        ["6. Cookies", ["We use one session cookie needed to keep you signed in and the browser's local storage for your preferences. We do not use advertising cookies."]],
      ],
    },
  },
  refunds: {
    ES: {
      title: "Política de reembolsos",
      sections: [
        ["Prueba gratis", ["El plan Pro empieza con 7 días gratis. Si cancelas antes de que termine, no se te cobra nada."]],
        ["Reembolsos", ["Si no estás satisfecho, puedes pedir el reembolso completo de cualquier cobro en los 14 días siguientes. Pídelo desde el enlace de tu factura de Paddle o desde la sección de Ayuda y Soporte; el reembolso se hace al mismo medio de pago.", "Al cancelar, el acceso Pro continúa hasta el final del periodo ya pagado; fuera del plazo de 14 días no se reembolsan los periodos parciales."]],
        ["Quién procesa el pago", ["Los pagos y reembolsos los procesa Paddle.com, nuestro revendedor autorizado."]],
      ],
    },
    EN: {
      title: "Refund Policy",
      sections: [
        ["Free trial", ["The Pro plan starts with a 7-day free trial. Cancel before it ends and you won't be charged."]],
        ["Refunds", ["If you're not satisfied, you can request a full refund of any charge within 14 days. Request it from the link on your Paddle invoice or from the Help and Support section; refunds go back to the original payment method.", "When you cancel, Pro access continues until the end of the paid period; after the 14-day window partial periods are not refunded."]],
        ["Who processes payments", ["Payments and refunds are processed by Paddle.com, our authorized reseller."]],
      ],
    },
  },
};

export function legalKindFromPath(path: string): Kind | null {
  const p = path.replace(/\/+$/, "");
  return p === "/terms" ? "terms" : p === "/privacy" ? "privacy" : p === "/refunds" ? "refunds" : null;
}

export default function LegalPage({ kind, language, theme }: { kind: Kind; language: Lang; theme: "dark" | "light" }) {
  const [lang, setLang] = useState<Lang>(language);
  const doc = DOCS[kind][lang];
  const dark = theme === "dark";
  const c = dark
    ? { bg: "#0b0d13", card: "#131621", line: "#262b3a", text: "#f1f5f9", muted: "#a3abbd", accent: "#34d399" }
    : { bg: "#f6f4ee", card: "#ffffff", line: "#e4e0d4", text: "#1b1917", muted: "#635e54", accent: "#047857" };
  const links: [Kind, string][] = [
    ["terms", lang === "ES" ? "Términos" : "Terms"],
    ["privacy", lang === "ES" ? "Privacidad" : "Privacy"],
    ["refunds", lang === "ES" ? "Reembolsos" : "Refunds"],
  ];
  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{ borderBottom: `1px solid ${c.line}`, padding: "18px 24px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <a href="/" style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: c.text, textDecoration: "none" }}>
            investiando<span style={{ color: c.accent }}>.app</span>
          </a>
          <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
            {links.map(([k, label]) => (
              <a key={k} href={`/${k}`} style={{ color: k === kind ? c.text : c.muted, fontWeight: k === kind ? 700 : 500, textDecoration: "none" }}>
                {label}
              </a>
            ))}
            <button type="button" onClick={() => setLang(lang === "ES" ? "EN" : "ES")} style={{ background: "none", border: `1px solid ${c.line}`, borderRadius: 8, padding: "2px 8px", color: c.muted, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              {lang === "ES" ? "EN" : "ES"}
            </button>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{doc.title}</h1>
        <p style={{ color: c.muted, fontSize: 14, margin: "10px 0 0" }}>
          {lang === "ES" ? "Última actualización" : "Last updated"}: {UPDATED}
        </p>
        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 18 }}>
          {doc.sections.map(([h, ps]) => (
            <section key={h} style={{ background: c.card, border: `1px solid ${c.line}`, borderRadius: 18, padding: "22px 24px" }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>{h}</h2>
              {ps.map((t, i) => (
                <p key={i} style={{ fontSize: 15, lineHeight: 1.7, color: c.muted, margin: "10px 0 0" }}>
                  {t}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p style={{ marginTop: 36 }}>
          <a href="/" style={{ color: c.accent, fontWeight: 600, textDecoration: "none" }}>
            ← {lang === "ES" ? "Volver a investiando" : "Back to investiando"}
          </a>
        </p>
      </main>
    </div>
  );
}
