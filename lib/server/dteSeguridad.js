// Seguridad de la transmisión DTE (solo servidor): cifrado de credenciales, lectura del certificado de
// firma del Ministerio de Hacienda y firma del documento (JWS con RS512).
import crypto from "crypto";

// ---------- Cifrado de las credenciales guardadas (AES-256-GCM) ----------
function claveMaestra() {
  const v = process.env.DTE_CLAVE_CIFRADO;
  if (!v || v.length < 16) {
    throw new Error("Falta configurar la variable DTE_CLAVE_CIFRADO en el servidor (Vercel). Debe tener al menos 16 caracteres.");
  }
  return crypto.createHash("sha256").update(v, "utf8").digest();
}

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", claveMaestra(), iv);
  const ct = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function descifrar(valor) {
  const [v, iv, tag, ct] = String(valor || "").split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Credencial guardada con un formato no válido.");
  const d = crypto.createDecipheriv("aes-256-gcm", claveMaestra(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  try {
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    throw new Error("No se pudo descifrar la credencial: la clave DTE_CLAVE_CIFRADO cambió. Vuelve a guardar las credenciales.");
  }
}

// ---------- Certificado de firma ----------
const tag = (xml, nombre) => {
  const m = new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`, "i").exec(xml);
  return m ? m[1].trim() : null;
};

// El certificado que entrega Hacienda es un XML (.crt) con la llave privada en PKCS#8 (base64) y un hash
// SHA-512 de la contraseña. También se acepta una llave privada en PEM.
// → { key: KeyObject, nit }
export function leerCertificado(contenido, clave) {
  const texto = String(contenido || "").trim();
  if (!texto) throw new Error("El certificado está vacío.");
  try {
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(texto)) {
      return { key: crypto.createPrivateKey({ key: texto, passphrase: clave || undefined }), nit: null };
    }
    const privada = tag(texto, "privateKey") || texto;
    const b64 = (tag(privada, "encodied") || "").replace(/\s+/g, "");
    if (!b64) throw new Error("El archivo no parece un certificado de firma de Hacienda (no trae la llave privada).");
    const hash = tag(privada, "clave");
    if (hash) {
      const calculado = crypto.createHash("sha512").update(String(clave ?? ""), "utf8").digest("hex");
      if (calculado.toLowerCase() !== hash.toLowerCase()) throw new Error("La contraseña del certificado no es correcta.");
    }
    const key = crypto.createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
    const nit = tag(tag(texto, "attributes") || texto, "nit");
    return { key, nit: nit ? nit.replace(/\D/g, "") : null };
  } catch (e) {
    if (/contraseña|certificado/i.test(e.message)) throw e;
    throw new Error("No se pudo leer el certificado: " + (e.message || e));
  }
}

// ---------- Firma JWS (RS512) ----------
const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function firmarJws(dte, key) {
  const cabecera = b64url(JSON.stringify({ alg: "RS512" }));
  const cuerpo = b64url(JSON.stringify(dte));
  const firma = crypto.sign("RSA-SHA512", Buffer.from(`${cabecera}.${cuerpo}`), key);
  return `${cabecera}.${cuerpo}.${b64url(firma)}`;
}

export function verificarJws(jws, llavePublica) {
  const [h, p, s] = String(jws).split(".");
  const ok = crypto.verify("RSA-SHA512", Buffer.from(`${h}.${p}`), llavePublica, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  return ok ? JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) : null;
}
