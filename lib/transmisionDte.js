// Llamadas del navegador a las rutas del servidor que firman y transmiten los DTE a Hacienda.
import { supabase } from "@/lib/supabaseClient";

async function llamar(url, opciones = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { error: "Tu sesión venció. Entra de nuevo." };
  let r;
  try {
    r = await fetch(url, { ...opciones, headers: { "Content-Type": "application/json", ...(opciones.headers || {}), Authorization: `Bearer ${token}` } });
  } catch {
    return { error: "No se pudo comunicar con el servidor. Revisa tu conexión." };
  }
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok && !j?.error) return { error: `El servidor respondió con un error (${r.status}).` };
  return j || {};
}

export const NOMBRE_AMBIENTE = { "00": "Pruebas", "01": "Producción" };

export const estadoCredenciales = (empresaId) => llamar(`/api/dte/credenciales?empresaId=${encodeURIComponent(empresaId)}`);
export const guardarCredenciales = (datos) => llamar("/api/dte/credenciales", { method: "POST", body: JSON.stringify(datos) });
export const quitarCredenciales = (empresaId) => llamar(`/api/dte/credenciales?empresaId=${encodeURIComponent(empresaId)}`, { method: "DELETE" });
// → { ok, aceptado, sello } | { aceptado:false, mensaje, observaciones } | { error }
export const transmitirDte = (documentoId) => llamar("/api/dte/transmitir", { method: "POST", body: JSON.stringify({ documentoId }) });

// Correo de compras (IMAP)
export const estadoCorreo = (empresaId) => llamar(`/api/correo?empresaId=${encodeURIComponent(empresaId)}`);
export const guardarCorreo = (datos) => llamar("/api/correo", { method: "POST", body: JSON.stringify(datos) });
export const quitarCorreo = (empresaId) => llamar(`/api/correo?empresaId=${encodeURIComponent(empresaId)}`, { method: "DELETE" });
// → { archivos:[{nombre, contenido, asunto, de, fecha}], correosRevisados, hayMas } | { error }
export const traerDelCorreo = (empresaId, reiniciar = false) => llamar("/api/correo/traer", { method: "POST", body: JSON.stringify({ empresaId, reiniciar }) });
