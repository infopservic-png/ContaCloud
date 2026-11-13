import { clienteUsuario, json } from "@/lib/server/dteAuth";
import { cifrar, descifrar } from "@/lib/server/dteSeguridad";
import { probarConexion, mensajeError } from "@/lib/server/correoCompras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function permiso(supabase, empresaId) {
  const { data, error } = await supabase.rpc("puede_empresa", { eid: empresaId, nivel: "completo" });
  return !error && data === true;
}

export async function GET(request) {
  const c = await clienteUsuario(request);
  if (c.error) return json({ error: c.error }, c.status);
  const empresaId = new URL(request.url).searchParams.get("empresaId");
  if (!empresaId) return json({ error: "Falta la empresa." }, 400);
  const { data, error } = await c.supabase.from("correo_compras").select("host, puerto, usuario, carpeta, ultima_revision").eq("empresa_id", empresaId).maybeSingle();
  if (error) return json({ error: /correo_compras/i.test(error.message) ? "Falta ejecutar la migración 40 (correo de compras) en Supabase." : error.message }, 500);
  return json({
    configurado: !!data, host: data?.host || "imap.gmail.com", puerto: data?.puerto || 993, usuario: data?.usuario || "",
    carpeta: data?.carpeta || "INBOX", ultimaRevision: data?.ultima_revision || null,
    servidorListo: !!(process.env.DTE_CLAVE_CIFRADO && process.env.DTE_CLAVE_CIFRADO.length >= 16),
  });
}

export async function POST(request) {
  const c = await clienteUsuario(request);
  if (c.error) return json({ error: c.error }, c.status);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Solicitud no válida." }, 400); }
  const { empresaId, host, puerto, usuario, clave, carpeta } = b || {};
  if (!empresaId) return json({ error: "Falta la empresa." }, 400);
  if (!(await permiso(c.supabase, empresaId))) return json({ error: "Solo quien tiene acceso completo a la empresa puede conectar el correo." }, 403);
  if (!process.env.DTE_CLAVE_CIFRADO || process.env.DTE_CLAVE_CIFRADO.length < 16) return json({ error: "Falta configurar DTE_CLAVE_CIFRADO en Vercel." }, 500);
  const { data: actual } = await c.supabase.from("correo_compras").select("*").eq("empresa_id", empresaId).maybeSingle();
  const cfg = {
    host: String(host || actual?.host || "").trim().toLowerCase(),
    puerto: Number(puerto || actual?.puerto || 993),
    usuario: String(usuario || actual?.usuario || "").trim(),
    carpeta: String(carpeta || actual?.carpeta || "INBOX").trim(),
    clave: clave ? String(clave).replace(/\s+/g, "") : actual ? descifrar(actual.clave_cifrada) : "",
  };
  if (!cfg.host || !cfg.usuario || !cfg.clave) return json({ error: "Faltan el servidor, el correo o la contraseña de aplicación." }, 400);
  try { await probarConexion(cfg); } catch (e) { return json({ error: mensajeError(e) }, 400); }
  const cambioBuzon = !actual || actual.usuario !== cfg.usuario || actual.host !== cfg.host || actual.carpeta !== cfg.carpeta;
  const { error } = await c.supabase.from("correo_compras").upsert({
    empresa_id: empresaId, host: cfg.host, puerto: cfg.puerto, usuario: cfg.usuario, clave_cifrada: cifrar(cfg.clave), carpeta: cfg.carpeta,
    ...(cambioBuzon ? { ultimo_uid: null, uid_validez: null } : {}),
    actualizado_por: c.user.email || null, updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

export async function DELETE(request) {
  const c = await clienteUsuario(request);
  if (c.error) return json({ error: c.error }, c.status);
  const empresaId = new URL(request.url).searchParams.get("empresaId");
  if (!empresaId) return json({ error: "Falta la empresa." }, 400);
  if (!(await permiso(c.supabase, empresaId))) return json({ error: "Sin permiso." }, 403);
  const { error } = await c.supabase.from("correo_compras").delete().eq("empresa_id", empresaId);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}
