"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const PESTANAS = [
  { slug: "facturacion", etiqueta: "Facturación" },
  { slug: "cuentas", etiqueta: "Catálogo de cuentas" },
  { slug: "transacciones", etiqueta: "Libro Diario" },
  { slug: "mayor", etiqueta: "Libro Mayor" },
  { slug: "balance", etiqueta: "Balance de comprobación" },
  { slug: "estado-resultados", etiqueta: "Estado de Resultados" },
  { slug: "balance-general", etiqueta: "Balance General" },
];

export default function EmpresaLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const empresaId = params.id;
  const [empresa, setEmpresa] = useState(null);

  useEffect(() => {
    async function cargar() {
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion.session) {
        router.replace("/login");
        return;
      }
      const { data, error } = await supabase
        .from("empresas")
        .select("*")
        .eq("id", empresaId)
        .single();
      if (error) {
        router.replace("/dashboard");
        return;
      }
      setEmpresa(data);
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-6 py-8">
      <header className="mb-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-xs text-inkSoft hover:text-ink underline underline-offset-2 mb-2"
        >
          ← Mis empresas
        </button>
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold">
            {empresa?.nombre || "Cargando…"}
          </h1>
          {empresa && (
            <span
              className={`text-xs px-2 py-1 rounded-sm ${
                empresa.tipo === "comercial"
                  ? "bg-brass/20 text-brassDark"
                  : "bg-ledger/20 text-ledgerDark"
              }`}
            >
              {empresa.tipo === "comercial" ? "Empresa comercial" : "Empresa de servicio"}
            </span>
          )}
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-paperLine mb-8">
        {PESTANAS.map((p) => {
          const activa = pathname?.endsWith(`/${p.slug}`);
          return (
            <button
              key={p.slug}
              onClick={() => router.push(`/empresa/${empresaId}/${p.slug}`)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                activa
                  ? "border-brass text-ink"
                  : "border-transparent text-inkSoft hover:text-ink"
              }`}
            >
              {p.etiqueta}
            </button>
          );
        })}
      </nav>

      {children}
    </main>
  );
}
