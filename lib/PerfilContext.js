"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { variablesTema } from "@/lib/colores";

// Perfil de marca del usuario: nombre, logo y colores. Se aplica a todo el sistema con variables CSS.
// La última marca usada se guarda en este navegador para que la pantalla de acceso y la carga inicial
// ya se vean con ella (se reemplaza por la real en cuanto se conoce la sesión).
const CLAVE_CACHE = "contacloud_marca";
const VARIABLES = ["--brand", "--brand-dark", "--on-brand", "--accent", "--accent-dark", "--on-accent"];

const PerfilContext = createContext(null);
export const usePerfil = () => useContext(PerfilContext);

export function aplicarTema(vars) {
  const estilo = document.documentElement.style;
  VARIABLES.forEach((k) => estilo.removeProperty(k));
  Object.entries(vars || {}).forEach(([k, v]) => estilo.setProperty(k, v));
}

const temaDe = (p) => variablesTema({ primario: p?.color_primario, acento: p?.color_acento });

function leerCache() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CACHE) || "null")?.perfil || null;
  } catch {
    return null;
  }
}
function escribirCache(perfil) {
  try {
    if (perfil) localStorage.setItem(CLAVE_CACHE, JSON.stringify({ perfil, vars: temaDe(perfil) }));
    else localStorage.removeItem(CLAVE_CACHE);
  } catch {
    /* sin almacenamiento local: no pasa nada */
  }
}

export function PerfilProvider({ children }) {
  const [perfil, setPerfil] = useState(null); // { nombre_marca, color_primario, color_acento, logo }
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  const aplicar = useCallback((p) => {
    setPerfil(p);
    aplicarTema(temaDe(p));
    escribirCache(p);
  }, []);

  useEffect(() => {
    const guardada = leerCache();
    if (guardada) setPerfil(guardada);
  }, []);

  useEffect(() => {
    let vivo = true;
    async function cargarDe(user) {
      if (!user) {
        // Sin sesión se conserva la última marca de este equipo (pantalla de acceso)
        setUsuario(null);
        setCargando(false);
        return;
      }
      setUsuario(user);
      const { data } = await supabase.from("perfiles").select("*").eq("user_id", user.id).maybeSingle();
      if (!vivo) return;
      aplicar(data || null); // sin perfil: paleta original
      setCargando(false);
    }
    supabase.auth.getSession().then(({ data }) => cargarDe(data?.session?.user ?? null));
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      cargarDe(sesion?.user ?? null);
    });
    return () => {
      vivo = false;
      suscripcion?.subscription?.unsubscribe();
    };
  }, [aplicar]);

  const guardarPerfil = useCallback(
    async (campos) => {
      if (!usuario) return { error: "No hay una sesión iniciada." };
      const { data, error } = await supabase
        .from("perfiles")
        .upsert({ user_id: usuario.id, ...campos, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select()
        .single();
      if (error) {
        const pista = /perfiles/i.test(error.message) ? " ¿Ya ejecutaste la migración 13 en Supabase?" : "";
        return { error: "No se pudo guardar: " + error.message + pista };
      }
      aplicar(data);
      return { ok: true };
    },
    [usuario, aplicar]
  );

  const valor = useMemo(
    () => ({ perfil, usuario, cargando, guardarPerfil }),
    [perfil, usuario, cargando, guardarPerfil]
  );
  return <PerfilContext.Provider value={valor}>{children}</PerfilContext.Provider>;
}
