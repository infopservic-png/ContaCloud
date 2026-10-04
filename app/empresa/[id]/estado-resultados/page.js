"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import EncabezadoReporte from "@/components/EncabezadoReporte";
import FirmasReporte from "@/components/FirmasReporte";

function fmt(n) {
  const num = Number(n) || 0;
  return num < 0 ? `(${Math.abs(num).toFixed(2)})` : num.toFixed(2);
}

export default function EstadoResultadosPage() {
  const params = useParams();
  const empresaId = params.id;
  const [cargando, setCargando] = useState(true);
  const [empresa, setEmpresa] = useState(null);
  const [grupos, setGrupos] = useState({
    Ingreso: [],
    Costo: [],
    Gasto: [],
  });

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function cargar() {
    setCargando(true);

    const { data: emp } = await supabase
      .from("empresas")
      .select("*")
      .eq("id", empresaId)
      .single();
    setEmpresa(emp);

    const { data: cuentas } = await supabase
      .from("cuentas")
      .select("*")
      .eq("empresa_id", empresaId)
      .in("clase", ["Ingreso", "Costo", "Gasto"])
      .order("codigo");

    const { data: movimientos } = await supabase
      .from("movimientos")
      .select("*, transacciones!inner(empresa_id)")
      .eq("transacciones.empresa_id", empresaId);

    const porClase = { Ingreso: [], Costo: [], Gasto: [] };

    (cuentas || []).forEach((cuenta) => {
      const movs = (movimientos || []).filter((m) => m.cuenta_id === cuenta.id);
      if (movs.length === 0) return;
      const totalDebe = movs.reduce((s, m) => s + Number(m.debe), 0);
      const totalHaber = movs.reduce((s, m) => s + Number(m.haber), 0);
      const monto =
        cuenta.clase === "Ingreso"
          ? cuenta.tipo_saldo === "acreedor"
            ? totalHaber - totalDebe
            : -(totalDebe - totalHaber)
          : totalDebe - totalHaber;

      porClase[cuenta.clase].push({ cuenta, monto });
    });

    setGrupos(porClase);
    setCargando(false);
  }

  if (cargando) return <p className="text-inkSoft">Cargando…</p>;

  const totalIngresos = grupos.Ingreso.reduce((s, f) => s + f.monto, 0);
  const totalCostos = grupos.Costo.reduce((s, f) => s + f.monto, 0);
  const totalGastos = grupos.Gasto.reduce((s, f) => s + f.monto, 0);

  const utilidadBruta = totalIngresos - totalCostos;
  const utilidadNeta = utilidadBruta - totalGastos;

  const sinDatos =
    grupos.Ingreso.length === 0 &&
    grupos.Costo.length === 0 &&
    grupos.Gasto.length === 0;

  function Renglon({ nombre, monto, negrita }) {
    return (
      <div
        className={`flex justify-between py-1.5 px-1 ${
          negrita ? "font-semibold" : ""
        }`}
      >
        <span>{nombre}</span>
        <span className="font-num tabular">{fmt(monto)}</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <EncabezadoReporte
        empresa={empresa}
        tituloReporte="Estado de Resultados"
        onGuardado={(cambios) => setEmpresa({ ...empresa, ...cambios })}
      />

      {sinDatos ? (
        <p className="text-inkSoft text-sm text-center">
          Todavía no hay movimientos de ingresos, costos o gastos para generar
          el estado de resultados.
        </p>
      ) : (
        <>
          <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
            <div className="mb-4">
              <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-1">
                Ingresos
              </p>
              {grupos.Ingreso.map((f) => (
                <Renglon key={f.cuenta.id} nombre={f.cuenta.nombre} monto={f.monto} />
              ))}
              <div className="border-t border-paperLine mt-1">
                <Renglon nombre="Total de ingresos" monto={totalIngresos} negrita />
              </div>
            </div>

            {grupos.Costo.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-1">
                  Costo de ventas
                </p>
                {grupos.Costo.map((f) => (
                  <Renglon key={f.cuenta.id} nombre={f.cuenta.nombre} monto={f.monto} />
                ))}
                <div className="border-t border-paperLine mt-1">
                  <Renglon nombre="Total costo de ventas" monto={totalCostos} negrita />
                </div>
              </div>
            )}

            {grupos.Costo.length > 0 && (
              <div className="mb-4 border-t-2 border-ink pt-1">
                <Renglon nombre="Utilidad bruta" monto={utilidadBruta} negrita />
              </div>
            )}

            <div className="mb-4">
              <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-1">
                Gastos de operación
              </p>
              {grupos.Gasto.map((f) => (
                <Renglon key={f.cuenta.id} nombre={f.cuenta.nombre} monto={f.monto} />
              ))}
              <div className="border-t border-paperLine mt-1">
                <Renglon nombre="Total de gastos" monto={totalGastos} negrita />
              </div>
            </div>

            <div className="border-t-2 border-ink pt-2 mt-4">
              <Renglon
                nombre={utilidadNeta >= 0 ? "Utilidad neta" : "Pérdida neta"}
                monto={utilidadNeta}
                negrita
              />
            </div>
          </div>

          <FirmasReporte />
        </>
      )}
    </div>
  );
}
