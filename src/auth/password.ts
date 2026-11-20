// Contraseña nueva: mínimo 8 caracteres, con letras y números. Devuelve la clave del error o null.
export function passwordError(password: string): string | null {
  if (password.length < 8) return 'auth.errors.passwordShort'
  if (password.length > 72) return 'auth.errors.passwordLong'
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'auth.errors.passwordWeak'
  return null
}

// Intentos fallidos seguidos antes de pausar el formulario de ingreso.
export const MAX_FAILED_SIGN_INS = 5
export const SIGN_IN_PAUSE_MS = 60_000
