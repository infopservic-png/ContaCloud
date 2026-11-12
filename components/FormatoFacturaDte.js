"use client";

import { useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";

const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";

// Reduce el logo en el navegador para guardarlo liviano (PNG, máx. 400×160)
function reducirImagen(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(400 / img.width, 160 / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * esc));
      c.height = Math.max(1, Math.round(img.height * esc));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

export default function FormatoFacturaDte() {
  const { empresa, actualizarEmpresa } = useEmpresa();
  const [logo, setLogo] = useState(empresa?.dte_logo || "");
  const [color, setColor] = useState(empresa?.dte_color || "#1F2937");
  const [usarColor, setUsarColor] = useState(!!empresa?.dte_color);
  const [pie, setPie] = useState(empresa?.dte_pie || "");
  const [notas, setNotas] = useState(empresa?.dte_notas || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function elegirLogo(e) {
    const a = e.target.files?.[0];
    e.target.value = "";
    if (!a) return;
    setError(null);
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(a.type)) return setError("Usa una imagen PNG o JPG.");
    try {
      setLogo(await reducirImagen(a));
    } catch (err) {
      setError(err.message);
    }
  }

  const formato = () => ({ logo: logo || null, color: usarColor ? color : null, pie: pie.trim() || null, notas: notas.trim() || null });

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setGuardando(true);
    const f = formato();
    const { error } = await actualizarEmpresa({ dte_logo: f.logo, dte_color: f.color, dte_pie: f.pie, dte_notas: f.notas });
    setGuardando(false);
    if (error) setError(/dte_(logo|color|pie|notas)/i.test(error.message) ? "Falta ejecutar la migración 38 (formato de factura) en Supabase." : error.message);
    else setAviso("Guardado. Las facturas que descargues desde ahora usarán este formato.");
  }

  async function vistaPrevia() {
    setError(null);
    try {
      const { generarPdfDte } = await import("@/lib/dtePdf");
      const dte = {
        identificacion: { tipoDte: "01", codigoGeneracion: "00000000-0000-0000-0000-000000000000", numeroControl: "DTE-01-00000000-000000000000000", fecEmi: new Date().toISOString().slice(0, 10), horEmi: "10:00:00", moneda: "USD" },
        emisor: { nombre: empresa?.nombre || "Empresa de ejemplo", nit: empresa?.nit || "0000-000000-000-0", nrc: empresa?.nrc || "000000-0" },
        receptor: { nombre: "Cliente de ejemplo, S.A. de C.V.", nrc: "000000-0", correo: "cliente@ejemplo.com" },
        cuerpoDocumento: [
          { numItem: 1, codigo: "P-001", descripcion: "Producto o servicio de ejemplo", cantidad: 2, precioUni: 50, ventaGravada: 100 },
          { numItem: 2, codigo: "P-002", descripcion: "Otro concepto de ejemplo", cantidad: 1, precioUni: 15, ventaGravada: 15 },
        ],
        resumen: { totalGravada: 115, totalIva: 13.23, montoTotalOperacion: 115, condicionOperacion: 1 },
      };
      const bytes = await generarPdfDte(dte, { formato: formato() });
      window.open(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), "_blank");
    } catch (err) {
      setError("No se pudo generar la vista previa: " + (err.message || err));
    }
  }

  return (
    <div className="max-w-xl mt-10">
      <h2 className="font-display text-lg font-semibold mb-1">Formato de la factura electrónica (PDF)</h2>
      <p className="text-xs text-inkSoft mb-4">
        Personaliza cómo se ve el PDF que recibe tu cliente. Los datos fiscales del documento no cambian; solo la presentación.
      </p>
      <form onSubmit={guardar} className="space-y-4 bg-[#F7F4EA] border border-paperLine rounded-sm p-5">
        <div>
          <span className="block text-xs font-medium text-inkSoft mb-1">Logo de la empresa</span>
          {logo && (
            <div className="mb-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="Logo" className="max-h-14 border border-paperLine bg-white p-1" />
              <button type="button" onClick={() => setLogo("")} className="text-xs text-rust hover:underline">Quitar</button>
            </div>
          )}
          <input type="file" accept="image/png,image/jpeg" onChange={elegirLogo} className="text-xs" />
          <span className="block text-[11px] text-inkSoft mt-0.5">PNG o JPG. Se reduce automáticamente.</span>
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-inkSoft mb-1">
            <input type="checkbox" checked={usarColor} onChange={(e) => setUsarColor(e.target.checked)} />
            Color principal (encabezado de la tabla, total y recuadros)
          </label>
          {usarColor && <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-16 border border-paperLine" />}
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Datos de pago y observaciones</span>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4} className={inputCls}
            placeholder={"Banco Agrícola — Cta. Corriente 0000000000 a nombre de …\nPago a 30 días. Gracias por su preferencia."} />
          <span className="block text-[11px] text-inkSoft mt-0.5">Aparece en un recuadro debajo de los totales.</span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Texto del pie de página</span>
          <input value={pie} onChange={(e) => setPie(e.target.value)} className={inputCls} placeholder="Ej.: Tel. 2222-0000 · ventas@miempresa.com · www.miempresa.com" />
          <span className="block text-[11px] text-inkSoft mt-0.5">Si lo dejas vacío se muestra la leyenda estándar de ContaCloud.</span>
        </label>

        {error && <p className="text-sm text-rust">{error}</p>}
        {aviso && <p className="text-sm text-ledger">{aviso}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={guardando} className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" onClick={vistaPrevia} className="border border-paperLine px-4 py-2 rounded-sm text-sm hover:bg-white">Vista previa</button>
        </div>
      </form>
    </div>
  );
}
