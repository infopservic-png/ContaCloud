"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { estadoCredenciales, guardarCredenciales, quitarCredenciales, NOMBRE_AMBIENTE } from "@/lib/transmisionDte";

const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";

export default function TransmisionHacienda() {
  const { empresa, empresaId } = useEmpresa();
  const [estado, setEstado] = useState(null);
  const [ambiente, setAmbiente] = useState("00");
  const [usuario, setUsuario] = useState("");
  const [claveApi, setClaveApi] = useState("");
  const [archivo, setArchivo] = useState(null); // { nombre, texto }
  const [claveCert, setClaveCert] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function cargar() {
    const e = await estadoCredenciales(empresaId);
    if (e.error) { setError(e.error); return; }
    setEstado(e);
    setAmbiente(e.ambiente);
    setUsuario(e.usuarioApi || (empresa?.nit || "").replace(/\D/g, ""));
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [empresaId]);

  async function elegirArchivo(ev) {
    const a = ev.target.files?.[0];
    ev.target.value = "";
    if (!a) return;
    if (a.size > 200000) return setError("El archivo es demasiado grande para ser un certificado.");
    setArchivo({ nombre: a.name, texto: await a.text() });
  }

  async function guardar(probar) {
    setError(null);
    setAviso(null);
    if (ambiente === "01" && estado?.ambiente !== "01" &&
        !window.confirm("Vas a activar el ambiente de PRODUCCIÓN: los documentos que transmitas serán reales y quedarán registrados en Hacienda. ¿Continuar?")) return;
    setTrabajando(true);
    const r = await guardarCredenciales({
      empresaId, ambiente, usuarioApi: usuario,
      claveApi: claveApi || undefined,
      certificado: archivo?.texto || undefined,
      claveCertificado: archivo || claveCert ? claveCert : undefined,
      probar,
    });
    setTrabajando(false);
    if (r.error) return setError(r.error);
    setClaveApi("");
    setClaveCert("");
    setArchivo(null);
    if (probar && r.conexion) {
      if (r.conexion.ok) setAviso("Guardado. La conexión con Hacienda funciona.");
      else setError("Guardado, pero la conexión con Hacienda falló: " + r.conexion.error);
    } else setAviso("Guardado.");
    await cargar();
  }

  async function quitar() {
    if (!window.confirm("¿Borrar el certificado y las claves guardadas de esta empresa? Ya no se podrá transmitir hasta configurarlos de nuevo.")) return;
    const r = await quitarCredenciales(empresaId);
    if (r.error) return setError(r.error);
    setAviso("Credenciales eliminadas.");
    await cargar();
  }

  return (
    <div className="max-w-xl mt-10">
      <h2 className="font-display text-lg font-semibold mb-1">Transmisión a Hacienda</h2>
      <p className="text-xs text-inkSoft mb-4">
        Con esto ContaCloud firma cada documento con tu certificado y lo envía a Hacienda. El certificado y las claves se guardan cifrados en el servidor
        y nunca se muestran de nuevo.
      </p>

      {estado && !estado.servidorListo && (
        <p className="text-sm bg-accent/10 border border-accent/40 rounded-sm px-3 py-2 mb-4">
          Falta configurar en Vercel la variable <strong>DTE_CLAVE_CIFRADO</strong> (cualquier texto largo y secreto, mínimo 16 caracteres) y volver a desplegar.
          Sin ella no se pueden guardar las credenciales.
        </p>
      )}

      <div className="space-y-4 bg-[#F7F4EA] border border-paperLine rounded-sm p-5">
        <div className="text-xs">
          Estado:{" "}
          {estado?.configurado ? (
            <span className="text-ledgerDark font-medium">Configurado — ambiente {NOMBRE_AMBIENTE[estado.ambiente]}</span>
          ) : (
            <span className="text-rust font-medium">Sin configurar</span>
          )}
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Ambiente</span>
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)} className={inputCls}>
            <option value="00">Pruebas (no tiene validez fiscal)</option>
            <option value="01">Producción (documentos reales)</option>
          </select>
          <span className="block text-[11px] text-inkSoft mt-0.5">Cada ambiente tiene su propio usuario y clave de API en Hacienda.</span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Usuario de la API (NIT sin guiones)</span>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} className={inputCls} placeholder="06141202931023" />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Clave de la API de Hacienda</span>
          <input type="password" value={claveApi} onChange={(e) => setClaveApi(e.target.value)} className={inputCls} autoComplete="new-password"
            placeholder={estado?.tieneClaveApi ? "Guardada — escribe solo si quieres cambiarla" : ""} />
        </label>

        <div>
          <span className="block text-xs font-medium text-inkSoft mb-1">Certificado de firma (archivo .crt que entrega Hacienda)</span>
          <input type="file" accept=".crt,.cer,.pem,.key,.xml,.txt" onChange={elegirArchivo} className="text-xs" />
          <span className="block text-[11px] text-inkSoft mt-0.5">
            {archivo ? `Seleccionado: ${archivo.nombre}` : estado?.tieneCertificado ? "Ya hay un certificado guardado. Sube otro solo para reemplazarlo." : "Aún no hay certificado."}
          </span>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Contraseña del certificado</span>
          <input type="password" value={claveCert} onChange={(e) => setClaveCert(e.target.value)} className={inputCls} autoComplete="new-password"
            placeholder={estado?.tieneCertificado && !archivo ? "Guardada — escribe solo si quieres cambiarla" : ""} />
        </label>

        {error && <p className="text-sm text-rust">{error}</p>}
        {aviso && <p className="text-sm text-ledger">{aviso}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={trabajando} onClick={() => guardar(true)}
            className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60">
            {trabajando ? "Guardando…" : "Guardar y probar conexión"}
          </button>
          <button type="button" disabled={trabajando} onClick={() => guardar(false)} className="border border-paperLine px-4 py-2 rounded-sm text-sm hover:bg-white disabled:opacity-60">
            Solo guardar
          </button>
          {estado?.configurado && (
            <button type="button" onClick={quitar} className="text-xs text-rust hover:underline ml-auto">Borrar credenciales</button>
          )}
        </div>
      </div>
    </div>
  );
}
