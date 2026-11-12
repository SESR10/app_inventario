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

## Asistente con IA

El asistente (pantalla "Asistente y pedidos") responde con el inventario real y aparta pedidos para recoger.
Corre en la función Edge `supabase/functions/asistente`, que llama a la API de Claude con la sesión de quien
escribe (las reglas por empresa siguen aplicando).

1. Corre la migración `20261112000000_asistente_pedidos.sql` en el SQL Editor de Supabase.
2. Crea una clave en https://console.anthropic.com (API Keys). Cada mensaje tiene un costo pequeño.
3. Publica la función y guarda la clave como secreto:
   ```
   npx supabase login
   npx supabase functions deploy asistente --project-ref <id-del-proyecto>
   npx supabase secrets set ANTHROPIC_API_KEY=<clave> --project-ref <id-del-proyecto>
   ```

## Estructura

- `src/auth`, `src/company`: sesión y empresa activa
- `src/components`: diseño general y componentes accesibles (`ui/`)
- `src/pages`: pantallas
- `src/i18n`: textos de la interfaz (español por defecto)
- `src/products`: lista, formulario y etiquetas de productos
- `src/assistant`: chat con el asistente y pedidos para recoger
- `supabase/functions/asistente`: función Edge del asistente (Claude)
- `supabase/migrations`: esquema, índices y reglas de acceso (RLS)
