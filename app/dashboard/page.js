"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Marca from "@/components/Marca";
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

  const fmtFecha = (f) => {
    if (!f) return "";
    const d = new Date(f);
    return isNaN(d) ? "" : d.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <main className="min-h-screen px-4 py-8 sac-escritorio">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="sac-ventana p-0" style={{ paddingTop: 0 }}>
          <div
            className="px-3 py-1.5 text-xs font-semibold flex items-center justify-between"
            style={{ background: "linear-gradient(to bottom, rgb(var(--brand-dark)), rgb(var(--brand)))", color: "rgb(var(--on-brand))" }}
          >
            <span><Marca tamano="sm" className="!gap-2" /> — Selección de empresa</span>
            <span className="font-normal opacity-80">{usuario?.email}</span>
          </div>

          {/* Barra de herramientas */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#a9a496] bg-[#E2DFD6]">
            <Link href="/perfil" className="sac-btn">Mi perfil</Link>
            {admin && (
              <button onClick={() => router.push("/admin")} className="sac-btn">Panel de administrador</button>
            )}
            <span className="flex-1" />
            <button onClick={cerrarSesion} className="sac-btn">Cerrar sesión</button>
          </div>

          {admin && (
            <p className="px-3 py-1.5 text-xs bg-accent/10 border-b border-accent/30">
              Acceso de administrador: puedes ver (solo lectura) las empresas de todos los usuarios.
            </p>
          )}

          {/* Cuadrícula de empresas */}
          <div className="p-3">
            <table className="w-full text-sm bg-white border border-[#7a828f]">
              <thead>
                <tr className="bg-[#DAD7CD] text-left text-xs">
                  <th className="px-3 py-1.5 border border-[#a9a496] w-12 text-center">No.</th>
                  <th className="px-3 py-1.5 border border-[#a9a496]">Empresa</th>
                  <th className="px-3 py-1.5 border border-[#a9a496] w-28">Tipo</th>
                  <th className="px-3 py-1.5 border border-[#a9a496] w-28">Creada</th>
                  <th className="px-3 py-1.5 border border-[#a9a496] w-36 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empresas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-inkSoft text-xs">
                      Aún no has creado ninguna empresa. Crea la primera en el recuadro de abajo.
                    </td>
                  </tr>
                )}
                {empresas.map((emp, i) => (
                  <tr
                    key={emp.id}
                    onDoubleClick={() => router.push(`/empresa/${emp.id}/transacciones`)}
                    className={`cursor-pointer hover:bg-[#DCE6F4] ${i % 2 ? "bg-[#F4F2EC]" : "bg-white"}`}
                  >
                    <td className="px-3 py-1.5 border border-[#d3d0c6] text-center text-xs">{i + 1}</td>
                    <td className="px-3 py-1.5 border border-[#d3d0c6] font-medium">{emp.nombre}</td>
                    <td className="px-3 py-1.5 border border-[#d3d0c6] text-xs">
                      {emp.tipo === "comercial" ? "Comercial" : "Servicio"}
                    </td>
                    <td className="px-3 py-1.5 border border-[#d3d0c6] text-xs">{fmtFecha(emp.created_at)}</td>
                    <td className="px-2 py-1 border border-[#d3d0c6] text-center whitespace-nowrap">
                      <button onClick={() => router.push(`/empresa/${emp.id}/transacciones`)} className="sac-btn sac-btn-primario !py-0.5 !px-3 text-xs">
                        Abrir
                      </button>{" "}
                      <button onClick={() => eliminarEmpresa(emp)} className="sac-btn !py-0.5 !px-3 text-xs text-rust">
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-inkSoft mt-1.5">Doble clic sobre una empresa para abrirla.</p>
          </div>

          <div className="px-3 py-1 text-[11px] text-inkSoft border-t border-[#a9a496] bg-[#E2DFD6]">
            {empresas.length} {empresas.length === 1 ? "empresa" : "empresas"}
          </div>
        </div>

        {/* Nueva empresa */}
        <form onSubmit={crearEmpresa} className="sac-ventana p-0">
          <div
            className="px-3 py-1.5 text-xs font-semibold"
            style={{ background: "linear-gradient(to bottom, rgb(var(--brand-dark)), rgb(var(--brand)))", color: "rgb(var(--on-brand))" }}
          >
            Nueva empresa de práctica
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">Nombre de la empresa</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Comercial El Roble, S.A."
                className="w-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <fieldset className="sac-grupo">
              <legend>Tipo de empresa</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { v: "servicio", t: "Servicio", d: "Sin inventario. Ej. consultoría, taller, clínica." },
                  { v: "comercial", t: "Comercial", d: "Compra-venta de mercadería, con inventario e IVA." },
                ].map((o) => (
                  <label key={o.v} className={`flex gap-2 items-start p-2 cursor-pointer border ${tipo === o.v ? "border-accent bg-accent/10" : "border-transparent"}`}>
                    <input type="radio" name="tipo" checked={tipo === o.v} onChange={() => setTipo(o.v)} className="mt-1" />
                    <span>
                      <span className="block text-sm font-medium">{o.t}</span>
                      <span className="block text-xs text-inkSoft">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p className="text-sm text-rust">{error}</p>}

            <button type="submit" disabled={creando} className="sac-btn sac-btn-primario font-medium">
              {creando ? "Creando…" : "Crear empresa y empezar"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
