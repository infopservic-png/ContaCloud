#!/usr/bin/env node
// Carga los esquemas JSON oficiales de Hacienda en el proyecto.
//   node tools/esquemas/construir.js <carpeta con los .json de los esquemas>
// Copia cada esquema de DTE a lib/schemas/ y regenera lib/schemas/index.js.
// La clave de cada esquema es "<tipoDte>-<versión>" (p. ej. 03-3), leída del propio esquema
// (identificacion.tipoDte / identificacion.version) o, si no está, del nombre del archivo (fe-ccf-v3.json).
const fs = require("fs");
const path = require("path");

const origen = process.argv[2];
if (!origen || !fs.existsSync(origen)) {
  console.error("Uso: node tools/esquemas/construir.js <carpeta con los esquemas>");
  process.exit(1);
}
const destino = path.join(__dirname, "..", "..", "lib", "schemas");

// Código del tipo de DTE según la abreviatura usada en los nombres de archivo de Hacienda
const POR_ABREV = { fc: "01", ccf: "03", nr: "04", nc: "05", nd: "06", cr: "07", cl: "08", d1: "09", fex: "11", fse: "14", cd: "15" };

const unico = (v) => (v && Array.isArray(v.enum) && v.enum.length === 1 ? String(v.enum[0]) : v && v.const !== undefined ? String(v.const) : null);

function claveDe(esquema, archivo) {
  const ident = esquema?.properties?.identificacion?.properties;
  const tipo = unico(ident?.tipoDte);
  const version = unico(ident?.version);
  if (tipo && version) return `${tipo}-${version}`;
  const m = /^(?:fe|dte)?-?([a-z0-9]+)-v(\d+)/i.exec(path.basename(archivo));
  if (m && POR_ABREV[m[1].toLowerCase()]) return `${POR_ABREV[m[1].toLowerCase()]}-${m[2]}`;
  return null;
}

fs.mkdirSync(destino, { recursive: true });
const archivos = fs.readdirSync(origen).filter((f) => f.toLowerCase().endsWith(".json"));
const cargados = [];
const omitidos = [];
for (const f of archivos) {
  let esquema;
  try {
    esquema = JSON.parse(fs.readFileSync(path.join(origen, f), "utf8").replace(/^﻿/, ""));
  } catch {
    omitidos.push(`${f}: no es un JSON válido`);
    continue;
  }
  const clave = claveDe(esquema, f);
  if (!clave) {
    omitidos.push(`${f}: no es un esquema de DTE (no se pudo determinar tipo y versión; los eventos como anulación o contingencia no se validan aquí)`);
    continue;
  }
  const nombre = `dte-${clave}.json`;
  fs.writeFileSync(path.join(destino, nombre), JSON.stringify(esquema));
  cargados.push({ clave, nombre, origen: f });
}
cargados.sort((a, b) => a.clave.localeCompare(b.clave));

const lineas = [
  "// Archivo generado por tools/esquemas/construir.js — no editar a mano.",
  ...cargados.map((c, i) => `import e${i} from "./${c.nombre}";`),
  "",
  "export const ESQUEMAS = {",
  ...cargados.map((c, i) => `  ${JSON.stringify(c.clave)}: e${i},`),
  "};",
  `export const VERSION_ESQUEMAS = ${JSON.stringify(new Date().toISOString().slice(0, 10))};`,
  "",
];
fs.writeFileSync(path.join(destino, "index.js"), lineas.join("\n"));

console.log(`Esquemas cargados: ${cargados.length}`);
for (const c of cargados) console.log(`  ${c.clave}  ←  ${c.origen}`);
if (omitidos.length) {
  console.log("Omitidos:");
  for (const o of omitidos) console.log("  " + o);
}
