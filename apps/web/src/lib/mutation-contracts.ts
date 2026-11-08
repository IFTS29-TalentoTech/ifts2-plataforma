import {
  PUBLICATION_KINDS,
  PUBLICATION_STATUSES,
  PUBLICATION_ORIGINS,
  PUBLICATION_SECTIONS,
  SOCIAL_STATUSES,
  NOTICE_STATUSES,
  DOCUMENT_STATUSES,
  MESSAGE_STATUSES,
} from '@ifts2/shared';
import { z } from 'zod';

const text = z.string();
const id = text.uuid();
const nullableText = text.nullable();
const record = <S extends z.ZodRawShape>(shape: S) => z.object(shape).passthrough();
const entity = record({ id });
const named = entity.extend({ name: text });

/** Contrato de salida: los tipos TypeScript por sí solos no validan datos de la red. */
export const publicationResponse = entity.extend({
  kind: z.enum(PUBLICATION_KINDS),
  title: text,
  summary: text,
  body: text,
  coverUrl: nullableText,
  coverSrc: nullableText,
  categoryId: id.nullable(),
  category: record({ id, name: text }).nullable(),
  section: z.enum(PUBLICATION_SECTIONS),
  status: z.enum(PUBLICATION_STATUSES),
  origin: z.enum(PUBLICATION_ORIGINS),
  socialPermalink: nullableText,
  visibleFrom: nullableText,
  visibleUntil: nullableText,
  createdAt: text.datetime(),
  updatedAt: text.datetime(),
  visible: z.boolean(),
  expired: z.boolean(),
});
const user = named.extend({ email: text.email(), roleId: id, role: text, active: z.boolean() });
const role = named.extend({ key: text, permissions: z.array(text), isSystem: z.boolean() });
const term = entity.extend({ year: z.number().int(), kind: text, publicCurrent: z.boolean() });
const document = entity.extend({
  title: text,
  filename: text,
  status: z.enum(DOCUMENT_STATUSES),
});
const schedule = entity.extend({ termId: id, documentId: id.nullable(), published: z.boolean() });
const notice = entity.extend({ title: text, status: z.enum(NOTICE_STATUSES) });
const teacher = named.extend({ visible: z.boolean(), order: z.number() });
const gallery = entity.extend({ area: text, image: text, order: z.number() });
const social = entity.extend({
  status: z.enum(SOCIAL_STATUSES),
  permalink: text,
});

export type ResponseContract = { status: number; alsoStatuses?: number[]; schema?: z.ZodTypeAny };
const json = (schema: z.ZodTypeAny, status = 200): ResponseContract => ({ status, schema });

/** Todas las mutaciones usadas por la web tienen contrato explícito. Un endpoint nuevo debe
 * registrarse antes de enviarse; no se acepta una promesa resuelta como confirmación de éxito.
 * Se validan identidad/estado y los campos usados por el consumidor; se toleran campos adicionales.
 */
export function mutationContract(method: string, path: string): ResponseContract | undefined {
  const parts = (path.split('?')[0] ?? path).split('/').filter(Boolean);
  const [resource = '', key = '', action = ''] = parts;
  if (
    method === 'POST' &&
    resource === 'auth' &&
    ['login', 'logout', 'change-password'].includes(key)
  ) {
    return { status: 204 };
  }
  if (method === 'DELETE') {
    if (resource === 'teachers' && action === 'photo') return json(teacher);
    if (
      [
        'publications',
        'notices',
        'documents',
        'schedules',
        'exam-calls',
        'roles',
        'links',
        'content',
        'contact-messages',
        'teachers',
        'gallery',
        'social',
      ].includes(resource)
    )
      return { status: 204 };
    return;
  }
  if (resource === 'public' && key === 'contact')
    return json(record({ received: z.literal(true) }), 201);
  if (resource === 'publications') {
    const statuses: Record<string, string> = {
      publish: 'PUBLISHED',
      pause: 'PAUSED',
      schedule: 'SCHEDULED',
      reactivate: 'PUBLISHED',
    };
    return json(
      publicationResponse.refine(
        (value) =>
          (!key || value.id === key) && (!statuses[action] || value.status === statuses[action]),
      ),
      key ? 200 : 201,
    );
  }
  if (resource === 'users') {
    if (!key) return json(record({ user }), 201);
    if (action === 'reset-password') return json(record({ temporaryPassword: text.min(1) }));
    return json(user);
  }
  if (resource === 'roles') return json(role, key ? 200 : 201);
  if (resource === 'terms') return json(term, key ? 200 : 201);
  if (resource === 'documents')
    return json(
      document.refine(
        (value) =>
          (!key || value.id === key) &&
          (action !== 'archive' || value.status === 'ARCHIVED') &&
          (action !== 'restore' || value.status === 'ACTIVE'),
      ),
      key ? 200 : 201,
    );
  if (resource === 'schedules' || resource === 'exam-calls') return json(schedule, key ? 200 : 201);
  if (resource === 'notices')
    return json(
      notice.refine(
        (value) =>
          (!key || value.id === key) &&
          (action !== 'pause' || value.status === 'PAUSED') &&
          (action !== 'resume' || value.status === 'ACTIVE'),
      ),
      key ? 200 : 201,
    );
  if (resource === 'links')
    return json(entity.extend({ title: text, url: text, visible: z.boolean() }), key ? 200 : 201);
  if (resource === 'content')
    return {
      ...json(
        entity.extend({ page: text, slug: text, title: text, body: text, visible: z.boolean() }),
      ),
      alsoStatuses: [201],
    };
  if (resource === 'contact-messages')
    return json(entity.extend({ status: z.enum(MESSAGE_STATUSES) }));
  if (resource === 'teachers' || resource === 'gallery') {
    const schema = resource === 'teachers' ? teacher : gallery;
    return key === 'order'
      ? json(record({ items: z.array(schema) }))
      : json(schema, key ? 200 : 201);
  }
  if (resource === 'settings') return json(record({ institution_name: nullableText }));
  if (resource === 'integrations') {
    if (action === 'test') return json(record({ ok: z.boolean(), demo: z.boolean() }));
    if (key === 'mail')
      return json(record({ provider: text, demoMode: z.boolean(), smtpConfigured: z.boolean() }));
    if (key === 'instagram') return json(record({ mode: z.enum(['demo', 'real']), status: text }));
  }
  if (resource === 'social') {
    if (key === 'sync')
      return json(
        record({
          created: z.number(),
          matched: z.number(),
          alreadyKnown: z.number(),
          demo: z.boolean(),
          mode: z.enum(['incremental', 'full']),
          lastFetchAt: text,
        }),
      );
    if (key === 'manual') return json(social, 201);
    if (parts[3] === 'approve')
      return json(record({ post: social, publication: publicationResponse }), 201);
    if (key === 'posts') return json(social);
  }
}
