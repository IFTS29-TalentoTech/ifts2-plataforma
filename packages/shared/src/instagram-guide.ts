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
