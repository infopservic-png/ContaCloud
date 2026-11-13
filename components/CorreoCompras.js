"use client";

import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";
import { estadoCorreo, guardarCorreo, quitarCorreo } from "@/lib/transmisionDte";

const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm bg-white";
const SERVIDORES = [
  { host: "imap.gmail.com", etiqueta: "Gmail / Google Workspace" },
  { host: "outlook.office365.com", etiqueta: "Outlook / Microsoft 365" },
  { host: "imap.mail.yahoo.com", etiqueta: "Yahoo" },
  { host: "", etiqueta: "Otro (escribir servidor)" },
];

export default function CorreoCompras() {
  const { empresaId } = useEmpresa();
  const [estado, setEstado] = useState(null);
  const [host, setHost] = useState("imap.gmail.com");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [carpeta, setCarpeta] = useState("INBOX");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function cargar() {
    const e = await estadoCorreo(empresaId);
    if (e.error) return setError(e.error);
    setEstado(e);
    setHost(e.host);
    setUsuario(e.usuario);
    setCarpeta(e.carpeta);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [empresaId]);

  async function guardar() {
    setError(null); setAviso(null); setTrabajando(true);
    const r = await guardarCorreo({ empresaId, host, usuario, clave: clave || undefined, carpeta });
    setTrabajando(false);
    if (r.error) return setError(r.error);
    setClave("");
    setAviso("Conectado. Ya puedes usar «Traer del correo» en Importar DTE.");
    await cargar();
  }
  async function quitar() {
    if (!window.confirm("¿Desconectar el correo de esta empresa? Se borra la contraseña guardada.")) return;
    const r = await quitarCorreo(empresaId);
    if (r.error) return setError(r.error);
    setAviso("Correo desconectado.");
    await cargar();
  }

  const conocido = SERVIDORES.some((s) => s.host === host && s.host);
  return (
    <div className="max-w-xl mt-10">
      <h2 className="font-display text-lg font-semibold mb-1">Correo de compras</h2>
      <p className="text-xs text-inkSoft mb-4">
        Conecta el buzón donde te llegan los DTE de tus compras. En «Importar DTE → Traer del correo» ContaCloud lee los JSON adjuntos y los deja listos para que
        confirmes antes de registrarlos. Solo se leen correos; no se borra ni se modifica nada. La contraseña se guarda cifrada.
      </p>
      <div className="space-y-4 bg-[#F7F4EA] border border-paperLine rounded-sm p-5">
        <div className="text-xs">
          Estado: {estado?.configurado ? <span className="text-ledgerDark font-medium">Conectado a {estado.usuario}{estado.ultimaRevision ? ` — última revisión ${new Date(estado.ultimaRevision).toLocaleString("es-SV")}` : ""}</span> : <span className="text-rust font-medium">Sin conectar</span>}
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Proveedor de correo</span>
          <select value={conocido ? host : ""} onChange={(e) => setHost(e.target.value)} className={inputCls}>
            {SERVIDORES.map((s) => <option key={s.etiqueta} value={s.host}>{s.etiqueta}</option>)}
          </select>
        </label>
        {!conocido && (
          <label className="block">
            <span className="block text-xs font-medium text-inkSoft mb-1">Servidor IMAP</span>
            <input value={host} onChange={(e) => setHost(e.target.value)} className={inputCls} placeholder="imap.midominio.com" />
          </label>
        )}
        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Correo</span>
          <input type="email" value={usuario} onChange={(e) => setUsuario(e.target.value)} className={inputCls} autoComplete="off" placeholder="compras@miempresa.com" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Contraseña de aplicación</span>
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} className={inputCls} autoComplete="new-password"
            placeholder={estado?.configurado ? "Guardada — escribe solo si quieres cambiarla" : "16 letras que genera Google"} />
          <span className="block text-[11px] text-inkSoft mt-0.5">
            Gmail: Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones. No uses tu contraseña normal.
          </span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-inkSoft mb-1">Carpeta o etiqueta a revisar</span>
          <input value={carpeta} onChange={(e) => setCarpeta(e.target.value)} className={inputCls} placeholder="INBOX" />
          <span className="block text-[11px] text-inkSoft mt-0.5">Por defecto, la bandeja de entrada. Puedes crear una etiqueta «Compras» en Gmail y escribir su nombre aquí.</span>
        </label>
        {error && <p className="text-sm text-rust">{error}</p>}
        {aviso && <p className="text-sm text-ledger">{aviso}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={trabajando} onClick={guardar} className="bg-brand text-onBrand px-4 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60">
            {trabajando ? "Probando conexión…" : "Guardar y probar"}
          </button>
          {estado?.configurado && <button type="button" onClick={quitar} className="text-xs text-rust hover:underline ml-auto">Desconectar</button>}
        </div>
      </div>
    </div>
  );
}
