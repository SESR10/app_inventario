# Inventario

App web de inventario multiempresa. La especificación completa está en [CLAUDE.md](CLAUDE.md).

## Requisitos

- Node.js 22 o superior
- Un proyecto de [Supabase](https://supabase.com)

## Puesta en marcha

1. Instala dependencias: `npm install`
2. Copia `.env.example` como `.env.local` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (en Supabase: Project Settings > API).
3. Crea las tablas en tu proyecto de Supabase:
   - Con la CLI: `npx supabase login`, `npx supabase link --project-ref <ref>` y `npx supabase db push`.
   - O pega el contenido de `supabase/migrations/*.sql` en el SQL Editor de Supabase, en orden.
4. Inicia la app: `npm run dev` y abre http://localhost:5173

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Revisa tipos y genera la versión de producción |
| `npm run lint` | Linter (oxlint) |
| `npm test` | Pruebas de interfaz y accesibilidad (Vitest + axe) |

## Publicar (Vercel)

1. Importa el repositorio en Vercel (Framework: Vite) y agrega las variables `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY`.
2. En Supabase, Authentication > URL Configuration: Site URL = la dirección de Vercel; agrega
   `http://localhost:5173` en Redirect URLs para seguir probando en local.

## Estructura

- `src/auth`, `src/company`: sesión y empresa activa
- `src/components`: diseño general y componentes accesibles (`ui/`)
- `src/pages`: pantallas
- `src/i18n`: textos de la interfaz (español por defecto)
- `src/products`: lista, formulario y etiquetas de productos
- `supabase/migrations`: esquema, índices y reglas de acceso (RLS)
