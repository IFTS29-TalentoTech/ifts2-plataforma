/**
 * Guía en español para que el cliente configure la integración de Instagram desde el panel.
 * La renderiza la pantalla de Configuración y se reutiliza en el Manual de Usuario.
 * La app de Meta la crea y administra el cliente (no el equipo de desarrollo).
 */
export interface SetupStep {
  title: string;
  body: string;
}

export const INSTAGRAM_REQUIRED_SCOPES = ['instagram_business_basic'] as const;

export const INSTAGRAM_SETUP_GUIDE: {
  title: string;
  intro: string;
  steps: SetupStep[];
  manualTokenNote: string;
} = {
  title: 'Cómo obtener las credenciales de Instagram',
  intro:
    'Para mostrar publicaciones de Instagram en el sitio, el instituto necesita una app propia en Meta for Developers. Solo se publica lo que un usuario del panel aprueba.',
  steps: [
    {
      title: 'Usá una cuenta profesional',
      body: 'La cuenta de Instagram del instituto tiene que ser profesional (Empresa o Creador). Se cambia desde Configuración y privacidad de Instagram, sin costo.',
    },
    {
      title: 'Creá la app en Meta for Developers',
      body: 'Ingresá a developers.facebook.com con una cuenta de Facebook, elegí "Crear app" y seleccioná el caso de uso de Instagram. Guardá el nombre de la app.',
    },
    {
      title: 'Agregá el producto Instagram',
      body: 'Dentro de la app, agregá el producto "Instagram" y elegí la opción de inicio de sesión con Instagram (API con inicio de sesión de Instagram).',
    },
    {
      title: 'Registrá la dirección de redirección',
      body: 'Copiá la "dirección de redirección" que muestra esta pantalla y pegala exactamente igual en el campo "URI de redireccionamiento de OAuth válidos" de la app de Meta.',
    },
    {
      title: 'Copiá el App ID y el App Secret',
      body: 'En la configuración básica de la app, copiá el identificador de la app (App ID) y la clave secreta (App Secret) y pegalos en los campos de esta pantalla. El secreto se guarda cifrado y no se vuelve a mostrar.',
    },
    {
      title: 'Conectá la cuenta',
      body: 'Pulsá "Conectar con Instagram", iniciá sesión con la cuenta del instituto y aceptá los permisos. Después usá "Probar conexión" para verificar.',
    },
  ],
  manualTokenNote:
    'Alternativa: si preferís no usar el botón de conexión, podés generar un token de acceso de larga duración en el panel de la app de Meta y pegarlo en el campo "Token de acceso".',
};

/**
 * Guía de la OTRA forma de conectar: pegar un token de acceso (sin App ID ni App Secret). Se muestra solo
 * cuando en la pantalla está elegido "Token de acceso"; la de arriba corresponde al inicio de sesión de Meta.
 * Los nombres de los botones de Meta cambian con el tiempo: por eso se indica el enlace oficial.
 */
export const INSTAGRAM_TOKEN_GUIDE: {
  title: string;
  intro: string;
  steps: SetupStep[];
  officialUrl: string;
  note: string;
} = {
  title: 'Cómo conseguir el token de acceso',
  intro:
    'El token es una clave larga que Meta genera para la cuenta de Instagram del instituto. Se pega una sola vez y la plataforma la guarda cifrada.',
  steps: [
    {
      title: 'Verificá que la cuenta sea profesional',
      body: 'La cuenta de Instagram del instituto tiene que ser profesional (Empresa o Creador). Se cambia desde Configuración y privacidad de Instagram, sin costo.',
    },
    {
      title: 'Entrá a Meta for Developers',
      body: 'Desde el navegador, ingresá a developers.facebook.com con la cuenta de Facebook que administra la app del instituto y abrí esa app (si todavía no existe, creala con "Crear app").',
    },
    {
      title: 'Buscá la configuración de Instagram',
      body: 'En el menú de la izquierda de la app, elegí "Instagram" y después la opción de configuración de la API con inicio de sesión de Instagram.',
    },
    {
      title: 'Generá el token',
      body: 'Agregá la cuenta del instituto si Meta te lo pide y tocá el botón "Generar token" que aparece al lado de la cuenta. Iniciá sesión con la cuenta y aceptá los permisos.',
    },
    {
      title: 'Copiá el token y pegalo acá',
      body: 'Copiá todo el texto del token (es muy largo: no dejes nada afuera), volvé a esta pantalla, pegalo en "Token de acceso" y tocá "Guardar y conectar". Después usá "Probar conexión".',
    },
  ],
  officialUrl:
    'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login',
  note: 'Si algún botón de Meta se llama distinto, seguí la guía oficial de Meta (enlace de arriba). Para pedir ayuda al equipo, no mandes el token por mensaje: es como una contraseña.',
};

/**
 * Guía de la tercera vía (ADR-045): token de FACEBOOK LOGIN (empieza con «EAA»). La plataforma acepta los dos
 * tipos de token y elige sola a qué servidor de Meta consultar. Esta vía permite además buscar publicaciones
 * públicas por hashtag (si Meta aprobó el permiso de contenido público). Nombres de botones y permisos según la
 * documentación oficial de Meta; si algo cambió, vale la guía oficial.
 */
export const INSTAGRAM_FACEBOOK_TOKEN_GUIDE: {
  title: string;
  intro: string;
  steps: SetupStep[];
  officialUrl: string;
  note: string;
} = {
  title: 'Si tu token empieza con «EAA» (Facebook)',
  intro:
    'Es el token que se genera con «Instagram API con inicio de sesión de Facebook». También sirve: pegalo igual en «Token de acceso» y la plataforma lo usa solo.',
  steps: [
    {
      title: 'Vinculá la cuenta a una Página de Facebook',
      body: 'La cuenta de Instagram del instituto tiene que ser profesional y estar vinculada a una Página de Facebook (en la Página: Configuración > Cuentas vinculadas > Instagram).',
    },
    {
      title: 'Abrí el Explorador de la API Graph',
      body: 'Entrá a developers.facebook.com/tools/explorer con la cuenta de Facebook que administra la Página y elegí en «Aplicación de Meta» la app del instituto.',
    },
    {
      title: 'Pedí los permisos',
      body: 'En «Permisos» agregá instagram_basic, pages_show_list y pages_read_engagement. Para buscar publicaciones públicas por hashtag hace falta además instagram_public_content_access (Meta lo revisa aparte). Después tocá «Generate Access Token» y aceptá.',
    },
    {
      title: 'Hacé que dure más',
      body: 'El token recién generado dura pocas horas. En developers.facebook.com/tools/debug/accesstoken pegalo y tocá «Extend Access Token» para que dure unos 60 días. Copiá el token nuevo completo (empieza con EAA).',
    },
    {
      title: 'Pegalo acá y probá',
      body: 'Volvé a esta pantalla, pegalo en «Token de acceso», tocá «Guardar y conectar» y después «Probar conexión». Si el token vence, repetí estos pasos: sin el App ID y el App Secret la plataforma no puede renovarlo sola.',
    },
  ],
  officialUrl:
    'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login',
  note: 'Si algún botón de Meta se llama distinto, seguí la guía oficial de Meta.',
};
