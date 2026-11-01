"use client";

import PanelBancoTx from "@/components/PanelBancoTx";

export default function TransaccionesBancariasPage() {
  return <PanelBancoTx tipos={["deposito", "nota_cargo", "nota_abono", "transferencia"]} titulo="Transacciones bancarias" descripcion="Depósitos, notas de cargo y abono, y transferencias. Cada una genera su partida contable." />;
}
