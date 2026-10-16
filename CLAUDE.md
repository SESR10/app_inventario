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
- Fase actual: 0 (sin iniciar)
