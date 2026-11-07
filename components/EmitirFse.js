"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEmpresa } from "@/lib/EmpresaContext";
import CuentaCombobox from "@/lib/CuentaCombobox";
import SelectorUbicacion from "@/components/SelectorUbicacion";
import { formatoMoneda } from "@/lib/contabilidad";
import { configVC, calcularDocumento } from "@/lib/ventasCompras";
import { obtenerConfig } from "@/lib/rrhh";
import { CODIGOS_INGRESO } from "@/lib/anexosRenta";
import { emitirFse } from "@/lib/dteFse";

const hoy = () => new Date().toISOString().slice(0, 10);
const sujetoVacio = () => ({
  nombre: "", tipo_documento: "dui", nit_dui: "", cod_actividad: "", desc_actividad: "",
  telefono: "", correo: "", direccion: "", cod_departamento: "", cod_municipio: "", cod_distrito: "",
});
let contador = 0;
const lineaVacia = () => { contador += 1; return { key: contador, clase: "concepto", producto_id: "", cuenta_id: "", descripcion: "", cantidad: "1", precio: "" }; };

const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
const labelCls = "block text-xs font-medium text-inkSoft mb-1";

export default function EmitirFse({ onEmitido }) {
  const { empresa, cuentas, empresaId } = useEmpresa();
  const cfg = useMemo(() => configVC("compra"), []);
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState("");
  const [sujeto, setSujeto] = useState(sujetoVacio());
  const [fecha, setFecha] = useState(hoy());
  const [condicion, setCondicion] = useState("contado");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [cuentaDinero, setCuentaDinero] = useState("");
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [conRetencion, setConRetencion] = useState(false);
  const [retencion, setRetencion] = useState("");
  const [codigoIngreso, setCodigoIngreso] = useState("11");
  const [cuentaRetencion, setCuentaRetencion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  useEffect(() => {
    supabase.from("proveedores").select("*").eq("empresa_id", empresaId).order("nombre").then(({ data }) => setProveedores(data || []));
    obtenerConfig(empresaId).then((c) => setCuentaRetencion(c?.cuenta_renta_pagar_id || "")).catch(() => {});
  }, [empresaId]);

  const calculo = useMemo(() => calcularDocumento(cfg, "sin_iva", lineas), [cfg, lineas]);
  const cuentasActivo = useMemo(() => cuentas.filter((c) => c.clase === "Activo"), [cuentas]);
  const cuentasGasto = useMemo(() => cuentas.filter((c) => c.clase === "Gasto" || c.clase === "Costo" || c.clase === "Activo"), [cuentas]);
  const cambiarLinea = (key, c) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...c } : l)));

  function elegirProveedor(id) {
    setProveedorId(id);
    const p = proveedores.find((x) => x.id === id);
    if (!p) return;
    setSujeto({
      ...sujetoVacio(),
      nombre: p.nombre_hacienda || p.nombre || "",
      tipo_documento: p.tipo_documento === "nit" ? "nit" : "dui",
      nit_dui: p.nit_dui || "",
      cod_actividad: p.cod_actividad || "",
      desc_actividad: p.desc_actividad || "",
      telefono: p.telefono || "",
      correo: p.correo || "",
      direccion: p.direccion || "",
      cod_departamento: p.cod_departamento || "",
      cod_municipio: p.cod_municipio || "",
      cod_distrito: p.cod_distrito || "",
    });
  }

  async function emitir(e) {
    e.preventDefault();
    setError(null);
    setExito(null);
    setGuardando(true);
    const res = await emitirFse({
      empresa, empresaId, proveedores,
      datos: {
        fecha, condicion, fechaVencimiento, cuentaDinero, proveedorId, sujeto, lineas,
        retencionRenta: conRetencion ? retencion : 0, codigoIngreso, cuentaRetencion,
      },
    });
    setGuardando(false);
    if (res.error) return setError(res.error);
    setExito(`Factura de sujeto excluido ${res.numeroControl} emitida ${res.numeroPartida ? `(partida N° ${res.numeroPartida})` : "(pendiente de contabilizar)"}. Ya aparece en Compras.`);
    setSujeto(sujetoVacio());
    setProveedorId("");
    setLineas([lineaVacia()]);
    setConRetencion(false);
    setRetencion("");
    const { data } = await supabase.from("proveedores").select("*").eq("empresa_id", empresaId).order("nombre");
    setProveedores(data || []);
    onEmitido?.();
  }

  const retNum = conRetencion ? Number(retencion) || 0 : 0;

  return (
    <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
      <h2 className="font-display text-base font-semibold mb-1">Emitir factura de sujeto excluido (14)</h2>
      <p className="text-xs text-inkSoft mb-4">
        La emites tú cuando compras a una persona no inscrita en IVA. Se registra como una compra (aparece en Compras, en el libro de
        compras como «sujetos excluidos» y en la casilla 66 del F-07). Si aplicas retención de renta, entra al Anexo F14.
      </p>
      <form onSubmit={emitir} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Forma de pago</label>
            <select value={condicion} onChange={(e) => setCondicion(e.target.value)} className={inputCls}>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            {condicion === "contado" ? (
              <>
                <label className={labelCls}>¿Con qué se pagó?</label>
                <CuentaCombobox cuentas={cuentasActivo} value={cuentaDinero} onChange={setCuentaDinero} />
              </>
            ) : (
              <>
                <label className={labelCls}>Fecha de vencimiento</label>
                <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className={inputCls} />
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">Sujeto excluido (proveedor)</p>
          <div className="mb-3">
            <label className={labelCls}>Proveedor registrado</label>
            <select value={proveedorId} onChange={(e) => elegirProveedor(e.target.value)} className={`${inputCls} sm:w-1/2`}>
              <option value="">— Escribir los datos manualmente (se guardará como proveedor) —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}{p.nit_dui ? ` — ${p.nit_dui}` : ""}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className={labelCls}>Nombre completo</label>
              <input value={sujeto.nombre} onChange={(e) => setSujeto({ ...sujeto, nombre: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tipo de documento</label>
              <select value={sujeto.tipo_documento} onChange={(e) => setSujeto({ ...sujeto, tipo_documento: e.target.value })} className={inputCls}>
                <option value="dui">DUI</option>
                <option value="nit">NIT</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{sujeto.tipo_documento === "dui" ? "DUI (9 dígitos) *" : "NIT (sin guiones) *"}</label>
              <input value={sujeto.nit_dui} onChange={(e) => setSujeto({ ...sujeto, nit_dui: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input value={sujeto.telefono} onChange={(e) => setSujeto({ ...sujeto, telefono: e.target.value })} className={inputCls} />
            </div>
            <div className="sm:col-span-3">
              <label className={labelCls}>Correo</label>
              <input value={sujeto.correo} onChange={(e) => setSujeto({ ...sujeto, correo: e.target.value })} className={inputCls} />
            </div>
            <SelectorUbicacion
              departamento={sujeto.cod_departamento}
              municipio={sujeto.cod_municipio}
              distrito={sujeto.cod_distrito}
              onChange={(v) => setSujeto({ ...sujeto, ...v })}
              requerido={false}
            />
            <div className="sm:col-span-3">
              <label className={labelCls}>Dirección complementaria</label>
              <input value={sujeto.direccion} onChange={(e) => setSujeto({ ...sujeto, direccion: e.target.value })} className={inputCls} />
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">Detalle de la compra</p>
          <div className="space-y-2">
            {lineas.map((l) => (
              <div key={l.key} className="grid grid-cols-12 gap-2 items-start border border-paperLine rounded-sm p-2 bg-paper/40">
                <div className="col-span-12 md:col-span-5">
                  <label className={labelCls}>Cuenta de gasto / costo</label>
                  <CuentaCombobox cuentas={cuentasGasto} value={l.cuenta_id} onChange={(id) => cambiarLinea(l.key, { cuenta_id: id })} />
                  <input value={l.descripcion} onChange={(e) => cambiarLinea(l.key, { descripcion: e.target.value })}
                    placeholder="Descripción (ej. Servicio de limpieza)" className={`${inputCls} mt-1`} />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className={labelCls}>Cantidad</label>
                  <input type="number" step="any" min="0" value={l.cantidad} onChange={(e) => cambiarLinea(l.key, { cantidad: e.target.value })} className={`${inputCls} font-num text-right`} />
                </div>
                <div className="col-span-4 md:col-span-3">
                  <label className={labelCls}>Precio</label>
                  <input type="number" step="any" min="0" value={l.precio} onChange={(e) => cambiarLinea(l.key, { precio: e.target.value })} className={`${inputCls} font-num text-right`} />
                </div>
                <div className="col-span-3 md:col-span-1">
                  <label className={labelCls}>Importe</label>
                  <p className="font-num text-sm text-right py-1.5">{formatoMoneda((Number(l.cantidad) || 0) * (Number(l.precio) || 0))}</p>
                </div>
                <div className="col-span-1 pt-5 text-right">
                  <button type="button" disabled={lineas.length <= 1} onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))} className="text-xs text-rust hover:underline disabled:opacity-30">Quitar</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLineas((ls) => [...ls, lineaVacia()])} className="text-xs text-accentDark hover:underline mt-2">+ Agregar ítem</button>
        </div>

        <div className="border border-paperLine rounded-sm bg-white/60 p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={conRetencion} onChange={(e) => { setConRetencion(e.target.checked); if (e.target.checked && !retencion) setRetencion(String(Math.round(calculo.total * 10) / 100)); }} />
            Aplicar retención de renta (10%)
          </label>
          {conRetencion && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Monto retenido</label>
                <input type="number" step="0.01" min="0" value={retencion} onChange={(e) => setRetencion(e.target.value)} className={`${inputCls} font-num`} />
              </div>
              <div>
                <label className={labelCls}>Código de ingreso (F14)</label>
                <select value={codigoIngreso} onChange={(e) => setCodigoIngreso(e.target.value)} className={inputCls}>
                  {CODIGOS_INGRESO.map(([c, t]) => (<option key={c} value={c}>{c} — {t.length > 50 ? t.slice(0, 50) + "…" : t}</option>))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Cuenta de renta retenida por pagar</label>
                <CuentaCombobox cuentas={cuentas} value={cuentaRetencion} onChange={setCuentaRetencion} />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <div className="w-full sm:w-72 text-sm space-y-1 font-num tabular">
            <div className="flex justify-between"><span className="font-body">Total de la compra</span><span>{formatoMoneda(calculo.total)}</span></div>
            {retNum > 0 && <div className="flex justify-between"><span className="font-body">Retención de renta</span><span>−{formatoMoneda(retNum)}</span></div>}
            <div className="flex justify-between font-semibold border-t border-paperLine pt-1"><span className="font-body">Total a pagar</span><span>{formatoMoneda(calculo.total - retNum)}</span></div>
          </div>
        </div>

        {error && <p className="text-sm text-rust">{error}</p>}
        {exito && <p className="text-sm text-ledger">{exito}</p>}
        <button type="submit" disabled={guardando} className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60">
          {guardando ? "Emitiendo…" : "Emitir factura de sujeto excluido"}
        </button>
      </form>
    </section>
  );
}
