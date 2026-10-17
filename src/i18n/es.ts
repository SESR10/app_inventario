// Textos en español. Para otro idioma, crea un archivo con las mismas claves y regístralo en index.ts.
const es = {
  app: {
    name: 'Inventario',
    skipToContent: 'Saltar al contenido principal',
    loading: 'Cargando…',
  },
  config: {
    title: 'Falta conectar la base de datos',
    body: 'Crea el archivo .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example) y vuelve a iniciar la aplicación.',
  },
  nav: {
    label: 'Menú principal',
    open: 'Abrir menú',
    close: 'Cerrar menú',
    dashboard: 'Panel',
    products: 'Productos',
    movements: 'Movimientos',
    import: 'Importar y exportar',
    signOut: 'Cerrar sesión',
    company: 'Empresa',
  },
  auth: {
    signInTitle: 'Ingresar',
    signUpTitle: 'Crear cuenta',
    email: 'Correo electrónico',
    password: 'Contraseña',
    passwordHint: 'Mínimo 8 caracteres.',
    signIn: 'Ingresar',
    signUp: 'Crear cuenta',
    toSignUp: '¿No tienes cuenta? Crea una',
    toSignIn: '¿Ya tienes cuenta? Ingresa',
    checkEmail: 'Te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja de entrada.',
    errors: {
      emailRequired: 'Escribe tu correo electrónico.',
      emailInvalid: 'Escribe un correo válido, por ejemplo nombre@empresa.com.',
      passwordShort: 'La contraseña debe tener al menos 8 caracteres.',
      invalidCredentials: 'El correo o la contraseña no son correctos.',
      generic: 'No pudimos completar la acción. Intenta de nuevo.',
    },
  },
  company: {
    createTitle: 'Crea tu empresa',
    createIntro: 'Todo tu inventario quedará dentro de esta empresa. Podrás invitar a tu equipo después.',
    name: 'Nombre de la empresa',
    create: 'Crear empresa',
    nameRequired: 'Escribe el nombre de la empresa.',
    select: 'Cambiar de empresa',
  },
  dashboard: {
    title: 'Panel',
    welcome: 'Te damos la bienvenida a {{company}}.',
    nextSteps: 'Aquí verás el resumen de tu inventario y las alertas de stock bajo.',
  },
  pending: {
    body: 'Esta sección estará disponible pronto.',
  },
  notFound: {
    title: 'Página no encontrada',
    back: 'Volver al panel',
  },
  roles: {
    admin: 'Administrador',
    editor: 'Editor',
    viewer: 'Solo lectura',
  },
}

export default es
