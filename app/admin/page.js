"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function AdminPage() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [autorizado, setAutorizado] = useState(null); // null = aún no se sabe
  const [empresas, setEmpresas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion.session) {
        router.replace("/login");
        return;
      }

      const { data: esAdmin, error: errAdmin } = await supabase.rpc("soy_admin");

      if (!activo) return;

      if (errAdmin || !esAdmin) {
        setAutorizado(false);
        setCargando(false);
        return;
      }

      setAutorizado(true);

      const { data, error: errEmpresas } = await supabase
        .from("empresas")
        .select("*")
        .order("created_at", { ascending: false });

      if (!activo) return;

      if (errEmpresas) {
        setError(errEmpresas.message);
      } else {
        setEmpresas(data || []);
      }
      setCargando(false);
    }

    cargar();
    return () => {
      activo = false;
    };
  }, [router]);

  async function eliminarEmpresa(emp) {
    const escrito = prompt(
      `Vas a eliminar PERMANENTEMENTE la empresa "${emp.nombre}" de ${
        emp.propietario_email || "este usuario"
      }, junto con todas sus cuentas, partidas y movimientos.\n\nPara confirmar, escribe exactamente el nombre de la empresa:`
    );
    if (escrito === null) return;
    if (escrito.trim() !== emp.nombre) {
      alert("El nombre no coincide. No se eliminó nada.");
      return;
    }
    const { error: errDel } = await supabase.from("empresas").delete().eq("id", emp.id);
    if (errDel) {
      alert("No se pudo eliminar: " + errDel.message);
      return;
    }
    setEmpresas((prev) => prev.filter((e) => e.id !== emp.id));
  }

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-inkSoft">Cargando…</p>
      </main>
    );
  }

  if (autorizado === false) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-sm mb-3">No tienes acceso a esta sección.</p>
          <Link
            href="/dashboard"
            className="text-sm text-accentDark hover:underline underline-offset-2"
          >
            ← Volver a mis empresas
          </Link>
        </div>
      </main>
    );
  }

  const empresasFiltradas = empresas.filter((e) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      e.nombre.toLowerCase().includes(q) ||
      (e.propietario_email || "").toLowerCase().includes(q)
    );
  });

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="text-xs text-inkSoft hover:text-ink underline underline-offset-2"
        >
          ← Mis empresas
        </Link>
        <h1 className="font-display text-2xl font-semibold mt-1">
          Panel de Administrador
        </h1>
        <p className="text-inkSoft text-sm mt-1">
          Vista de solo lectura de todas las empresas registradas en ContaCloud.
        </p>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre de empresa o correo del estudiante…"
        className="w-full border border-paperLine rounded-sm px-3 py-2 text-sm mb-6"
      />

      {error && <p className="text-sm text-rust mb-4">{error}</p>}

      {empresasFiltradas.length === 0 ? (
        <p className="text-inkSoft text-sm">No se encontraron empresas.</p>
      ) : (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand text-onBrand text-left">
                <th className="px-3 py-2 font-medium">Empresa</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Estudiante</th>
                <th className="px-3 py-2 font-medium">Creada</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {empresasFiltradas.map((emp) => (
                <tr key={emp.id} className="border-t border-paperLine">
                  <td className="px-3 py-2 font-medium">{emp.nombre}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-sm ${
                        emp.tipo === "comercial"
                          ? "bg-accent/20 text-accentDark"
                          : "bg-ledger/20 text-ledgerDark"
                      }`}
                    >
                      {emp.tipo === "comercial" ? "Comercial" : "Servicio"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-inkSoft">
                    {emp.propietario_email || "—"}
                  </td>
                  <td className="px-3 py-2 text-inkSoft">
                    {new Date(emp.created_at).toLocaleDateString("es-SV")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => router.push(`/empresa/${emp.id}/cuentas`)}
                      className="text-accentDark text-xs font-medium hover:underline"
                    >
                      Ver →
                    </button>
                    <button
                      onClick={() => eliminarEmpresa(emp)}
                      className="text-rust text-xs font-medium hover:underline ml-4"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-inkSoft mt-4">
        {empresasFiltradas.length} de {empresas.length} empresas.
      </p>
    </main>
  );
}
