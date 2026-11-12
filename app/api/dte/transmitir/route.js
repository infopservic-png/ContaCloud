import { clienteUsuario, json } from "@/lib/server/dteAuth";
import { descifrar, leerCertificado, firmarJws } from "@/lib/server/dteSeguridad";
import { obtenerToken, recibirDte } from "@/lib/server/dteMH";
import { validarDte } from "@/lib/dteValidacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "dd/MM/yyyy HH:mm:ss" (hora de El Salvador) → ISO
function fechaMH(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ""));
  if (!m) return new Date().toISOString();
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-06:00`).toISOString();
}

export async function POST(request) {
  const c = await clienteUsuario(request);
  if (c.error) return json({ error: c.error }, c.status);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Solicitud no válida." }, 400); }
  const { documentoId } = b || {};
  if (!documentoId) return json({ error: "Falta el documento." }, 400);

  const { data: doc, error: eDoc } = await c.supabase.from("documentos_dte").select("*").eq("id", documentoId).maybeSingle();
  if (eDoc || !doc) return json({ error: "No se encontró el documento (o no tienes acceso)." }, 404);
  if (doc.estado === "transmitido" || doc.sello_recibido) return json({ error: "Este documento ya fue recibido por Hacienda." }, 409);
  if (doc.estado === "invalidado") return json({ error: "Este documento está invalidado." }, 409);

  const { data: ed } = await c.supabase.rpc("puede_empresa", { eid: doc.empresa_id, nivel: "editar" });
  if (ed !== true) return json({ error: "Tu acceso a esta empresa no permite transmitir documentos." }, 403);

  const { data: cred, error: eCred } = await c.supabase.from("dte_credenciales").select("*").eq("empresa_id", doc.empresa_id).maybeSingle();
  if (eCred) return json({ error: /dte_credenciales/i.test(eCred.message) ? "Falta ejecutar la migración 39 (transmisión DTE) en Supabase." : eCred.message }, 500);
  if (!cred?.certificado_cifrado || !cred?.clave_api_cifrada || !cred?.usuario_api) {
    return json({ error: "Faltan las credenciales de Hacienda. Configúralas en Administrador → Configuración → Transmisión a Hacienda." }, 400);
  }

  try {
    const { key } = leerCertificado(descifrar(cred.certificado_cifrado), descifrar(cred.clave_certificado_cifrada));

    // El DTE que se firma no lleva los campos que agrega Hacienda (firma y sello)
    const dte = JSON.parse(JSON.stringify(doc.json_dte || {}));
    delete dte.firma;
    delete dte.selloRecibido;
    dte.identificacion = { ...dte.identificacion, ambiente: cred.ambiente };
    // Si están cargados los esquemas oficiales, se valida antes de enviar (Hacienda rechazaría lo que no cumpla)
    const v = validarDte(dte);
    if (v.estado === "invalido") {
      return json({ ok: false, aceptado: false, mensaje: "El documento no cumple el esquema oficial; no se envió a Hacienda.", observaciones: v.errores.map((e) => `${e.ruta}: ${e.mensaje}`) });
    }
    const jws = firmarJws(dte, key);

    const claveApi = descifrar(cred.clave_api_cifrada);
    let token = await obtenerToken({ ambiente: cred.ambiente, usuario: cred.usuario_api, clave: claveApi });
    const envio = { ambiente: cred.ambiente, tipoDte: dte.identificacion.tipoDte, version: dte.identificacion.version, jws, codigoGeneracion: dte.identificacion.codigoGeneracion };
    let r = await recibirDte({ ...envio, token });
    if (r.expirado) {
      token = await obtenerToken({ ambiente: cred.ambiente, usuario: cred.usuario_api, clave: claveApi, forzar: true });
      r = await recibirDte({ ...envio, token });
    }

    const respuesta = { estado: r.estado, codigoMsg: r.codigoMsg, descripcionMsg: r.descripcionMsg, observaciones: r.observaciones, http: r.http };
    if (r.aceptado) {
      const jsonFinal = { ...dte, selloRecibido: r.sello };
      const { error } = await c.supabase.from("documentos_dte").update({
        estado: "transmitido", sello_recibido: r.sello, fecha_procesamiento: fechaMH(r.fechaProcesamiento),
        respuesta_mh: respuesta, dte_firmado: jws, ambiente: cred.ambiente, json_dte: jsonFinal,
      }).eq("id", doc.id);
      if (error) {
        // Hacienda ya lo recibió: se devuelve el sello para no perderlo aunque no se pudo guardar
        return json({ error: "Hacienda aceptó el documento pero no se pudo guardar el sello: " + error.message, sello: r.sello, aceptado: true }, 500);
      }
      return json({ ok: true, aceptado: true, sello: r.sello, ambiente: cred.ambiente });
    }
    await c.supabase.from("documentos_dte").update({ estado: "rechazado", respuesta_mh: respuesta, ambiente: cred.ambiente }).eq("id", doc.id);
    return json({ ok: false, aceptado: false, estado: r.estado, mensaje: r.descripcionMsg, observaciones: r.observaciones });
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
