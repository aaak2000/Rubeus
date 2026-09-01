import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, uniqueEmail } from './setup';

let app: INestApplication;
let token: string;

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
const get = (url: string) => auth(request(app.getHttpServer()).get(url));
const post = (url: string) => auth(request(app.getHttpServer()).post(url));
const patch = (url: string) => auth(request(app.getHttpServer()).patch(url));
const del = (url: string) => auth(request(app.getHttpServer()).delete(url));

beforeAll(async () => {
  ({ app } = await createTestApp());
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: uniqueEmail('yahrzeit'), password: 'password123' })
    .expect(201);
  token = res.body.accessToken;
  await patch('/api/me/settings')
    .send({ tzid: 'Asia/Jerusalem', latitude: 31.7683, longitude: 35.2137, il: true })
    .expect(200);
});
afterAll(async () => {
  await app?.close();
});

describe('yahrzeit register', () => {
  let id: string;

  it('records a name and works out the next observance', async () => {
    const res = await post('/api/yahrzeits')
      .send({
        name: 'סבא יוסף',
        hebrewName: 'יוסף בן אברהם',
        relation: 'סב',
        deathDate: '2019-07-20',
        afterSunset: false,
      })
      .expect(201);
    id = res.body.id;

    expect(res.body.name).toBe('סבא יוסף');
    expect(res.body.hebrewDateText).toBeTruthy();
    expect(res.body.next).not.toBeNull();
    // The next occurrence is ahead of us, not behind.
    expect(res.body.next.daysUntil).toBeGreaterThanOrEqual(0);
    // And it falls on the same Hebrew date as the death.
    expect(res.body.next.hebrewText.split(' ').slice(0, 2).join(' ')).toBe(
      res.body.hebrewDateText.split(' ').slice(0, 2).join(' '),
    );
  });

  it('lights the candle the evening before, when the Hebrew day begins', async () => {
    const res = await get('/api/yahrzeits').expect(200);
    const row = res.body.find((r: { id: string }) => r.id === id);
    expect(row.next.candleAt).toMatch(/^\d{2}:\d{2}$/);
    // The candle date is the day before the yahrzeit itself.
    const day = Date.parse(`${row.next.gregorian}T00:00:00Z`);
    const candle = Date.parse(`${row.next.candleDate}T00:00:00Z`);
    expect((day - candle) / 86_400_000).toBe(1);
  });

  it('moves the Hebrew date a day when death was after sunset', async () => {
    const dayDeath = await post('/api/yahrzeits')
      .send({ name: 'א', deathDate: '2019-07-20', afterSunset: false })
      .expect(201);
    const eveningDeath = await post('/api/yahrzeits')
      .send({ name: 'ב', deathDate: '2019-07-20', afterSunset: true })
      .expect(201);

    // Same Gregorian date of death, one Hebrew day apart — the distinction
    // that decides which day the family observes, every year.
    expect(eveningDeath.body.hebrewDateText).not.toBe(dayDeath.body.hebrewDateText);
    const a = Date.parse(`${dayDeath.body.next.gregorian}T00:00:00Z`);
    const b = Date.parse(`${eveningDeath.body.next.gregorian}T00:00:00Z`);
    expect(Math.abs((b - a) / 86_400_000)).toBe(1);
  });

  it('defaults to reminders a week, a day, and the day itself', async () => {
    const res = await get('/api/yahrzeits').expect(200);
    const row = res.body.find((r: { id: string }) => r.id === id);
    expect(row.remindDaysBefore).toEqual([7, 1, 0]);
  });

  it('stores reminder offsets unique and descending', async () => {
    const res = await patch(`/api/yahrzeits/${id}`)
      .send({ remindDaysBefore: [1, 30, 1, 0] })
      .expect(200);
    expect(res.body.remindDaysBefore).toEqual([30, 1, 0]);
  });

  it('rejects an absurd reminder offset rather than scheduling it', async () => {
    await patch(`/api/yahrzeits/${id}`)
      .send({ remindDaysBefore: [4000] })
      .expect(400);
    await patch(`/api/yahrzeits/${id}`)
      .send({ remindDaysBefore: [1, 2, 3, 4, 5, 6, 7] })
      .expect(400);
  });

  it('rejects a malformed date of death', async () => {
    await post('/api/yahrzeits').send({ name: 'ג', deathDate: 'לא תאריך' }).expect(400);
  });

  it('requires a name', async () => {
    await post('/api/yahrzeits').send({ deathDate: '2019-07-20' }).expect(400);
  });

  it('lists soonest first', async () => {
    const res = await get('/api/yahrzeits').expect(200);
    const days = res.body
      .filter((r: { next: unknown }) => r.next)
      .map((r: { next: { daysUntil: number } }) => r.next.daysUntil);
    expect(days).toEqual([...days].sort((a: number, b: number) => a - b));
  });

  it("hides another user's records, and refuses to edit them", async () => {
    const other = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail('yz-other'), password: 'password123' })
      .expect(201);
    const t2 = other.body.accessToken;

    const theirs = await request(app.getHttpServer())
      .get('/api/yahrzeits')
      .set('Authorization', `Bearer ${t2}`)
      .expect(200);
    expect(theirs.body).toEqual([]);

    // Not 403: that would confirm the id exists.
    await request(app.getHttpServer())
      .patch(`/api/yahrzeits/${id}`)
      .set('Authorization', `Bearer ${t2}`)
      .send({ name: 'נחטף' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/yahrzeits/${id}`)
      .set('Authorization', `Bearer ${t2}`)
      .expect(404);
  });

  it('requires authentication at all', async () => {
    await request(app.getHttpServer()).get('/api/yahrzeits').expect(401);
  });

  it('deletes a record', async () => {
    await del(`/api/yahrzeits/${id}`).expect(200);
    const res = await get('/api/yahrzeits').expect(200);
    expect(res.body.find((r: { id: string }) => r.id === id)).toBeUndefined();
  });
});
