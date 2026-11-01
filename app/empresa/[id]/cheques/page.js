"use client";

import PanelBancoTx from "@/components/PanelBancoTx";

export default function ChequesPage() {
  return <PanelBancoTx tipos={["cheque"]} titulo="Cheques" descripcion="Emite cheques con su número correlativo; cada uno genera su partida de Egreso. También sirve como reporte de cheques." />;
}
