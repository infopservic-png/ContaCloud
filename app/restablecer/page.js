"use client";

import { useEffect, useState } from "react";
import Marca from "@/components/Marca";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function RestablecerPage() {
  const router = useRouter();
  // "verificando" | "listo" | "invalido" | "guardado"
  const [estado, setEstado] = useState("verificando");
  const [clave, setClave] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    // Si el enlace venció o ya se usó, Supabase lo indica en la URL (#error=...)
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (hash.get("error") || query.get("error")) {
      setEstado("invalido");
      return;
    }

    // Supabase lee el token del enlace y abre una sesión temporal de recuperación
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "PASSWORD_RECOVERY" || (sesion && evento === "SIGNED_IN")) {
        setEstado("listo");
      }
    });

    // Por si el evento ocurrió antes de suscribirnos
    const temporizador = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setEstado((actual) =>
        actual === "verificando" ? (data.session ? "listo" : "invalido") : actual
      );
    }, 1500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(temporizador);
    };
  }, []);

  async function manejarEnvio(e) {
    e.preventDefault();
    setError(null);
    if (clave.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (clave !== confirmar) return setError("Las contraseñas no coinciden.");

    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password: clave });
    setGuardando(false);

    if (error) {
      if (/different from the old/i.test(error.message)) {
        setError("La contraseña nueva debe ser distinta de la anterior.");
      } else if (/session/i.test(error.message)) {
        setEstado("invalido");
      } else {
        setError(error.message);
      }
      return;
    }

    setEstado("guardado");
    setTimeout(() => router.replace("/dashboard"), 2000);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-semibold text-ink">
            <Marca tamano="lg" vertical />
          </h1>
          <p className="text-inkSoft mt-1 text-sm">Crear contraseña nueva</p>
        </div>

        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 shadow-sm">
          {estado === "verificando" && (
            <p className="text-sm text-inkSoft">Verificando el enlace…</p>
          )}

          {estado === "invalido" && (
            <div className="space-y-4">
              <p className="text-sm text-rust">
                El enlace venció o ya fue usado.
              </p>
              <Link
                href="/recuperar"
                className="block w-full text-center bg-brand text-onBrand py-2 rounded-sm text-sm font-medium hover:bg-brandDark transition-colors"
              >
                Solicitar un enlace nuevo
              </Link>
            </div>
          )}

          {estado === "guardado" && (
            <p className="text-sm text-ledger">
              Contraseña actualizada. Te llevamos a tus empresas…
            </p>
          )}

          {estado === "listo" && (
            <form onSubmit={manejarEnvio} className="space-y-4">
              <div>
                <label htmlFor="clave" className="block text-xs font-medium text-inkSoft mb-1">
                  Contraseña nueva
                </label>
                <input
                  id="clave"
                  type="password"
                  required
                  minLength={6}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  className="w-full border border-paperLine rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label htmlFor="confirmar" className="block text-xs font-medium text-inkSoft mb-1">
                  Confirmar contraseña
                </label>
                <input
                  id="confirmar"
                  type="password"
                  required
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className="w-full border border-paperLine rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {error && <p className="text-sm text-rust">{error}</p>}

              <button
                type="submit"
                disabled={guardando}
                className="w-full bg-brand text-onBrand py-2 rounded-sm text-sm font-medium hover:bg-brandDark transition-colors disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
