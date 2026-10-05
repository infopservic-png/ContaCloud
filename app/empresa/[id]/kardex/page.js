"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import {
  obtenerProductos,
  obtenerKardex,
  saldoActual,
  ordenarKardex,
  recalcularSecuencia,
  validarCostoDocumentos,
  sincronizarKardex,
} from "@/lib/kardex";
import { formatoMoneda } from "@/lib/contabilidad";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { exportarAExcel } from "@/lib/exportarExcel";

function nuevoProductoVacio() {
  return { codigo: "", nombre: "", unidad: "", cuenta_inventario_id: "", cuenta_costo_venta_id: "" };
}

function nuevoMovimientoVacio() {
  return {
    tipo: "entrada",
    fecha: new Date().toISOString().slice(0, 10),
    cantidad: "",
    costoUnitario: "",
    cuentaContraria: "",
    descripcion: "",
  };
}

const TOLERANCIA = 0.005;
function distinto(a, b) {
  return Math.abs(Number(a) - Number(b)) > TOLERANCIA;
}

export default function KardexPage() {
  const { cuentas, empresaId } = useEmpresa();

  const [productos, setProductos] = useState([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [productoId, setProductoId] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoMov, setCargandoMov] = useState(false);

  const [nuevoProducto, setNuevoProducto] = useState(nuevoProductoVacio());
  const [errorProducto, setErrorProducto] = useState(null);
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [mostrarFormProducto, setMostrarFormProducto] = useState(false);

  const [form, setForm] = useState(nuevoMovimientoVacio());
  const [editandoMovId, setEditandoMovId] = useState(null);
  const [errorMov, setErrorMov] = useState(null);
  const [guardandoMov, setGuardandoMov] = useState(false);

  async function cargarProductos() {
    setCargandoProductos(true);
    const data = await obtenerProductos(empresaId);
    setProductos(data);
    setCargandoProductos(false);
    return data;
  }

  useEffect(() => {
    cargarProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function cargarMovimientos(id) {
    setCargandoMov(true);
    const data = await obtenerKardex(id);
    setMovimientos(data);
    setCargandoMov(false);
  }

  function seleccionarProducto(id) {
    setProductoId(id);
    setForm(nuevoMovimientoVacio());
    setEditandoMovId(null);
    setErrorMov(null);
    cargarMovimientos(id);
  }

  const producto = productos.find((p) => p.id === productoId) || null;
  const saldo = useMemo(() => saldoActual(movimientos), [movimientos]);

  async function agregarProducto(e) {
    e.preventDefault();
    setErrorProducto(null);
    if (!nuevoProducto.nombre.trim()) {
      setErrorProducto("El nombre del producto es obligatorio.");
      return;
    }
    if (!nuevoProducto.cuenta_inventario_id || !nuevoProducto.cuenta_costo_venta_id) {
      setErrorProducto("Selecciona la cuenta de Inventario y la de Costo de Venta.");
      return;
    }
    setGuardandoProducto(true);
    const { data, error } = await supabase
      .from("productos")
      .insert({
        empresa_id: empresaId,
        codigo: nuevoProducto.codigo.trim() || null,
        nombre: nuevoProducto.nombre.trim(),
        unidad: nuevoProducto.unidad.trim() || null,
        cuenta_inventario_id: nuevoProducto.cuenta_inventario_id,
        cuenta_costo_venta_id: nuevoProducto.cuenta_costo_venta_id,
      })
      .select()
      .single();
    setGuardandoProducto(false);
    if (error) {
      setErrorProducto("No se pudo crear: " + error.message);
      return;
    }
    setNuevoProducto(nuevoProductoVacio());
    setMostrarFormProducto(false);
    const lista = await cargarProductos();
    const creado = lista.find((p) => p.id === data.id);
    if (creado) seleccionarProducto(creado.id);
  }

  function glosaMovimiento(tipo, descripcion) {
    const base =
      tipo === "entrada"
        ? `Entrada de inventario — ${producto.nombre}`
        : `Salida de inventario (costo de venta) — ${producto.nombre}`;
    return descripcion ? `${base}: ${descripcion}` : base;
  }

  // La sincronización del kardex con sus partidas está en lib/kardex.js
  // (compartida con los módulos de Ventas y Compras).
  const sincronizarCambios = sincronizarKardex;

  async function crearMovimiento() {
    const cantidad = Number(form.cantidad);
    const candidato = {
      id: "NUEVO",
      tipo: form.tipo,
      fecha: form.fecha,
      cantidad,
      costo_unitario: form.tipo === "entrada" ? Number(form.costoUnitario) : 0,
      descripcion: form.descripcion.trim() || null,
      created_at: new Date().toISOString(),
    };
    const lista = [...movimientos, candidato].sort(ordenarKardex);
    const { error, resultado } = recalcularSecuencia(lista);
    if (error) {
      setErrorMov(error);
      return;
    }
    const errorDoc = validarCostoDocumentos(resultado, movimientos);
    if (errorDoc) {
      setErrorMov(errorDoc);
      return;
    }
    const nuevo = resultado.find((r) => r.id === "NUEVO");

    const { data: ultimaPartida } = await supabase
      .from("transacciones")
      .select("numero_partida")
      .eq("empresa_id", empresaId)
      .order("numero_partida", { ascending: false })
      .limit(1)
      .maybeSingle();
    const siguienteNumero = (ultimaPartida?.numero_partida || 0) + 1;

    const { data: transaccion, error: errTx } = await supabase
      .from("transacciones")
      .insert({
        empresa_id: empresaId,
        fecha: candidato.fecha,
        descripcion: glosaMovimiento(candidato.tipo, candidato.descripcion),
        numero_partida: siguienteNumero,
      })
      .select()
      .single();
    if (errTx) {
      setErrorMov("No se pudo registrar la partida: " + errTx.message);
      return;
    }

    const cuentaDebe = form.tipo === "entrada" ? producto.cuenta_inventario_id : producto.cuenta_costo_venta_id;
    const cuentaHaber = form.tipo === "entrada" ? form.cuentaContraria : producto.cuenta_inventario_id;

    const { error: errMov } = await supabase.from("movimientos").insert([
      { transaccion_id: transaccion.id, cuenta_id: cuentaDebe, debe: nuevo.costo_total, haber: 0 },
      { transaccion_id: transaccion.id, cuenta_id: cuentaHaber, debe: 0, haber: nuevo.costo_total },
    ]);
    if (errMov) {
      setErrorMov("Partida creada, pero fallaron las líneas: " + errMov.message);
      return;
    }

    const { error: errKardex } = await supabase.from("kardex_movimientos").insert({
      producto_id: productoId,
      fecha: candidato.fecha,
      tipo: candidato.tipo,
      descripcion: candidato.descripcion,
      cantidad,
      costo_unitario: nuevo.costo_unitario,
      costo_total: nuevo.costo_total,
      saldo_cantidad: nuevo.saldo_cantidad,
      saldo_costo_unitario: nuevo.saldo_costo_unitario,
      saldo_costo_total: nuevo.saldo_costo_total,
      transaccion_id: transaccion.id,
    });
    if (errKardex) {
      setErrorMov("La partida se registró, pero falló el renglón del kardex: " + errKardex.message);
      return;
    }

    await sincronizarCambios(
      resultado.filter((r) => r.id !== "NUEVO"),
      movimientos
    );

    setForm(nuevoMovimientoVacio());
    cargarMovimientos(productoId);
    cargarProductos();
  }

  function empezarEdicionMovimiento(m) {
    setErrorMov(null);
    setEditandoMovId(m.id);
    setForm({
      tipo: m.tipo,
      fecha: m.fecha,
      cantidad: String(m.cantidad),
      costoUnitario: m.tipo === "entrada" ? String(m.costo_unitario) : "",
      cuentaContraria: "",
      descripcion: m.descripcion || "",
    });

    if (m.tipo === "entrada" && m.transaccion_id) {
      supabase
        .from("movimientos")
        .select("cuenta_id, haber")
        .eq("transaccion_id", m.transaccion_id)
        .then(({ data }) => {
          const filaHaber = (data || []).find((r) => Number(r.haber) > 0);
          if (filaHaber) {
            setForm((f) => ({ ...f, cuentaContraria: filaHaber.cuenta_id }));
          }
        });
    }
  }

  function cancelarEdicionMovimiento() {
    setEditandoMovId(null);
    setForm(nuevoMovimientoVacio());
    setErrorMov(null);
  }

  async function guardarEdicionMovimiento() {
    const cantidad = Number(form.cantidad);
    const original = movimientos.find((m) => m.id === editandoMovId);
    if (!original) return;

    const editado = {
      ...original,
      tipo: form.tipo,
      fecha: form.fecha,
      cantidad,
      costo_unitario: form.tipo === "entrada" ? Number(form.costoUnitario) : original.costo_unitario,
      descripcion: form.descripcion.trim() || null,
    };
    const lista = [...movimientos.filter((m) => m.id !== editandoMovId), editado].sort(ordenarKardex);
    const { error, resultado } = recalcularSecuencia(lista);
    if (error) {
      setErrorMov(error);
      return;
    }
    const errorDoc = validarCostoDocumentos(resultado, movimientos);
    if (errorDoc) {
      setErrorMov(errorDoc);
      return;
    }
    const nuevo = resultado.find((r) => r.id === editandoMovId);

    if (original.transaccion_id) {
      await supabase
        .from("transacciones")
        .update({
          fecha: editado.fecha,
          descripcion: glosaMovimiento(editado.tipo, editado.descripcion),
        })
        .eq("id", original.transaccion_id);

      const { data: movs } = await supabase
        .from("movimientos")
        .select("id, debe, haber")
        .eq("transaccion_id", original.transaccion_id);
      const filaDebe = (movs || []).find((r) => Number(r.debe) > 0);
      const filaHaber = (movs || []).find((r) => Number(r.haber) > 0);
      const cuentaDebe =
        editado.tipo === "entrada" ? producto.cuenta_inventario_id : producto.cuenta_costo_venta_id;
      const cuentaHaber = editado.tipo === "entrada" ? form.cuentaContraria : producto.cuenta_inventario_id;
      if (filaDebe) {
        await supabase
          .from("movimientos")
          .update({ debe: nuevo.costo_total, cuenta_id: cuentaDebe })
          .eq("id", filaDebe.id);
      }
      if (filaHaber) {
        await supabase
          .from("movimientos")
          .update({ haber: nuevo.costo_total, cuenta_id: cuentaHaber })
          .eq("id", filaHaber.id);
      }
    }

    await supabase
      .from("kardex_movimientos")
      .update({
        tipo: editado.tipo,
        fecha: editado.fecha,
        descripcion: editado.descripcion,
        cantidad: editado.cantidad,
        costo_unitario: nuevo.costo_unitario,
        costo_total: nuevo.costo_total,
        saldo_cantidad: nuevo.saldo_cantidad,
        saldo_costo_unitario: nuevo.saldo_costo_unitario,
        saldo_costo_total: nuevo.saldo_costo_total,
      })
      .eq("id", editandoMovId);

    await sincronizarCambios(
      resultado.filter((r) => r.id !== editandoMovId),
      movimientos
    );

    cancelarEdicionMovimiento();
    cargarMovimientos(productoId);
    cargarProductos();
  }

  async function eliminarMovimiento(m) {
    const confirmado = confirm(
      `¿Eliminar este movimiento del ${m.fecha}? Esto recalculará el costo promedio de los movimientos posteriores y su partida contable se eliminará.`
    );
    if (!confirmado) return;

    const lista = movimientos.filter((x) => x.id !== m.id);
    const { error, resultado } = recalcularSecuencia(lista);
    if (error) {
      alert("No se puede eliminar: " + error);
      return;
    }
    const errorDoc = validarCostoDocumentos(resultado, movimientos);
    if (errorDoc) {
      alert("No se puede eliminar: " + errorDoc);
      return;
    }

    if (m.transaccion_id) {
      await supabase.from("transacciones").delete().eq("id", m.transaccion_id);
    }
    await supabase.from("kardex_movimientos").delete().eq("id", m.id);

    await sincronizarCambios(resultado, movimientos);

    if (editandoMovId === m.id) cancelarEdicionMovimiento();
    cargarMovimientos(productoId);
    cargarProductos();
  }

  async function registrarMovimiento(e) {
    e.preventDefault();
    setErrorMov(null);

    const cantidad = Number(form.cantidad);
    if (!cantidad || cantidad <= 0) {
      setErrorMov("La cantidad debe ser mayor que cero.");
      return;
    }
    if (form.tipo === "entrada") {
      if (!Number(form.costoUnitario) || Number(form.costoUnitario) <= 0) {
        setErrorMov("El costo unitario debe ser mayor que cero.");
        return;
      }
      if (!form.cuentaContraria) {
        setErrorMov(
          "Selecciona con qué se pagó (cuenta contraria: Caja, Bancos, Cuentas por Pagar, etc.)."
        );
        return;
      }
    }

    setGuardandoMov(true);
    try {
      if (editandoMovId) {
        await guardarEdicionMovimiento();
      } else {
        await crearMovimiento();
      }
    } finally {
      setGuardandoMov(false);
    }
  }

  function exportar() {
    const filas = [
      [`Kardex — ${producto.nombre}`],
      [],
      [
        "Fecha",
        "Descripción",
        "Entrada Cant.",
        "Entrada Costo Unit.",
        "Entrada Costo Total",
        "Salida Cant.",
        "Salida Costo Unit.",
        "Salida Costo Total",
        "Saldo Cant.",
        "Saldo Costo Unit.",
        "Saldo Costo Total",
      ],
      ...movimientos.map((m) => [
        m.fecha,
        m.descripcion || "",
        m.tipo === "entrada" ? m.cantidad : "",
        m.tipo === "entrada" ? m.costo_unitario : "",
        m.tipo === "entrada" ? m.costo_total : "",
        m.tipo === "salida" ? m.cantidad : "",
        m.tipo === "salida" ? m.costo_unitario : "",
        m.tipo === "salida" ? m.costo_total : "",
        m.saldo_cantidad,
        m.saldo_costo_unitario,
        m.saldo_costo_total,
      ]),
    ];
    exportarAExcel(`kardex-${producto.nombre}`, [{ nombre: "Kardex", filas }]);
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-4 no-print">Kardex de Inventarios</h2>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Lista de productos */}
        <div className="no-print">
          <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden mb-3">
            {cargandoProductos ? (
              <p className="p-3 text-sm text-inkSoft">Cargando…</p>
            ) : productos.length === 0 ? (
              <p className="p-3 text-sm text-inkSoft">Sin productos todavía.</p>
            ) : (
              <ul>
                {productos.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => seleccionarProducto(p.id)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-paperLine last:border-b-0 hover:bg-brass/10 ${
                        productoId === p.id ? "bg-brass/20 font-medium" : ""
                      }`}
                    >
                      {p.codigo ? `${p.codigo} — ` : ""}
                      {p.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => setMostrarFormProducto((v) => !v)}
            className="text-xs text-brassDark hover:underline"
          >
            {mostrarFormProducto ? "Cancelar" : "+ Agregar producto"}
          </button>

          {mostrarFormProducto && (
            <form
              onSubmit={agregarProducto}
              className="mt-3 bg-[#F7F4EA] border border-paperLine rounded-sm p-3 space-y-2"
            >
              <div>
                <label className="block text-xs font-medium text-inkSoft mb-1">Código (opcional)</label>
                <input
                  value={nuevoProducto.codigo}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, codigo: e.target.value })}
                  className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-inkSoft mb-1">Nombre</label>
                <input
                  value={nuevoProducto.nombre}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, nombre: e.target.value })}
                  className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-inkSoft mb-1">Unidad (opcional)</label>
                <input
                  value={nuevoProducto.unidad}
                  onChange={(e) => setNuevoProducto({ ...nuevoProducto, unidad: e.target.value })}
                  placeholder="Ej. unidad, caja, kg"
                  className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-inkSoft mb-1">
                  Cuenta de Inventario
                </label>
                <CuentaCombobox
                  cuentas={cuentas}
                  value={nuevoProducto.cuenta_inventario_id}
                  onChange={(id) =>
                    setNuevoProducto({ ...nuevoProducto, cuenta_inventario_id: id })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-inkSoft mb-1">
                  Cuenta de Costo de Venta
                </label>
                <CuentaCombobox
                  cuentas={cuentas}
                  value={nuevoProducto.cuenta_costo_venta_id}
                  onChange={(id) =>
                    setNuevoProducto({ ...nuevoProducto, cuenta_costo_venta_id: id })
                  }
                />
              </div>
              {errorProducto && <p className="text-xs text-rust">{errorProducto}</p>}
              <button
                type="submit"
                disabled={guardandoProducto}
                className="bg-ink text-paper px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-[#2C3A52] disabled:opacity-60"
              >
                {guardandoProducto ? "Guardando…" : "Guardar producto"}
              </button>
            </form>
          )}
        </div>

        {/* Detalle del producto seleccionado */}
        <div>
          {!producto ? (
            <p className="text-inkSoft text-sm">
              Selecciona un producto de la lista (o crea uno nuevo) para ver su kardex.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display text-base font-semibold">{producto.nombre}</h3>
                  <p className="text-xs text-inkSoft">
                    Inventario: {producto.cuenta_inventario?.codigo} —{" "}
                    {producto.cuenta_inventario?.nombre} · Costo de Venta:{" "}
                    {producto.cuenta_costo_venta?.codigo} — {producto.cuenta_costo_venta?.nombre}
                  </p>
                </div>
                <div className="flex items-center gap-3 no-print">
                  <button
                    onClick={() => window.print()}
                    className="text-xs text-inkSoft hover:text-ink underline underline-offset-2"
                  >
                    Imprimir
                  </button>
                  {movimientos.length > 0 && (
                    <button
                      onClick={exportar}
                      className="text-xs text-ledgerDark hover:underline"
                    >
                      Exportar a Excel
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4 max-w-md">
                <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-3 text-center">
                  <p className="text-xs text-inkSoft">Cantidad</p>
                  <p className="font-num font-semibold">{saldo.cantidad}</p>
                </div>
                <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-3 text-center">
                  <p className="text-xs text-inkSoft">Costo Prom.</p>
                  <p className="font-num font-semibold">{formatoMoneda(saldo.costoUnitario)}</p>
                </div>
                <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-3 text-center">
                  <p className="text-xs text-inkSoft">Costo Total</p>
                  <p className="font-num font-semibold">{formatoMoneda(saldo.costoTotal)}</p>
                </div>
              </div>

              <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 mb-6 no-print">
                {editandoMovId && (
                  <div className="mb-3 bg-brass/10 border border-brass/40 rounded-sm px-3 py-2 text-xs flex items-center justify-between">
                    <span>
                      Editando un movimiento existente — al guardar se recalculará el costo
                      promedio de los movimientos posteriores.
                    </span>
                    <button
                      onClick={cancelarEdicionMovimiento}
                      className="text-inkSoft hover:text-ink underline underline-offset-2 ml-3 whitespace-nowrap"
                    >
                      Cancelar edición
                    </button>
                  </div>
                )}

                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, tipo: "entrada" })}
                    className={`px-3 py-1.5 rounded-sm text-xs font-medium border ${
                      form.tipo === "entrada"
                        ? "bg-ledger/20 border-ledger text-ledgerDark"
                        : "border-paperLine text-inkSoft"
                    }`}
                  >
                    Entrada (compra)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, tipo: "salida" })}
                    className={`px-3 py-1.5 rounded-sm text-xs font-medium border ${
                      form.tipo === "salida"
                        ? "bg-rust/20 border-rust text-rust"
                        : "border-paperLine text-inkSoft"
                    }`}
                  >
                    Salida (venta)
                  </button>
                </div>

                <form onSubmit={registrarMovimiento} className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-inkSoft mb-1">Fecha</label>
                      <input
                        type="date"
                        value={form.fecha}
                        onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                        className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-inkSoft mb-1">Cantidad</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.cantidad}
                        onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                        className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm font-num"
                      />
                    </div>
                    {form.tipo === "entrada" ? (
                      <div>
                        <label className="block text-xs font-medium text-inkSoft mb-1">
                          Costo unitario
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={form.costoUnitario}
                          onChange={(e) => setForm({ ...form, costoUnitario: e.target.value })}
                          className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm font-num"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-inkSoft mb-1">
                          Costo unitario (promedio actual)
                        </label>
                        <input
                          disabled
                          value={formatoMoneda(saldo.costoUnitario)}
                          className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm font-num bg-paperLine/30"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-inkSoft mb-1">
                        Descripción (opcional)
                      </label>
                      <input
                        value={form.descripcion}
                        onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                        className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  {form.tipo === "entrada" && (
                    <div className="max-w-sm">
                      <label className="block text-xs font-medium text-inkSoft mb-1">
                        ¿Con qué se pagó? (cuenta contraria)
                      </label>
                      <CuentaCombobox
                        cuentas={cuentas}
                        value={form.cuentaContraria}
                        onChange={(id) => setForm({ ...form, cuentaContraria: id })}
                        placeholder="Ej. Caja, Bancos, Cuentas por Pagar…"
                      />
                    </div>
                  )}

                  {errorMov && <p className="text-sm text-rust">{errorMov}</p>}

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={guardandoMov}
                      className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] transition-colors disabled:opacity-60"
                    >
                      {guardandoMov
                        ? "Guardando…"
                        : editandoMovId
                        ? "Guardar cambios"
                        : "Registrar movimiento"}
                    </button>
                    {editandoMovId && (
                      <button
                        type="button"
                        onClick={cancelarEdicionMovimiento}
                        className="text-sm text-inkSoft hover:text-ink underline underline-offset-2"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <h4 className="font-display text-sm font-semibold mb-2">Tarjeta de Kardex</h4>
              {cargandoMov ? (
                <p className="text-inkSoft text-sm">Cargando…</p>
              ) : movimientos.length === 0 ? (
                <p className="text-inkSoft text-sm">Todavía no hay movimientos para este producto.</p>
              ) : (
                <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-x-auto">
                  <table className="w-full text-sm min-w-[920px]">
                    <thead>
                      <tr className="bg-ink text-paper text-center">
                        <th rowSpan={2} className="px-2 py-2 font-medium align-bottom text-left">
                          Fecha
                        </th>
                        <th rowSpan={2} className="px-2 py-2 font-medium align-bottom text-left">
                          Descripción
                        </th>
                        <th colSpan={3} className="px-2 py-1 font-medium border-l border-paper/20">
                          Entradas
                        </th>
                        <th colSpan={3} className="px-2 py-1 font-medium border-l border-paper/20">
                          Salidas
                        </th>
                        <th colSpan={3} className="px-2 py-1 font-medium border-l border-paper/20">
                          Saldos
                        </th>
                        <th rowSpan={2} className="px-2 py-2 font-medium align-bottom no-print"></th>
                      </tr>
                      <tr className="bg-ink text-paper text-center text-xs">
                        <th className="px-2 py-1 font-normal border-l border-paper/20">Cant.</th>
                        <th className="px-2 py-1 font-normal">C. Unit.</th>
                        <th className="px-2 py-1 font-normal">C. Total</th>
                        <th className="px-2 py-1 font-normal border-l border-paper/20">Cant.</th>
                        <th className="px-2 py-1 font-normal">C. Unit.</th>
                        <th className="px-2 py-1 font-normal">C. Total</th>
                        <th className="px-2 py-1 font-normal border-l border-paper/20">Cant.</th>
                        <th className="px-2 py-1 font-normal">C. Unit.</th>
                        <th className="px-2 py-1 font-normal">C. Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((m) => (
                        <tr
                          key={m.id}
                          className={`border-t border-paperLine text-right ${
                            editandoMovId === m.id ? "bg-brass/10" : ""
                          }`}
                        >
                          <td className="px-2 py-1.5 text-left whitespace-nowrap">{m.fecha}</td>
                          <td className="px-2 py-1.5 text-left text-inkSoft">{m.descripcion}</td>
                          <td className="px-2 py-1.5 font-num border-l border-paperLine">
                            {m.tipo === "entrada" ? m.cantidad : ""}
                          </td>
                          <td className="px-2 py-1.5 font-num">
                            {m.tipo === "entrada" ? formatoMoneda(m.costo_unitario) : ""}
                          </td>
                          <td className="px-2 py-1.5 font-num">
                            {m.tipo === "entrada" ? formatoMoneda(m.costo_total) : ""}
                          </td>
                          <td className="px-2 py-1.5 font-num border-l border-paperLine">
                            {m.tipo === "salida" ? m.cantidad : ""}
                          </td>
                          <td className="px-2 py-1.5 font-num">
                            {m.tipo === "salida" ? formatoMoneda(m.costo_unitario) : ""}
                          </td>
                          <td className="px-2 py-1.5 font-num">
                            {m.tipo === "salida" ? formatoMoneda(m.costo_total) : ""}
                          </td>
                          <td className="px-2 py-1.5 font-num border-l border-paperLine">
                            {m.saldo_cantidad}
                          </td>
                          <td className="px-2 py-1.5 font-num">
                            {formatoMoneda(m.saldo_costo_unitario)}
                          </td>
                          <td className="px-2 py-1.5 font-num">
                            {formatoMoneda(m.saldo_costo_total)}
                          </td>
                          <td className="px-2 py-1.5 text-left no-print whitespace-nowrap">
                            {m.venta_id || m.compra_id ? (
                              <span className="text-xs text-inkSoft" title="Se edita o elimina desde su módulo de origen">
                                {m.venta_id ? "Desde Ventas" : "Desde Compras"}
                              </span>
                            ) : (
                            <>
                            <button
                              onClick={() => empezarEdicionMovimiento(m)}
                              className="text-brassDark text-xs font-medium hover:underline mr-2"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => eliminarMovimiento(m)}
                              className="text-rust text-xs hover:underline"
                            >
                              Eliminar
                            </button>
                            </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
