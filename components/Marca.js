"use client";

import { usePerfil } from "@/lib/PerfilContext";

// Nombre y logo de la marca del usuario (por defecto, "ContaCloud"). Solo se muestra dentro del sistema.
export default function Marca({ tamano = "md", vertical = false, className = "" }) {
  const ctx = usePerfil();
  const nombre = ctx?.perfil?.nombre_marca?.trim() || "ContaCloud";
  const logo = ctx?.perfil?.logo || null;
  const alto = { sm: "h-6", md: "h-9", lg: "h-14" }[tamano] || "h-9";
  return (
    <span className={`inline-flex ${vertical ? "flex-col" : ""} items-center gap-3 ${className}`}>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className={`${alto} w-auto max-w-[200px] object-contain`} />
      )}
      <span>{nombre}</span>
    </span>
  );
}
