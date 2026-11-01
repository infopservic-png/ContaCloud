// Cheques, transacciones bancarias, y pagos a proveedores / recibos de
// clientes: cada una genera su partida y queda registrada en
// bancos_transacciones. Las dos últimas, además, se aplican contra una
// factura de Cuentas por Pagar/Cobrar (ver registrarPagoCxCxP).
import { supabase } from "@/lib/supabaseClient";
import { siguienteNumeroPartida } from "@/lib/partidas";
import { configCxCxP } from "@/lib/cxcxp";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// lado: dónde va el banco en la partida. partida: tipo de partida que se genera.
export const TIPOS_BANCO = {
  cheque: { label: "Cheque", partida: "egreso", lado: "haber", contraria: "Cuenta contable de cargo (gasto, proveedor…)" },
  deposito: { label: "Remesa", partida: "remesa", lado: "debe", contraria: "Cuenta contable de abono (cliente, ingreso…)" },
  nota_cargo: { label: "Nota de cargo", partida: "diario", lado: "haber", contraria: "Cuenta contable de cargo (comisión, gasto…)" },
  nota_abono: { label: "Nota de abono", partida: "diario", lado: "debe", contraria: "Cuenta contable de abono (intereses, ingreso…)" },
  transferencia: { label: "Transferencia", partida: "transferencia", lado: "haber", contraria: "Cuenta contable destino (otro banco, proveedor…)" },
  // Estos dos no usan "contraria" vía combobox: la cuenta contraria es
  // siempre la cuenta de control de CxP/CxC, y en vez de eso se elige
  // el proveedor/cliente y la factura a la que se aplica el pago.
  pago_proveedor: { label: "Pago a proveedor", partida: "egreso", lado: "haber", cxcxp: "pagar" },
  recibo_cliente: { label: "Recibo de cliente", partida: "remesa", lado: "debe", cxcxp: "cobrar" },
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

// Pago a proveedor o recibo de pago de cliente, registrado desde Bancos:
// genera la partida (banco vs. cuenta de control CxP/CxC), el registro en
// bancos_transacciones (para que salga en Libro de Bancos y Conciliación)
// y el abono en CxC/CxP (para que se descuente el saldo de la factura).
export async function registrarPagoCxCxP({ empresaId, cuentaBancaria, tipo, fecha, numero, factura, cuentaControlId, entidadNombre, concepto, monto }) {
  const cfgBanco = TIPOS_BANCO[tipo];
  if (!cfgBanco?.cxcxp) return { error: "Tipo de transacción no válido." };
  const cfg = configCxCxP(cfgBanco.cxcxp);
  const importe = r2(monto);

  if (!(importe > 0)) return { error: "El monto debe ser mayor que cero." };
  if (!fecha) return { error: "Indica la fecha." };
  if (!factura) return { error: `Selecciona la factura del ${cfg.labelEntidad.toLowerCase()}.` };
  if (importe > Number(factura.saldo_pendiente) + 0.005) {
    return { error: `El monto no puede ser mayor al saldo pendiente de la factura (${factura.saldo_pendiente}).` };
  }
  if (!cuentaControlId) {
    return { error: `Configura primero la ${cfg.labelCuentaControl} en el módulo ${cfg.labelModulo}.` };
  }
  if (cuentaControlId === cuentaBancaria.cuenta_contable_id) {
    return { error: "La cuenta de control no puede ser la misma cuenta del banco." };
  }

  const numeroDoc = String(numero ?? "").trim();
  const glosa = glosaBanco(tipo, { numero: numeroDoc, beneficiario: entidadNombre, concepto: concepto || `Factura ${factura.numero_factura || factura.id}` });
  const numeroPartida = await siguienteNumeroPartida(empresaId, cfgBanco.partida);
  const { data: tx, error: errTx } = await supabase
    .from("transacciones")
    .insert({ empresa_id: empresaId, fecha, descripcion: glosa, numero_partida: numeroPartida, tipo: cfgBanco.partida })
    .select()
    .single();
  if (errTx) return { error: "No se pudo registrar la partida: " + errTx.message };

  // Banco: debe si es recibo de cliente (entra dinero), haber si es pago a proveedor (sale dinero).
  const cuentaDebe = cfgBanco.lado === "debe" ? cuentaBancaria.cuenta_contable_id : cuentaControlId;
  const cuentaHaber = cfgBanco.lado === "debe" ? cuentaControlId : cuentaBancaria.cuenta_contable_id;
  const { error: errMov } = await supabase.from("movimientos").insert([
    { transaccion_id: tx.id, cuenta_id: cuentaDebe, debe: importe, haber: 0 },
    { transaccion_id: tx.id, cuenta_id: cuentaHaber, debe: 0, haber: importe },
  ]);
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
      beneficiario: String(entidadNombre ?? "").trim() || null,
      concepto: String(concepto ?? "").trim() || null,
      monto: importe,
      cuenta_contraria_id: cuentaControlId,
      transaccion_id: tx.id,
    })
    .select()
    .single();
  if (errReg) {
    await supabase.from("transacciones").delete().eq("id", tx.id);
    return { error: "No se pudo guardar: " + errReg.message };
  }

  const { error: errAbono } = await supabase.from(cfg.tablaAbonos).insert({
    factura_id: factura.id,
    fecha,
    monto: importe,
    cuenta_contraria_id: cuentaBancaria.cuenta_contable_id,
    transaccion_id: tx.id,
  });
  if (errAbono) {
    await supabase.from("bancos_transacciones").delete().eq("id", reg.id);
    await supabase.from("transacciones").delete().eq("id", tx.id);
    return { error: "No se pudo aplicar el pago a la factura: " + errAbono.message };
  }

  const nuevoSaldo = r2(Number(factura.saldo_pendiente) - importe);
  const { error: errFactura } = await supabase
    .from(cfg.tablaFacturas)
    .update({ saldo_pendiente: nuevoSaldo })
    .eq("id", factura.id);
  if (errFactura) {
    return { error: "El pago quedó registrado, pero no se pudo actualizar el saldo de la factura: " + errFactura.message };
  }

  return { ok: true, registro: reg, numeroPartida, tipoPartida: cfgBanco.partida, numero: numeroDoc };
}

// Anula un cheque: se elimina su partida y el registro queda como «anulado» (conserva el número).
export async function anularCheque(reg) {
  if (reg.transaccion_id) await supabase.from("transacciones").delete().eq("id", reg.transaccion_id);
  const { error } = await supabase.from("bancos_transacciones").update({ estado: "anulado", transaccion_id: null }).eq("id", reg.id);
  return error ? { error: error.message } : { ok: true };
}

// Elimina la transacción junto con su partida. Si es un pago a proveedor o
// recibo de cliente, también elimina el abono y restaura el saldo de la
// factura, para que CxC/CxP quede consistente.
export async function eliminarTransaccionBanco(reg) {
  const cfgBanco = TIPOS_BANCO[reg.tipo];
  if (cfgBanco?.cxcxp && reg.transaccion_id) {
    const cfg = configCxCxP(cfgBanco.cxcxp);
    const { data: abono } = await supabase
      .from(cfg.tablaAbonos)
      .select("*")
      .eq("transaccion_id", reg.transaccion_id)
      .maybeSingle();
    if (abono) {
      const { data: factura } = await supabase
        .from(cfg.tablaFacturas)
        .select("id, saldo_pendiente")
        .eq("id", abono.factura_id)
        .maybeSingle();
      if (factura) {
        await supabase
          .from(cfg.tablaFacturas)
          .update({ saldo_pendiente: r2(Number(factura.saldo_pendiente) + Number(abono.monto)) })
          .eq("id", factura.id);
      }
      await supabase.from(cfg.tablaAbonos).delete().eq("id", abono.id);
    }
  }
  if (reg.transaccion_id) await supabase.from("transacciones").delete().eq("id", reg.transaccion_id);
  const { error } = await supabase.from("bancos_transacciones").delete().eq("id", reg.id);
  return error ? { error: error.message } : { ok: true };
}
