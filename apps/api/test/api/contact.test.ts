import request from 'supertest';
import { loadConfig } from '../../src/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
});

const valid = {
  name: 'Ana Pérez',
  email: 'ana@correo.test',
  subject: 'Consulta por el ingreso',
  message: '¿Cuándo abre la inscripción?',
  consent: true,
};
const send = (body: object = valid, app = t.app) =>
  request(app).post('/api/v1/public/contact').send(body);

async function setDestination(to = 'institucional@prueba.test') {
  await testPrisma.siteSetting.create({ data: { key: 'email_institutional', value: to } });
  return to;
}

describe('POST /public/contact', () => {
  it('guarda el mensaje y envía el correo al destino institucional (sin sesión)', async () => {
    const to = await setDestination();
    const res = await send();
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: true });

    const row = await testPrisma.contactMessage.findFirstOrThrow();
    expect(row).toMatchObject({
      name: 'Ana Pérez',
      email: 'ana@correo.test',
      status: 'NEW',
      consent: true,
      mailSent: true,
    });
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]).toMatchObject({
      to,
      subject: '[Contacto web] Consulta por el ingreso',
      replyTo: 'ana@correo.test',
    });
    expect(t.mailer.sent[0]!.text).toContain('¿Cuándo abre la inscripción?');
  });

  it('con destino configurado y proveedor consola conserva mailSent=false (A11)', async () => {
    await setDestination();
    const demo = await createTestApp({
      useRealIntegrationResolution: true,
      config: loadConfig({
        ...process.env,
        MAILER_PROVIDER: 'console',
        SMTP_URL: '',
        CONTACT_TO_EMAIL: '',
        REVALIDATE_SECRET: '',
      }),
    });
    expect((await demo.ctx.getMailer()).mailer.kind).toBe('console');

    const res = await send(valid, demo.app);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: true });

    const row = await testPrisma.contactMessage.findFirstOrThrow();
    expect(row).toMatchObject({ message: valid.message, mailSent: false });

    const admin = await loginAs(demo.app, 'ADMIN');
    const panel = await request(demo.app)
      .get('/api/v1/contact-messages')
      .set('Cookie', admin.cookie);
    expect(panel.status).toBe(200);
    expect(panel.body.items[0].mailSent).toBe(false);
  });

  it('exige el consentimiento (Ley 25.326) y los campos, con mensajes en español', async () => {
    let res = await send({ ...valid, consent: false });
    expect(res.status).toBe(400);
    expect(res.body.errors.consent[0]).toMatch(/aviso de uso de datos personales/);
    res = await send({ ...valid, consent: undefined });
    expect(res.status).toBe(400);
    res = await send({ name: '', email: 'malo', subject: '', message: '', consent: true });
    expect(res.status).toBe(400);
    expect(res.body.errors.name[0]).toBe('El nombre es obligatorio.');
    expect(res.body.errors.email[0]).toMatch(/formato válido/);
    expect(res.body.errors.subject[0]).toBe('El asunto es obligatorio.');
    expect(res.body.errors.message[0]).toBe('El mensaje es obligatorio.');
    expect(await testPrisma.contactMessage.count()).toBe(0);
    expect(t.mailer.sent).toHaveLength(0);
  });

  it('si el correo falla, el mensaje SE CONSERVA y responde 201 (RNF03)', async () => {
    await setDestination();
    t.mailer.failWith = new Error('SMTP caído');
    const res = await send();
    expect(res.status).toBe(201);
    const row = await testPrisma.contactMessage.findFirstOrThrow();
    expect(row.mailSent).toBe(false);
    expect(row.message).toBe(valid.message);
  });

  it('sin correo de destino configurado también conserva el mensaje', async () => {
    const res = await send();
    expect(res.status).toBe(201);
    expect(await testPrisma.contactMessage.count()).toBe(1);
    expect(t.mailer.sent).toHaveLength(0);
    expect((await testPrisma.contactMessage.findFirstOrThrow()).mailSent).toBe(false);
  });

  it('el asunto no puede inyectar encabezados (saltos de línea)', async () => {
    await setDestination();
    await send({ ...valid, subject: 'Hola\r\nBcc: victima@x.test' });
    expect(t.mailer.sent[0]!.subject).toBe('[Contacto web] Hola Bcc: victima@x.test');
  });

  it('honeypot: un bot que completa el campo señuelo recibe 201 pero no se guarda ni se envía nada', async () => {
    await setDestination();
    const res = await send({ ...valid, website: 'http://spam.test' });
    expect(res.status).toBe(201);
    expect(await testPrisma.contactMessage.count()).toBe(0);
    expect(t.mailer.sent).toHaveLength(0);
  });

  it('límite de frecuencia: el 6.º envío en una hora recibe 429', async () => {
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(201);
    const res = await send();
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('too-many-requests');
    expect(await testPrisma.contactMessage.count()).toBe(5);
  });
});

describe('panel: /contact-messages', () => {
  async function seed() {
    await testPrisma.contactMessage.createMany({
      data: [
        {
          name: 'Ana',
          email: 'ana@x.test',
          subject: 'Ingreso',
          message: 'm1',
          consent: true,
          status: 'NEW',
        },
        {
          name: 'Beto',
          email: 'beto@x.test',
          subject: 'Horarios',
          message: 'm2',
          consent: true,
          status: 'READ',
        },
        {
          name: 'Cora',
          email: 'cora@x.test',
          subject: 'Título',
          message: 'm3',
          consent: true,
          status: 'ANSWERED',
        },
      ],
    });
    return testPrisma.contactMessage.findMany();
  }

  it('401 sin sesión y 403 para EDITOR', async () => {
    const [m] = await seed();
    expect((await request(t.app).get('/api/v1/contact-messages')).status).toBe(401);
    const editor = await loginAs(t.app, 'EDITOR');
    expect(
      (await request(t.app).get('/api/v1/contact-messages').set('Cookie', editor.cookie)).status,
    ).toBe(403);
    expect(
      (
        await request(t.app)
          .patch(`/api/v1/contact-messages/${m!.id}`)
          .set('Cookie', editor.cookie)
          .send({ status: 'READ' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(t.app)
          .delete(`/api/v1/contact-messages/${m!.id}`)
          .set('Cookie', editor.cookie)
      ).status,
    ).toBe(403);
  });

  it('BEDELIA y ADMIN listan con la forma documentada; filtra por estado y texto', async () => {
    await seed();
    const bedelia = await loginAs(t.app, 'BEDELIA');
    const res = await request(t.app).get('/api/v1/contact-messages').set('Cookie', bedelia.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      [
        'consent',
        'email',
        'id',
        'mailSent',
        'message',
        'name',
        'receivedAt',
        'status',
        'subject',
      ].sort(),
    );
    const names = async (qs: string) =>
      (
        await request(t.app).get(`/api/v1/contact-messages?${qs}`).set('Cookie', bedelia.cookie)
      ).body.items.map((m: { name: string }) => m.name);
    expect(await names('status=NEW')).toEqual(['Ana']);
    expect(await names('q=horarios')).toEqual(['Beto']);
    expect(await names('q=cora@')).toEqual(['Cora']);
    expect(
      (await request(t.app).get('/api/v1/contact-messages?status=X').set('Cookie', bedelia.cookie))
        .status,
    ).toBe(400);
  });

  it('PATCH cambia el estado y audita sin datos personales', async () => {
    const [m] = await seed();
    const bedelia = await loginAs(t.app, 'BEDELIA');
    const res = await request(t.app)
      .patch(`/api/v1/contact-messages/${m!.id}`)
      .set('Cookie', bedelia.cookie)
      .send({ status: 'READ' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READ');
    const log = await testPrisma.auditLog.findFirstOrThrow({ where: { action: 'contact.status' } });
    expect(JSON.stringify(log)).not.toContain(m!.email);
    const bad = await request(t.app)
      .patch(`/api/v1/contact-messages/${m!.id}`)
      .set('Cookie', bedelia.cookie)
      .send({ status: 'BORRADO' });
    expect(bad.status).toBe(400);
    expect(
      (
        await request(t.app)
          .patch('/api/v1/contact-messages/11111111-1111-4111-8111-111111111111')
          .set('Cookie', bedelia.cookie)
          .send({ status: 'READ' })
      ).status,
    ).toBe(404);
  });

  it('DELETE: BEDELIA 403; ADMIN solo mensajes respondidos (409 si no) y queda auditado', async () => {
    const all = await seed();
    const answered = all.find((m) => m.status === 'ANSWERED')!;
    const fresh = all.find((m) => m.status === 'NEW')!;
    const bedelia = await loginAs(t.app, 'BEDELIA');
    expect(
      (
        await request(t.app)
          .delete(`/api/v1/contact-messages/${answered.id}`)
          .set('Cookie', bedelia.cookie)
      ).status,
    ).toBe(403);

    const admin = await loginAs(t.app, 'ADMIN');
    const refuse = await request(t.app)
      .delete(`/api/v1/contact-messages/${fresh.id}`)
      .set('Cookie', admin.cookie);
    expect(refuse.status).toBe(409);
    expect(await testPrisma.contactMessage.count({ where: { id: fresh.id } })).toBe(1);

    expect(
      (
        await request(t.app)
          .delete(`/api/v1/contact-messages/${answered.id}`)
          .set('Cookie', admin.cookie)
      ).status,
    ).toBe(204);
    expect(
      await testPrisma.auditLog.count({
        where: { action: 'contact.delete', userId: admin.user.id },
      }),
    ).toBe(1);
    expect(
      (
        await request(t.app)
          .delete(`/api/v1/contact-messages/${answered.id}`)
          .set('Cookie', admin.cookie)
      ).status,
    ).toBe(404);
  });
});
