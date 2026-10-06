"use client";

import { useState } from "react";
import Marca from "@/components/Marca";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function RecuperarPage() {
  const [correo, setCorreo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState(null);

  async function manejarEnvio(e) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
      redirectTo: `${window.location.origin}/restablecer`,
    });

    setCargando(false);
    if (error) {
      if (error.status === 429 || /rate limit|seconds/i.test(error.message)) {
        setError("Ya se enviaron varios correos. Espera unos minutos e inténtalo de nuevo.");
      } else {
        setError(error.message);
      }
      return;
    }
    // Mismo mensaje exista o no la cuenta, para no revelar correos registrados.
    setEnviado(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-semibold text-ink">
            <Marca tamano="lg" vertical />
          </h1>
          <p className="text-inkSoft mt-1 text-sm">Recuperar contraseña</p>
        </div>

        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 shadow-sm">
          {enviado ? (
            <div className="space-y-4">
              <p className="text-sm text-ink">
                Si <strong>{correo}</strong> tiene una cuenta, te enviamos un enlace para
                crear una contraseña nueva. Revisa también la carpeta de spam.
              </p>
              <p className="text-xs text-inkSoft">
                El enlace solo funciona una vez y vence en poco tiempo.
              </p>
            </div>
          ) : (
            <form onSubmit={manejarEnvio} className="space-y-4">
              <p className="text-sm text-inkSoft">
                Escribe el correo con el que creaste tu cuenta y te enviaremos un enlace.
              </p>
              <div>
                <label htmlFor="correo" className="block text-xs font-medium text-inkSoft mb-1">
                  Correo institucional
                </label>
                <input
                  id="correo"
                  type="email"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full border border-paperLine rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="tu.nombre@universidad.edu"
                />
              </div>

              {error && <p className="text-sm text-rust">{error}</p>}

              <button
                type="submit"
                disabled={cargando}
                className="w-full bg-brand text-onBrand py-2 rounded-sm text-sm font-medium hover:bg-brandDark transition-colors disabled:opacity-60"
              >
                {cargando ? "Enviando…" : "Enviar enlace"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center mt-4">
          <Link href="/login" className="text-sm text-accentDark hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
