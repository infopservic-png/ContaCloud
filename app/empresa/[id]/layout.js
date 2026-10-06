"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { EmpresaContext } from "@/lib/EmpresaContext";
import Marca from "@/components/Marca";

const TABS = [
  { href: "cuentas", label: "Cuentas" },
  { href: "transacciones", label: "Diario" },
  { href: "mayor", label: "Mayor" },
  { href: "ventas", label: "Ventas" },
  { href: "compras", label: "Compras" },
  { href: "facturacion", label: "Facturación DTE" },
  { href: "kardex", label: "Kardex" },
  { href: "cxc", label: "Cuentas por Cobrar" },
  { href: "cxp", label: "Cuentas por Pagar" },
  { href: "bancos", label: "Bancos" },
  { href: "balance", label: "Balance de Comprobación" },
  { href: "resultados", label: "Estado de Resultados" },
  { href: "balance-general", label: "Balance General" },
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

        <nav className="flex flex-wrap gap-1 border-b border-paperLine mb-8 no-print">
          {TABS.map((tab) => {
            const activa = pathname?.endsWith(`/${tab.href}`);
            return (
              <Link
                key={tab.href}
                href={`/empresa/${empresaId}/${tab.href}`}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activa
                    ? "border-accent text-ink"
                    : "border-transparent text-inkSoft hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
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
