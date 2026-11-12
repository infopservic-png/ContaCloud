// Identifica al usuario que llama a las rutas de transmisión: usa su sesión de Supabase,
// de modo que todo pasa por las mismas reglas de acceso (RLS) que el resto del sistema.
import { createClient } from "@supabase/supabase-js";

export async function clienteUsuario(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Tu sesión venció. Entra de nuevo.", status: 401 };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: "El servidor no tiene configurada la conexión a Supabase.", status: 500 };
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: "Tu sesión venció. Entra de nuevo.", status: 401 };
  return { supabase, user: data.user };
}

export const json = (cuerpo, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
