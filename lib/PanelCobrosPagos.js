"use client";

import { useEffect, useState, Fragment } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import {
  configCxCxP,
  obtenerEntidades,
  obtenerFacturas,
  obtenerAbonos,
  estadoFactura,
} from "@/lib/cxcxp";
import { formatoMoneda } from "@/lib/contabilidad";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { exportarAExcel } from "@/lib/exportarExcel";

function nuevaEntidadVacia() {
  return { nombre: "", telefono: "", correo: "", direccion: "" };
}

function nuevaFacturaVacia() {
  return {
    entidad_id: "",
    numero_factura: "",
    fecha: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: "",
    descripcion: "",
    monto: "",
    cuentaContraria: "",
  };
}

function nuevoAbonoVacio() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    monto: "",
    cuentaContraria: "",
  };
}

const ESTILOS_ESTADO = {
  pendiente: "bg-brass/20 text-brassDark",
  parcial: "bg-ledger/20 text-ledgerDark",
  pagada: "bg-paperLine text-inkSoft",
  vencida: "bg-rust/20 text-rust",
};
const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  parcial: "Abono parcial",
  pagada: "Pagada",
  vencida: "Vencida",
};

export default function PanelCobrosPagos({ tipo }) {
  const { empresa, cuentas, empresaId, actualizarEmpresa } = useEmpresa();
  const cfg = configCxCxP(tipo);

  const [cuentaControlLocal, setCuentaControlLocal] = useState("");
  const cuentaControlId = empresa?.[cfg.campoCuentaControl] || "";

  const [entidades, setEntidades] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [mostrarFormEntidad, setMostrarFormEntidad] = useState(false);
  const [nuevaEntidad, setNuevaEntidad] = useState(nuevaEntidadVacia());
  const [errorEntidad, setErrorEntidad] = useState(null);
  const [guardandoEntidad, setGuardandoEntidad] = useState(false);

  const [mostrarFormFactura, setMostrarFormFactura] = useState(false);
  const [nuevaFactura, setNuevaFactura] = useState(nuevaFacturaVacia());
  const [errorFactura, setErrorFactura] = useState(null);
  const [guardandoFactura, setGuardandoFactura] = useState(false);

  const [facturaAbiertaId, setFacturaAbiertaId] = useState(null);
  const [abonos, setAbonos] = useState([]);
  const [cargandoAbonos, setCargandoAbonos] = useState(false);
  const [nuevoAbono, setNuevoAbono] = useState(nuevoAbonoVacio());
  const [errorAbono, setErrorAbono] = useState(null);
  const [guardandoAbono, setGuardandoAbono] = useState(false);

  async function cargarTodo() {
    setCargando(true);
    const [ents, facs] = await Promise.all([
      obtenerEntidades(cfg, empresaId),
      obtenerFacturas(cfg, empresaId),
    ]);
    setEntidades(ents);
    setFacturas(facs);
    setCargando(false);
  }

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, tipo]);

  async function guardarCuentaControl() {
    if (!cuentaControlLocal) return;
    await actualizarEmpresa({ [cfg.campoCuentaControl]: cuentaControlLocal });
  }

  async function agregarEntidad(e) {
    e.preventDefault();
    setErrorEntidad(null);
    if (!nuevaEntidad.nombre.trim()) {
      setErrorEntidad(`El nombre del ${cfg.labelEntidad.toLowerCase()} es obligatorio.`);
      return;
    }
    setGuardandoEntidad(true);
    const { error } = await supabase.from(cfg.tablaEntidad).insert({
      empresa_id: empresaId,
      nombre: nuevaEntidad.nombre.trim(),
      telefono: nuevaEntidad.telefono.trim() || null,
      correo: nuevaEntidad.correo.trim() || null,
      direccion: nuevaEntidad.direccion.trim() || null,
    });
    setGuardandoEntidad(false);
    if (error) {
      setErrorEntidad("No se pudo guardar: " + error.message);
      return;
    }
    setNuevaEntidad(nuevaEntidadVacia());
    setMostrarFormEntidad(false);
    cargarTodo();
  }

  function glosaFactura(f) {
    const entidadNombre = entidades.find((e) => e.id === f.entidad_id)?.nombre || "";
    const base =
      tipo === "cobrar"
        ? `Venta al crédito — ${entidadNombre}`
        : `Compra al crédito — ${entidadNombre}`;
    return f.numero_factura
      ? `${base} (Factura ${f.numero_factura})`
      : base + (f.descripcion ? `: ${f.descripcion}` : "");
  }

  async function crearFactura(e) {
    e.preventDefault();
    setErrorFactura(null);

    const monto = Number(nuevaFactura.monto);
    if (!nuevaFactura.entidad_id) {
      setErrorFactura(`Selecciona un ${cfg.labelEntidad.toLowerCase()}.`);
      return;
    }
    if (!monto || monto <= 0) {
      setErrorFactura("El monto debe ser mayor que cero.");
      return;
    }
    if (!nuevaFactura.cuentaContraria) {
      setErrorFactura(`Selecciona la ${cfg.labelCuentaContraFactura.toLowerCase()}.`);
      return;
    }

    setGuardandoFactura(true);

    const { data: ultimaPartida } = await supabase
      .from("transacciones")
      .select("numero_partida")
      .eq("empresa_id", empresaId)
      .order("numero_partida", { ascending: false })
      .limit(1)
      .maybeSingle();
    const siguienteNumero = (ultimaPartida?.numero_partida || 0) + 1;

    const entidadNombre = entidades.find((en) => en.id === nuevaFactura.entidad_id)?.nombre || "";
    const glosaBase =
      tipo === "cobrar" ? `Venta al crédito — ${entidadNombre}` : `Compra al crédito — ${entidadNombre}`;
    const glosa = nuevaFactura.numero_factura
      ? `${glosaBase} (Factura ${nuevaFactura.numero_factura})`
      : glosaBase;

    const { data: transaccion, error: errTx } = await supabase
      .from("transacciones")
      .insert({
        empresa_id: empresaId,
        fecha: nuevaFactura.fecha,
        descripcion: glosa,
        numero_partida: siguienteNumero,
      })
      .select()
      .single();
    if (errTx) {
      setErrorFactura("No se pudo registrar la partida: " + errTx.message);
      setGuardandoFactura(false);
      return;
    }

    const cuentaDebe = tipo === "cobrar" ? cuentaControlId : nuevaFactura.cuentaContraria;
    const cuentaHaber = tipo === "cobrar" ? nuevaFactura.cuentaContraria : cuentaControlId;

    const { error: errMov } = await supabase.from("movimientos").insert([
      { transaccion_id: transaccion.id, cuenta_id: cuentaDebe, debe: monto, haber: 0 },
      { transaccion_id: transaccion.id, cuenta_id: cuentaHaber, debe: 0, haber: monto },
    ]);
    if (errMov) {
      setErrorFactura("Partida creada, pero fallaron las líneas: " + errMov.message);
      setGuardandoFactura(false);
      return;
    }

    const { error: errFactura } = await supabase.from(cfg.tablaFacturas).insert({
      empresa_id: empresaId,
      [cfg.campoEntidadId]: nuevaFactura.entidad_id,
      numero_factura: nuevaFactura.numero_factura.trim() || null,
      fecha: nuevaFactura.fecha,
      fecha_vencimiento: nuevaFactura.fecha_vencimiento || null,
      descripcion: nuevaFactura.descripcion.trim() || null,
      monto,
      saldo_pendiente: monto,
      cuenta_contraria_id: nuevaFactura.cuentaContraria,
      transaccion_id: transaccion.id,
    });

    setGuardandoFactura(false);

    if (errFactura) {
      setErrorFactura("La partida se registró, pero falló guardar la factura: " + errFactura.message);
      return;
    }

    setNuevaFactura(nuevaFacturaVacia());
    setMostrarFormFactura(false);
    cargarTodo();
  }

  async function abrirFactura(factura) {
    if (facturaAbiertaId === factura.id) {
      setFacturaAbiertaId(null);
      return;
    }
    setFacturaAbiertaId(factura.id);
    setErrorAbono(null);
    setNuevoAbono(nuevoAbonoVacio());
    setCargandoAbonos(true);
    const data = await obtenerAbonos(cfg, factura.id);
    setAbonos(data);
    setCargandoAbonos(false);
  }

  async function registrarAbono(e, factura) {
    e.preventDefault();
    setErrorAbono(null);

    const monto = Number(nuevoAbono.monto);
    if (!monto || monto <= 0) {
      setErrorAbono("El monto debe ser mayor que cero.");
      return;
    }
    if (monto > Number(factura.saldo_pendiente) + 0.005) {
      setErrorAbono(
        `El abono no puede ser mayor al saldo pendiente (${formatoMoneda(factura.saldo_pendiente)}).`
      );
      return;
    }
    if (!nuevoAbono.cuentaContraria) {
      setErrorAbono(`Selecciona ${cfg.labelCuentaContraAbono.toLowerCase()}`);
      return;
    }

    setGuardandoAbono(true);

    const { data: ultimaPartida } = await supabase
      .from("transacciones")
      .select("numero_partida")
      .eq("empresa_id", empresaId)
      .order("numero_partida", { ascending: false })
      .limit(1)
      .maybeSingle();
    const siguienteNumero = (ultimaPartida?.numero_partida || 0) + 1;

    const glosa =
      tipo === "cobrar"
        ? `Abono recibido — ${glosaFactura(factura)}`
        : `Abono pagado — ${glosaFactura(factura)}`;

    const { data: transaccion, error: errTx } = await supabase
      .from("transacciones")
      .insert({
        empresa_id: empresaId,
        fecha: nuevoAbono.fecha,
        descripcion: glosa,
        numero_partida: siguienteNumero,
      })
      .select()
      .single();
    if (errTx) {
      setErrorAbono("No se pudo registrar la partida: " + errTx.message);
      setGuardandoAbono(false);
      return;
    }

    const cuentaDebe = tipo === "cobrar" ? nuevoAbono.cuentaContraria : cuentaControlId;
    const cuentaHaber = tipo === "cobrar" ? cuentaControlId : nuevoAbono.cuentaContraria;

    const { error: errMov } = await supabase.from("movimientos").insert([
      { transaccion_id: transaccion.id, cuenta_id: cuentaDebe, debe: monto, haber: 0 },
      { transaccion_id: transaccion.id, cuenta_id: cuentaHaber, debe: 0, haber: monto },
    ]);
    if (errMov) {
      setErrorAbono("Partida creada, pero fallaron las líneas: " + errMov.message);
      setGuardandoAbono(false);
      return;
    }

    const { error: errAbono } = await supabase.from(cfg.tablaAbonos).insert({
      factura_id: factura.id,
      fecha: nuevoAbono.fecha,
      monto,
      cuenta_contraria_id: nuevoAbono.cuentaContraria,
      transaccion_id: transaccion.id,
    });
    if (errAbono) {
      setErrorAbono("La partida se registró, pero falló guardar el abono: " + errAbono.message);
      setGuardandoAbono(false);
      return;
    }

    const nuevoSaldo = Number(factura.saldo_pendiente) - monto;
    await supabase
      .from(cfg.tablaFacturas)
      .update({ saldo_pendiente: nuevoSaldo })
      .eq("id", factura.id);

    setGuardandoAbono(false);
    setNuevoAbono(nuevoAbonoVacio());
    const data = await obtenerAbonos(cfg, factura.id);
    setAbonos(data);
    cargarTodo();
  }

  async function eliminarAbono(abono, factura) {
    const confirmado = confirm("¿Eliminar este abono? Esto también elimina su partida contable.");
    if (!confirmado) return;

    if (abono.transaccion_id) {
      await supabase.from("transacciones").delete().eq("id", abono.transaccion_id);
    }
    await supabase.from(cfg.tablaAbonos).delete().eq("id", abono.id);

    const nuevoSaldo = Number(factura.saldo_pendiente) + Number(abono.monto);
    await supabase.from(cfg.tablaFacturas).update({ saldo_pendiente: nuevoSaldo }).eq("id", factura.id);

    const data = await obtenerAbonos(cfg, factura.id);
    setAbonos(data);
    cargarTodo();
  }

  async function eliminarFactura(factura) {
    if (factura.venta_id || factura.compra_id) {
      alert(
        `Esta factura se generó desde el módulo de ${factura.venta_id ? "Ventas" : "Compras"}. Para eliminarla, elimina el documento desde ese módulo.`
      );
      return;
    }
    if (Number(factura.saldo_pendiente) !== Number(factura.monto)) {
      alert(
        "No se puede eliminar: esta factura ya tiene abonos registrados. Elimina primero los abonos."
      );
      return;
    }
    const confirmado = confirm("¿Eliminar esta factura? Esto también elimina su partida contable.");
    if (!confirmado) return;

    if (factura.transaccion_id) {
      await supabase.from("transacciones").delete().eq("id", factura.transaccion_id);
    }
    await supabase.from(cfg.tablaFacturas).delete().eq("id", factura.id);

    if (facturaAbiertaId === factura.id) setFacturaAbiertaId(null);
    cargarTodo();
  }

  function exportar() {
    const filas = [
      [cfg.labelModulo],
      [],
      [
        cfg.labelEntidad,
        "N.° Factura",
        "Fecha",
        "Vencimiento",
        "Descripción",
        "Monto",
        "Saldo Pendiente",
        "Estado",
      ],
      ...facturas.map((f) => [
        f.entidad?.nombre || "",
        f.numero_factura || "",
        f.fecha,
        f.fecha_vencimiento || "",
        f.descripcion || "",
        f.monto,
        f.saldo_pendiente,
        ETIQUETAS_ESTADO[estadoFactura(f)],
      ]),
    ];
    exportarAExcel(cfg.tablaFacturas, [{ nombre: cfg.labelModulo, filas }]);
  }

  if (cargando) {
    return <p className="text-inkSoft text-sm">Cargando…</p>;
  }

  if (!cuentaControlId) {
    return (
      <div>
        <h2 className="font-display text-lg font-semibold mb-4">{cfg.labelModulo}</h2>
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 max-w-md">
          <p className="text-sm mb-3">
            Antes de empezar, elige cuál es tu <strong>{cfg.labelCuentaControl}</strong> del
            catálogo (se usa una sola vez para todas las facturas de este módulo).
          </p>
          <CuentaCombobox
            cuentas={cuentas}
            value={cuentaControlLocal}
            onChange={setCuentaControlLocal}
          />
          <button
            onClick={guardarCuentaControl}
            disabled={!cuentaControlLocal}
            className="mt-3 bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] disabled:opacity-60"
          >
            Guardar y continuar
          </button>
        </div>
      </div>
    );
  }

  const totalPendiente = facturas.reduce((a, f) => a + Number(f.saldo_pendiente), 0);
  const totalVencido = facturas
    .filter((f) => estadoFactura(f) === "vencida")
    .reduce((a, f) => a + Number(f.saldo_pendiente), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 no-print">
        <h2 className="font-display text-lg font-semibold">{cfg.labelModulo}</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="text-xs text-inkSoft hover:text-ink underline underline-offset-2"
          >
            Imprimir
          </button>
          {facturas.length > 0 && (
            <button onClick={exportar} className="text-xs text-ledgerDark hover:underline">
              Exportar a Excel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6 max-w-sm">
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-3 text-center">
          <p className="text-xs text-inkSoft">Saldo total pendiente</p>
          <p className="font-num font-semibold">{formatoMoneda(totalPendiente)}</p>
        </div>
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-3 text-center">
          <p className="text-xs text-inkSoft">Vencido</p>
          <p className={`font-num font-semibold ${totalVencido > 0 ? "text-rust" : ""}`}>
            {formatoMoneda(totalVencido)}
          </p>
        </div>
      </div>

      {/* Directorio */}
      <section className="mb-6 no-print">
        <button
          onClick={() => setMostrarFormEntidad((v) => !v)}
          className="text-xs text-brassDark hover:underline mb-2"
        >
          {mostrarFormEntidad ? "Cancelar" : `+ Agregar ${cfg.labelEntidad.toLowerCase()}`}
        </button>
        {mostrarFormEntidad && (
          <form
            onSubmit={agregarEntidad}
            className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end"
          >
            <div className="col-span-2">
              <label className="block text-xs font-medium text-inkSoft mb-1">Nombre</label>
              <input
                value={nuevaEntidad.nombre}
                onChange={(e) => setNuevaEntidad({ ...nuevaEntidad, nombre: e.target.value })}
                className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">Teléfono</label>
              <input
                value={nuevaEntidad.telefono}
                onChange={(e) => setNuevaEntidad({ ...nuevaEntidad, telefono: e.target.value })}
                className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">Correo</label>
              <input
                value={nuevaEntidad.correo}
                onChange={(e) => setNuevaEntidad({ ...nuevaEntidad, correo: e.target.value })}
                className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-xs font-medium text-inkSoft mb-1">
                Dirección (opcional)
              </label>
              <input
                value={nuevaEntidad.direccion}
                onChange={(e) => setNuevaEntidad({ ...nuevaEntidad, direccion: e.target.value })}
                className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
              />
            </div>
            {errorEntidad && (
              <p className="col-span-2 sm:col-span-4 text-sm text-rust">{errorEntidad}</p>
            )}
            <button
              type="submit"
              disabled={guardandoEntidad}
              className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] disabled:opacity-60"
            >
              {guardandoEntidad ? "Guardando…" : "Guardar"}
            </button>
          </form>
        )}
      </section>

      {/* Registrar factura */}
      <section className="mb-8 no-print">
        <button
          onClick={() => setMostrarFormFactura((v) => !v)}
          className="text-xs text-brassDark hover:underline mb-2"
        >
          {mostrarFormFactura ? "Cancelar" : "+ Registrar factura"}
        </button>
        {mostrarFormFactura && (
          <form
            onSubmit={crearFactura}
            className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-3"
          >
            {entidades.length === 0 ? (
              <p className="text-sm text-inkSoft">
                Primero agrega un {cfg.labelEntidad.toLowerCase()} arriba.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-inkSoft mb-1">
                    {cfg.labelEntidad}
                  </label>
                  <select
                    value={nuevaFactura.entidad_id}
                    onChange={(e) =>
                      setNuevaFactura({ ...nuevaFactura, entidad_id: e.target.value })
                    }
                    className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                  >
                    <option value="">Selecciona…</option>
                    {entidades.map((en) => (
                      <option key={en.id} value={en.id}>
                        {en.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-inkSoft mb-1">
                    N.° Factura (opcional)
                  </label>
                  <input
                    value={nuevaFactura.numero_factura}
                    onChange={(e) =>
                      setNuevaFactura({ ...nuevaFactura, numero_factura: e.target.value })
                    }
                    className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-inkSoft mb-1">Fecha</label>
                  <input
                    type="date"
                    value={nuevaFactura.fecha}
                    onChange={(e) => setNuevaFactura({ ...nuevaFactura, fecha: e.target.value })}
                    className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-inkSoft mb-1">
                    Vencimiento (opcional)
                  </label>
                  <input
                    type="date"
                    value={nuevaFactura.fecha_vencimiento}
                    onChange={(e) =>
                      setNuevaFactura({ ...nuevaFactura, fecha_vencimiento: e.target.value })
                    }
                    className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-inkSoft mb-1">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={nuevaFactura.monto}
                    onChange={(e) => setNuevaFactura({ ...nuevaFactura, monto: e.target.value })}
                    className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm font-num"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-inkSoft mb-1">
                    {cfg.labelCuentaContraFactura}
                  </label>
                  <CuentaCombobox
                    cuentas={cuentas}
                    value={nuevaFactura.cuentaContraria}
                    onChange={(id) => setNuevaFactura({ ...nuevaFactura, cuentaContraria: id })}
                  />
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <label className="block text-xs font-medium text-inkSoft mb-1">
                    Descripción (opcional)
                  </label>
                  <input
                    value={nuevaFactura.descripcion}
                    onChange={(e) =>
                      setNuevaFactura({ ...nuevaFactura, descripcion: e.target.value })
                    }
                    className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}
            {errorFactura && <p className="text-sm text-rust">{errorFactura}</p>}
            {entidades.length > 0 && (
              <button
                type="submit"
                disabled={guardandoFactura}
                className="bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-[#2C3A52] disabled:opacity-60"
              >
                {guardandoFactura ? "Guardando…" : "Registrar factura"}
              </button>
            )}
          </form>
        )}
      </section>

      {/* Listado de facturas */}
      {facturas.length === 0 ? (
        <p className="text-inkSoft text-sm">Todavía no hay facturas registradas.</p>
      ) : (
        <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink text-paper text-left">
                <th className="px-3 py-2 font-medium">{cfg.labelEntidad}</th>
                <th className="px-3 py-2 font-medium">Factura</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Vence</th>
                <th className="px-3 py-2 font-medium text-right">Monto</th>
                <th className="px-3 py-2 font-medium text-right">Saldo</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium no-print"></th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => {
                const est = estadoFactura(f);
                return (
                  <Fragment key={f.id}>
                    <tr className="border-t border-paperLine">
                      <td className="px-3 py-1.5">{f.entidad?.nombre}</td>
                      <td className="px-3 py-1.5 font-num">{f.numero_factura || "—"}</td>
                      <td className="px-3 py-1.5">{f.fecha}</td>
                      <td className="px-3 py-1.5">{f.fecha_vencimiento || "—"}</td>
                      <td className="px-3 py-1.5 font-num text-right tabular">
                        {formatoMoneda(f.monto)}
                      </td>
                      <td className="px-3 py-1.5 font-num text-right tabular">
                        {formatoMoneda(f.saldo_pendiente)}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-sm ${ESTILOS_ESTADO[est]}`}>
                          {ETIQUETAS_ESTADO[est]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right no-print whitespace-nowrap">
                        <button
                          onClick={() => abrirFactura(f)}
                          className="text-brassDark text-xs font-medium hover:underline mr-3"
                        >
                          {facturaAbiertaId === f.id ? "Cerrar" : "Ver / Abonar"}
                        </button>
                        {f.venta_id || f.compra_id ? (
                          <span className="text-xs text-inkSoft">
                            {f.venta_id ? "Desde Ventas" : "Desde Compras"}
                          </span>
                        ) : (
                          <button
                            onClick={() => eliminarFactura(f)}
                            className="text-rust text-xs hover:underline"
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                    {facturaAbiertaId === f.id && (
                      <tr className="border-t border-paperLine">
                        <td colSpan={8} className="px-3 py-4 bg-paper/40 no-print">
                          {cargandoAbonos ? (
                            <p className="text-sm text-inkSoft">Cargando abonos…</p>
                          ) : (
                            <>
                              {abonos.length > 0 && (
                                <table className="w-full text-sm mb-3">
                                  <thead>
                                    <tr className="text-left text-xs text-inkSoft border-b border-paperLine">
                                      <th className="py-1">Fecha</th>
                                      <th className="py-1 text-right">Monto</th>
                                      <th className="py-1"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {abonos.map((ab) => (
                                      <tr key={ab.id} className="border-b border-paperLine">
                                        <td className="py-1">{ab.fecha}</td>
                                        <td className="py-1 font-num text-right tabular">
                                          {formatoMoneda(ab.monto)}
                                        </td>
                                        <td className="py-1 text-right">
                                          <button
                                            onClick={() => eliminarAbono(ab, f)}
                                            className="text-rust text-xs hover:underline"
                                          >
                                            Eliminar
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}

                              {Number(f.saldo_pendiente) > 0.005 ? (
                                <form
                                  onSubmit={(e) => registrarAbono(e, f)}
                                  className="flex flex-wrap items-end gap-3"
                                >
                                  <div>
                                    <label className="block text-xs font-medium text-inkSoft mb-1">
                                      Fecha
                                    </label>
                                    <input
                                      type="date"
                                      value={nuevoAbono.fecha}
                                      onChange={(e) =>
                                        setNuevoAbono({ ...nuevoAbono, fecha: e.target.value })
                                      }
                                      className="border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-inkSoft mb-1">
                                      Monto
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={nuevoAbono.monto}
                                      onChange={(e) =>
                                        setNuevoAbono({ ...nuevoAbono, monto: e.target.value })
                                      }
                                      className="border border-paperLine rounded-sm px-2 py-1.5 text-sm font-num w-32"
                                    />
                                  </div>
                                  <div className="w-64">
                                    <label className="block text-xs font-medium text-inkSoft mb-1">
                                      {cfg.labelCuentaContraAbono}
                                    </label>
                                    <CuentaCombobox
                                      cuentas={cuentas}
                                      value={nuevoAbono.cuentaContraria}
                                      onChange={(id) =>
                                        setNuevoAbono({ ...nuevoAbono, cuentaContraria: id })
                                      }
                                    />
                                  </div>
                                  <button
                                    type="submit"
                                    disabled={guardandoAbono}
                                    className="bg-ink text-paper px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-[#2C3A52] disabled:opacity-60"
                                  >
                                    {guardandoAbono ? "Guardando…" : "Registrar abono"}
                                  </button>
                                </form>
                              ) : (
                                <p className="text-xs text-ledgerDark">
                                  Esta factura ya está completamente pagada.
                                </p>
                              )}
                              {errorAbono && (
                                <p className="text-sm text-rust mt-2">{errorAbono}</p>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
