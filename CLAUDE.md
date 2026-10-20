# Proyecto: App de Inventario General (multiempresa)

## Visión
App web de inventario para cualquier empresa, desde microempresas hasta grandes
industrias. Prioridades en este orden: accesibilidad, rendimiento con catálogos
grandes, facilidad de uso y apariencia profesional.

## Stack
- Frontend: React + TypeScript + Vite, Tailwind CSS
- Backend/DB: Supabase (PostgreSQL + Auth + Row Level Security)
- Excel: SheetJS (xlsx) para importar y exportar
- Códigos: JsBarcode (Code128) y qrcode para etiquetas

## Requisitos funcionales
1. Multiempresa: cada empresa ve solo sus datos (RLS por company_id).
2. Productos: crear, editar, eliminar (con confirmación), búsqueda y filtros.
   Campos: SKU, nombre, categoría, unidad, costo, precio, stock, stock mínimo,
   ubicación, proveedor, imagen opcional.
3. Código por producto: SKU autogenerado si no existe + código de barras/QR
   imprimible en etiquetas.
4. Importar Excel/CSV: subir archivo, mapear columnas, vista previa con errores
   marcados (duplicados, campos vacíos, formatos), importar en lotes.
   Exportar a Excel. Plantilla descargable.
5. Movimientos: entradas, salidas y ajustes con historial (quién, cuándo, por qué).
6. Alertas de stock bajo y panel con resumen.
7. Roles: administrador, editor, solo lectura.

## Requisitos no funcionales
- Accesibilidad WCAG 2.2 AA: navegación completa por teclado, foco visible,
  etiquetas en todos los campos, contraste 4.5:1, compatible con lectores de
  pantalla, textos claros sin jerga técnica.
- Responsive mobile-first (celular, tablet, escritorio).
- Escala: soportar 100.000+ productos con paginación del lado del servidor,
  índices en DB y listas virtualizadas.
- Interfaz en español, preparada para otros idiomas.

## Reglas de trabajo para Claude
- Trabaja por fases; no avances a la siguiente sin que yo lo pida.
- Respuestas cortas: no expliques lo obvio ni repitas código ya escrito.
- Edita solo los archivos necesarios; no reescribas archivos completos.
- Antes de terminar una tarea: corre build, linter y tests.
- Al final de cada fase, actualiza la sección "Estado" de este archivo.

## Estado
- Fase actual: 7 terminada (unidades, presentaciones y kits). Propuestas sin pedir aún: 8 onboarding con Excel,
  9 atajos, 10 seguridad (papelera, auditoría, respaldo).
- Fase 1: Vite + React + TS + Tailwind; esquema Supabase (empresas, miembros con rol,
  categorías, ubicaciones, proveedores, productos, movimientos) con RLS por company_id,
  claves compuestas entre empresas e índices (trigram para búsqueda, stock bajo);
  login y registro, creación de empresa, selector de empresa, layout accesible
  mobile-first, i18n con textos en `src/i18n/es.ts`; pruebas con Vitest + axe.
- Fase 2: migración `20261017000000_productos.sql` con SKU automático por empresa (P-000001…),
  búsqueda paginada por cursor (`search_products`, `count_products`, SQL dinámico para usar
  índices; <10 ms con 100.000 productos) y bucket privado `product-images` con RLS por carpeta
  de empresa. Lista virtualizada con filtros, formulario con catálogos creables en línea,
  imagen, confirmación al eliminar, y etiquetas Code128/QR imprimibles (hasta 200 productos).
- Fase 3: migración `20261018000000_importar_exportar.sql` con `import_products` (lote de hasta 500
  filas por transacción, crea categorías/ubicaciones/proveedores por nombre, actualiza u omite SKU
  existentes), `existing_skus` y `export_products` (páginas de 1000). Las dos primeras son security
  definer con chequeo de rol: con RLS, `lower(sku)` no usa el índice. Pantalla `/importar`: leer
  .xlsx/.xls/.csv (UTF-8 o Windows-1252, coma o punto y coma), mapeo automático de columnas,
  revisión con errores por fila y descarga de errores, importación por lotes con progreso y
  reintento, exportación a Excel y plantilla con instrucciones. SheetJS 0.20.3 vía el paquete npm
  `@e965/xlsx` (el CDN oficial de SheetJS no es accesible desde el entorno de desarrollo).
- Fase 4: migración `20261019000000_operacion.sql`. Todo cambio de stock queda en `stock_movements`
  por un trigger en products (tipo y motivo vía `set_config('app.movement_*', ..., true)`; motivos
  `@initial`, `@import`, `@edit` se traducen en la interfaz). `record_movement` (entrada, salida,
  ajuste por conteo; no deja stock negativo), `list_movements` (cursor por id, con correo de quien
  lo hizo), `dashboard_summary`, equipo con `company_people`, `invite_member` (agrega si la cuenta
  existe y tiene el correo confirmado; si no, deja invitación en `company_invitations`),
  `claim_invitations` al ingresar y trigger que impide quedarse sin administrador. Pantallas:
  registrar movimiento (búsqueda por nombre/SKU, escáner + Enter), historial con filtros, panel
  con resumen y productos para reponer, equipo. El stock ya no se edita en la ficha del producto
  (solo el inicial al crearlo). Etiquetas e importación se cargan bajo demanda (lazy).
- Fase 5: identidad visual "bodega": logo de caja (`src/components/Logo.tsx`, favicon), paleta índigo + acento
  ámbar en `src/index.css`, fuente Plus Jakarta Sans (@fontsource, sin CDN) e íconos lucide-react. Menú lateral
  oscuro en escritorio y menú fijo abajo en celular (un solo `<nav>`; nada de `backdrop-filter` en el header,
  rompe el `fixed`). Panel con encabezado de bienvenida y tarjetas con ícono; ingreso con presentación de la app.
- Fase 6: publicación en Vercel. `vercel.json` reescribe toda ruta a `index.html` (rutas de React Router) y
  el registro manda `emailRedirectTo: window.location.origin`. En Vercel van `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`; en Supabase (Authentication > URL Configuration), Site URL = dirección de Vercel
  y `http://localhost:5173` en Redirect URLs.
- Fase 7: migración `20261020000000_unidades_presentaciones_kits.sql`. Stock en la unidad base (`products.unit`,
  decimales con 3 cifras); `UnitField` con unidades agrupadas (conteo, longitud, área, volumen, peso) u otra.
  `product_packages` (nombre, factor = unidades base por empaque, código de barras propio, autogenerado `SKU-n`);
  `record_movement(..., p_package)` convierte y guarda la presentación en el historial; `find_code` resuelve SKU o
  código de presentación al escanear. Kits (`is_kit`, `kit_components`): su stock lo calcula un trigger (cuántos se
  pueden armar), vender o recibir un kit mueve cada pieza; una pieza usada en un kit no se puede eliminar.
  Guardado atómico con `set_product_packages` y `set_kit_components`. Etiquetas por presentación; Excel con
  columnas Presentación y Contenido por presentación (importar y exportar).
