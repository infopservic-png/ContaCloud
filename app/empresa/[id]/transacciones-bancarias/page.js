"use client";

import { useState } from "react";
import PanelBancoTx from "@/components/PanelBancoTx";
import LibroBancos from "@/components/LibroBancos";
import Conciliacion from "@/components/Conciliacion";

// Pestañas internas del módulo de Transacciones bancarias. Cada una de
// tipo "panel" usa PanelBancoTx con un único tipo de movimiento; "libro"
// y "conciliacion" son reportes aparte, sin formulario de registro.
const PESTANAS = [
  {
    id: "deposito",
    label: "Remesas",
    render: () => (
      <PanelBancoTx
        tipos={["deposito"]}
        titulo="Remesas"
        descripcion="Depósitos de efectivo o cheques al banco (cobros recibidos). Cada remesa genera su partida de Remesas."
      />
    ),
  },
  {
    id: "nota_cargo",
    label: "Notas de Cargo",
    render: () => (
      <PanelBancoTx
        tipos={["nota_cargo"]}
        titulo="Notas de Cargo"
        descripcion="Comisiones, cargos u otros débitos que el banco aplica a la cuenta. Genera una partida de Diario."
      />
    ),
  },
  {
    id: "nota_abono",
    label: "Nota de Abono",
    render: () => (
      <PanelBancoTx
        tipos={["nota_abono"]}
        titulo="Nota de Abono"
        descripcion="Intereses u otros créditos que el banco abona a la cuenta. Genera una partida de Diario."
      />
    ),
  },
  {
    id: "transferencia",
    label: "Transferencia",
    render: () => (
      <PanelBancoTx
        tipos={["transferencia"]}
        titulo="Transferencia"
        descripcion="Transferencias salientes hacia otra cuenta (otro banco, proveedor, etc). Genera una partida de Transferencias."
      />
    ),
  },
  {
    id: "pago_proveedor",
    label: "Pago a Proveedores",
    render: () => (
      <PanelBancoTx
        tipos={["pago_proveedor"]}
        titulo="Pago a Proveedores"
        descripcion="Pago desde el banco a un proveedor, aplicado directamente contra una factura de Cuentas por Pagar."
      />
    ),
  },
  {
    id: "recibo_cliente",
    label: "Recibo Pago Clientes",
    render: () => (
      <PanelBancoTx
        tipos={["recibo_cliente"]}
        titulo="Recibo Pago Clientes"
        descripcion="Cobro recibido en el banco de un cliente, aplicado directamente contra una factura de Cuentas por Cobrar."
      />
    ),
  },
  {
    id: "cheque",
    label: "Cheques",
    render: () => (
      <PanelBancoTx
        tipos={["cheque"]}
        titulo="Cheques"
        descripcion="Emite cheques con su número correlativo; cada uno genera su partida de Egreso. También sirve como reporte de cheques."
      />
    ),
  },
  { id: "libro-bancos", label: "Libro de Bancos", render: () => <LibroBancos /> },
  { id: "conciliacion", label: "Conciliación Bancaria", render: () => <Conciliacion /> },
];

export default function TransaccionesBancariasPage() {
  const [activa, setActiva] = useState(PESTANAS[0].id);
  const pestana = PESTANAS.find((p) => p.id === activa) || PESTANAS[0];

  return (
    <div>
      <div className="mb-6 no-print">
        <h1 className="font-display text-xl font-semibold mb-3">Transacciones</h1>
        <div className="flex flex-wrap gap-1.5 border-b border-paperLine pb-3">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiva(p.id)}
              className={`cc-btn !py-1 ${p.id === activa ? "cc-btn-primario font-medium" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {pestana.render()}
    </div>
  );
}
