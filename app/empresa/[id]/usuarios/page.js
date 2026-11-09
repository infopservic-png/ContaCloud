"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";

const ROLES = {
  lector: "Lector — solo consulta",
  digitador: "Digitador — consulta, crea y edita; no elimina",
  completo: "Completo — todo, incluida la configuración de la empresa",
};
const inputCls = "border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";
const fechaHora = (iso) => new Date(iso).toLocaleString("es-SV", { timeZone: "America/El_Salvador", dateStyle: "short", timeStyle: "short" });

export default function UsuariosPage() {
  const { empresa, empresaId } = useEmpresa();
  const [esDueno, setEsDueno] = useState(false);
  const [miembros, setMiembros] = useState([]);
  const [accesos, setAccesos] = useState([]);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("digitador");
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function cargar() {
    const { data: sesion } = await supabase.auth.getSession();
    const dueno = sesion?.session?.user?.id === empresa?.user_id;
    setEsDueno(dueno);
    if (dueno) {
      const { data, error } = await supabase.from("empresa_miembros").select("*").eq("empresa_id", empresaId).order("created_at");
      if (error) setError(/empresa_miembros/i.test(error.message) ? "Falta ejecutar la migración 35 (usuarios por empresa) en Supabase." : error.message);
      else setMiembros(data || []);
    }
    const desde = new Date(Date.now() - 90 * 864e5).toISOString();
    const { data: acc } = await supabase.from("accesos_empresa").select("*").eq("empresa_id", empresaId).gte("created_at", desde).order("created_at", { ascending: false }).limit(1000);
    setAccesos(acc || []);
  }
  useEffect(() => {
    if (empresa) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, empresa?.user_id]);

  async function invitar(e) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    const correo = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(correo)) return setError("Escribe un correo válido.");
    if (correo === String(empresa?.propietario_email || "").toLowerCase()) return setError("Ese es el correo del propietario.");
    const { error } = await supabase.from("empresa_miembros").insert({ empresa_id: empresaId, email: correo, rol });
    if (error) return setError(/duplicate|unique/i.test(error.message) ? "Ese correo ya tiene acceso." : error.message);
    setEmail("");
    setAviso(`Listo. ${correo} verá la empresa en su panel al iniciar sesión (debe registrarse en ContaCloud con ese mismo correo).`);
    cargar();
  }

  async function cambiarRol(m, nuevo) {
    const { error } = await supabase.from("empresa_miembros").update({ rol: nuevo }).eq("id", m.id);
    if (error) return setError(error.message);
    cargar();
  }

  async function quitar(m) {
    if (!confirm(`¿Quitar el acceso de ${m.email}?`)) return;
    const { error } = await supabase.from("empresa_miembros").delete().eq("id", m.id);
    if (error) return setError(error.message);
    cargar();
  }

  const resumen = useMemo(() => {
    const por = new Map();
    for (const a of accesos) {
      const k = String(a.email || "—").toLowerCase();
      const r = por.get(k) || { email: k, ultimo: a.created_at, total: 0, ultimos30: 0 };
      r.total += 1;
      if (Date.now() - new Date(a.created_at).getTime() < 30 * 864e5) r.ultimos30 += 1;
      por.set(k, r);
    }
    return [...por.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo));
  }, [accesos]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-semibold mb-1">Usuarios con acceso a esta empresa</h2>
        {!esDueno ? (
          <p className="text-sm text-inkSoft">Solo el propietario ({empresa?.propietario_email || "—"}) administra quién tiene acceso.</p>
        ) : (
          <>
            <p className="text-xs text-inkSoft mb-3">
              Invita a tu contador, auxiliar o auditor. Cada persona entra con su propia cuenta de ContaCloud y todo lo que haga queda en la bitácora. Las invitaciones no consumen tu límite de empresas.
            </p>
            <form onSubmit={invitar} className="bg-[#F7F4EA] border border-paperLine rounded-sm p-3 flex flex-wrap items-end gap-3 mb-3">
              <label><span className="block text-xs text-inkSoft mb-1">Correo</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls + " w-64"} placeholder="contador@correo.com" /></label>
              <label><span className="block text-xs text-inkSoft mb-1">Acceso</span>
                <select value={rol} onChange={(e) => setRol(e.target.value)} className={inputCls}>
                  {Object.entries(ROLES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <button type="submit" className="bg-brand text-onBrand px-4 py-1.5 rounded-sm text-sm font-medium hover:bg-brandDark">Dar acceso</button>
            </form>
            {error && <p className="text-sm text-rust mb-2">{error}</p>}
            {aviso && <p className="text-sm text-ledger mb-2">{aviso}</p>}
            <div className="overflow-x-auto bg-white border border-paperLine rounded-sm">
              <table className="w-full text-sm">
                <thead className="bg-brand text-onBrand text-xs">
                  <tr><th className="px-2 py-1 text-left font-normal">Correo</th><th className="px-2 py-1 text-left font-normal">Acceso</th><th className="px-2 py-1 text-left font-normal">Desde</th><th></th></tr>
                </thead>
                <tbody>
                  <tr className="border-t border-paperLine"><td className="px-2 py-1">{empresa?.propietario_email}</td><td className="px-2 py-1 text-xs text-inkSoft">Propietario</td><td></td><td></td></tr>
                  {miembros.map((m) => (
                    <tr key={m.id} className="border-t border-paperLine">
                      <td className="px-2 py-1">{m.email}</td>
                      <td className="px-2 py-1">
                        <select value={m.rol} onChange={(e) => cambiarRol(m, e.target.value)} className={inputCls + " !py-0.5"}>
                          {Object.entries(ROLES).map(([v, t]) => <option key={v} value={v}>{t.split(" — ")[0]}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1 text-xs">{fechaHora(m.created_at)}</td>
                      <td className="px-2 py-1 text-right"><button type="button" onClick={() => quitar(m)} className="text-xs text-rust hover:underline">Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold mb-1">Reporte de accesos</h2>
        <p className="text-xs text-inkSoft mb-3">Quién entró a esta empresa, últimos 90 días (se anota una vez cada dos horas por usuario).</p>
        <div className="overflow-x-auto bg-white border border-paperLine rounded-sm mb-4">
          <table className="w-full text-sm">
            <thead className="bg-brand text-onBrand text-xs">
              <tr><th className="px-2 py-1 text-left font-normal">Usuario</th><th className="px-2 py-1 text-left font-normal">Último acceso</th><th className="px-2 py-1 text-right font-normal">Últimos 30 días</th><th className="px-2 py-1 text-right font-normal">Últimos 90 días</th></tr>
            </thead>
            <tbody>
              {resumen.length === 0 && <tr><td colSpan={4} className="px-2 py-3 text-inkSoft">Sin accesos registrados todavía.</td></tr>}
              {resumen.map((r) => (
                <tr key={r.email} className="border-t border-paperLine">
                  <td className="px-2 py-1">{r.email}</td>
                  <td className="px-2 py-1 text-xs">{fechaHora(r.ultimo)}</td>
                  <td className="px-2 py-1 text-right font-num">{r.ultimos30}</td>
                  <td className="px-2 py-1 text-right font-num">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {accesos.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-accentDark">Ver el detalle de cada acceso</summary>
            <ul className="mt-2 text-xs space-y-0.5">
              {accesos.slice(0, 200).map((a) => (<li key={a.id}>{fechaHora(a.created_at)} — {a.email}</li>))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
