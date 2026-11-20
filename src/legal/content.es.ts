// Textos legales en español. Para otro idioma, crea content.<idioma>.ts con la misma forma.
// Guía general basada en la ley colombiana; no reemplaza la revisión de un abogado.
import type { LegalDoc } from './config'

export type Block = string | { list: string[] }
export interface LegalSection {
  title: string
  blocks: Block[]
}
export interface LegalText {
  title: string
  sections: LegalSection[]
}

export interface Owner {
  nombre: string
  documento: string
  direccion: string
  ciudad: string
  correo: string
  telefono: string
}

export function legalTexts(o: Owner): Record<LegalDoc, LegalText> {
  const contacto = `escribe al correo ${o.correo}`
  return {
    privacy: {
      title: 'Política de tratamiento de datos personales',
      sections: [
        {
          title: '1. Quién es el responsable',
          blocks: [
            'El responsable del tratamiento de tus datos personales en STOCK 360 es:',
            {
              list: [
                `Nombre o razón social: ${o.nombre}`,
                `Cédula o NIT: ${o.documento}`,
                `Dirección: ${o.direccion}, ${o.ciudad}, Colombia`,
                `Correo: ${o.correo}`,
                `Teléfono: ${o.telefono}`,
              ],
            },
            'Esta política cumple la Ley 1581 de 2012, el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y las demás normas colombianas de protección de datos personales.',
          ],
        },
        {
          title: '2. A quién aplica',
          blocks: [
            'Aplica a las personas que crean una cuenta en STOCK 360 y a quienes usan la app como parte del equipo de una empresa.',
            'Los datos que cada empresa registra en su inventario (por ejemplo, el nombre, teléfono o correo de un proveedor) son de esa empresa. La empresa es la responsable de esos datos y de tener la autorización de sus dueños; STOCK 360 actúa como encargado y solo los usa para prestar el servicio, siguiendo las instrucciones de la empresa.',
          ],
        },
        {
          title: '3. Qué datos tratamos',
          blocks: [
            {
              list: [
                'Tu correo electrónico y tu contraseña. La contraseña se guarda cifrada: nadie puede leerla, ni siquiera nosotros.',
                'Las empresas a las que perteneces y tu rol en cada una (administrador, editor o solo lectura).',
                'Quién registró cada movimiento de inventario y cuándo, para que el equipo tenga un historial confiable.',
                'Datos técnicos necesarios para la seguridad: dirección IP, fecha y hora de ingreso y tipo de navegador.',
                'La fecha y la versión de estos documentos que aceptaste.',
              ],
            },
            'No pedimos datos sensibles (como salud, origen étnico, creencias o datos biométricos) ni datos de niños, niñas o adolescentes. La app es para personas mayores de edad que la usan en su trabajo.',
            'La cámara se usa solo en la pantalla Escanear, para leer códigos de barras en tu propio dispositivo. No guardamos fotos ni videos.',
          ],
        },
        {
          title: '4. Para qué los usamos',
          blocks: [
            {
              list: [
                'Crear y administrar tu cuenta y darte acceso a tu empresa según tu rol.',
                'Prestar el servicio de inventario: productos, movimientos, etiquetas, importación y exportación.',
                'Mostrar a tu equipo quién hizo cada cambio.',
                'Enviarte los correos necesarios: confirmar tu cuenta, recuperar tu contraseña, avisos de seguridad y cambios en estos documentos.',
                'Proteger la app contra fraudes y accesos indebidos.',
                'Atender tus consultas y reclamos y cumplir obligaciones legales.',
              ],
            },
            'No vendemos ni alquilamos tus datos y no los usamos para publicidad. Si algún día quisiéramos usarlos para otra finalidad, te pediremos una nueva autorización.',
          ],
        },
        {
          title: '5. Tus derechos',
          blocks: [
            'Según el artículo 8 de la Ley 1581 de 2012, tienes derecho a:',
            {
              list: [
                'Conocer, actualizar y corregir tus datos.',
                'Pedir prueba de la autorización que nos diste.',
                'Saber cómo hemos usado tus datos.',
                'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).',
                'Revocar la autorización o pedir que borremos tus datos, cuando no exista un deber legal o contractual de conservarlos.',
                'Consultar tus datos gratis.',
              ],
            },
          ],
        },
        {
          title: '6. Cómo ejercer tus derechos',
          blocks: [
            `Para una consulta o un reclamo, ${contacto} con tu nombre, número de documento, lo que pides y el correo o la dirección donde quieres la respuesta.`,
            {
              list: [
                'Consultas: respondemos en máximo 10 días hábiles. Si no alcanzamos, te avisamos y respondemos en máximo 5 días hábiles más.',
                'Reclamos (corregir, actualizar, borrar o revocar): respondemos en máximo 15 días hábiles. Si no alcanzamos, te avisamos y respondemos en máximo 8 días hábiles más. Si falta información, te la pedimos dentro de los 5 días siguientes.',
              ],
            },
            'Puedes cambiar tu contraseña cuando quieras con la opción "¿Olvidaste tu contraseña?" de la pantalla de ingreso.',
            'Si no quedas conforme con nuestra respuesta, puedes acudir a la Superintendencia de Industria y Comercio (www.sic.gov.co).',
          ],
        },
        {
          title: '7. Dónde se guardan',
          blocks: [
            'Usamos proveedores de tecnología para guardar la información y publicar la app: Supabase (base de datos y cuentas) y Vercel (publicación de la página). Sus servidores pueden estar fuera de Colombia, por ejemplo en Estados Unidos.',
            'Al aceptar esta política autorizas que tus datos se envíen y guarden en esos servidores. Solo trabajamos con proveedores que tienen medidas de seguridad adecuadas y que tratan los datos únicamente para prestarnos el servicio.',
          ],
        },
        {
          title: '8. Cómo los protegemos',
          blocks: [
            {
              list: [
                'Toda la comunicación viaja cifrada (HTTPS).',
                'Las contraseñas se guardan cifradas.',
                'La base de datos separa la información de cada empresa: nadie puede ver los datos de otra.',
                'Cada persona tiene permisos según su rol y queda un historial de los movimientos.',
              ],
            },
            'Ningún sistema es infalible. Si ocurre un incidente que afecte tus datos, te avisaremos y lo reportaremos a la Superintendencia de Industria y Comercio como lo exige la ley.',
          ],
        },
        {
          title: '9. Cuánto tiempo los guardamos',
          blocks: [
            'Mientras tengas una cuenta activa o tu empresa use el servicio. Después los borramos, salvo los que una ley nos obligue a conservar. Tu empresa puede exportar su inventario a Excel en cualquier momento.',
          ],
        },
        {
          title: '10. Cambios y vigencia',
          blocks: [
            'Si cambiamos esta política te avisaremos en la app y, si el cambio es importante, te pediremos aceptarla de nuevo. La versión de la fecha indicada arriba rige desde su publicación.',
          ],
        },
      ],
    },
    terms: {
      title: 'Términos y condiciones de uso',
      sections: [
        {
          title: '1. Qué es STOCK 360',
          blocks: [
            `STOCK 360 es una app en internet para llevar el inventario de un negocio. La presta ${o.nombre} (${o.documento}), con domicilio en ${o.ciudad}, Colombia.`,
            'Al crear una cuenta aceptas estos términos. Si usas la app en nombre de una empresa, declaras que tienes autorización de ella para hacerlo.',
          ],
        },
        {
          title: '2. Tu cuenta',
          blocks: [
            {
              list: [
                'Usa datos verdaderos y un correo al que tengas acceso.',
                'Cuida tu contraseña y no la compartas: cada persona del equipo debe tener su propia cuenta.',
                'Eres responsable de lo que se haga con tu cuenta. Si crees que alguien más la está usando, cambia tu contraseña y avísanos.',
              ],
            },
          ],
        },
        {
          title: '3. Empresas, roles y datos',
          blocks: [
            'El administrador de cada empresa decide quién entra y con qué rol. La información que la empresa guarda (productos, precios, movimientos, proveedores) es de la empresa: no la usamos para otra cosa ni la compartimos con terceros, salvo orden de una autoridad competente.',
            'Si la empresa registra datos personales de otras personas (por ejemplo, contactos de proveedores), es responsable de contar con su autorización. STOCK 360 trata esos datos como encargado, según la Política de tratamiento de datos personales.',
          ],
        },
        {
          title: '4. Uso permitido',
          blocks: [
            'No está permitido:',
            {
              list: [
                'Intentar entrar a cuentas o datos de otras personas o empresas.',
                'Intentar vulnerar la seguridad de la app, introducir programas dañinos o sobrecargarla a propósito.',
                'Copiar, revender o modificar la app sin autorización.',
                'Usarla para actividades ilegales.',
              ],
            },
            'Estas conductas pueden ser delitos según la Ley 1273 de 2009 y llevan a suspender la cuenta.',
          ],
        },
        {
          title: '5. Disponibilidad y respaldos',
          blocks: [
            'Trabajamos para que la app esté disponible siempre, pero puede haber interrupciones por mantenimiento, fallas de internet o de nuestros proveedores. La app necesita conexión a internet para funcionar.',
            'Te recomendamos exportar tu inventario a Excel con frecuencia como respaldo propio.',
          ],
        },
        {
          title: '6. Precio y pago',
          blocks: [
            'El precio, la forma de pago y la duración del plan se acuerdan con cada empresa antes de empezar. Las facturas se expiden según las normas de la DIAN.',
          ],
        },
        {
          title: '7. Responsabilidad',
          blocks: [
            'STOCK 360 es una herramienta de apoyo. Las decisiones de compra, venta y precios, y la información contable y tributaria del negocio, son responsabilidad de cada empresa.',
            'No respondemos por pérdidas causadas por datos mal ingresados, por el uso de una cuenta cuya contraseña se compartió, ni por fallas de terceros fuera de nuestro control.',
            'Nada de lo anterior limita los derechos que la ley colombiana te reconoce y que no se pueden renunciar, incluido el Estatuto del Consumidor (Ley 1480 de 2011) cuando aplique.',
          ],
        },
        {
          title: '8. Propiedad intelectual',
          blocks: [
            `La app, el nombre y el logo de STOCK 360 y su código pertenecen a ${o.nombre}. Mientras tengas una cuenta, te damos permiso para usarla en tu negocio; ese permiso no es exclusivo ni se puede transferir.`,
          ],
        },
        {
          title: '9. Fin del servicio',
          blocks: [
            `Puedes dejar de usar la app cuando quieras y pedir que borremos tu cuenta; para eso, ${contacto}. Podemos suspender cuentas que incumplan estos términos. Si el servicio de una empresa termina, le daremos un plazo razonable para exportar su información.`,
          ],
        },
        {
          title: '10. Cambios',
          blocks: [
            'Si cambiamos estos términos te avisaremos en la app y, si el cambio es importante, te pediremos aceptarlos de nuevo.',
          ],
        },
        {
          title: '11. Ley aplicable',
          blocks: [
            'Estos términos se rigen por las leyes de Colombia. Aceptarlos en la app tiene la misma validez que una firma, según la Ley 527 de 1999. Cualquier diferencia la intentaremos resolver primero de forma directa; si no es posible, la resolverán los jueces de Colombia.',
            `Para cualquier duda, ${contacto} o llama al ${o.telefono}.`,
          ],
        },
      ],
    },
    cookies: {
      title: 'Política de cookies',
      sections: [
        {
          title: '1. Qué son',
          blocks: [
            'Las cookies y el almacenamiento local son pequeños datos que una página guarda en tu navegador para recordar algo, por ejemplo que ya ingresaste.',
          ],
        },
        {
          title: '2. Qué usamos',
          blocks: [
            'STOCK 360 no usa cookies de publicidad, de analítica ni de terceros. Solo guarda en tu navegador lo estrictamente necesario para funcionar:',
            {
              list: [
                'Sesión (sb-…-auth-token): mantiene tu sesión iniciada de forma segura. Se borra al cerrar sesión.',
                'Empresa elegida (inventario.empresa): recuerda la empresa que estás viendo si perteneces a varias.',
                'Aviso de cookies (stock360.cookies): recuerda que ya viste el aviso para no mostrarlo otra vez.',
              ],
            },
            'Nuestro proveedor de publicación (Vercel) recibe datos técnicos como tu dirección IP para entregarte la página y protegerla de ataques, sin cookies de seguimiento.',
          ],
        },
        {
          title: '3. Cómo borrarlas',
          blocks: [
            'Al cerrar sesión se borra tu sesión. También puedes borrar todo desde la configuración de tu navegador. Si bloqueas este almacenamiento no podrás ingresar a la app, porque es necesario para mantener tu sesión.',
          ],
        },
        {
          title: '4. Cambios',
          blocks: [
            'Si en el futuro usamos cookies que no sean necesarias (por ejemplo, de analítica), te pediremos permiso antes de activarlas.',
          ],
        },
      ],
    },
  }
}
