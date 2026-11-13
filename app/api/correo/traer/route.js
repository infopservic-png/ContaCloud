import { clienteUsuario, json } from "@/lib/server/dteAuth";
import { descifrar } from "@/lib/server/dteSeguridad";
import { traerJson, mensajeError } from "@/lib/server/correoCompras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Trae los JSON de los correos nuevos. Devuelve los archivos; el registro lo hace el usuario en «Importar DTE».
export async function POST(request) {
  const c = await clienteUsuario(request);
  if (c.error) return json({ error: c.error }, c.status);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Solicitud no válida." }, 400); }
  const { empresaId, reiniciar } = b || {};
  if (!empresaId) return json({ error: "Falta la empresa." }, 400);
  const { data: p } = await c.supabase.rpc("puede_empresa", { eid: empresaId, nivel: "completo" });
  if (p !== true) return json({ error: "Solo quien tiene acceso completo a la empresa puede revisar el correo." }, 403);
  const { data: cfg, error } = await c.supabase.from("correo_compras").select("*").eq("empresa_id", empresaId).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!cfg) return json({ error: "Primero conecta el correo en Configuración." }, 400);
  let r;
  try {
    r = await traerJson(
      { host: cfg.host, puerto: cfg.puerto, usuario: cfg.usuario, clave: descifrar(cfg.clave_cifrada), carpeta: cfg.carpeta },
      { desdeUid: reiniciar ? null : cfg.ultimo_uid, uidValidez: cfg.uid_validez, dias: 30 }
    );
  } catch (e) {
    return json({ error: mensajeError(e) }, 400);
  }
  await c.supabase.from("correo_compras").update({ ultimo_uid: r.ultimoUid, uid_validez: r.uidValidez, ultima_revision: new Date().toISOString() }).eq("empresa_id", empresaId);
  return json(r);
}
