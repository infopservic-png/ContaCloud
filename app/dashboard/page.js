"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { catalogoPorTipo } from "@/lib/catalogoCuentas";

export default function Dashboard() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("servicio");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState(null);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setUsuario(data.session.user);
      cargarEmpresas(data.session.user.id);
      supabase.rpc("soy_admin").then(({ data: esAdmin }) => {
        setAdmin(!!esAdmin);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarEmpresas(userId) {
    setCargando(true);
    const { data, error } = await supabase
      .from("empresas")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!error) setEmpresas(data);
    setCargando(false);
  }

  async function crearEmpresa(e) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return;
    setCreando(true);

    const { data: sesion } = await supabase.auth.getSession();
    const userId = sesion.session.user.id;

    const { data: empresa, error: errEmpresa } = await supabase
      .from("empresas")
      .insert({
        nombre: nombre.trim(),
        tipo,
        user_id: userId,
        propietario_email: sesion.session.user.email,
      })
      .select()
      .single();

    if (errEmpresa) {
      setError("No se pudo crear la empresa: " + errEmpresa.message);
      setCreando(false);
      return;
    }

    const cuentasIniciales = catalogoPorTipo(tipo).map((c) => ({
      ...c,
      empresa_id: empresa.id,
    }));

    const { error: errCuentas } = await supabase
      .from("cuentas")
      .insert(cuentasIniciales);

    if (errCuentas) {
      setError("Empresa creada, pero falló el catálogo de cuentas: " + errCuentas.message);
    }

    setNombre("");
    setCreando(false);
    router.push(`/empresa/${empresa.id}/transacciones`);
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function eliminarEmpresa(emp) {
    const confirmado = confirm(
      `¿Eliminar "${emp.nombre}"? Esto borra también todas sus cuentas, partidas y movimientos. Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;
    const { error: errDel } = await supabase.from("empresas").delete().eq("id", emp.id);
    if (errDel) {
      alert("No se pudo eliminar: " + errDel.message);
      return;
    }
    if (usuario) cargarEmpresas(usuario.id);
  }

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-inkSoft">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-2xl font-semibold">ContaCloud</h1>
          <p className="text-inkSoft text-sm">{usuario?.email}</p>
        </div>
        <button
          onClick={cerrarSesion}
          className="text-sm text-inkSoft hover:text-ink underline underline-offset-2"
        >
          Cerrar sesión
        </button>
      </header>

      {admin && (
        <div className="mb-8 bg-brass/10 border border-brass/40 rounded-sm px-4 py-3 flex items-center justify-between">
          <span className="text-sm">
            Tienes acceso de administrador: puedes ver (solo lectura) las
            empresas de todos los usuarios.
          </span>
          <button
            onClick={() => router.push("/admin")}
            className="text-sm font-medium text-brassDark hover:underline whitespace-nowrap ml-4"
          >
            Panel de administrador →
          </button>
        </div>
      )}

      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold mb-4">
          Tus empresas de práctica
        </h2>
        {empresas.length === 0 ? (
          <p className="text-inkSoft text-sm">
            Aún no has creado ninguna empresa. Crea la primera abajo para
            empezar a practicar.
          </p>
        ) : (
          <ul className="space-y-2">
            {empresas.map((emp) => (
              <li
                key={emp.id}
                className="bg-[#F7F4EA] border border-paperLine rounded-sm px-4 py-3 flex items-center justify-between hover:border-brass transition-colors"
              >
                <button
                  onClick={() => router.push(`/empresa/${emp.id}/transacciones`)}
                  className="flex-1 text-left flex items-center gap-3"
                >
                  <span className="font-medium">{emp.nombre}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded-sm ${
                      emp.tipo === "comercial"
                        ? "bg-brass/20 text-brassDark"
                        : "bg-ledger/20 text-ledgerDark"
                    }`}
                  >
                    {emp.tipo === "comercial" ? "Comercial" : "Servicio"}
                  </span>
                </button>
                <button
                  onClick={() => eliminarEmpresa(emp)}
                  className="text-xs text-rust hover:underline ml-4 whitespace-nowrap"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
        <h2 className="font-display text-lg font-semibold mb-4">
          Crear nueva empresa de práctica
        </h2>
        <form onSubmit={crearEmpresa} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-inkSoft mb-1">
              Nombre de la empresa
            </label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Comercial El Roble, S.A."
              className="w-full border border-paperLine rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brass"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-inkSoft mb-2">
              Tipo de empresa
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTipo("servicio")}
                className={`border rounded-sm px-4 py-3 text-left text-sm transition-colors ${
                  tipo === "servicio"
                    ? "border-ledger bg-ledger/10"
                    : "border-paperLine"
                }`}
              >
                <span className="block font-medium">Servicio</span>
                <span className="block text-xs text-inkSoft mt-1">
                  Sin inventario. Ej. consultoría, taller, clínica.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTipo("comercial")}
                className={`border rounded-sm px-4 py-3 text-left text-sm transition-colors ${
                  tipo === "comercial"
                    ? "border-brass bg-brass/10"
                    : "border-paperLine"
                }`}
              >
                <span className="block font-medium">Comercial</span>
                <span className="block text-xs text-inkSoft mt-1">
                  Compra-venta de mercadería, con inventario e IVA.
                </span>
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-rust">{error}</p>}

          <button
            type="submit"
            disabled={creando}
            className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] transition-colors disabled:opacity-60"
          >
            {creando ? "Creando…" : "Crear empresa y empezar"}
          </button>
        </form>
      </section>
    </main>
  );
}
