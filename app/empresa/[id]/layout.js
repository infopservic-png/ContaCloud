"use client";

import AvisoLicencia from "@/components/AvisoLicencia";
import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { EmpresaContext } from "@/lib/EmpresaContext";
import Marca from "@/components/Marca";

// Íconos de línea simples (24x24, stroke="currentColor") para los grupos
// principales del menú. Un solo componente genérico leyendo un "path" por id
// evita repetir el <svg> completo en cada botón.
const ICONO_PATHS = {
  // Libro abierto (Contabilidad)
  contabilidad:
    "M3 5.5c2.2-1 4.8-1 7 0v13c-2.2-1-4.8-1-7 0v-13zM21 5.5c-2.2-1-4.8-1-7 0v13c2.2-1 4.8-1 7 0v-13z",
  // Recibo con porcentaje (Impuestos)
  impuestos:
    "M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3zM9 8h1.5M13.5 16H15M9 16l6-8",
  // Edificio de banco con columnas (Bancos)
  bancos:
    "M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 21h18M4 10h16",
  // Camión/equipo (Activo fijo): caja con ruedas
  activos:
    "M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM17 19a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z",
  // Persona con tarjeta (Recursos humanos)
  rrhh:
    "M12 11a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM5.5 20c.4-3.3 3.2-5.4 6.5-5.4s6.1 2.1 6.5 5.4M3 3h18v18H3z",
  // Dos personas (Socios de negocios)
  socios:
    "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.7-5 6-5s6 2 6 5M17.5 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM15 20c.3-2.3 2.3-4 4.5-4s4.2 1.7 4.5 4",
};

function IconoGrupo({ id }) {
  const d = ICONO_PATHS[id];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-[-2px] mr-1.5"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

// Menú agrupado (como las secciones del SAC).
const GRUPOS = [
  {
    id: "contabilidad",
    label: "Contabilidad",
    items: [
      { href: "cuentas", label: "Cuentas" },
      { href: "transacciones", label: "Libro diario" },
      { href: "contabilizar", label: "Contabilizar" },
      { href: "mayor", label: "Mayor" },
      { href: "movimiento-cuentas", label: "Movimiento de cuentas" },
      { href: "balance", label: "Balance de comprobación" },
      { href: "resultados", label: "Estado de resultados" },
      { href: "balance-general", label: "Balance general" },
      { href: "kardex", label: "Kardex" },
    ],
  },
  {
    id: "impuestos",
    label: "Impuestos",
    items: [
      { href: "compras", label: "Compras" },
      { href: "ventas", label: "Ventas" },
      { href: "facturacion", label: "Facturación DTE" },
      { href: "libros", label: "Libros de IVA" },
      { href: "anexo-iva-contribuyentes", label: "Anexo ventas contribuyentes" },
      { href: "anexo-iva-consumidor", label: "Anexo ventas consumidor" },
      { href: "anexo-iva-compras", label: "Anexo compras" },
      { href: "anexo-iva-sujetos-excluidos", label: "Casilla 66 sujetos excluidos" },
      { href: "importar", label: "Importar DTE" },
    ],
  },
  {
    id: "bancos",
    label: "Bancos",
    items: [
      { href: "bancos", label: "Bancos" },
      { href: "transacciones-bancarias", label: "Transacciones" },
    ],
  },
  {
    id: "activos",
    label: "Activo fijo",
    items: [{ href: "activos-fijos", label: "Propiedad, planta y equipo" }],
  },
  {
    id: "rrhh",
    label: "Recursos humanos",
    items: [
      { href: "empleados", label: "Empleados" },
      { href: "planillas", label: "Planillas" },
      { href: "anexo-f14", label: "Anexo F14" },
      { href: "anexo-q25", label: "Anexo Q25" },
      { href: "rrhh-config", label: "Configuración" },
    ],
  },
  {
    id: "socios",
    label: "Socios de negocios",
    items: [
      { href: "clientes", label: "Clientes" },
      { href: "cxc", label: "Cuentas por cobrar" },
      { href: "proveedores", label: "Proveedores" },
      { href: "cxp", label: "Cuentas por pagar" },
    ],
  },
];

export default function EmpresaLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const empresaId = params.id;

  const [empresa, setEmpresa] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [usuarioId, setUsuarioId] = useState(null);
  const [grupoElegido, setGrupoElegido] = useState(null);
  // El grupo activo sigue a la página abierta; al pulsar un grupo se muestra ese.
  const grupoDePagina = GRUPOS.find((g) => g.items.some((i) => pathname?.endsWith(`/${i.href}`)));
  const grupoActivo = GRUPOS.find((g) => g.id === grupoElegido) || grupoDePagina || GRUPOS[0];

  const recargarCuentas = useCallback(async () => {
    const { data, error } = await supabase
      .from("cuentas")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("codigo");
    if (!error) setCuentas(data || []);
    return { data, error };
  }, [empresaId]);

  const actualizarEmpresa = useCallback(
    async (cambios) => {
      const { data, error } = await supabase
        .from("empresas")
        .update(cambios)
        .eq("id", empresaId)
        .select()
        .single();
      if (!error && data) setEmpresa(data);
      return { data, error };
    },
    [empresaId]
  );

  useEffect(() => {
    setGrupoElegido(null);
  }, [pathname]);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion.session) {
        router.replace("/login");
        return;
      }
      setUsuarioId(sesion.session.user.id);

      const { data: emp, error: errEmpresa } = await supabase
        .from("empresas")
        .select("*")
        .eq("id", empresaId)
        .single();

      if (!activo) return;

      if (errEmpresa || !emp) {
        // No existe o no pertenece al usuario (RLS lo bloquea)
        router.replace("/dashboard");
        return;
      }

      setEmpresa(emp);

      const { data: cts, error: errCuentas } = await supabase
        .from("cuentas")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("codigo");

      if (!activo) return;

      if (errCuentas) {
        setErrorCarga(errCuentas.message);
      } else {
        setCuentas(cts || []);
      }
      setCargando(false);
    }

    cargar();
    return () => {
      activo = false;
    };
  }, [empresaId, router]);

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-inkSoft">Cargando…</p>
      </main>
    );
  }

  return (
    <EmpresaContext.Provider
      value={{ empresa, cuentas, empresaId, recargarCuentas, actualizarEmpresa }}
    >
      <main className="min-h-screen px-6 py-8 max-w-5xl mx-auto">
        {usuarioId && empresa?.user_id && usuarioId !== empresa.user_id && (
          <div className="no-print mb-6 bg-accent/10 border border-accent/40 rounded-sm px-4 py-2 text-sm">
            Estás viendo esta empresa en modo administrador (solo lectura) —
            pertenece a {empresa.propietario_email || "otro usuario"}.
          </div>
        )}
        <AvisoLicencia />
        <header className="flex items-center justify-between mb-6 no-print">
          <div>
            <Link
              href="/dashboard"
              className="text-xs text-inkSoft hover:text-ink underline underline-offset-2"
            >
              ← Mis empresas
            </Link>
            <h1 className="font-display text-2xl font-semibold mt-1">
              {empresa?.nombre}
            </h1>
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded-sm mt-1 ${
                empresa?.tipo === "comercial"
                  ? "bg-accent/20 text-accentDark"
                  : "bg-ledger/20 text-ledgerDark"
              }`}
            >
              {empresa?.tipo === "comercial" ? "Comercial" : "Servicio"}
            </span>
          </div>
          <div className="text-right">
            <div className="font-display text-sm font-semibold text-inkSoft">
              <Marca tamano="sm" />
            </div>
            <Link href="/perfil" className="text-xs text-accentDark hover:underline">
              Mi perfil
            </Link>
          </div>
        </header>

        <nav className="mb-8 no-print border border-[#5d6673] bg-[#ECE9E1] shadow-[2px_2px_0_rgba(31,42,60,0.22)]">
          {/* Menú principal */}
          <div className="flex flex-wrap bg-[#DAD7CD] border-b border-[#a9a496]">
            {GRUPOS.map((g) => {
              const activo = g.id === grupoActivo.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGrupoElegido(g.id)}
                  className={`px-5 py-2 text-sm font-semibold border-r border-[#a9a496] transition-colors ${
                    activo ? "bg-brand text-onBrand" : "text-ink hover:bg-[#E8E5DB]"
                  }`}
                >
                  <IconoGrupo id={g.id} />
                  {g.label}
                </button>
              );
            })}
          </div>
          {/* Opciones del grupo */}
          <div className="flex flex-wrap gap-1.5 p-2">
            {grupoActivo.items.map((tab) => {
              const activa = pathname?.endsWith(`/${tab.href}`);
              return (
                <Link
                  key={tab.href}
                  href={`/empresa/${empresaId}/${tab.href}`}
                  className={`sac-btn !py-1 ${activa ? "sac-btn-primario font-medium" : ""}`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {errorCarga && (
          <p className="text-sm text-rust mb-4">
            No se pudieron cargar las cuentas: {errorCarga}
          </p>
        )}

        {children}
      </main>
    </EmpresaContext.Provider>
  );
}
