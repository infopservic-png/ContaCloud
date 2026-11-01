// Cheques y transacciones bancarias: cada una genera su partida y queda registrada en bancos_transacciones.
import { supabase } from "@/lib/supabaseClient";
import { siguienteNumeroPartida } from "@/lib/partidas";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// lado: dónde va el banco en la partida. partida: tipo de partida que se genera.
export const TIPOS_BANCO = {
  cheque: { label: "Cheque", partida: "egreso", lado: "haber", contraria: "Cuenta contable de cargo (gasto, proveedor…)" },
  deposito: { label: "Depósito", partida: "ingreso", lado: "debe", contraria: "Cuenta contable de abono (cliente, ingreso…)" },
  nota_cargo: { label: "Nota de cargo", partida: "diario", lado: "haber", contraria: "Cuenta contable de cargo (comisión, gasto…)" },
  nota_abono: { label: "Nota de abono", partida: "diario", lado: "debe", contraria: "Cuenta contable de abono (intereses, ingreso…)" },
  transferencia: { label: "Transferencia", partida: "transferencia", lado: "haber", contraria: "Cuenta contable destino (otro banco, proveedor…)" },
};

export async function obtenerTransaccionesBanco(empresaId, { tipos, cuentaBancariaId, desde, hasta } = {}) {
  let q = supabase
    .from("bancos_transacciones")
    .select("*, cuenta_bancaria:cuenta_bancaria_id ( nombre, banco ), contraria:cuenta_contraria_id ( codigo, nombre ), partida:transaccion_id ( numero_partida, tipo )")
    .eq("empresa_id", empresaId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (tipos?.length) q = q.in("tipo", tipos);
  if (cuentaBancariaId) q = q.eq("cuenta_bancaria_id", cuentaBancariaId);
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export function glosaBanco(tipo, d) {
  const t = TIPOS_BANCO[tipo];
  const partes = [t.label + (d.numero ? ` N° ${d.numero}` : "")];
  if (d.beneficiario) partes.push(tipo === "deposito" ? `de ${d.beneficiario}` : `a nombre de ${d.beneficiario}`);
  return partes.join(" ") + (d.concepto ? ` — ${d.concepto}` : "");
}

export async function registrarTransaccionBanco({ empresaId, cuentaBancaria, tipo, fecha, numero, beneficiario, concepto, monto, cuentaContrariaId }) {
  const cfg = TIPOS_BANCO[tipo];
  const importe = r2(monto);
  if (!cfg) return { error: "Tipo de transacción no válido." };
  if (!(importe > 0)) return { error: "El monto debe ser mayor que cero." };
  if (!fecha) return { error: "Indica la fecha." };
  if (!cuentaContrariaId) return { error: cfg.contraria.split(" (")[0] + ": selecciónala." };
  if (cuentaContrariaId === cuentaBancaria.cuenta_contable_id) return { error: "La cuenta contable no puede ser la misma cuenta del banco." };

  let numeroDoc = String(numero ?? "").trim();
  let incrementarCheque = false;
  if (tipo === "cheque" && !numeroDoc) {
    numeroDoc = String(cuentaBancaria.siguiente_cheque || 1);
    incrementarCheque = true;
  } else if (tipo === "cheque" && Number(numeroDoc) === Number(cuentaBancaria.siguiente_cheque)) {
    incrementarCheque = true;
  }

  const glosa = glosaBanco(tipo, { numero: numeroDoc, beneficiario, concepto });
  const numeroPartida = await siguienteNumeroPartida(empresaId, cfg.partida);
  const { data: tx, error: errTx } = await supabase
    .from("transacciones")
    .insert({ empresa_id: empresaId, fecha, descripcion: glosa, numero_partida: numeroPartida, tipo: cfg.partida })
    .select()
    .single();
  if (errTx) return { error: "No se pudo registrar la partida: " + errTx.message };

  const banco = { cuenta_id: cuentaBancaria.cuenta_contable_id, debe: cfg.lado === "debe" ? importe : 0, haber: cfg.lado === "haber" ? importe : 0 };
  const contra = { cuenta_id: cuentaContrariaId, debe: cfg.lado === "haber" ? importe : 0, haber: cfg.lado === "debe" ? importe : 0 };
  const lineas = (cfg.lado === "haber" ? [contra, banco] : [banco, contra]).map((l) => ({ ...l, transaccion_id: tx.id }));
  const { error: errMov } = await supabase.from("movimientos").insert(lineas);
  if (errMov) {
    await supabase.from("transacciones").delete().eq("id", tx.id);
    return { error: "Fallaron las líneas de la partida: " + errMov.message };
  }

  const { data: reg, error: errReg } = await supabase
    .from("bancos_transacciones")
    .insert({
      empresa_id: empresaId,
      cuenta_bancaria_id: cuentaBancaria.id,
      tipo,
      fecha,
      numero: numeroDoc || null,
      beneficiario: String(beneficiario ?? "").trim() || null,
      concepto: String(concepto ?? "").trim() || null,
      monto: importe,
      cuenta_contraria_id: cuentaContrariaId,
      transaccion_id: tx.id,
    })
    .select()
    .single();
  if (errReg) {
    await supabase.from("transacciones").delete().eq("id", tx.id);
    return { error: "No se pudo guardar: " + errReg.message };
  }
  if (incrementarCheque) {
    await supabase.from("cuentas_bancarias").update({ siguiente_cheque: Number(numeroDoc) + 1 }).eq("id", cuentaBancaria.id);
  }
  return { ok: true, registro: reg, numeroPartida, tipoPartida: cfg.partida, numero: numeroDoc };
}

// Anula un cheque: se elimina su partida y el registro queda como «anulado» (conserva el número).
export async function anularCheque(reg) {
  if (reg.transaccion_id) await supabase.from("transacciones").delete().eq("id", reg.transaccion_id);
  const { error } = await supabase.from("bancos_transacciones").update({ estado: "anulado", transaccion_id: null }).eq("id", reg.id);
  return error ? { error: error.message } : { ok: true };
}

// Elimina la transacción junto con su partida.
export async function eliminarTransaccionBanco(reg) {
  if (reg.transaccion_id) await supabase.from("transacciones").delete().eq("id", reg.transaccion_id);
  const { error } = await supabase.from("bancos_transacciones").delete().eq("id", reg.id);
  return error ? { error: error.message } : { ok: true };
}
