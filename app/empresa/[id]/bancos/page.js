"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import { obtenerCuentasBancarias, obtenerMovimientosLibros } from "@/lib/bancos";
import { formatoMoneda } from "@/lib/contabilidad";
import CuentaCombobox from "@/lib/CuentaCombobox";

const vacia = () => ({ banco: "", nombre: "", numero_cuenta: "", tipo_cuenta: "corriente", cuenta_contable_id: "", siguiente_cheque: "1" });
const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";
const labelCls = "block text-xs font-medium text-inkSoft mb-1";

export default function BancosPage() {
  const { empresaId, cuentas } = useEmpresa();
  const [lista, setLista] = useState([]);
  const [saldos, setSaldos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(vacia());
  const [editandoId, setEditandoId] = useState(null);
  const [mostrar, setMostrar] = useState(false);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    const data = await obtenerCuentasBancarias(empresaId);
    setLista(data);
    const s = {};
    for (const b of data) {
      const movs = await obtenerMovimientosLibros(b.cuenta_contable_id);
      s[b.id] = movs.reduce((a, m) => a + Number(m.debe) - Number(m.haber), 0);
    }
    setSaldos(s);
    setCargando(false);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  function editar(b) {
    setEditandoId(b.id);
    setForm({
      banco: b.banco || "",
      nombre: b.nombre || "",
      numero_cuenta: b.numero_cuenta || "",
      tipo_cuenta: b.tipo_cuenta || "corriente",
      cuenta_contable_id: b.cuenta_contable_id || "",
      siguiente_cheque: String(b.siguiente_cheque ?? 1),
    });
    setMostrar(true);
    setError(null);
  }
  function cancelar() {
    setEditandoId(null);
    setForm(vacia());
    setMostrar(false);
    setError(null);
  }

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    if (!form.nombre.trim()) return setError("Escribe un nombre para la cuenta (por ejemplo «Cuenta corriente principal»).");
    if (!form.cuenta_contable_id) return setError("Elige la cuenta contable de Banco del catálogo.");
    const sig = Number(form.siguiente_cheque);
    if (!Number.isInteger(sig) || sig < 1) return setError("El siguiente número de cheque debe ser un entero mayor que cero.");
    const datos = {
      banco: form.banco.trim() || null,
      nombre: form.nombre.trim(),
      numero_cuenta: form.numero_cuenta.trim() || null,
      tipo_cuenta: form.tipo_cuenta,
      cuenta_contable_id: form.cuenta_contable_id,
      siguiente_cheque: sig,
    };
    setGuardando(true);
    const { error: err } = editandoId
      ? await supabase.from("cuentas_bancarias").update(datos).eq("id", editandoId)
      : await supabase.from("cuentas_bancarias").insert({ empresa_id: empresaId, ...datos });
    setGuardando(false);
    if (err) return setError("No se pudo guardar: " + err.message);
    cancelar();
    cargar();
  }

  async function eliminar(b) {
    if (!confirm(`¿Eliminar la cuenta «${b.nombre}»? Se borran sus cheques y transacciones registrados aquí; las partidas del Diario no se tocan.`)) return;
    const { error: err } = await supabase.from("cuentas_bancarias").delete().eq("id", b.id);
    if (err) return alert("No se pudo eliminar: " + err.message);
    cargar();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Bancos</h2>
          <p className="text-xs text-inkSoft">Cuentas bancarias de la empresa y la cuenta contable a la que se enlazan.</p>
        </div>
        {!mostrar && <button onClick={() => setMostrar(true)} className="sac-btn sac-btn-primario font-medium">+ Nueva cuenta bancaria</button>}
      </div>

      {mostrar && (
        <form onSubmit={guardar} className="border border-paperLine bg-[#F7F4EA] rounded-sm p-4 space-y-3">
          <p className="text-sm font-medium">{editandoId ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="sm:col-span-2"><span className={labelCls}>Banco</span><input value={form.banco} onChange={(e) => set("banco", e.target.value)} placeholder="Ej. Banco Agrícola" className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>Nombre de la cuenta</span><input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Corriente principal" className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>N.° de cuenta</span><input value={form.numero_cuenta} onChange={(e) => set("numero_cuenta", e.target.value)} className={inputCls} /></label>
            <label>
              <span className={labelCls}>Tipo de cuenta</span>
              <select value={form.tipo_cuenta} onChange={(e) => set("tipo_cuenta", e.target.value)} className={inputCls}>
                <option value="corriente">Corriente</option>
                <option value="ahorro">Ahorro</option>
              </select>
            </label>
            <label><span className={labelCls}>Siguiente N.° de cheque</span><input type="number" min="1" value={form.siguiente_cheque} onChange={(e) => set("siguiente_cheque", e.target.value)} className={inputCls} /></label>
            <div className="sm:col-span-4">
              <span className={labelCls}>Cuenta contable de Banco</span>
              <CuentaCombobox cuentas={cuentas} value={form.cuenta_contable_id} onChange={(id) => set("cuenta_contable_id", id)} placeholder="Buscar cuenta del catálogo…" />
            </div>
          </div>
          {error && <p className="text-sm text-rust">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={guardando} className="sac-btn sac-btn-primario font-medium">{guardando ? "Guardando…" : "Guardar"}</button>
            <button type="button" onClick={cancelar} className="text-sm text-inkSoft hover:text-ink underline underline-offset-2">Cancelar</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-paperLine overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#DAD7CD] text-left text-xs">
              <th className="px-3 py-1.5">Banco</th>
              <th className="px-3 py-1.5">Cuenta</th>
              <th className="px-3 py-1.5">N.° de cuenta</th>
              <th className="px-3 py-1.5">Tipo</th>
              <th className="px-3 py-1.5">Cuenta contable</th>
              <th className="px-3 py-1.5 text-right">Sig. cheque</th>
              <th className="px-3 py-1.5 text-right">Saldo en libros</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-xs text-inkSoft">Cargando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-xs text-inkSoft">Aún no hay cuentas bancarias.</td></tr>
            ) : (
              lista.map((b) => (
                <tr key={b.id} className="border-t border-paperLine">
                  <td className="px-3 py-1.5">{b.banco || "—"}</td>
                  <td className="px-3 py-1.5 font-medium">{b.nombre}</td>
                  <td className="px-3 py-1.5 font-num">{b.numero_cuenta || "—"}</td>
                  <td className="px-3 py-1.5">{b.tipo_cuenta === "ahorro" ? "Ahorro" : "Corriente"}</td>
                  <td className="px-3 py-1.5 text-xs">{b.cuenta_contable ? `${b.cuenta_contable.codigo} — ${b.cuenta_contable.nombre}` : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-num">{b.siguiente_cheque ?? 1}</td>
                  <td className="px-3 py-1.5 text-right font-num tabular">{formatoMoneda(saldos[b.id] || 0)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <button onClick={() => editar(b)} className="text-xs text-accentDark hover:underline mr-3">Editar</button>
                    <button onClick={() => eliminar(b)} className="text-xs text-rust hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
