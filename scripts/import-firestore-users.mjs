// Importa los usuarios de Firestore (colección "users") a la base D1 de Cloudflare (Fase 3).
// Las contraseñas, que Firestore guardaba en texto plano, se cifran aquí con PBKDF2 en el mismo
// formato que usa el Worker (src/worker/auth/password.ts). No sobrescribe usuarios que ya existan en D1.
//
// Uso:
//   node scripts/import-firestore-users.mjs .wrangler/import-users.sql [correos.txt]
//   npx wrangler d1 execute investiando-db --remote --file .wrangler/import-users.sql
//   (después borrar el .sql: contiene los hashes)
// Las reglas de Firestore no permiten listar la colección, así que normalmente hay que pasar
// un archivo con un correo por línea; cada usuario se lee por separado.
import fs from "node:fs";
import crypto from "node:crypto";

const outFile = process.argv[2];
const emailsFile = process.argv[3];
if (!outFile) {
  console.error("Uso: node scripts/import-firestore-users.mjs <salida.sql> [correos.txt]");
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(new URL("../firebase-applet-config.json", import.meta.url), "utf8"));
const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId || "(default)"}/documents/users`;

// Convierte el formato tipado de la API REST de Firestore a JSON normal.
function fromValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields)) o[k] = fromValue(v);
  return o;
}

function hashPassword(password) {
  const iterations = 100000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2-sha256$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const PROTECTED = ["email", "id", "name", "clave", "password", "passwordHash", "emailVerified", "status", "role",
  "verificationCode", "resetCode", "resetCodeExpires", "createdAt", "verifiedAt", "lastLogin", "_pendingCloudSync"];

const docs = [];
let noEncontrados = 0;
if (emailsFile) {
  // Mismo id de documento que usaba la app: correo en minúsculas con caracteres raros cambiados por "_".
  const emails = fs.readFileSync(emailsFile, "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l.includes("@"));
  for (const email of [...new Set(emails)]) {
    const docId = email.replace(/[^a-z0-9@._-]/g, "_");
    const res = await fetch(`${base}/${encodeURIComponent(docId)}?key=${cfg.apiKey}`);
    if (res.status === 404) { noEncontrados++; continue; }
    if (!res.ok) throw new Error(`Firestore respondió ${res.status} para un usuario: ${(await res.text()).slice(0, 200)}`);
    docs.push(await res.json());
  }
} else {
  let pageToken = "";
  do {
    const url = `${base}?pageSize=300&key=${cfg.apiKey}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url);
    if (res.status === 403) throw new Error("Firestore no permite listar usuarios. Pasa un archivo con los correos como segundo argumento.");
    if (!res.ok) throw new Error(`Firestore respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    docs.push(...(json.documents || []));
    pageToken = json.nextPageToken || "";
  } while (pageToken);
}

const nowIso = new Date().toISOString();
const statements = [];
let sinClave = 0, verificados = 0, maxBytes = 0;
const seenIds = new Set();

for (const d of docs) {
  const u = fromFields(d.fields || {});
  const docId = decodeURIComponent(d.name.split("/").pop());
  const email = String(u.email || docId).toLowerCase().trim();
  if (!email.includes("@")) continue;

  let id = String(u.id || "user_" + email.replace(/[^a-zA-Z0-9]/g, "_"));
  if (seenIds.has(id)) id = id + "_" + crypto.randomBytes(3).toString("hex");
  seenIds.add(id);

  const plain = u.clave || u.password || u.passwordHash || "";
  if (!plain) sinClave++;
  const verified = u.emailVerified === true ? 1 : 0;
  verificados += verified;

  const data = { ...u };
  for (const k of PROTECTED) delete data[k];
  const dataJson = JSON.stringify(data);
  maxBytes = Math.max(maxBytes, dataJson.length);

  statements.push(
    `INSERT INTO users (email, id, name, password_hash, email_verified, status, data, created_at, updated_at, verified_at, last_login) VALUES (` +
      [q(email), q(id), q(u.name || ""), q(plain ? hashPassword(String(plain)) : null), verified,
        q(u.status === "suspended" ? "suspended" : "active"), q(dataJson), q(u.createdAt || nowIso),
        q(u.updatedAt || nowIso), q(u.verifiedAt || null), q(u.lastLogin || null)].join(", ") +
      `) ON CONFLICT(email) DO NOTHING;`
  );
}

fs.writeFileSync(outFile, statements.join("\n") + "\n");
console.log(`Usuarios leídos de Firestore: ${docs.length}${emailsFile ? ` (correos sin documento: ${noEncontrados})` : ""}`);
console.log(`Sentencias generadas: ${statements.length} (verificados: ${verificados}, sin contraseña: ${sinClave})`);
console.log(`Mayor tamaño de datos por usuario: ${maxBytes} caracteres (límite D1 por sentencia: 100.000)`);
