"use client";

import { createContext, useContext } from "react";

export const EmpresaContext = createContext(null);

export function useEmpresa() {
  const ctx = useContext(EmpresaContext);
  if (!ctx) {
    throw new Error("useEmpresa debe usarse dentro de EmpresaContext.Provider");
  }
  return ctx;
}
