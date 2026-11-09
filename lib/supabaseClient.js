import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // No lanzamos error en build, solo avisamos en consola del navegador.
  console.warn(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. Revisa tu archivo .env.local"
  );
}

// Rol del usuario en la empresa que tiene abierta: null (dueño o sin empresa), "lector", "digitador" o "completo".
// La seguridad real la hace la base de datos (RLS); esto solo evita intentos que fallarían y da un mensaje claro.
let rolEmpresa = null;
export function establecerRolEmpresa(rol) {
  rolEmpresa = rol || null;
}

const MENSAJE_PERMISO = "No tienes permiso para esta acción: tu acceso a esta empresa es limitado o la licencia del propietario venció.";

function respuestaBloqueada(mensaje) {
  return new Response(JSON.stringify({ code: "42501", message: mensaje, details: null, hint: null }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchControlado(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url || "";
  const metodo = String(init.method || (typeof input !== "string" && input?.method) || "GET").toUpperCase();
  if (rolEmpresa && metodo !== "GET" && metodo !== "HEAD" && url.includes("/rest/v1/") && !url.includes("/accesos_empresa")) {
    if (rolEmpresa === "lector") return respuestaBloqueada("Tu acceso a esta empresa es de solo lectura.");
    if (rolEmpresa === "digitador" && metodo === "DELETE") return respuestaBloqueada("Tu acceso a esta empresa no permite eliminar.");
  }
  const res = await fetch(input, init);
  // Errores de seguridad de la base de datos (RLS) en lenguaje claro
  if (res.status === 403 || res.status === 401) {
    try {
      const texto = await res.clone().text();
      if (/row-level security|42501/.test(texto)) return respuestaBloqueada(MENSAJE_PERMISO);
    } catch {}
  }
  return res;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: (...a) => fetchControlado(...a) } });
