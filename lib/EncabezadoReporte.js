"use client";

import { useState } from "react";
import { useEmpresa } from "@/lib/EmpresaContext";

// Encabezado para Balance de Comprobación / Balance General:
// muestra y permite editar la moneda de presentación, y un campo de
// fecha de corte ("Al [fecha]").
export function EncabezadoAlFecha({ fechaCorte, onFechaCorte }) {
  const { empresa, actualizarEmpresa } = useEmpresa();
  const [moneda, setMoneda] = useState(empresa?.moneda || "");

  async function guardarMoneda() {
    if (moneda !== empresa?.moneda) {
      await actualizarEmpresa({ moneda });
    }
  }

  return (
    <div className="mb-4 text-sm no-print space-y-3 max-w-xl">
      <div>
        <label className="block text-xs font-medium text-inkSoft mb-1">
          Fecha de corte (Al)
        </label>
        <input
          type="date"
          value={fechaCorte}
          onChange={(e) => onFechaCorte(e.target.value)}
          className="w-full sm:w-64 border border-paperLine rounded-sm px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-inkSoft mb-1">
          Moneda de presentación
        </label>
        <input
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          onBlur={guardarMoneda}
          placeholder="Ej. Dólares de los Estados Unidos de América (US$)"
          className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}

// Encabezado para Estado de Resultados: rango de fechas + moneda.
export function EncabezadoRango({ fechaInicio, fechaFin, onFechaInicio, onFechaFin }) {
  const { empresa, actualizarEmpresa } = useEmpresa();
  const [moneda, setMoneda] = useState(empresa?.moneda || "");

  async function guardarMoneda() {
    if (moneda !== empresa?.moneda) {
      await actualizarEmpresa({ moneda });
    }
  }

  return (
    <div className="mb-4 text-sm no-print space-y-3 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
        <div>
          <label className="block text-xs font-medium text-inkSoft mb-1">Del</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => onFechaInicio(e.target.value)}
            className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-inkSoft mb-1">Al</label>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => onFechaFin(e.target.value)}
            className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-inkSoft mb-1">
          Moneda de presentación
        </label>
        <input
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          onBlur={guardarMoneda}
          placeholder="Ej. Dólares de los Estados Unidos de América (US$)"
          className="w-full border border-paperLine rounded-sm px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}

// Línea de texto para el título impreso: "[Empresa] — [Moneda] — Al/Del..[fecha(s)]"
export function tituloPeriodo({ fechaCorte, fechaInicio, fechaFin }) {
  if (fechaInicio || fechaFin) {
    return `Del ${fechaInicio || "…"} al ${fechaFin || "…"}`;
  }
  if (fechaCorte) return `Al ${fechaCorte}`;
  return "";
}

// Firmas al pie de cada estado financiero: Representante Legal, Contador, Auditor.
// Cada nombre es editable y se guarda en la empresa; en pantalla se ve el campo,
// al imprimir se ve solo la línea de firma con el nombre debajo.
export function FirmasEstadosFinancieros() {
  const { empresa, actualizarEmpresa } = useEmpresa();
  const [nombres, setNombres] = useState({
    representante_legal: empresa?.representante_legal || "",
    contador: empresa?.contador || "",
    auditor: empresa?.auditor || "",
  });

  async function guardar(campo) {
    if (nombres[campo] !== (empresa?.[campo] || "")) {
      await actualizarEmpresa({ [campo]: nombres[campo] });
    }
  }

  const campos = [
    { key: "representante_legal", label: "Representante Legal" },
    { key: "contador", label: "Contador" },
    { key: "auditor", label: "Auditor" },
  ];

  return (
    <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-2xl">
      {campos.map((c) => (
        <div key={c.key} className="text-center">
          <input
            value={nombres[c.key]}
            onChange={(e) => setNombres({ ...nombres, [c.key]: e.target.value })}
            onBlur={() => guardar(c.key)}
            placeholder="Nombre completo"
            className="no-print w-full border border-paperLine rounded-sm px-2 py-1 text-sm text-center mb-2"
          />
          <div className="border-t border-ink pt-1">
            <p className="text-sm">{nombres[c.key] || "\u00A0"}</p>
            <p className="text-xs text-inkSoft">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
