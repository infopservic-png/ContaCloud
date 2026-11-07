"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PLANES } from "@/lib/licencia";

const hoyMas = (dias, desde) => {
  const base = desde && desde >= new Date().toISOString().slice(0, 10) ? new Date(desde + "T12:00:00") : new Date();
  base.setDate(base.getDate() + dias);
  return base.toISOString().slice(0, 10);
};

export default function AdminLicencias({ empresas }) {
  const [lista, setLista] = useState([]);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  async function cargar() {
    const { data, error: err } = await supabase.from("licencias").select("*").order("vence_el");
    if (err) setError("No se pudieron cargar las licencias (¿corriste la migración 32?): " + err.message);
    else setLista(data || []);
  }
  useEffect(() => {
    cargar();
  }, []);

  const cambiar = (uid, c) => setLista((l) => l.map((x) => (x.user_id === uid ? { ...x, ...c } : x)));

  async function guardar(l) {
    setError(null);
    setAviso(null);
    const { error: err } = await supabase
      .from("licencias")
      .update({ plan: l.plan, estado: l.estado, vence_el: l.vence_el, max_empresas: Number(l.max_empresas) || 0, notas: l.notas || null, updated_at: new Date().toISOString() })
      .eq("user_id", l.user_id);
    if (err) setError("No se pudo guardar: " + err.message);
    else setAviso(`Licencia de ${l.email} guardada.`);
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const q = busqueda.trim().toLowerCase();
  const filas = lista.filter((l) => !q || (l.email || "").toLowerCase().includes(q));
  const cuentaEmpresas = (uid) => empresas.filter((e) => e.user_id === uid).length;
  const porVencer = lista.filter((l) => l.estado === "activa" && l.vence_el >= hoy && l.vence_el <= hoyMas(15)).length;
  const vencidas = lista.filter((l) => l.vence_el < hoy || l.estado === "suspendida").length;

  const inp = "border border-paperLine rounded-sm px-1.5 py-1 text-xs bg-white";
  return (
    <section className="mb-10">
      <h2 className="font-display text-lg font-semibold mb-1">Licencias</h2>
      <p className="text-xs text-inkSoft mb-3">
        {lista.length} usuarios · {porVencer} por vencer en 15 días · {vencidas} vencidas o suspendidas. Sin licencia vigente el usuario queda en solo lectura.
      </p>
      <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por correo…" className="w-full border border-paperLine rounded-sm px-3 py-2 text-sm mb-3" />
      {error && <p className="text-sm text-rust mb-2">{error}</p>}
      {aviso && <p className="text-sm text-ledger mb-2">{aviso}</p>}
      <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-brand text-onBrand text-left">
              <th className="px-2 py-2 font-medium">Correo</th>
              <th className="px-2 py-2 font-medium">Plan</th>
              <th className="px-2 py-2 font-medium">Estado</th>
              <th className="px-2 py-2 font-medium">Vence</th>
              <th className="px-2 py-2 font-medium">Empresas</th>
              <th className="px-2 py-2 font-medium">Notas</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((l) => {
              const vencida = l.vence_el < hoy;
              return (
                <tr key={l.user_id} className="border-t border-paperLine align-top">
                  <td className="px-2 py-1.5">{l.email}</td>
                  <td className="px-2 py-1.5">
                    <select value={l.plan} onChange={(e) => cambiar(l.user_id, { plan: e.target.value })} className={inp}>
                      {PLANES.map((p) => (<option key={p.valor} value={p.valor}>{p.etiqueta}</option>))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={l.estado} onChange={(e) => cambiar(l.user_id, { estado: e.target.value })} className={inp + (l.estado === "suspendida" ? " text-rust" : "")}>
                      <option value="activa">Activa</option>
                      <option value="suspendida">Suspendida</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="date" value={l.vence_el} onChange={(e) => cambiar(l.user_id, { vence_el: e.target.value })} className={inp + (vencida ? " text-rust" : "")} />
                    <div className="mt-1 flex gap-2">
                      {[30, 90, 365].map((d) => (
                        <button key={d} type="button" onClick={() => cambiar(l.user_id, { vence_el: hoyMas(d, l.vence_el), estado: "activa" })} className="text-accentDark hover:underline">+{d}d</button>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {cuentaEmpresas(l.user_id)} /{" "}
                    <input type="number" min="0" value={l.max_empresas} onChange={(e) => cambiar(l.user_id, { max_empresas: e.target.value })} className={inp + " w-14"} />
                  </td>
                  <td className="px-2 py-1.5"><input value={l.notas || ""} onChange={(e) => cambiar(l.user_id, { notas: e.target.value })} className={inp + " w-40"} placeholder="Pago, factura…" /></td>
                  <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => guardar(l)} className="bg-brand text-onBrand px-2 py-1 rounded-sm">Guardar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
