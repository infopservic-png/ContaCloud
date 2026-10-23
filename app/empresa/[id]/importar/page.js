"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { configVC } from "@/lib/ventasCompras";
import { configCxCxP, obtenerEntidades } from "@/lib/cxcxp";
import { procesarLote } from "@/lib/importarDte";
import { hayEsquemas, clavesEsquemas } from "@/lib/dteValidacion";
import { formatoMoneda } from "@/lib/contabilidad";
import { exportarAExcel } from "@/lib/exportarExcel";
import CuentaCombobox from "@/lib/CuentaCombobox";

const MODOS = [
  { id: "venta", etiqueta: "Importar ventas", ayuda: "Documentos que emitió esta empresa (la empresa es el emisor)." },
  { id: "compra", etiqueta: "Importar compras", ayuda: "Documentos que le emitieron a esta empresa (la empresa es el receptor)." },
  { id: "validar", etiqueta: "Solo validar", ayuda: "Revisa los archivos contra el esquema oficial sin registrar nada." },
];
const ESTILOS = {
  importado: "bg-ledger/20 text-ledgerDark",
  valido: "bg-ledger/20 text-ledgerDark",
  duplicado: "bg-paperLine text-inkSoft",
  invalido: "bg-rust/20 text-rust",
  error: "bg-rust/20 text-rust",
};
const ETIQUETAS = { importado: "Importado", valido: "Válido", duplicado: "Ya existe", invalido: "No cumple el esquema", error: "Error" };

export default function ImportarPage() {
  const { empresa, cuentas, empresaId } = useEmpresa();
  const [modo, setModo] = useState("venta");
  const [archivos, setArchivos] = useState([]);
  const [cuentaConcepto, setCuentaConcepto] = useState("");
  const [cuentaDinero, setCuentaDinero] = useState("");
  const [permitirNoValidos, setPermitirNoValidos] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [avance, setAvance] = useState({ hechos: 0, total: 0 });
  const [resultados, setResultados] = useState(null);
  const [error, setError] = useState(null);
  const [detalleAbierto, setDetalleAbierto] = useState(null);

  const soloValidar = modo === "validar";
  const modoTxt = MODOS.find((m) => m.id === modo);

  useEffect(() => {
    if (modo === "venta" && !cuentaConcepto && empresa?.cuenta_ventas_id) setCuentaConcepto(empresa.cuenta_ventas_id);
  }, [modo, empresa, cuentaConcepto]);

  function cambiarModo(id) {
    setModo(id);
    setResultados(null);
    setError(null);
    setCuentaConcepto(id === "venta" ? empresa?.cuenta_ventas_id || "" : "");
  }

  async function elegirArchivos(e) {
    const lista = [...(e.target.files || [])].filter((f) => f.name.toLowerCase().endsWith(".json"));
    const leidos = [];
    for (const f of lista) leidos.push({ nombre: f.webkitRelativePath || f.name, contenido: await f.text() });
    setArchivos(leidos);
    setResultados(null);
    setError(null);
  }

  async function procesar() {
    setError(null);
    if (archivos.length === 0) return setError("Selecciona al menos un archivo JSON.");
    if (!soloValidar) {
      if (!cuentaConcepto) {
        return setError(modo === "venta" ? "Elige la cuenta de ingresos." : "Elige la cuenta de compra o gasto donde se cargarán las compras.");
      }
      if (!cuentaDinero && !window.confirm(`No elegiste ${modo === "venta" ? "dónde se recibió el dinero" : "con qué se pagó"}. Los documentos al contado no se podrán registrar; los de crédito sí. ¿Continuar?`)) return;
    }
    setProcesando(true);
    setResultados(null);
    try {
      const cfg = soloValidar ? null : configCxCxP(modo === "venta" ? "cobrar" : "pagar");
      const entidades = soloValidar ? [] : await obtenerEntidades(cfg, empresaId);
      const res = await procesarLote(
        archivos,
        { modo: soloValidar ? "venta" : modo, empresa, empresaId, entidades, cuentaConcepto, cuentaDinero, soloValidar, permitirNoValidos },
        (hechos, total) => setAvance({ hechos, total })
      );
      setResultados(res);
    } catch (e) {
      setError("No se pudo procesar: " + e.message);
    } finally {
      setProcesando(false);
    }
  }

  function exportarInforme() {
    const filas = [
      ["Archivo", "N.° de control", "Fecha", "Contraparte", "Total", "Resultado", "Detalle", "Avisos"],
      ...resultados.map((r) => [
        r.archivo, r.numeroControl || "", r.fecha || "", r.contraparte || "", r.total ?? "",
        ETIQUETAS[r.estado] || r.estado,
        [r.detalle, ...(r.esquema?.errores || []).map((x) => `${x.ruta}: ${x.mensaje}`)].filter(Boolean).join(" | "),
        (r.avisos || []).join(" | "),
      ]),
    ];
    exportarAExcel("informe-importacion-dte", [{ nombre: "Informe", filas }]);
  }

  const cuenta = (r) => (r.estado === "importado" ? 1 : 0);
  const resumen = resultados
    ? Object.entries(resultados.reduce((a, r) => ({ ...a, [r.estado]: (a[r.estado] || 0) + 1 }), {}))
    : [];

  return (
    <div className="max-w-5xl">
      <h2 className="font-display text-lg font-semibold mb-1">Importar DTE (JSON)</h2>
      <p className="text-sm text-inkSoft mb-4">
        Carga muchos documentos a la vez. Se aceptan Facturas (01) y Créditos Fiscales (03). Cada uno se valida y, si
        no está repetido, se registra con su partida en el Diario.
      </p>

      <div className="flex flex-wrap gap-1 mb-2">
        {MODOS.map((m) => (
          <button
            key={m.id}
            onClick={() => cambiarModo(m.id)}
            aria-pressed={modo === m.id}
            className={
              "px-3 py-1.5 text-sm rounded-sm border border-paperLine " +
              (modo === m.id ? "bg-brand text-onBrand" : "bg-white text-inkSoft hover:bg-paperLine/30")
            }
          >
            {m.etiqueta}
          </button>
        ))}
      </div>
      <p className="text-xs text-inkSoft mb-4">{modoTxt.ayuda}</p>

      <div className={"text-xs rounded-sm px-3 py-2 mb-4 " + (hayEsquemas() ? "bg-ledger/10 text-ledgerDark" : "bg-accent/20 text-accentDark")}>
        {hayEsquemas()
          ? `Esquemas oficiales cargados: ${clavesEsquemas().join(", ")}.`
          : "Todavía no están cargados los esquemas oficiales de Hacienda: se revisa que el documento tenga lo necesario para registrarse, pero no se valida contra el esquema."}
      </div>

      <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-4 space-y-4 mb-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-inkSoft mb-1">Archivos JSON</label>
            <input type="file" accept=".json,application/json" multiple onChange={elegirArchivos} className="text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-inkSoft mb-1">…o una carpeta completa</label>
            <input type="file" webkitdirectory="" directory="" multiple onChange={elegirArchivos} className="text-sm w-full" />
          </div>
        </div>
        <p className="text-xs text-inkSoft">{archivos.length ? `${archivos.length} archivo(s) listo(s).` : "Aún no hay archivos seleccionados."}</p>

        {!soloValidar && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">
                {modo === "venta" ? "Cuenta de ingresos por ventas" : "Cuenta de compra o gasto"}
              </label>
              <CuentaCombobox cuentas={cuentas} value={cuentaConcepto} onChange={setCuentaConcepto} placeholder="Buscar cuenta…" />
              {modo === "compra" && (
                <p className="text-xs text-inkSoft mt-1">Todas las compras del lote se cargan a esta cuenta; luego puedes reclasificar en el Diario.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-inkSoft mb-1">
                {configVC(modo).labelDinero} (documentos al contado)
              </label>
              <CuentaCombobox cuentas={cuentas} value={cuentaDinero} onChange={setCuentaDinero} placeholder="Caja, Bancos…" />
              <p className="text-xs text-inkSoft mt-1">Los documentos al crédito van a {configVC(modo).labelControl}.</p>
            </div>
          </div>
        )}

        {hayEsquemas() && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={permitirNoValidos} onChange={(e) => setPermitirNoValidos(e.target.checked)} />
            Importar aunque no cumpla el esquema oficial
          </label>
        )}

        {error && <p className="text-sm text-rust">{error}</p>}
        <button
          onClick={procesar}
          disabled={procesando || archivos.length === 0}
          className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60"
        >
          {procesando ? `Procesando ${avance.hechos} de ${avance.total}…` : soloValidar ? "Validar archivos" : "Importar documentos"}
        </button>
      </section>

      {resultados && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-sm font-medium">
              Resultado:{" "}
              {resumen.map(([estado, n]) => (
                <span key={estado} className={"text-xs px-2 py-1 rounded-sm mr-2 " + (ESTILOS[estado] || "")}>
                  {n} {ETIQUETAS[estado] || estado}
                </span>
              ))}
            </p>
            <button onClick={exportarInforme} className="text-xs text-ledgerDark hover:underline">Descargar informe (Excel)</button>
          </div>
          <div className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-inkSoft border-b border-paperLine">
                  <th className="px-3 py-2 font-medium">Archivo</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">{modo === "compra" ? "Proveedor" : "Cliente"}</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, i) => {
                  const abierto = detalleAbierto === i;
                  const problemas = r.esquema?.errores || [];
                  return (
                    <tr key={i} className="border-t border-paperLine align-top">
                      <td className="px-3 py-1.5 text-xs break-all">{r.archivo}</td>
                      <td className="px-3 py-1.5">{r.fecha || "—"}</td>
                      <td className="px-3 py-1.5">{r.contraparte || "—"}</td>
                      <td className="px-3 py-1.5 font-num text-right tabular">{r.total ? formatoMoneda(r.total) : "—"}</td>
                      <td className="px-3 py-1.5">
                        <span className={"text-xs px-2 py-1 rounded-sm " + (ESTILOS[r.estado] || "")}>{ETIQUETAS[r.estado] || r.estado}</span>
                        {r.numeroPartida ? <span className="text-xs text-inkSoft ml-2">Partida N.° {r.numeroPartida}</span> : null}
                        {r.entidadNueva && <span className="text-xs text-inkSoft ml-2">(se creó a {r.entidadNombre})</span>}
                        {r.detalle && <p className="text-xs text-inkSoft mt-1">{r.detalle}</p>}
                        {(r.avisos || []).map((a) => (
                          <p key={a} className="text-xs text-accentDark mt-1">Aviso: {a}</p>
                        ))}
                        {problemas.length > 0 && (
                          <>
                            <button onClick={() => setDetalleAbierto(abierto ? null : i)} className="text-xs text-accentDark hover:underline mt-1">
                              {abierto ? "Ocultar" : "Ver"} {problemas.length} problema(s) del esquema
                            </button>
                            {abierto && (
                              <ul className="text-xs mt-1 space-y-0.5 list-disc pl-4">
                                {problemas.map((p, k) => (
                                  <li key={k}><span className="font-num">{p.ruta}</span>: {p.mensaje}</li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
