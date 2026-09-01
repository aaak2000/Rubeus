import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { HDate, zonedDateTimeToUtc } from '@hcal/core';
import { createTestApp, uniqueEmail } from './setup';
import { RemindersService } from '../src/notifications/reminders.service';
import { UnsubscribeService } from '../src/notifications/unsubscribe.service';
import { MailService } from '../src/notifications/mail.service';
import { PushService } from '../src/notifications/push.service';
import { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let token: string;
let email: string;
let reminders: RemindersService;
let unsub: UnsubscribeService;
let prisma: PrismaService;

const outbox: { to: string; body: string }[] = [];
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

/**
 * A death date whose yahrzeit lands exactly `daysAhead` from today.
 *
 * "Today" has to be measured in the same timezone the service measures it in —
 * Asia/Jerusalem, the default. Building the target from UTC instead makes the
 * test pass only when the two agree, so it would start failing every evening
 * once UTC and Jerusalem fall on different dates.
 */
function deathDateForYahrzeitIn(daysAhead: number): string {
  const todayThere = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const target = new Date(`${todayThere}T00:00:00.000Z`);
  target.setUTCDate(target.getUTCDate() + daysAhead);
  const hd = new HDate(target);
  const past = new HDate(hd.getDate(), hd.getMonth(), hd.getFullYear() - 5);
  return past.greg().toISOString().slice(0, 10);
}

beforeAll(async () => {
  ({ app } = await createTestApp());
  reminders = app.get(RemindersService);
  unsub = app.get(UnsubscribeService);
  prisma = app.get(PrismaService);

  const mail = app.get(MailService);
  Object.defineProperty(mail, 'enabled', { get: () => true });
  mail.send = async (to: string, _subject: string, text: string) => {
    outbox.push({ to, body: text });
    return true;
  };
  const push = app.get(PushService);
  Object.defineProperty(push, 'enabled', { get: () => false });

  email = uniqueEmail('optout');
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password: 'password123' })
    .expect(201);
  token = res.body.accessToken;
});
afterAll(async () => {
  await app?.close();
});

describe('reminder email opt-out', () => {
  let yahrzeitId: string;
  let whileOptedOutId: string;

  it('defaults to email on, at 09:00 local', async () => {
    const me = await auth(request(app.getHttpServer()).get('/api/me')).expect(200);
    expect(me.body.settings?.emailReminders ?? true).toBe(true);
    expect(me.body.settings?.reminderHour ?? 9).toBe(9);
  });

  it('sends, and every message carries a way out', async () => {
    const created = await auth(request(app.getHttpServer()).post('/api/yahrzeits'))
      .send({ name: 'סבא', deathDate: deathDateForYahrzeitIn(1), remindDaysBefore: [1] })
      .expect(201);
    yahrzeitId = created.body.id;

    outbox.length = 0;
    // atHourOnly=false: this asserts opt-out, not the clock.
    await reminders.dispatch(new Date(), false);

    const mine = outbox.filter((m) => m.to === email);
    expect(mine).toHaveLength(1);
    expect(mine[0].body).toContain('/unsubscribe?token=');
  });

  it('stops sending once the user opts out', async () => {
    await auth(request(app.getHttpServer()).patch('/api/me/settings'))
      .send({ emailReminders: false })
      .expect(200);

    // A second record, so there is something genuinely new to send.
    const created = await auth(request(app.getHttpServer()).post('/api/yahrzeits'))
      .send({ name: 'סבתא', deathDate: deathDateForYahrzeitIn(1), remindDaysBefore: [1] })
      .expect(201);
    whileOptedOutId = created.body.id;

    outbox.length = 0;
    await reminders.dispatch(new Date(), false);
    expect(outbox.filter((m) => m.to === email)).toHaveLength(0);
  });

  it('claims no delivery while opted out, so re-enabling resumes cleanly', async () => {
    // Scoped to this run's record: names are not unique, and the database is
    // shared across suites and re-runs.
    const rows = await prisma.reminderDelivery.findMany({
      where: { yahrzeitId: whileOptedOutId, channel: 'email' },
    });
    expect(rows).toHaveLength(0);

    await auth(request(app.getHttpServer()).patch('/api/me/settings'))
      .send({ emailReminders: true })
      .expect(200);
    outbox.length = 0;
    await reminders.dispatch(new Date(), false);
    expect(outbox.filter((m) => m.to === email).length).toBeGreaterThan(0);
  });
});

describe('the unsubscribe link', () => {
  it('turns email off without any login', async () => {
    const me = await auth(request(app.getHttpServer()).get('/api/me')).expect(200);
    const link = unsub.tokenFor(me.body.id);

    // No Authorization header at all — that is the point of the link.
    const res = await request(app.getHttpServer())
      .post('/api/notifications/unsubscribe')
      .query({ token: link })
      .expect(200);
    expect(res.body).toEqual({ unsubscribed: true });

    const after = await auth(request(app.getHttpServer()).get('/api/me')).expect(200);
    expect(after.body.settings.emailReminders).toBe(false);
  });

  it('rejects a forged or altered token', async () => {
    const me = await auth(request(app.getHttpServer()).get('/api/me')).expect(200);
    const good = unsub.tokenFor(me.body.id);
    const tampered = good.slice(0, -2) + 'xy';

    for (const bad of [tampered, `${me.body.id}.nonsense`, 'garbage', '']) {
      const res = await request(app.getHttpServer())
        .post('/api/notifications/unsubscribe')
        .query({ token: bad })
        .expect(200);
      expect(res.body).toEqual({ unsubscribed: false });
    }
  });

  it('cannot be used to discover whether an address is registered', async () => {
    // A well-formed token for a user that does not exist reports the same
    // success — the sender's wish already holds, and a distinct answer here
    // would turn the link into an account probe.
    const res = await request(app.getHttpServer())
      .post('/api/notifications/unsubscribe')
      .query({ token: unsub.tokenFor('cl00000000000000000000000') })
      .expect(200);
    expect(res.body).toEqual({ unsubscribed: true });
  });
});

describe('reminder hour', () => {
  it('only sends at the hour the user chose, in their own timezone', async () => {
    const other = uniqueEmail('hour');
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: other, password: 'password123' })
      .expect(201);
    const t = reg.body.accessToken;
    const authOther = (r: request.Test) => r.set('Authorization', `Bearer ${t}`);

    await authOther(request(app.getHttpServer()).patch('/api/me/settings'))
      .send({ tzid: 'Asia/Jerusalem', reminderHour: 9 })
      .expect(200);
    await authOther(request(app.getHttpServer()).post('/api/yahrzeits'))
      .send({ name: 'לפי שעה', deathDate: deathDateForYahrzeitIn(1), remindDaysBefore: [1] })
      .expect(201);

    // Both instants must land on the same Jerusalem *date* the record was
    // built against, or the day count moves and the test stops testing hours.
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const due = await reminders.findDue(zonedDateTimeToUtc(today, '09:00', 'Asia/Jerusalem'), true);
    expect(due.some((d) => d.email === other)).toBe(true);

    const notDue = await reminders.findDue(
      zonedDateTimeToUtc(today, '15:00', 'Asia/Jerusalem'),
      true,
    );
    expect(notDue.some((d) => d.email === other)).toBe(false);
  });
});

describe('account deletion', () => {
  it('removes the account and everything hanging off it', async () => {
    const doomed = uniqueEmail('delete-me');
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: doomed, password: 'password123' })
      .expect(201);
    const t = reg.body.accessToken;
    const authDoomed = (r: request.Test) => r.set('Authorization', `Bearer ${t}`);

    await authDoomed(request(app.getHttpServer()).post('/api/yahrzeits'))
      .send({ name: 'נמחק', deathDate: '2019-01-01' })
      .expect(201);
    const me = await authDoomed(request(app.getHttpServer()).get('/api/me')).expect(200);
    const userId = me.body.id;

    await authDoomed(request(app.getHttpServer()).delete('/api/me')).expect(200);

    // Nothing left behind: data the user believes is gone must actually be.
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.yahrzeit.count({ where: { userId } })).toBe(0);
    expect(await prisma.userSettings.count({ where: { userId } })).toBe(0);
    expect(await prisma.calendar.count({ where: { userId } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).delete('/api/me').expect(401);
  });
});
