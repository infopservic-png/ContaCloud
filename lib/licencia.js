import { supabase } from "@/lib/supabaseClient";

export const PLANES = [
  { valor: "prueba", etiqueta: "Prueba" },
  { valor: "profesional", etiqueta: "Profesional" },
  { valor: "estudiante", etiqueta: "Estudiante" },
];

// Licencia del usuario actual. Devuelve { licencia, vigente, dias, admin }.
export async function obtenerLicenciaActual() {
  const { data: sesion } = await supabase.auth.getSession();
  const uid = sesion?.session?.user?.id;
  if (!uid) return { licencia: null, vigente: false, dias: 0, admin: false };
  const [{ data: lic }, { data: esAdmin }] = await Promise.all([
    supabase.from("licencias").select("*").eq("user_id", uid).maybeSingle(),
    supabase.rpc("soy_admin"),
  ]);
  const dias = lic ? Math.ceil((new Date(lic.vence_el + "T23:59:59") - new Date()) / 86400000) : 0;
  const vigente = !!esAdmin || (!!lic && lic.estado === "activa" && dias >= 0);
  return { licencia: lic || null, vigente, dias, admin: !!esAdmin };
}
