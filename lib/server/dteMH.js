// Cliente de la API del Ministerio de Hacienda (solo servidor): autenticación y recepción de DTE.
const BASES = { "00": "https://apitest.dtes.mh.gob.sv", "01": "https://api.dtes.mh.gob.sv" };

export const baseUrl = (ambiente) => process.env.DTE_MH_BASE_URL || BASES[ambiente] || BASES["00"];

const tokens = new Map(); // `${ambiente}|${usuario}` → { token, vence }

async function pedir(url, opciones, ms = 45000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: ctl.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Hacienda no respondió a tiempo. Intenta de nuevo en unos minutos.");
    throw new Error("No se pudo conectar con Hacienda: " + (e.cause?.message || e.message));
  } finally {
    clearTimeout(t);
  }
}

export async function obtenerToken({ ambiente, usuario, clave, forzar = false }) {
  const k = `${ambiente}|${usuario}`;
  const c = tokens.get(k);
  if (!forzar && c && c.vence > Date.now()) return c.token;
  const r = await pedir(`${baseUrl(ambiente)}/seguridad/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ user: usuario, pwd: clave }).toString(),
  });
  const texto = await r.text();
  let j = null;
  try { j = JSON.parse(texto); } catch { /* respuesta no JSON */ }
  const token = j?.body?.token;
  if (!r.ok || !token) {
    const detalle = j?.message || j?.body?.message || j?.descripcionMsg || texto.slice(0, 200);
    throw new Error(`Hacienda rechazó el usuario o la clave de la API (${r.status}). ${detalle || ""}`.trim());
  }
  const t = /^Bearer /i.test(token) ? token : `Bearer ${token}`;
  tokens.set(k, { token: t, vence: Date.now() + 20 * 3600 * 1000 });
  return t;
}

// → { aceptado, estado, sello, fechaProcesamiento, codigoMsg, descripcionMsg, observaciones, crudo, http }
export async function recibirDte({ ambiente, token, tipoDte, version, jws, codigoGeneracion }) {
  const r = await pedir(`${baseUrl(ambiente)}/fesv/recepciondte`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token },
    body: JSON.stringify({ ambiente, idEnvio: 1, version, tipoDte, documento: jws, codigoGeneracion }),
  }, 60000);
  const texto = await r.text();
  let j = null;
  try { j = JSON.parse(texto); } catch { /* respuesta no JSON */ }
  if (r.status === 401 || r.status === 403) {
    return { aceptado: false, expirado: true, http: r.status, estado: "SIN_AUTORIZACION", descripcionMsg: "El token de Hacienda no es válido o venció.", observaciones: [], crudo: j || texto.slice(0, 500) };
  }
  if (!j) {
    return { aceptado: false, http: r.status, estado: "ERROR", descripcionMsg: `Respuesta inesperada de Hacienda (${r.status}).`, observaciones: [], crudo: texto.slice(0, 500) };
  }
  const estado = String(j.estado || "").toUpperCase();
  return {
    aceptado: estado === "PROCESADO" && !!j.selloRecibido,
    http: r.status,
    estado: estado || "ERROR",
    sello: j.selloRecibido || null,
    fechaProcesamiento: j.fhProcesamiento || null,
    codigoMsg: j.codigoMsg || null,
    descripcionMsg: j.descripcionMsg || j.message || null,
    observaciones: Array.isArray(j.observaciones) ? j.observaciones : [],
    crudo: j,
  };
}
