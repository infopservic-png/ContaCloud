"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function lineaVacia() {
  return { cuenta_id: "", debe: "", haber: "" };
}

export default function TransaccionesPage() {
  const params = useParams();
  const empresaId = params.id;

  const [cuentas, setCuentas] = useState([]);
  const [transacciones, setTransacciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState("");
  const [lineas, setLineas] = useState([lineaVacia(), lineaVacia()]);

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function cargarTodo() {
    setCargando(true);
    const [{ data: cuentasData }, { data: transData }] = await Promise.all([
      supabase.from("cuentas").select("*").eq("empresa_id", empresaId).order("codigo"),
      supabase
        .from("transacciones")
        .select("*, movimientos(*, cuentas(codigo, nombre))")
        .eq("empresa_id", empresaId)
        .order("numero_partida", { ascending: false }),
    ]);
    setCuentas(cuentasData || []);
    setTransacciones(transData || []);
    setCargando(false);
  }

  function actualizarLinea(index, campo, valor) {
    const copia = [...lineas];
    copia[index] = { ...copia[index], [campo]: valor };
    setLineas(copia);
  }

  function agregarLinea() {
    setLineas([...lineas, lineaVacia()]);
  }

  function quitarLinea(index) {
    if (lineas.length <= 2) return;
    setLineas(lineas.filter((_, i) => i !== index));
  }

  const totalDebe = lineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
  const cuadra =
    totalDebe > 0 && Math.abs(totalDebe - totalHaber) < 0.005;

  async function guardarTransaccion(e) {
    e.preventDefault();
    setError(null);
    setExito(null);

    if (!descripcion.trim()) {
      setError("Escribe una descripción para la transacción.");
      return;
    }
    const lineasValidas = lineas.filter(
      (l) => l.cuenta_id && (parseFloat(l.debe) > 0 || parseFloat(l.haber) > 0)
    );
    if (lineasValidas.length < 2) {
      setError("Necesitas al menos dos líneas con cuenta y monto.");
      return;
    }
    if (lineasValidas.some((l) => parseFloat(l.debe) > 0 && parseFloat(l.haber) > 0)) {
      setError("Una línea no puede tener monto en Debe y en Haber a la vez.");
      return;
    }
    if (!cuadra) {
      setError(
        `La partida no cuadra: Debe ${totalDebe.toFixed(2)} vs Haber ${totalHaber.toFixed(2)}.`
      );
      return;
    }

    setGuardando(true);

    const numeroPartida =
      transacciones.length > 0 ? transacciones[0].numero_partida + 1 : 1;

    const { data: trans, error: errTrans } = await supabase
      .from("transacciones")
      .insert({
        empresa_id: empresaId,
        fecha,
        descripcion: descripcion.trim(),
        numero_partida: numeroPartida,
      })
      .select()
      .single();

    if (errTrans) {
      setError("No se pudo guardar la transacción: " + errTrans.message);
      setGuardando(false);
      return;
    }

    const movimientos = lineasValidas.map((l) => ({
      transaccion_id: trans.id,
      cuenta_id: l.cuenta_id,
      debe: parseFloat(l.debe) || 0,
      haber: parseFloat(l.haber) || 0,
    }));

    const { error: errMov } = await supabase.from("movimientos").insert(movimientos);

    if (errMov) {
      setError("Transacción creada, pero fallaron las líneas: " + errMov.message);
      setGuardando(false);
      return;
    }

    setExito(`Partida #${numeroPartida} registrada correctamente.`);
    setDescripcion("");
    setLineas([lineaVacia(), lineaVacia()]);
    setGuardando(false);
    cargarTodo();
  }

  if (cargando) {
    return <p className="text-inkSoft">Cargando…</p>;
  }

  if (cuentas.length === 0) {
    return (
      <p className="text-inkSoft text-sm">
        Primero necesitas al menos una cuenta en el{" "}
        <span className="font-medium">Catálogo de cuentas</span> para poder
        registrar transacciones.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
        <h2 className="font-display text-base font-semibold mb-4">
          Registrar nueva partida
        </h2>
        <form onSubmit={guardarTransaccion} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-inkSoft mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs text-inkSoft mb-1">
                Descripción de la operación
              </label>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej. Se compra mercadería al contado según factura 001"
                className="w-full border border-paperLine rounded-sm px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="grid grid-cols-12 gap-2 text-xs text-inkSoft mb-1 px-1">
              <span className="col-span-6">Cuenta</span>
              <span className="col-span-2 text-right">Debe</span>
              <span className="col-span-2 text-right">Haber</span>
              <span className="col-span-2"></span>
            </div>
            <div className="space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={l.cuenta_id}
                    onChange={(e) => actualizarLinea(i, "cuenta_id", e.target.value)}
                    className="col-span-6 border border-paperLine rounded-sm px-2 py-2 text-sm"
                  >
                    <option value="">Selecciona una cuenta…</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} — {c.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.debe}
                    onChange={(e) => actualizarLinea(i, "debe", e.target.value)}
                    placeholder="0.00"
                    className="col-span-2 border border-paperLine rounded-sm px-2 py-2 text-sm text-right font-num"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.haber}
                    onChange={(e) => actualizarLinea(i, "haber", e.target.value)}
                    placeholder="0.00"
                    className="col-span-2 border border-paperLine rounded-sm px-2 py-2 text-sm text-right font-num"
                  />
                  <button
                    type="button"
                    onClick={() => quitarLinea(i)}
                    disabled={lineas.length <= 2}
                    className="col-span-2 text-xs text-rust hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={agregarLinea}
              className="text-xs text-brassDark hover:underline mt-2"
            >
              + Agregar línea
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-paperLine pt-3">
            <div className="text-sm font-num tabular space-x-6">
              <span>
                Debe: <strong>{totalDebe.toFixed(2)}</strong>
              </span>
              <span>
                Haber: <strong>{totalHaber.toFixed(2)}</strong>
              </span>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-sm ${
                cuadra ? "bg-ledger/20 text-ledgerDark" : "bg-rust/10 text-rust"
              }`}
            >
              {cuadra ? "Partida cuadrada ✓" : "No cuadra todavía"}
            </span>
          </div>

          {error && <p className="text-sm text-rust">{error}</p>}
          {exito && <p className="text-sm text-ledger">{exito}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] transition-colors disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Registrar partida"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold mb-4">Libro Diario</h2>
        {transacciones.length === 0 ? (
          <p className="text-inkSoft text-sm">Aún no hay partidas registradas.</p>
        ) : (
          <div className="space-y-4">
            {transacciones.map((t) => (
              <div
                key={t.id}
                className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden"
              >
                <div className="px-4 py-2 border-b border-paperLine flex items-center justify-between bg-paperLine/20">
                  <span className="text-sm font-medium">
                    Partida #{t.numero_partida} — {t.descripcion}
                  </span>
                  <span className="text-xs text-inkSoft font-num">{t.fecha}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {t.movimientos.map((m) => (
                      <tr key={m.id} className="border-b border-paperLine last:border-0">
                        <td className="px-4 py-1.5 pl-8 text-inkSoft">
                          {m.cuentas?.codigo} — {m.cuentas?.nombre}
                        </td>
                        <td className="px-4 py-1.5 text-right font-num tabular w-28">
                          {m.debe > 0 ? Number(m.debe).toFixed(2) : ""}
                        </td>
                        <td className="px-4 py-1.5 text-right font-num tabular w-28">
                          {m.haber > 0 ? Number(m.haber).toFixed(2) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
