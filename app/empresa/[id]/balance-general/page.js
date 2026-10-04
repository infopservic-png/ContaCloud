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

export default function BalanceGeneralPage() {
  const params = useParams();
  const empresaId = params.id;
  const [cargando, setCargando] = useState(true);
  const [empresa, setEmpresa] = useState(null);
  const [activos, setActivos] = useState([]);
  const [pasivos, setPasivos] = useState([]);
  const [capitales, setCapitales] = useState([]);
  const [utilidadDelEjercicio, setUtilidadDelEjercicio] = useState(0);

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
      .order("codigo");

    const { data: movimientos } = await supabase
      .from("movimientos")
      .select("*, transacciones!inner(empresa_id)")
      .eq("transacciones.empresa_id", empresaId);

    const act = [];
    const pas = [];
    const cap = [];
    let ingresos = 0;
    let costos = 0;
    let gastos = 0;

    (cuentas || []).forEach((cuenta) => {
      const movs = (movimientos || []).filter((m) => m.cuenta_id === cuenta.id);
      if (movs.length === 0) return;
      const totalDebe = movs.reduce((s, m) => s + Number(m.debe), 0);
      const totalHaber = movs.reduce((s, m) => s + Number(m.haber), 0);

      if (cuenta.clase === "Activo") {
        act.push({ cuenta, monto: totalDebe - totalHaber });
      } else if (cuenta.clase === "Pasivo") {
        pas.push({ cuenta, monto: totalHaber - totalDebe });
      } else if (cuenta.clase === "Capital") {
        cap.push({ cuenta, monto: totalHaber - totalDebe });
      } else if (cuenta.clase === "Ingreso") {
        ingresos +=
          cuenta.tipo_saldo === "acreedor"
            ? totalHaber - totalDebe
            : -(totalDebe - totalHaber);
      } else if (cuenta.clase === "Costo") {
        costos += totalDebe - totalHaber;
      } else if (cuenta.clase === "Gasto") {
        gastos += totalDebe - totalHaber;
      }
    });

    setActivos(act);
    setPasivos(pas);
    setCapitales(cap);
    setUtilidadDelEjercicio(ingresos - costos - gastos);
    setCargando(false);
  }

  if (cargando) return <p className="text-inkSoft">Cargando…</p>;

  const totalActivo = activos.reduce((s, f) => s + f.monto, 0);
  const totalPasivo = pasivos.reduce((s, f) => s + f.monto, 0);
  const totalCapitalSocios = capitales.reduce((s, f) => s + f.monto, 0);
  const totalCapital = totalCapitalSocios + utilidadDelEjercicio;
  const totalPasivoMasCapital = totalPasivo + totalCapital;
  const cuadra = Math.abs(totalActivo - totalPasivoMasCapital) < 0.005;
  const sinDatos = activos.length === 0 && pasivos.length === 0 && capitales.length === 0;

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
    <div className="max-w-3xl mx-auto">
      <EncabezadoReporte
        empresa={empresa}
        tituloReporte="Balance General"
        onGuardado={(cambios) => setEmpresa({ ...empresa, ...cambios })}
      />

      {sinDatos ? (
        <p className="text-inkSoft text-sm text-center">
          Todavía no hay movimientos para generar el balance general.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
              <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">
                Activo
              </p>
              {activos.map((f) => (
                <Renglon key={f.cuenta.id} nombre={f.cuenta.nombre} monto={f.monto} />
              ))}
              <div className="border-t-2 border-ink mt-2 pt-1">
                <Renglon nombre="Total Activo" monto={totalActivo} negrita />
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
                <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">
                  Pasivo
                </p>
                {pasivos.length === 0 ? (
                  <p className="text-sm text-inkSoft italic">Sin pasivos registrados</p>
                ) : (
                  pasivos.map((f) => (
                    <Renglon key={f.cuenta.id} nombre={f.cuenta.nombre} monto={f.monto} />
                  ))
                )}
                <div className="border-t border-paperLine mt-1 pt-1">
                  <Renglon nombre="Total Pasivo" monto={totalPasivo} negrita />
                </div>
              </div>

              <div className="bg-[#F7F4EA] border border-paperLine rounded-sm p-6">
                <p className="text-xs font-semibold text-inkSoft uppercase tracking-wide mb-2">
                  Capital
                </p>
                {capitales.map((f) => (
                  <Renglon key={f.cuenta.id} nombre={f.cuenta.nombre} monto={f.monto} />
                ))}
                <Renglon
                  nombre={
                    utilidadDelEjercicio >= 0
                      ? "Utilidad del ejercicio"
                      : "Pérdida del ejercicio"
                  }
                  monto={utilidadDelEjercicio}
                />
                <div className="border-t border-paperLine mt-1 pt-1">
                  <Renglon nombre="Total Capital" monto={totalCapital} negrita />
                </div>
              </div>

              <div className="bg-ink text-paper rounded-sm p-4">
                <Renglon
                  nombre="Total Pasivo + Capital"
                  monto={totalPasivoMasCapital}
                  negrita
                />
              </div>
            </div>
          </div>

          <div
            className={`text-sm px-4 py-2 rounded-sm inline-block mt-6 ${
              cuadra ? "bg-ledger/20 text-ledgerDark" : "bg-rust/10 text-rust"
            }`}
          >
            {cuadra
              ? "El balance cuadra: Activo = Pasivo + Capital ✓"
              : `Diferencia de ${Math.abs(totalActivo - totalPasivoMasCapital).toFixed(2)} — revisa las partidas del Diario.`}
          </div>

          <FirmasReporte />
        </>
      )}
    </div>
  );
}
