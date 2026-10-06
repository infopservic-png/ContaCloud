"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePerfil } from "@/lib/PerfilContext";
import { COLORES_ORIGINALES, normalizarHex, variablesTema, avisoColorPrimario } from "@/lib/colores";
import { reducirLogo, TIPOS_LOGO } from "@/lib/logo";

const inputCls = "w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm";
const labelCls = "block text-xs font-medium text-inkSoft mb-1";

function CampoColor({ etiqueta, ayuda, valor, onChange, original }) {
  const hex = normalizarHex(valor);
  return (
    <div>
      <label className={labelCls}>{etiqueta}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${etiqueta} (selector de color)`}
          value={hex || original}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-12 p-0.5 border border-paperLine rounded-sm cursor-pointer"
        />
        <input
          aria-label={`${etiqueta} (código)`}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={original}
          maxLength={7}
          className={`${inputCls} w-28 font-num uppercase`}
        />
        {valor && (
          <button type="button" onClick={() => onChange("")} className="text-xs text-inkSoft hover:underline">
            Usar el original
          </button>
        )}
      </div>
      <p className="text-xs text-inkSoft mt-1">{ayuda}</p>
      {valor && !hex && <p className="text-xs text-rust mt-1">Escribe un color con 6 dígitos, por ejemplo {original}.</p>}
    </div>
  );
}

export default function PerfilPage() {
  const router = useRouter();
  const { perfil, usuario, cargando, guardarPerfil } = usePerfil();
  const [nombre, setNombre] = useState("");
  const [primario, setPrimario] = useState("");
  const [acento, setAcento] = useState("");
  const [logo, setLogo] = useState(null);
  const [inicializado, setInicializado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [procesandoLogo, setProcesandoLogo] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  useEffect(() => {
    if (!cargando && !usuario) router.replace("/login");
  }, [cargando, usuario, router]);

  useEffect(() => {
    if (!cargando && !inicializado) {
      setNombre(perfil?.nombre_marca || "");
      setPrimario(perfil?.color_primario || "");
      setAcento(perfil?.color_acento || "");
      setLogo(perfil?.logo || null);
      setInicializado(true);
    }
  }, [cargando, perfil, inicializado]);

  async function elegirLogo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    setExito(null);
    setProcesandoLogo(true);
    try {
      setLogo(await reducirLogo(archivo));
    } catch (err) {
      setError(err.message || "No se pudo usar esa imagen.");
    }
    setProcesandoLogo(false);
  }

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    setExito(null);
    if (primario && !normalizarHex(primario)) return setError("El color principal no es válido.");
    if (acento && !normalizarHex(acento)) return setError("El color de acento no es válido.");
    if (nombre.trim().length > 60) return setError("El nombre de la marca admite hasta 60 caracteres.");
    setGuardando(true);
    const res = await guardarPerfil({
      nombre_marca: nombre.trim() || null,
      color_primario: normalizarHex(primario) || null,
      color_acento: normalizarHex(acento) || null,
      logo: logo || null,
    });
    setGuardando(false);
    if (res.error) return setError(res.error);
    setExito("Listo: tu marca ya se aplica en todo el sistema.");
  }

  if (cargando || !usuario) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-inkSoft">Cargando…</p>
      </main>
    );
  }

  // La vista previa usa los mismos estilos del sistema, con los colores que se están eligiendo
  const tema = variablesTema({
    primario: normalizarHex(primario) || COLORES_ORIGINALES.primario,
    acento: normalizarHex(acento) || COLORES_ORIGINALES.acento,
  });
  const aviso = avisoColorPrimario(primario);

  return (
    <main className="min-h-screen px-6 py-10 max-w-3xl mx-auto">
      <Link href="/dashboard" className="text-xs text-inkSoft hover:text-ink underline underline-offset-2">
        ← Mis empresas
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1">Mi perfil</h1>
      <p className="text-inkSoft text-sm mb-8">{usuario.email}</p>

      <form onSubmit={guardar} className="space-y-8">
        <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 space-y-5">
          <h2 className="font-display text-base font-semibold">Mi marca</h2>
          <div>
            <label className={labelCls} htmlFor="nombre-marca">Nombre de mi marca</label>
            <input
              id="nombre-marca"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ContaCloud"
              maxLength={60}
              className={inputCls}
            />
            <p className="text-xs text-inkSoft mt-1">Reemplaza el nombre «ContaCloud» en el encabezado del sistema.</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="logo-marca">Logo</label>
            <div className="flex items-center gap-4">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo actual" className="h-14 w-auto max-w-[200px] object-contain border border-paperLine rounded-sm bg-white p-1" />
              ) : (
                <span className="text-xs text-inkSoft">Sin logo</span>
              )}
              <input
                id="logo-marca"
                type="file"
                accept={TIPOS_LOGO.join(",")}
                onChange={elegirLogo}
                disabled={procesandoLogo}
                className="text-xs"
              />
              {logo && (
                <button type="button" onClick={() => setLogo(null)} className="text-xs text-rust hover:underline">
                  Quitar logo
                </button>
              )}
            </div>
            <p className="text-xs text-inkSoft mt-1">
              PNG, JPG o WebP. Se reduce solo para que pese poco; un fondo transparente (PNG) se conserva.
            </p>
          </div>
        </section>

        <section className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6 space-y-5">
          <h2 className="font-display text-base font-semibold">Colores del sistema</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <CampoColor
              etiqueta="Color corporativo"
              ayuda="Botones principales y encabezados de tablas."
              valor={primario}
              onChange={setPrimario}
              original={COLORES_ORIGINALES.primario}
            />
            <CampoColor
              etiqueta="Color de acento"
              ayuda="Enlaces, insignias y detalles."
              valor={acento}
              onChange={setAcento}
              original={COLORES_ORIGINALES.acento}
            />
          </div>
          {aviso && <p className="text-xs text-brandDark">{aviso}</p>}
          <p className="text-xs text-inkSoft">
            El color del texto se ajusta solo (claro u oscuro) para que siempre se lea bien sobre tu color.
          </p>

          <div>
            <p className={labelCls}>Vista previa</p>
            <div style={tema} className="border border-paperLine rounded-sm overflow-hidden" data-testid="vista-previa">
              <div className="bg-brand text-onBrand px-4 py-3 flex items-center gap-3 font-display font-semibold">
                {logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="h-7 w-auto max-w-[140px] object-contain" />
                )}
                <span>{nombre.trim() || "ContaCloud"}</span>
              </div>
              <div className="bg-[#F7F4EA] p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="bg-brand text-onBrand hover:bg-brandDark px-4 py-2 rounded-sm text-sm font-medium">
                    Botón principal
                  </span>
                  <span className="text-accentDark underline text-sm">Enlace de acento</span>
                  <span className="bg-accent/20 text-accentDark text-xs px-2 py-1 rounded-sm">Insignia</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-brand text-onBrand text-left">
                      <th className="px-3 py-1.5 font-medium">Cuenta</th>
                      <th className="px-3 py-1.5 font-medium text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-paperLine">
                      <td className="px-3 py-1.5">Caja general</td>
                      <td className="px-3 py-1.5 text-right font-num">$ 1,250.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <p className="text-xs text-inkSoft">
          Tu marca se ve solo dentro del sistema. Los reportes impresos y los documentos tributarios (DTE) conservan su
          formato.
        </p>

        {error && <p className="text-sm text-rust">{error}</p>}
        {exito && <p className="text-sm text-ledger">{exito}</p>}
        <button
          type="submit"
          disabled={guardando || procesandoLogo}
          className="bg-brand text-onBrand px-5 py-2 rounded-sm text-sm font-medium hover:bg-brandDark disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar perfil"}
        </button>
      </form>
    </main>
  );
}
