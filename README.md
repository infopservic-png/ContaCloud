# ContaCloud

App de práctica de contabilidad para estudiantes universitarios. Permite crear
empresas de ejercicio (comercial o de servicio), registrar transacciones por
partida doble, y genera automáticamente:

- Libro Diario
- Libro Mayor (cuentas T)
- Balance de comprobación
- Estado de Resultados
- Balance General

Cada estados financiero incluye encabezado editable (periodo y moneda) y
bloque de firmas (Contador, Representante Legal, Auditor).

## 1. Crear el proyecto en Supabase (gratis)

1. Ve a https://supabase.com y crea una cuenta.
2. Crea un New Project.
3. En SQL Editor > New query, pega TODO el contenido de sql/schema.sql y Run.
4. En Project Settings > API, copia tu Project URL y tu anon/public key.

## 2. Configurar y probar localmente

```bash
npm install
cp .env.local.example .env.local
# Edita .env.local con tus valores de Supabase
npm run dev
```

## 3. Subir a GitHub y desplegar en Vercel

```bash
git init
git add .
git commit -m "version inicial"
git remote add origin https://github.com/tu-usuario/tu-repo.git
git branch -M main
git push -u origin main
```

En vercel.com: Add New > Project > importar el repositorio > agregar las
variables de entorno NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
> Deploy.

## Estructura

```
app/
  login/
  dashboard/
  empresa/[id]/
    cuentas/            -> catálogo de cuentas (agregar, editar, eliminar)
    transacciones/      -> registrar partidas + Libro Diario
    mayor/               -> Libro Mayor
    balance/             -> Balance de comprobación
    estado-resultados/   -> Estado de Resultados
    balance-general/     -> Balance General
components/
  EncabezadoReporte.js   -> periodo y moneda editables en los reportes
  FirmasReporte.js       -> bloque de firmas al pie de los reportes
lib/
  supabaseClient.js
  catalogoCuentas.js
sql/
  schema.sql
  migracion_periodo_moneda.sql
```
