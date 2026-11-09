"use client";

import { useEmpresa } from "@/lib/EmpresaContext";
import { DescargarRespaldo, RestaurarRespaldo } from "@/components/RespaldoEmpresa";
import Link from "next/link";

export default function RespaldoPage() {
  const { empresa } = useEmpresa();
  return (
    <div className="space-y-8 max-w-2xl">
      <section>
        <h2 className="font-display text-lg font-semibold mb-1">Copia de seguridad</h2>
        <p className="text-xs text-inkSoft mb-3">
          Descarga un archivo con todo lo de esta empresa: catálogo, partidas, ventas, compras, kardex, cuentas por cobrar y pagar, bancos, activo fijo, planillas y documentos DTE.
          Guárdalo en un lugar seguro.
        </p>
        <DescargarRespaldo empresa={empresa} />
      </section>
      <section>
        <h2 className="font-display text-lg font-semibold mb-1">Restaurar una copia</h2>
        <p className="text-xs text-inkSoft mb-3">
          La copia se restaura como una empresa nueva; no modifica esta ni ninguna otra empresa. La encontrarás en tu <Link href="/dashboard" className="underline text-accentDark">panel de empresas</Link>.
        </p>
        <RestaurarRespaldo />
      </section>
    </div>
  );
}
