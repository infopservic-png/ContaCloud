"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState("entrar"); // "entrar" | "registrar"
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function manejarEnvio(e) {
    e.preventDefault();
    setMensaje(null);
    setCargando(true);

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({
        email: correo,
        password: clave,
      });
      setCargando(false);
      if (error) {
        setMensaje({ tipo: "error", texto: traducirError(error.message) });
      } else {
        router.replace("/dashboard");
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email: correo,
        password: clave,
      });
      setCargando(false);
      if (error) {
        setMensaje({ tipo: "error", texto: traducirError(error.message) });
      } else {
        setMensaje({
          tipo: "ok",
          texto: "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.",
        });
        setModo("entrar");
      }
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-semibold text-ink">ContaCloud</h1>
          <p className="text-inkSoft mt-1 text-sm">
            Práctica de partida doble para empresas de comercio y servicio
          </p>
        </div>

        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 shadow-sm">
          <div className="flex mb-6 border-b border-paperLine">
            <button
              onClick={() => setModo("entrar")}
              className={`flex-1 pb-3 text-sm font-medium ${
                modo === "entrar"
                  ? "text-ink border-b-2 border-brass -mb-px"
                  : "text-inkSoft"
              }`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => setModo("registrar")}
              className={`flex-1 pb-3 text-sm font-medium ${
                modo === "registrar"
                  ? "text-ink border-b-2 border-brass -mb-px"
                  : "text-inkSoft"
              }`}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={manejarEnvio} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">
                Correo institucional
              </label>
              <input
                type="email"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="w-full border border-paperLine rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brass"
                placeholder="tu.nombre@universidad.edu"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="w-full border border-paperLine rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brass"
                placeholder="Mínimo 6 caracteres"
              />
              {modo === "entrar" && (
                <div className="text-right mt-1">
                  <Link
                    href="/recuperar"
                    className="text-xs text-brass hover:text-brassDark hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              )}
            </div>

            {mensaje && (
              <p
                className={`text-sm ${
                  mensaje.tipo === "error" ? "text-rust" : "text-ledger"
                }`}
              >
                {mensaje.texto}
              </p>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-ink text-paper py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] transition-colors disabled:opacity-60"
            >
              {cargando
                ? "Procesando…"
                : modo === "entrar"
                ? "Entrar"
                : "Crear cuenta"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function traducirError(msg) {
  if (msg.includes("Invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (msg.includes("User already registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  return msg;
}
