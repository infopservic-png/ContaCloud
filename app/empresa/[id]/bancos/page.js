"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import {
  obtenerCuentasBancarias,
  obtenerMovimientosLibros,
  obtenerMovimientosBanco,
} from "@/lib/bancos";
import { formatoMoneda } from "@/lib/contabilidad";
import CuentaCombobox from "@/lib/CuentaCombobox";

function nuevaCuentaVacia() {
  return { nombre: "", numero_cuenta: "", cuenta_contable_id: "" };
}

function nuevoMovBancoVacio() {
  return { tipo: "deposito", fecha: new Date().toISOString().slice(0, 10), descripcion: "", monto: "" };
}

export default function BancosPage() {
  const { cuentas, empresaId } = useEmpresa();

  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);
  const [cuentaBancariaId, setCuentaBancariaId] = useState(null);

  const [movLibros, setMovLibros] = useState([]);
  const [movBanco, setMovBanco] = useState([]);
  const [cargandoMov, setCargandoMov] = useState(false);

  const [mostrarFormCuenta, setMostrarFormCuenta] = useState(false);
  const [nuevaCuenta, setNuevaCuenta] = useState(nuevaCuentaVacia());
  const [errorCuenta, setErrorCuenta] = useState(null);
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);

  const [formMov, setFormMov] = useState(nuevoMovBancoVacio());
  const [errorMov, setErrorMov] = useState(null);
  const [guardandoMov, setGuardandoMov] = useState(false);

  async function cargarCuentas() {
    setCargandoCuentas(true);
    const data = await obtenerCuentasBancarias(empresaId);
    setCuentasBancarias(data);
    setCargandoCuentas(false);
    return data;
  }

  useEffect(() => {
    cargarCuentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const cuentaBancaria = cuentasBancarias.find((c) => c.id === cuentaBancariaId) || null;

  async function cargarMovimientos(cb) {
    setCargandoMov(true);
    const [libros, banco] = await Promise.all([
      obtenerMovimientosLibros(cb.cuenta_contable_id),
      obtenerMovimientosBanco(cb.id),
    ]);
    setMovLibros(libros);
    setMovBanco(banco);
    setCargandoMov(false);
  }

  function seleccionarCuenta(cb) {
    setCuentaBancariaId(cb.id);
    cargarMovimientos(cb);
  }

  async function agregarCuenta(e) {
    e.preventDefault();
    setErrorCuenta(null);
    if (!nuevaCuenta.nombre.trim()) {
      setErrorCuenta("El nombre de la cuenta es obligatorio.");
      return;
    }
    if (!nuevaCuenta.cuenta_contable_id) {
      setErrorCuenta("Selecciona la cuenta contable de Banco en el catálogo.");
      return;
    }
    setGuardandoCuenta(true);
    const { data, error } = await supabase
      .from("cuentas_bancarias")
      .insert({
        empresa_id: empresaId,
        nombre: nuevaCuenta.nombre.trim(),
        numero_cuenta: nuevaCuenta.numero_cuenta.trim() || null,
        cuenta_contable_id: nuevaCuenta.cuenta_contable_id,
      })
      .select()
      .single();
    setGuardandoCuenta(false);
    if (error) {
      setErrorCuenta("No se pudo crear: " + error.message);
      return;
    }
    setNuevaCuenta(nuevaCuentaVacia());
    setMostrarFormCuenta(false);
    const lista = await cargarCuentas();
    const creada = lista.find((c) => c.id === data.id);
    if (creada) seleccionarCuenta(creada);
  }

  async function agregarMovBanco(e) {
    e.preventDefault();
    setErrorMov(null);
    const monto = Number(formMov.monto);
    if (!monto || monto <= 0) {
      setErrorMov("El monto debe ser mayor que cero.");
      return;
    }
    setGuardandoMov(true);
    const montoFinal = formMov.tipo === "deposito" ? monto : -monto;
    const { error } = await supabase.from("movimientos_banco_estado").insert({
      cuenta_bancaria_id: cuentaBancariaId,
      fecha: formMov.fecha,
      descripcion: formMov.descripcion.trim() || null,
      monto: montoFinal,
    });
    setGuardandoMov(false);
    if (error) {
      setErrorMov("No se pudo guardar: " + error.message);
      return;
    }
    setFormMov(nuevoMovBancoVacio());
    cargarMovimientos(cuentaBancaria);
  }

  async function eliminarMovBanco(m) {
    if (!confirm("¿Eliminar este movimiento del estado de cuenta?")) return;
    await supabase.from("movimientos_banco_estado").delete().eq("id", m.id);
    cargarMovimientos(cuentaBancaria);
  }

  async function alternarConciliadoLibros(m) {
    await supabase.from("movimientos").update({ conciliado: !m.conciliado }).eq("id", m.id);
    cargarMovimientos(cuentaBancaria);
  }

  async function alternarConciliadoBanco(m) {
    await supabase
      .from("movimientos_banco_estado")
      .update({ conciliado: !m.conciliado })
      .eq("id", m.id);
    cargarMovimientos(cuentaBancaria);
  }

  const resumen = useMemo(() => {
    const saldoLibros = movLibros.reduce((a, m) => a + Number(m.debe) - Number(m.haber), 0);
    const saldoBanco = movBanco.reduce((a, m) => a + Number(m.monto), 0);

    const depositosEnTransito = movLibros
      .filter((m) => !m.conciliado && Number(m.debe) > 0)
      .reduce((a, m) => a + Number(m.debe), 0);
    const chequesPendientes = movLibros
      .filter((m) => !m.conciliado && Number(m.haber) > 0)
      .reduce((a, m) => a + Number(m.haber), 0);

    const notasNoRegistradas = movBanco
      .filter((m) => !m.conciliado)
      .reduce((a, m) => a + Number(m.monto), 0);

    const saldoAjustadoBanco = saldoBanco + depositosEnTransito - chequesPendientes;
    const saldoAjustadoLibros = saldoLibros + notasNoRegistradas;

    return {
      saldoLibros,
      saldoBanco,
      depositosEnTransito,
      chequesPendientes,
      notasNoRegistradas,
      saldoAjustadoBanco,
      saldoAjustadoLibros,
      concilia: Math.abs(saldoAjustadoBanco - saldoAjustadoLibros) < 0.01,
    };
  }, [movLibros, movBanco]);

  if (cargandoCuentas) {
    return <p className="text-inkSoft text-sm">Cargando…</p>;
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold mb-4 no-print">Bancos</h2>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Lista de cuentas bancarias */}
        <div className="no-print">
          <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden mb-3">
            {cuentasBancarias.length === 0 ? (
              <p className="p-3 text-sm text-inkSoft">Sin cuentas bancarias todavía.</p>
            ) : (
              <ul>
                {cuentasBancarias.map((cb) => (
                  <li key={cb.id}>
                    <button
                      onClick={() => seleccionarCuenta(cb)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-paperLine last:border-b-0 hover:bg-brass/10 ${
                        cuentaBancariaId === cb.id ? "bg-brass/20 font-medium" : ""
                      }`}
                    >
                      {cb.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => setMostrarFormCuenta((v) => !v)}
            className="text-xs text-brassDark hover:underline"
          >
            {mostrarFormCuenta ? "Cancelar" : "+ Agregar cuenta bancaria"}
          </button>

          {mostrarFormCuenta && (
            <form
              onSubmit={agregarCuenta}
              className="mt-3 bg-[#F7F4EA] border border-paperLine rounded-sm p-3 space-y-2"
            >
              <div>
                <label className="block text-xs font-medium text-inkSoft mb-1">
                  Nombre (ej. Banco Agrícola)
                </label>
                <input
                  value={nuevaCuenta.nombre}
                  onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, nombre: e.target.value })}
                  className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-inkSoft mb-1">
                  N.° de cuenta (opcional)
                </label>
                <input
                  value={nuevaCuenta.numero_cuenta}
                  onChange={(e) =>
                    setNuevaCuenta({ ...nuevaCuenta, numero_cuenta: e.target.value })
                  }
                  className="w-full border border-paperLine rounded-sm px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-inkSoft mb-1">
                  Cuenta contable (del catálogo)
                </label>
                <CuentaCombobox
                  cuentas={cuentas}
                  value={nuevaCuenta.cuenta_contable_id}
                  onChange={(id) => setNuevaCuenta({ ...nuevaCuenta, cuenta_contable_id: id })}
                />
              </div>
              {errorCuenta && <p className="text-xs text-rust">{errorCuenta}</p>}
              <button
                type="submit"
                disabled={guardandoCuenta}
                className="bg-ink text-paper px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-[#2C3A52] disabled:opacity-60"
              >
                {guardandoCuenta ? "Guardando…" : "Guardar cuenta"}
              </button>
            </form>
          )}
        </div>

        {/* Detalle de la cuenta seleccionada */}
        <div>
          {!cuentaBancaria ? (
            <p className="text-inkSoft text-sm">
              Selecciona una cuenta bancaria (o crea una nueva) para ver su conciliación.
            </p>
          ) : cargandoMov ? (
            <p className="text-inkSoft text-sm">Cargando…</p>
          ) : (
            <>
              <div className="mb-4">
                <h3 className="font-display text-base font-semibold">{cuentaBancaria.nombre}</h3>
                <p className="text-xs text-inkSoft">
                  {cuentaBancaria.cuenta_contable?.codigo} — {cuentaBancaria.cuenta_contable?.nombre}
                  {cuentaBancaria.numero_cuenta ? ` · Cuenta N.° ${cuentaBancaria.numero_cuenta}` : ""}
                </p>
              </div>

              {/* Agregar movimiento del estado de cuenta del banco */}
              <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 mb-6 no-print">
                <h4 className="text-sm font-medium mb-3">
                  Agregar movimiento del estado de cuenta (según el banco)
                </h4>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setFormMov({ ...formMov, tipo: "deposito" })}
                    className={`px-3 py-1.5 rounded-sm text-xs font-medium border ${
                      formMov.tipo === "deposito"
                        ? "bg-ledger/20 border-ledger text-ledgerDark"
                        : "border-paperLine text-inkSoft"
                    }`}
                  >
                    Depósito / Abono
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMov({ ...formMov, tipo: "cargo" })}
                    className={`px-3 py-1.5 rounded-sm text-xs font-medium border ${
                      formMov.tipo === "cargo"
                        ? "bg-rust/20 border-rust text-rust"
                        : "border-paperLine text-inkSoft"
                    }`}
                  >
                    Cargo / Comisión
                  </button>
                </div>
                <form onSubmit={agregarMovBanco} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs font-medium text-inkSoft mb-1">Fecha</label>
                    <input
                      type="date"
                      value={formMov.fecha}
                      onChange={(e) => setFormMov({ ...formMov, fecha: e.target.value })}
                      className="border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs font-medium text-inkSoft mb-1">
                      Descripción
                    </label>
                    <input
                      value={formMov.descripcion}
                      onChange={(e) => setFormMov({ ...formMov, descripcion: e.target.value })}
                      className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-inkSoft mb-1">Monto</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formMov.monto}
                      onChange={(e) => setFormMov({ ...formMov, monto: e.target.value })}
                      className="border border-paperLine rounded-sm px-2 py-1.5 text-sm font-num w-32"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={guardandoMov}
                    className="bg-ink text-paper px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-[#2C3A52] disabled:opacity-60"
                  >
                    {guardandoMov ? "Guardando…" : "Agregar"}
                  </button>
                </form>
                {errorMov && <p className="text-sm text-rust mt-2">{errorMov}</p>}
              </section>

              {/* Conciliación de dos columnas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden">
                  <div className="px-3 py-2 bg-ink text-paper text-sm font-medium">
                    Según Libros
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-inkSoft border-b border-paperLine">
                        <th className="px-2 py-1.5">✓</th>
                        <th className="px-2 py-1.5">Partida</th>
                        <th className="px-2 py-1.5">Fecha</th>
                        <th className="px-2 py-1.5 text-right">Debe</th>
                        <th className="px-2 py-1.5 text-right">Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movLibros.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-2 py-3 text-center text-xs text-inkSoft">
                            Sin movimientos.
                          </td>
                        </tr>
                      )}
                      {movLibros.map((m) => (
                        <tr key={m.id} className="border-t border-paperLine">
                          <td className="px-2 py-1.5 no-print">
                            <input
                              type="checkbox"
                              checked={m.conciliado}
                              onChange={() => alternarConciliadoLibros(m)}
                            />
                          </td>
                          <td className="px-2 py-1.5 font-num">
                            N.° {m.transacciones?.numero_partida}
                          </td>
                          <td className="px-2 py-1.5">{m.transacciones?.fecha}</td>
                          <td className="px-2 py-1.5 font-num text-right tabular">
                            {m.debe > 0 ? formatoMoneda(m.debe) : ""}
                          </td>
                          <td className="px-2 py-1.5 font-num text-right tabular">
                            {m.haber > 0 ? formatoMoneda(m.haber) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden">
                  <div className="px-3 py-2 bg-ink text-paper text-sm font-medium">
                    Según Banco
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-inkSoft border-b border-paperLine">
                        <th className="px-2 py-1.5">✓</th>
                        <th className="px-2 py-1.5">Fecha</th>
                        <th className="px-2 py-1.5">Descripción</th>
                        <th className="px-2 py-1.5 text-right">Monto</th>
                        <th className="px-2 py-1.5 no-print"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {movBanco.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-2 py-3 text-center text-xs text-inkSoft">
                            Sin movimientos.
                          </td>
                        </tr>
                      )}
                      {movBanco.map((m) => (
                        <tr key={m.id} className="border-t border-paperLine">
                          <td className="px-2 py-1.5 no-print">
                            <input
                              type="checkbox"
                              checked={m.conciliado}
                              onChange={() => alternarConciliadoBanco(m)}
                            />
                          </td>
                          <td className="px-2 py-1.5">{m.fecha}</td>
                          <td className="px-2 py-1.5 text-inkSoft">{m.descripcion}</td>
                          <td
                            className={`px-2 py-1.5 font-num text-right tabular ${
                              Number(m.monto) < 0 ? "text-rust" : ""
                            }`}
                          >
                            {formatoMoneda(m.monto)}
                          </td>
                          <td className="px-2 py-1.5 no-print">
                            <button
                              onClick={() => eliminarMovBanco(m)}
                              className="text-rust text-xs hover:underline"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resumen de conciliación */}
              <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-5 max-w-2xl">
                <h4 className="font-display text-sm font-semibold mb-3">
                  Conciliación Bancaria
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                  <table className="w-full">
                    <tbody>
                      <tr>
                        <td className="py-1">Saldo según Banco</td>
                        <td className="py-1 font-num text-right tabular">
                          {formatoMoneda(resumen.saldoBanco)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">(+) Depósitos en tránsito</td>
                        <td className="py-1 font-num text-right tabular">
                          {formatoMoneda(resumen.depositosEnTransito)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">(–) Cheques pendientes de cobro</td>
                        <td className="py-1 font-num text-right tabular">
                          ({formatoMoneda(resumen.chequesPendientes)})
                        </td>
                      </tr>
                      <tr className="border-t border-paperLine font-semibold">
                        <td className="pt-2">Saldo Ajustado según Banco</td>
                        <td className="pt-2 font-num text-right tabular">
                          {formatoMoneda(resumen.saldoAjustadoBanco)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="w-full">
                    <tbody>
                      <tr>
                        <td className="py-1">Saldo según Libros</td>
                        <td className="py-1 font-num text-right tabular">
                          {formatoMoneda(resumen.saldoLibros)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">(+/–) Notas no registradas en libros</td>
                        <td className="py-1 font-num text-right tabular">
                          {formatoMoneda(resumen.notasNoRegistradas)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">&nbsp;</td>
                        <td className="py-1">&nbsp;</td>
                      </tr>
                      <tr className="border-t border-paperLine font-semibold">
                        <td className="pt-2">Saldo Ajustado según Libros</td>
                        <td className="pt-2 font-num text-right tabular">
                          {formatoMoneda(resumen.saldoAjustadoLibros)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className={`text-sm mt-4 ${resumen.concilia ? "text-ledger" : "text-rust"}`}>
                  {resumen.concilia
                    ? "✓ La conciliación cuadra: ambos saldos ajustados son iguales."
                    : "⚠ La conciliación no cuadra — revisa los movimientos marcados."}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
