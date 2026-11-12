import { clienteUsuario, json } from "@/lib/server/dteAuth";
import { cifrar, leerCertificado } from "@/lib/server/dteSeguridad";
import { obtenerToken } from "@/lib/server/dteMH";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function permiso(supabase, empresaId) {
  const { data, error } = await supabase.rpc("puede_empresa", { eid: empresaId, nivel: "completo" });
  return !error && data === true;
}

// Estado de la configuración (nunca devuelve secretos)
export async function GET(request) {
  const c = await clienteUsuario(request);
  if (c.error) return json({ error: c.error }, c.status);
  const empresaId = new URL(request.url).searchParams.get("empresaId");
  if (!empresaId) return json({ error: "Falta la empresa." }, 400);
  const { data, error } = await c.supabase
    .from("dte_credenciales")
    .select("ambiente, usuario_api, clave_api_cifrada, certificado_cifrado, clave_certificado_cifrada, updated_at")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error) {
    const falta = /dte_credenciales/i.test(error.message);
    return json({ error: falta ? "Falta ejecutar la migración 39 (transmisión DTE) en Supabase." : error.message }, 500);
  }
  return json({
    configurado: !!(data?.clave_api_cifrada && data?.certificado_cifrado && data?.clave_certificado_cifrada),
    ambiente: data?.ambiente || "00",
    usuarioApi: data?.usuario_api || "",
    tieneCertificado: !!data?.certificado_cifrado,
    tieneClaveApi: !!data?.clave_api_cifrada,
    actualizado: data?.updated_at || null,
    servidorListo: !!(process.env.DTE_CLAVE_CIFRADO && process.env.DTE_CLAVE_CIFRADO.length >= 16),
  });
}

// Guarda las credenciales cifradas. Solo cambia lo que se envía; se valida el certificado y, si se pide, la conexión.
export async function POST(request) {
  const c = await clienteUsuario(request);
  if (c.error) return json({ error: c.error }, c.status);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Solicitud no válida." }, 400); }
  const { empresaId, ambiente, usuarioApi, claveApi, certificado, claveCertificado, probar } = b || {};
  if (!empresaId) return json({ error: "Falta la empresa." }, 400);
  if (!(await permiso(c.supabase, empresaId))) return json({ error: "Solo quien tiene acceso completo a la empresa puede cambiar estas credenciales." }, 403);
  if (ambiente && !["00", "01"].includes(ambiente)) return json({ error: "Ambiente no válido." }, 400);
  if (!process.env.DTE_CLAVE_CIFRADO || process.env.DTE_CLAVE_CIFRADO.length < 16) {
    return json({ error: "Falta configurar la variable DTE_CLAVE_CIFRADO en Vercel (mínimo 16 caracteres) y volver a desplegar." }, 500);
  }

  const { data: actual } = await c.supabase.from("dte_credenciales").select("*").eq("empresa_id", empresaId).maybeSingle();
  const fila = {
    empresa_id: empresaId,
    ambiente: ambiente || actual?.ambiente || "00",
    usuario_api: (usuarioApi ?? actual?.usuario_api ?? "").toString().replace(/\D/g, "") || null,
    clave_api_cifrada: actual?.clave_api_cifrada || null,
    certificado_cifrado: actual?.certificado_cifrado || null,
    clave_certificado_cifrada: actual?.clave_certificado_cifrada || null,
    actualizado_por: c.user.email || null,
    updated_at: new Date().toISOString(),
  };
  try {
    if (claveApi) fila.clave_api_cifrada = cifrar(claveApi);
    if (certificado || claveCertificado) {
      // Para validar hacen falta ambos: el archivo (nuevo o el guardado) y la contraseña (nueva o la guardada)
      const { descifrar } = await import("@/lib/server/dteSeguridad");
      const cert = certificado || descifrar(actual?.certificado_cifrado);
      const clave = claveCertificado ?? (actual?.clave_certificado_cifrada ? descifrar(actual.clave_certificado_cifrada) : "");
      const leido = leerCertificado(cert, clave);
      const nitEmpresa = fila.usuario_api;
      if (leido.nit && nitEmpresa && leido.nit !== nitEmpresa) {
        return json({ error: `El certificado es del NIT ${leido.nit}, pero el usuario de la API es ${nitEmpresa}.` }, 400);
      }
      fila.certificado_cifrado = cifrar(cert);
      fila.clave_certificado_cifrada = cifrar(clave);
    }
  } catch (e) {
    return json({ error: e.message || String(e) }, 400);
  }

  let conexion = null;
  if (probar) {
    try {
      const { descifrar } = await import("@/lib/server/dteSeguridad");
      if (!fila.usuario_api || !fila.clave_api_cifrada) throw new Error("Falta el usuario o la clave de la API de Hacienda.");
      await obtenerToken({ ambiente: fila.ambiente, usuario: fila.usuario_api, clave: descifrar(fila.clave_api_cifrada), forzar: true });
      conexion = { ok: true };
    } catch (e) {
      conexion = { ok: false, error: e.message };
    }
  }

  const { error } = await c.supabase.from("dte_credenciales").upsert(fila, { onConflict: "empresa_id" });
  if (error) {
    const falta = /dte_credenciales/i.test(error.message);
    return json({ error: falta ? "Falta ejecutar la migración 39 (transmisión DTE) en Supabase." : error.message }, 500);
  }
  return json({ ok: true, conexion });
}

export async function DELETE(request) {
  const c = await clienteUsuario(request);
  if (c.error) return json({ error: c.error }, c.status);
  const empresaId = new URL(request.url).searchParams.get("empresaId");
  if (!empresaId || !(await permiso(c.supabase, empresaId))) return json({ error: "Sin permiso." }, 403);
  const { error } = await c.supabase.from("dte_credenciales").delete().eq("empresa_id", empresaId);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}
