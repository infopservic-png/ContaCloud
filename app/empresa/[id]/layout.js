"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { EmpresaContext } from "@/lib/EmpresaContext";
import Marca from "@/components/Marca";

// Menú agrupado (como las secciones del SAC).
const GRUPOS = [
  {
    id: "contabilidad",
    label: "Contabilidad",
    items: [
      { href: "cuentas", label: "Cuentas" },
      { href: "transacciones", label: "Libro diario" },
      { href: "mayor", label: "Mayor" },
      { href: "balance", label: "Balance de comprobación" },
      { href: "resultados", label: "Estado de resultados" },
      { href: "balance-general", label: "Balance general" },
      { href: "bancos", label: "Bancos" },
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
      { href: "importar", label: "Importar DTE" },
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
