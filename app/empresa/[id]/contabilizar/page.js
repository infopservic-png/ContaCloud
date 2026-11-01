"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useEmpresa } from "@/lib/EmpresaContext";
import { formatoMoneda } from "@/lib/contabilidad";
import { documentosPendientes, contabilizar } from "@/lib/contabilizar";
import { TIPOS_PARTIDA } from "@/lib/partidas";

const MODOS = [
  { id: "documento", titulo: "Una partida por cada documento", texto: "Cada venta o compra genera su partida en el Diario al registrarla." },
  { id: "diferida", titulo: "Contabilizar después (una partida por día)", texto: "Las ventas y compras se cargan sin partida y aquí se contabilizan por día, como en el SAC." },
];

const fmt = (f) => {
  const [a, m, d] = String(f).split("-");
  return `${d}/${m}/${a}`;
};

export default function ContabilizarPage() {
  const { empresa, empresaId, actualizarEmpresa } = useEmpresa();
  const diferida = empresa?.modo_contable === "diferida";

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipoVentas, setTipoVentas] = useState("ingreso");
  const [tipoCompras, setTipoCompras] = useState("egreso");
  const [incluirVentas, setIncluirVentas] = useState(true);
  const [incluirCompras, setIncluirCompras] = useState(true);
  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [resultados, setResultados] = useState(null);
  const [errorGeneral, setErrorGeneral] = useState(null);

  async function cargar() {
    setCargando(true);
    try {
      const [v, c] = await Promise.all([
        documentosPendientes("venta", empresaId, desde, hasta),
        documentosPendientes("compra", empresaId, desde, hasta),
      ]);
      setVentas(v);
      setCompras(c);
    } catch (e) {
      setErrorGeneral(e.message);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, desde, hasta]);

  // Resumen por día de lo pendiente
  const resumen = useMemo(() => {
    const dias = {};
    const sumar = (docs, clase) => {
      for (const d of docs) {
        const x = (dias[d.fecha] ||= { fecha: d.fecha, ventas: 0, compras: 0, totalVentas: 0, totalCompras: 0 });
        x[clase === "venta" ? "ventas" : "compras"] += 1;
        x[clase === "venta" ? "totalVentas" : "totalCompras"] += Number(d.total) || 0;
      }
    };
    sumar(ventas, "venta");
    sumar(compras, "compra");
    return Object.values(dias).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [ventas, compras]);

  async function cambiarModo(modo) {
    if (modo === empresa?.modo_contable) return;
    if (!confirm(`Se cambiará el modo a «${MODOS.find((m) => m.id === modo).titulo}». Solo afecta a los documentos que registres desde ahora; lo ya registrado no cambia. ¿Continuar?`)) return;
    await actualizarEmpresa({ modo_contable: modo });
  }

  async function ejecutar() {
    setErrorGeneral(null);
    if (!incluirVentas && !incluirCompras) {
      setErrorGeneral("Marca al menos ventas o compras.");
      return;
    }
    const n = (incluirVentas ? ventas.length : 0) + (incluirCompras ? compras.length : 0);
    if (n === 0) {
      setErrorGeneral("No hay documentos pendientes en ese rango.");
      return;
    }
    if (!confirm(`Se contabilizarán ${n} documento(s), una partida por día y por tipo. ¿Continuar?`)) return;
    setTrabajando(true);
    try {
      const res = await contabilizar({
        empresa,
        empresaId,
        desde,
        hasta,
        tipos: { venta: incluirVentas ? tipoVentas : null, compra: incluirCompras ? tipoCompras : null },
      });
      setResultados(res);
      await cargar();
    } catch (e) {
      setErrorGeneral(e.message);
    } finally {
      setTrabajando(false);
    }
  }

  const sel = "border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";
  const pendientes = ventas.length + compras.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Contabilizar</h2>
        <p className="text-xs text-inkSoft">Genera las partidas del Diario a partir de las ventas y compras cargadas.</p>
      </div>

      <section className="border border-paperLine bg-[#F7F4EA] rounded-sm p-4">
        <p className="text-sm font-medium mb-2">Modo de contabilización de esta empresa</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {MODOS.map((m) => (
            <label key={m.id} className={`flex gap-2 items-start p-3 cursor-pointer border ${empresa?.modo_contable === m.id || (!empresa?.modo_contable && m.id === "documento") ? "border-accent bg-accent/10" : "border-paperLine bg-white"}`}>
              <input type="radio" name="modo" className="mt-1" checked={(empresa?.modo_contable || "documento") === m.id} onChange={() => cambiarModo(m.id)} />
              <span>
                <span className="block text-sm font-medium">{m.titulo}</span>
                <span className="block text-xs text-inkSoft">{m.texto}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="border border-paperLine bg-[#F7F4EA] rounded-sm p-4 space-y-4">
        <p className="text-sm font-medium">Documentos pendientes de contabilizar</p>
        <div className="flex flex-wrap gap-4 items-end text-sm">
          <label>
            <span className="block text-xs text-inkSoft mb-1">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={sel} />
          </label>
          <label>
            <span className="block text-xs text-inkSoft mb-1">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={sel} />
          </label>
        </div>

        {!diferida && pendientes === 0 ? (
          <p className="text-sm text-inkSoft">
            Esta empresa genera una partida por cada documento, así que no hay nada pendiente. Si quieres contabilizar por día, elige «Contabilizar después» arriba.
          </p>
        ) : cargando ? (
          <p className="text-sm text-inkSoft">Cargando…</p>
        ) : pendientes === 0 ? (
          <p className="text-sm text-inkSoft">No hay ventas ni compras pendientes en ese rango.</p>
        ) : (
          <>
            <div className="overflow-x-auto bg-white border border-paperLine">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#DAD7CD] text-left text-xs">
                    <th className="px-3 py-1.5">Fecha</th>
                    <th className="px-3 py-1.5 text-right">Ventas</th>
                    <th className="px-3 py-1.5 text-right">Total ventas</th>
                    <th className="px-3 py-1.5 text-right">Compras</th>
                    <th className="px-3 py-1.5 text-right">Total compras</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map((d) => (
                    <tr key={d.fecha} className="border-t border-paperLine">
                      <td className="px-3 py-1">{fmt(d.fecha)}</td>
                      <td className="px-3 py-1 text-right">{d.ventas || "—"}</td>
                      <td className="px-3 py-1 text-right font-num tabular">{d.ventas ? formatoMoneda(d.totalVentas) : ""}</td>
                      <td className="px-3 py-1 text-right">{d.compras || "—"}</td>
                      <td className="px-3 py-1 text-right font-num tabular">{d.compras ? formatoMoneda(d.totalCompras) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <fieldset className="border border-paperLine p-3 bg-white">
                <legend className="text-xs px-1 text-inkSoft">Ventas ({ventas.length})</legend>
                <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={incluirVentas} onChange={(e) => setIncluirVentas(e.target.checked)} /> Contabilizar ventas</label>
                <label className="block text-xs text-inkSoft mb-1">Tipo de partida</label>
                <select value={tipoVentas} onChange={(e) => setTipoVentas(e.target.value)} className={sel}>
                  {TIPOS_PARTIDA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </fieldset>
              <fieldset className="border border-paperLine p-3 bg-white">
                <legend className="text-xs px-1 text-inkSoft">Compras ({compras.length})</legend>
                <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={incluirCompras} onChange={(e) => setIncluirCompras(e.target.checked)} /> Contabilizar compras</label>
                <label className="block text-xs text-inkSoft mb-1">Tipo de partida</label>
                <select value={tipoCompras} onChange={(e) => setTipoCompras(e.target.value)} className={sel}>
                  {TIPOS_PARTIDA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </fieldset>
            </div>

            {errorGeneral && <p className="text-sm text-rust">{errorGeneral}</p>}
            <button onClick={ejecutar} disabled={trabajando} className="sac-btn sac-btn-primario font-medium">
              {trabajando ? "Contabilizando…" : "Contabilizar"}
            </button>
          </>
        )}
        {pendientes === 0 && errorGeneral && <p className="text-sm text-rust">{errorGeneral}</p>}
      </section>

      {resultados && (
        <section className="border border-paperLine bg-[#F7F4EA] rounded-sm p-4">
          <p className="text-sm font-medium mb-2">Resultado</p>
          {resultados.length === 0 ? (
            <p className="text-sm text-inkSoft">No había nada que contabilizar.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {resultados.map((r, i) => (
                <li key={i} className={r.error ? "text-rust" : ""}>
                  {fmt(r.fecha)} — {r.clase === "venta" ? "Ventas" : "Compras"} ({r.docs}):{" "}
                  {r.error ? `no se contabilizó: ${r.error}` : <>partida {r.etiqueta} por {formatoMoneda(r.total)}</>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-inkSoft mt-3">
            Las partidas están en el <Link className="underline" href={`/empresa/${empresaId}/transacciones`}>Libro diario</Link>. Si eliminas una partida diaria, sus documentos quedan pendientes otra vez.
          </p>
        </section>
      )}
    </div>
  );
}
