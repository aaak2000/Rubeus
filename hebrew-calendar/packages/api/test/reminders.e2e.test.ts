import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { HDate } from '@hcal/core';
import { createTestApp, uniqueEmail } from './setup';
import { RemindersService } from '../src/notifications/reminders.service';
import { PushService } from '../src/notifications/push.service';
import { MailService } from '../src/notifications/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let token: string;
let reminders: RemindersService;
let prisma: PrismaService;

/** Mail and push are replaced with recorders — no network, no real sends. */
const outbox: { to: string; subject: string }[] = [];
const pushed: { userId: string; title: string }[] = [];

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  ({ app } = await createTestApp());
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: uniqueEmail('reminders'), password: 'password123' })
    .expect(201);
  token = res.body.accessToken;

  reminders = app.get(RemindersService);
  prisma = app.get(PrismaService);

  const mail = app.get(MailService);
  Object.defineProperty(mail, 'enabled', { get: () => true });
  mail.send = async (to: string, subject: string) => {
    outbox.push({ to, subject });
    return true;
  };
  const push = app.get(PushService);
  Object.defineProperty(push, 'enabled', { get: () => true });
  push.sendToUser = async (userId: string, payload) => {
    pushed.push({ userId, title: payload.title });
    return 1;
  };
});
afterAll(async () => {
  await app?.close();
});

/**
 * A death date whose yahrzeit lands exactly `daysAhead` from today, so the
 * reminder is due now. Working backwards through the Hebrew calendar is the
 * only way to build this: the Gregorian date moves every year.
 */
function deathDateForYahrzeitIn(daysAhead: number): string {
  const target = new Date();
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() + daysAhead);
  const hd = new HDate(target);
  // Same Hebrew date, several years back — far enough that the yahrzeit has
  // begun recurring.
  const past = new HDate(hd.getDate(), hd.getMonth(), hd.getFullYear() - 5);
  return past.greg().toISOString().slice(0, 10);
}

describe('yahrzeit reminder dispatch', () => {
  let id: string;

  it('finds a reminder whose offset matches the days remaining', async () => {
    const created = await auth(request(app.getHttpServer()).post('/api/yahrzeits'))
      .send({
        name: 'סבתא מרים',
        deathDate: deathDateForYahrzeitIn(7),
        remindDaysBefore: [7],
      })
      .expect(201);
    id = created.body.id;
    expect(created.body.next.daysUntil).toBe(7);

    const due = await reminders.findDue();
    const mine = due.filter((d) => d.yahrzeitId === id);
    expect(mine).toHaveLength(1);
    expect(mine[0].daysBefore).toBe(7);
  });

  it('sends on both channels and names the person', async () => {
    outbox.length = 0;
    pushed.length = 0;
    await reminders.dispatch();

    expect(pushed.some((p) => p.title.includes('סבתא מרים'))).toBe(true);
    expect(outbox.some((m) => m.subject.includes('סבתא מרים'))).toBe(true);
    // "בעוד 7 ימים" — the offset is stated, not just the name.
    expect(pushed.find((p) => p.title.includes('סבתא מרים'))!.title).toContain('7');
  });

  it('never sends the same reminder twice', async () => {
    outbox.length = 0;
    pushed.length = 0;
    const second = await reminders.dispatch();

    // The delivery rows from the first run claim it; nothing new goes out.
    expect(outbox).toHaveLength(0);
    expect(pushed).toHaveLength(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(second.sent).toBe(0);
  });

  it('records one delivery per channel', async () => {
    const rows = await prisma.reminderDelivery.findMany({ where: { yahrzeitId: id } });
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'push']);
  });

  it('releases the claim when a send fails, so the next run retries', async () => {
    const failing = await auth(request(app.getHttpServer()).post('/api/yahrzeits'))
      .send({ name: 'נכשל', deathDate: deathDateForYahrzeitIn(1), remindDaysBefore: [1] })
      .expect(201);

    const mail = app.get(MailService);
    const push = app.get(PushService);
    const realMail = mail.send;
    const realPush = push.sendToUser;
    mail.send = async () => false;
    push.sendToUser = async () => 0;
    try {
      await reminders.dispatch();
      const rows = await prisma.reminderDelivery.findMany({
        where: { yahrzeitId: failing.body.id },
      });
      // Nothing went out, so nothing is recorded as sent.
      expect(rows).toHaveLength(0);
    } finally {
      mail.send = realMail;
      push.sendToUser = realPush;
    }

    // With delivery working again the reminder still goes out.
    outbox.length = 0;
    await reminders.dispatch();
    expect(outbox.some((m) => m.subject.includes('נכשל'))).toBe(true);
  });

  it('leaves alone a yahrzeit whose offset has not come round', async () => {
    const later = await auth(request(app.getHttpServer()).post('/api/yahrzeits'))
      .send({ name: 'רחוק', deathDate: deathDateForYahrzeitIn(40), remindDaysBefore: [7, 1, 0] })
      .expect(201);
    const due = await reminders.findDue();
    expect(due.some((d) => d.yahrzeitId === later.body.id)).toBe(false);
  });

  it('sends nothing for a record with no offsets', async () => {
    const quiet = await auth(request(app.getHttpServer()).post('/api/yahrzeits'))
      .send({ name: 'שקט', deathDate: deathDateForYahrzeitIn(7), remindDaysBefore: [] })
      .expect(201);
    const due = await reminders.findDue();
    expect(due.some((d) => d.yahrzeitId === quiet.body.id)).toBe(false);
  });
});

describe('notification config', () => {
  it('reports which channels this deployment can deliver on', async () => {
    const res = await auth(request(app.getHttpServer()).get('/api/notifications/config')).expect(200);
    expect(res.body).toHaveProperty('push.enabled');
    expect(res.body).toHaveProperty('email.enabled');
  });

  it('rejects a push subscription missing its keys', async () => {
    await auth(request(app.getHttpServer()).post('/api/notifications/push'))
      .send({ endpoint: 'https://example.test/ep' })
      .expect(400);
  });

  it('stores and removes a push subscription', async () => {
    const endpoint = `https://example.test/ep-${Date.now()}`;
    await auth(request(app.getHttpServer()).post('/api/notifications/push'))
      .send({ endpoint, keys: { p256dh: 'key', auth: 'secret' } })
      .expect(201);
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);

    // Re-subscribing the same device updates rather than duplicating.
    await auth(request(app.getHttpServer()).post('/api/notifications/push'))
      .send({ endpoint, keys: { p256dh: 'key2', auth: 'secret2' } })
      .expect(201);
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);

    await auth(request(app.getHttpServer()).delete('/api/notifications/push'))
      .send({ endpoint })
      .expect(200);
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/notifications/config').expect(401);
  });
});
