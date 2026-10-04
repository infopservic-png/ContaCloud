"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const CLASES = ["Activo", "Pasivo", "Capital", "Ingreso", "Costo", "Gasto"];

export default function CuentasPage() {
  const params = useParams();
  const empresaId = params.id;
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nueva, setNueva] = useState({
    codigo: "",
    nombre: "",
    clase: "Activo",
    tipo_saldo: "deudor",
  });
  const [editandoId, setEditandoId] = useState(null);
  const [edicion, setEdicion] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    cargarCuentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function cargarCuentas() {
    setCargando(true);
    const { data, error } = await supabase
      .from("cuentas")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("codigo");
    if (!error) setCuentas(data);
    setCargando(false);
  }

  async function agregarCuenta(e) {
    e.preventDefault();
    setError(null);
    if (!nueva.codigo.trim() || !nueva.nombre.trim()) return;

    const { error } = await supabase.from("cuentas").insert({
      empresa_id: empresaId,
      codigo: nueva.codigo.trim(),
      nombre: nueva.nombre.trim(),
      clase: nueva.clase,
      tipo_saldo: nueva.tipo_saldo,
    });

    if (error) {
      setError(
        error.message.includes("duplicate")
          ? "Ya existe una cuenta con ese código."
          : error.message
      );
      return;
    }

    setNueva({ codigo: "", nombre: "", clase: "Activo", tipo_saldo: "deudor" });
    cargarCuentas();
  }

  function empezarEdicion(cuenta) {
    setError(null);
    setEditandoId(cuenta.id);
    setEdicion({
      codigo: cuenta.codigo,
      nombre: cuenta.nombre,
      clase: cuenta.clase,
      tipo_saldo: cuenta.tipo_saldo,
    });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setEdicion(null);
  }

  async function guardarEdicion(id) {
    setError(null);
    if (!edicion.codigo.trim() || !edicion.nombre.trim()) return;

    const { error } = await supabase
      .from("cuentas")
      .update({
        codigo: edicion.codigo.trim(),
        nombre: edicion.nombre.trim(),
        clase: edicion.clase,
        tipo_saldo: edicion.tipo_saldo,
      })
      .eq("id", id);

    if (error) {
      setError(
        error.message.includes("duplicate")
          ? "Ya existe otra cuenta con ese código."
          : "No se pudo guardar el cambio: " + error.message
      );
      return;
    }

    setEditandoId(null);
    setEdicion(null);
    cargarCuentas();
  }

  async function eliminarCuenta(id) {
    const { error } = await supabase.from("cuentas").delete().eq("id", id);
    if (error) {
      setError(
        "No se pudo eliminar (probablemente ya tiene movimientos registrados)."
      );
      return;
    }
    cargarCuentas();
  }

  return (
    <div className="space-y-8">
      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-inkSoft border-b border-paperLine">
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre de cuenta</th>
              <th className="px-4 py-3 font-medium">Clase</th>
              <th className="px-4 py-3 font-medium">Naturaleza</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-inkSoft">
                  Cargando…
                </td>
              </tr>
            ) : cuentas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-inkSoft">
                  No hay cuentas todavía.
                </td>
              </tr>
            ) : (
              cuentas.map((c) =>
                editandoId === c.id ? (
                  <tr key={c.id} className="border-b border-paperLine last:border-0 bg-brass/5">
                    <td className="px-4 py-2">
                      <input
                        value={edicion.codigo}
                        onChange={(e) =>
                          setEdicion({ ...edicion, codigo: e.target.value })
                        }
                        className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm font-num"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={edicion.nombre}
                        onChange={(e) =>
                          setEdicion({ ...edicion, nombre: e.target.value })
                        }
                        className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={edicion.clase}
                        onChange={(e) =>
                          setEdicion({ ...edicion, clase: e.target.value })
                        }
                        className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
                      >
                        {CLASES.map((cl) => (
                          <option key={cl} value={cl}>
                            {cl}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={edicion.tipo_saldo}
                        onChange={(e) =>
                          setEdicion({ ...edicion, tipo_saldo: e.target.value })
                        }
                        className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
                      >
                        <option value="deudor">Deudora</option>
                        <option value="acreedor">Acreedora</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => guardarEdicion(c.id)}
                        className="text-xs text-ledgerDark hover:underline mr-3"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={cancelarEdicion}
                        className="text-xs text-inkSoft hover:underline"
                      >
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="border-b border-paperLine last:border-0">
                    <td className="px-4 py-2 font-num tabular">{c.codigo}</td>
                    <td className="px-4 py-2">{c.nombre}</td>
                    <td className="px-4 py-2 text-inkSoft">{c.clase}</td>
                    <td className="px-4 py-2 text-inkSoft capitalize">
                      {c.tipo_saldo}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => empezarEdicion(c)}
                        className="text-xs text-brassDark hover:underline mr-3"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminarCuenta(c.id)}
                        className="text-xs text-rust hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </section>

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
        <h2 className="font-display text-base font-semibold mb-4">
          Agregar cuenta al catálogo
        </h2>
        <form
          onSubmit={agregarCuenta}
          className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
        >
          <div className="sm:col-span-1">
            <label className="block text-xs text-inkSoft mb-1">Código</label>
            <input
              value={nueva.codigo}
              onChange={(e) => setNueva({ ...nueva, codigo: e.target.value })}
              className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm font-num"
              placeholder="1105"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-inkSoft mb-1">Nombre</label>
            <input
              value={nueva.nombre}
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm"
              placeholder="Papelería y Útiles"
            />
          </div>
          <div>
            <label className="block text-xs text-inkSoft mb-1">Clase</label>
            <select
              value={nueva.clase}
              onChange={(e) => setNueva({ ...nueva, clase: e.target.value })}
              className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm"
            >
              {CLASES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-inkSoft mb-1">Naturaleza</label>
            <select
              value={nueva.tipo_saldo}
              onChange={(e) =>
                setNueva({ ...nueva, tipo_saldo: e.target.value })
              }
              className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm"
            >
              <option value="deudor">Deudora</option>
              <option value="acreedor">Acreedora</option>
            </select>
          </div>
          <div className="sm:col-span-5">
            <button
              type="submit"
              className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] transition-colors"
            >
              Agregar cuenta
            </button>
          </div>
        </form>
        {error && <p className="text-sm text-rust mt-3">{error}</p>}
      </section>
    </div>
  );
}
