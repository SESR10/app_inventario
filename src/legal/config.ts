// Datos de quien vende y responde por STOCK 360 (responsable del tratamiento de datos,
// Ley 1581 de 2012 y Decreto 1377 de 2013). Complétalos antes de vender la app:
// mientras estén vacíos, las páginas legales muestran "(pendiente)".
export const RESPONSABLE = {
  // Nombre completo (persona natural) o razón social (empresa, por ejemplo "STOCK 360 S.A.S.").
  nombre: '',
  // Cédula o NIT.
  documento: '',
  direccion: '',
  ciudad: '',
  // Correo para consultas y reclamos sobre datos personales.
  correo: '',
  telefono: '',
}

// Cambia la versión cuando cambien los términos o la política: a quien ya tenía cuenta
// se le pedirá aceptar otra vez al ingresar.
export const LEGAL_VERSION = '2026-11-20'
export const LEGAL_UPDATED = '20 de noviembre de 2026'

// Llave del aviso de cookies en el navegador.
export const COOKIE_NOTICE_KEY = 'stock360.cookies'

export const LEGAL_PATHS = { privacy: '/privacidad', terms: '/terminos', cookies: '/cookies' } as const
export type LegalDoc = keyof typeof LEGAL_PATHS
