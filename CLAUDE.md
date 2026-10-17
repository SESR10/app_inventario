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
- Fase actual: 2 terminada (productos y etiquetas). Siguiente: fase 3, importar y exportar Excel.
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
- Pendiente: el stock se edita directo en el formulario; en la fase 4 pasará a movimientos.
  Importar en lotes de 500 filas o menos (el contador de SKU se vuelve lento con lotes enormes).
