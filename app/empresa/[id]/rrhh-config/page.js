"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import CuentaCombobox from "@/lib/CuentaCombobox";
import { CUENTAS_CONFIG, TABLA_RENTA_MENSUAL, TABLA_RENTA_QUINCENAL, TABLA_RENTA_JUNIO, TABLA_RENTA_DICIEMBRE, obtenerConfig, guardarConfig } from "@/lib/rrhh";

const NUMEROS = [
  ["isss_emp_pct", "ISSS empleado (%)"],
  ["isss_pat_pct", "ISSS patrono (%)"],
  ["isss_tope_base", "ISSS: base máxima mensual ($)"],
  ["afp_emp_pct", "AFP empleado (%)"],
  ["afp_pat_pct", "AFP patrono (%)"],
  ["insaforp_pct", "INSAFORP patrono (%)"],
  ["salario_minimo", "Salario mínimo mensual ($)"],
  ["vacaciones_dias", "Días de vacaciones al año"],
  ["vacaciones_recargo_pct", "Recargo de vacaciones (%)"],
];

function TablaRenta({ titulo, filas, onChange }) {
  const cambiar = (i, campo, v) => onChange(filas.map((f, j) => (j === i ? { ...f, [campo]: v === "" ? (campo === "hasta" ? null : 0) : Number(v) } : f)));
  const inp = "w-24 border border-paperLine rounded-sm px-1.5 py-0.5 text-xs font-num bg-white";
  return (
    <div>
      <p className="text-xs font-semibold text-inkSoft mb-1">{titulo}</p>
      <table className="text-xs">
        <thead>
          <tr className="text-inkSoft"><th className="text-left pr-2">Desde</th><th className="text-left pr-2">Hasta</th><th className="text-left pr-2">%</th><th className="text-left pr-2">Cuota fija</th><th className="text-left">Sobre exceso de</th></tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {["desde", "hasta", "pct", "cuota", "exceso"].map((c) => (
                <td key={c} className="pr-2 py-0.5">
                  <input type="number" step="0.01" className={inp} value={f[c] ?? ""} placeholder={c === "hasta" ? "en adelante" : ""} onChange={(e) => cambiar(i, c, e.target.value)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RrhhConfigPage() {
  const { empresaId, cuentas } = useEmpresa();
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    obtenerConfig(empresaId).then(setCfg).catch((e) => setError("No se pudo cargar (¿ya corriste la migración de Recursos humanos en Supabase?): " + (e.message || e)));
  }, [empresaId]);

  async function guardar() {
    setError(null);
    setMensaje(null);
    setGuardando(true);
    try {
      await guardarConfig(empresaId, cfg);
      setMensaje("Configuración guardada.");
    } catch (e) {
      setError("No se pudo guardar: " + (e.message || e));
    } finally {
      setGuardando(false);
    }
  }

  if (!cfg) return error ? <p className="text-sm text-rust">{error}</p> : <p className="text-inkSoft text-sm">Cargando configuración…</p>;

  const inp = "w-full border border-paperLine rounded-sm px-2 py-1 text-sm bg-white font-num";
  const lbl = "block text-xs font-medium text-inkSoft mb-1";
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div className="space-y-6">
      <h2 className="font-display text-lg font-semibold">Recursos humanos — Configuración</h2>

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-3">
        <p className="text-sm font-medium">Porcentajes y topes de ley</p>
        <p className="text-xs text-inkSoft">Valores por defecto vigentes en El Salvador; edítalos si cambian. Confírmalos con tu contador antes de usarlos en planillas reales.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {NUMEROS.map(([k, t]) => (
            <div key={k}><label className={lbl}>{t}</label><input type="number" step="0.01" className={inp} value={cfg[k]} onChange={(e) => set(k, e.target.value === "" ? "" : Number(e.target.value))} /></div>
          ))}
        </div>
        <div className="flex flex-wrap gap-5 text-xs text-inkSoft">
          {[
            ["aplica_insaforp", "Aplica INSAFORP (empresas con 10 o más empleados)"],
            ["provisiona_vacaciones", "Provisionar vacaciones"],
            ["provisiona_aguinaldo", "Provisionar aguinaldo"],
            ["provisiona_indemnizacion", "Provisionar indemnización"],
          ].map(([k, t]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={!!cfg[k]} onChange={(e) => set(k, e.target.checked)} /> {t}</label>
          ))}
        </div>
      </section>

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-4">
        <p className="text-sm font-medium">Tabla de retención de renta (sueldos)</p>
        <TablaRenta titulo="Mensual" filas={cfg.tabla_renta_mensual} onChange={(f) => set("tabla_renta_mensual", f)} />
        <TablaRenta titulo="Quincenal" filas={cfg.tabla_renta_quincenal} onChange={(f) => set("tabla_renta_quincenal", f)} />
        <p className="text-xs text-inkSoft pt-2">Recálculo de la retención (Decreto Ejecutivo N.° 10 de 2025): en la última planilla de junio se acumulan las remuneraciones gravadas de enero a junio, y en la de diciembre las de todo el año; a la retención que resulte se le resta lo ya retenido y, si queda negativa, no se retiene.</p>
        <TablaRenta titulo="Recálculo de junio (acumulado enero–junio)" filas={cfg.tabla_renta_junio} onChange={(f) => set("tabla_renta_junio", f)} />
        <TablaRenta titulo="Recálculo de diciembre (acumulado del año)" filas={cfg.tabla_renta_diciembre} onChange={(f) => set("tabla_renta_diciembre", f)} />
        <button type="button" onClick={() => { set("tabla_renta_mensual", TABLA_RENTA_MENSUAL); set("tabla_renta_quincenal", TABLA_RENTA_QUINCENAL); set("tabla_renta_junio", TABLA_RENTA_JUNIO); set("tabla_renta_diciembre", TABLA_RENTA_DICIEMBRE); }} className="text-xs text-inkSoft underline underline-offset-2 hover:text-ink">Restaurar tablas por defecto</button>
      </section>

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-3">
        <p className="text-sm font-medium">Cuentas contables de la planilla</p>
        <p className="text-xs text-inkSoft">Las marcadas con * son obligatorias para contabilizar. Las de provisiones solo se necesitan si activaste esa provisión.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {CUENTAS_CONFIG.map(([k, t, obl]) => (
            <div key={k}>
              <label className={lbl}>{t}{obl ? " *" : ""}</label>
              <CuentaCombobox cuentas={cuentas} value={cfg[k] || ""} onChange={(id) => set(k, id || null)} />
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-rust">{error}</p>}
      {mensaje && <p className="text-sm text-ledgerDark">{mensaje}</p>}
      <button onClick={guardar} disabled={guardando} className="sac-btn sac-btn-primario font-medium">{guardando ? "Guardando…" : "Guardar configuración"}</button>
    </div>
  );
}
