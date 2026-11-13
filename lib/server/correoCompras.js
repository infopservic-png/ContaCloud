// Lectura del buzón (IMAP) para traer los DTE en JSON que llegan adjuntos a los correos de compras. Solo servidor.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const MAX_CORREOS = 40;
const MAX_BYTES = 2 * 1024 * 1024;

function conectar({ host, puerto, usuario, clave }) {
  return new ImapFlow({
    host, port: Number(puerto) || 993, secure: (Number(puerto) || 993) === 993,
    auth: { user: usuario, pass: clave }, logger: false, socketTimeout: 40000,
  });
}

export function mensajeError(e) {
  const t = `${e?.responseText || ""} ${e?.message || ""}`;
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|auth/i.test(t)) {
    return "El correo rechazó el usuario o la contraseña. En Gmail usa una «contraseña de aplicación» (no la contraseña normal) y verifica que IMAP esté activado.";
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(t)) return "No se encontró el servidor de correo. Revisa el nombre del servidor.";
  if (/ETIMEDOUT|ECONNREFUSED|timeout/i.test(t)) return "No se pudo conectar con el servidor de correo (tiempo agotado). Revisa servidor y puerto.";
  return "No se pudo leer el correo: " + (e?.responseText || e?.message || e);
}

export async function probarConexion(cfg) {
  const c = conectar(cfg);
  c.on("error", () => {});
  try {
    await c.connect();
    const l = await c.getMailboxLock(cfg.carpeta || "INBOX");
    l.release();
  } finally {
    try { await c.logout(); } catch { /* ya cerrada */ }
  }
}

// → { archivos:[{nombre, contenido, asunto, de, fecha}], ultimoUid, uidValidez, correosRevisados, hayMas }
export async function traerJson(cfg, { desdeUid = null, uidValidez = null, dias = 30 } = {}) {
  const c = conectar(cfg);
  c.on("error", () => {});
  const archivos = [];
  let ultimoUid = desdeUid, revisados = 0, hayMas = false, validez = uidValidez;
  try {
    await c.connect();
    const lock = await c.getMailboxLock(cfg.carpeta || "INBOX");
    try {
      validez = Number(c.mailbox.uidValidity);
      const reiniciar = desdeUid == null || (uidValidez && validez !== Number(uidValidez));
      const desde = new Date(Date.now() - dias * 86400000);
      let uids = reiniciar ? await c.search({ since: desde }, { uid: true }) : await c.search({ uid: `${Number(desdeUid) + 1}:*` }, { uid: true });
      uids = (uids || []).filter((u) => reiniciar || u > Number(desdeUid)).sort((a, b) => a - b);
      if (uids.length > MAX_CORREOS) { hayMas = true; uids = uids.slice(0, MAX_CORREOS); }
      for (const uid of uids) {
        const m = await c.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
        revisados += 1;
        ultimoUid = uid;
        if (!m?.source) continue;
        const p = await simpleParser(m.source);
        for (const a of p.attachments || []) {
          const nombre = a.filename || "";
          if (!/\.json$/i.test(nombre) && !/json/i.test(a.contentType || "")) continue;
          if (!a.content || a.content.length > MAX_BYTES) continue;
          const contenido = a.content.toString("utf8");
          if (!/"identificacion"/.test(contenido)) continue; // no parece un DTE
          archivos.push({ nombre: nombre || `correo-${uid}.json`, contenido, asunto: p.subject || "", de: p.from?.text || "", fecha: p.date ? p.date.toISOString().slice(0, 10) : "" });
        }
      }
      if (ultimoUid == null) ultimoUid = Number(c.mailbox.uidNext || 1) - 1;
    } finally {
      lock.release();
    }
  } finally {
    try { await c.logout(); } catch { /* ya cerrada */ }
  }
  return { archivos, ultimoUid, uidValidez: validez, correosRevisados: revisados, hayMas };
}
