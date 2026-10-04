"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function MayorPage() {
  const params = useParams();
  const empresaId = params.id;
  const [cargando, setCargando] = useState(true);
  const [mayor, setMayor] = useState([]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function cargar() {
    setCargando(true);
    const { data: cuentas } = await supabase
      .from("cuentas")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("codigo");

    const { data: movimientos } = await supabase
      .from("movimientos")
      .select("*, transacciones!inner(empresa_id, numero_partida, fecha, descripcion)")
      .eq("transacciones.empresa_id", empresaId)
      .order("numero_partida", { referencedTable: "transacciones" });

    const agrupado = (cuentas || []).map((cuenta) => {
      const movs = (movimientos || [])
        .filter((m) => m.cuenta_id === cuenta.id)
        .map((m) => ({
          debe: Number(m.debe),
          haber: Number(m.haber),
          numero_partida: m.transacciones.numero_partida,
          descripcion: m.transacciones.descripcion,
          fecha: m.transacciones.fecha,
        }))
        .sort((a, b) => a.numero_partida - b.numero_partida);

      const totalDebe = movs.reduce((s, m) => s + m.debe, 0);
      const totalHaber = movs.reduce((s, m) => s + m.haber, 0);
      const saldo =
        cuenta.tipo_saldo === "deudor"
          ? totalDebe - totalHaber
          : totalHaber - totalDebe;

      return { cuenta, movimientos: movs, totalDebe, totalHaber, saldo };
    });

    setMayor(agrupado);
    setCargando(false);
  }

  if (cargando) return <p className="text-inkSoft">Cargando…</p>;

  const conMovimientos = mayor.filter((c) => c.movimientos.length > 0);

  if (conMovimientos.length === 0) {
    return (
      <p className="text-inkSoft text-sm">
        Todavía no hay movimientos. Registra partidas en el Libro Diario para
        ver aquí las cuentas T.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {conMovimientos.map(({ cuenta, movimientos, totalDebe, totalHaber, saldo }) => (
        <div
          key={cuenta.id}
          className="bg-[#F7F4EA] border border-paperLine rounded-sm overflow-hidden"
        >
          <div className="px-4 py-2 border-b border-paperLine bg-paperLine/20">
            <span className="text-sm font-medium">
              {cuenta.codigo} — {cuenta.nombre}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-inkSoft border-b border-paperLine">
                <th className="text-right px-3 py-1.5 font-medium w-1/2 border-r border-paperLine">
                  Debe
                </th>
                <th className="text-right px-3 py-1.5 font-medium w-1/2">Haber</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({
                length: Math.max(
                  movimientos.filter((m) => m.debe > 0).length,
                  movimientos.filter((m) => m.haber > 0).length,
                  1
                ),
              }).map((_, i) => {
                const debes = movimientos.filter((m) => m.debe > 0);
                const haberes = movimientos.filter((m) => m.haber > 0);
                return (
                  <tr key={i} className="border-b border-paperLine">
                    <td className="text-right px-3 py-1 font-num tabular border-r border-paperLine">
                      {debes[i] ? debes[i].debe.toFixed(2) : ""}
                    </td>
                    <td className="text-right px-3 py-1 font-num tabular">
                      {haberes[i] ? haberes[i].haber.toFixed(2) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink text-sm">
                <td className="text-right px-3 py-1.5 font-num tabular font-semibold border-r border-paperLine">
                  {totalDebe.toFixed(2)}
                </td>
                <td className="text-right px-3 py-1.5 font-num tabular font-semibold">
                  {totalHaber.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="px-4 py-2 bg-paperLine/10 text-xs flex justify-between">
            <span className="text-inkSoft">Saldo ({cuenta.tipo_saldo})</span>
            <span className="font-num tabular font-semibold">
              {saldo < 0 ? "(" + Math.abs(saldo).toFixed(2) + ")" : saldo.toFixed(2)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
