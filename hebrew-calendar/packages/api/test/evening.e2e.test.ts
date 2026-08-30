import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, uniqueEmail } from './setup';

/**
 * The Hebrew day begins at sunset, so an evening event belongs to the *next*
 * Hebrew date. These tests drive the real API to prove that an event entered
 * at 21:00 is filed — and found — under the Hebrew day a user would look for
 * it on, not the civil date it happens to share a clock with.
 */

let app: INestApplication;
let token: string;
let calendarId: string;

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  ({ app } = await createTestApp());
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: uniqueEmail('evening'), password: 'password123' })
    .expect(201);
  token = res.body.accessToken;
  const cals = await auth(request(app.getHttpServer()).get('/api/calendars')).expect(200);
  calendarId = cals.body[0].id;
  // Jerusalem, so sunset is defined and the Hebrew day can actually turn.
  await auth(request(app.getHttpServer()).patch('/api/me/settings'))
    .send({ tzid: 'Asia/Jerusalem', latitude: 31.7683, longitude: 35.2137, il: true })
    .expect(200);
});
afterAll(async () => {
  await app?.close();
});

function create(body: Record<string, unknown>) {
  return auth(request(app.getHttpServer()).post(`/api/calendars/${calendarId}/events`)).send(body);
}
function list(start: string, end: string) {
  return auth(request(app.getHttpServer()).get(`/api/calendars/${calendarId}/events`)).query({
    start,
    end,
  });
}

// 16 Sep 2026 in Jerusalem: sunset ~18:43 (UTC+3, so 15:43Z).
const MORNING = '2026-09-16T06:00:00.000Z'; // 09:00 local
const EVENING = '2026-09-16T18:00:00.000Z'; // 21:00 local, after sunset

describe('evening events and the Hebrew day', () => {
  it('files a daytime event under its own day', async () => {
    const created = await create({
      title: 'שיעור בוקר',
      start: MORNING,
      end: '2026-09-16T07:00:00.000Z',
    }).expect(201);

    const res = await list('2026-09-16T00:00:00.000Z', '2026-09-16T23:59:59.000Z').expect(200);
    const found = res.body.find((e: { id: string }) => e.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.localDate).toBe('2026-09-16');
    expect(found.hebrewDay).toBe('2026-09-16');
    expect(found.isEvening).toBe(false);
  });

  it('files an evening event under the following Hebrew day', async () => {
    const created = await create({
      title: 'סעודת ליל שישי',
      start: EVENING,
      end: '2026-09-16T19:30:00.000Z',
    }).expect(201);

    const res = await list('2026-09-16T00:00:00.000Z', '2026-09-18T23:59:59.000Z').expect(200);
    const found = res.body.find((e: { id: string }) => e.id === created.body.id);
    expect(found).toBeDefined();
    // Its clock date is the 16th, but the Hebrew day already turned.
    expect(found.localDate).toBe('2026-09-16');
    expect(found.hebrewDay).toBe('2026-09-17');
    expect(found.isEvening).toBe(true);
    // And the Hebrew date shown is the 17th's, one day on from the 16th's.
    const morning = res.body.find((e: { title: string }) => e.title === 'שיעור בוקר');
    expect(found.hebrew.day).toBe(morning.hebrew.day + 1);
  });

  it('returns an evening event when the window asks for the Hebrew day it belongs to', async () => {
    // A user opening 17 September must see the event entered on the 16th at
    // 21:00 — that is the Hebrew day it is part of.
    const res = await list('2026-09-17T00:00:00.000Z', '2026-09-17T23:59:59.000Z').expect(200);
    const titles = res.body.map((e: { title: string }) => e.title);
    expect(titles).toContain('סעודת ליל שישי');
    expect(titles).not.toContain('שיעור בוקר');
  });

  it('honours a user who prefers the civil day', async () => {
    await auth(request(app.getHttpServer()).patch('/api/me/settings'))
      .send({ dayBoundary: 'midnight' })
      .expect(200);
    try {
      const res = await list('2026-09-16T00:00:00.000Z', '2026-09-16T23:59:59.000Z').expect(200);
      const titles = res.body.map((e: { title: string }) => e.title);
      // Under a midnight boundary both events share the 16th.
      expect(titles).toContain('סעודת ליל שישי');
      expect(titles).toContain('שיעור בוקר');
    } finally {
      await auth(request(app.getHttpServer()).patch('/api/me/settings'))
        .send({ dayBoundary: 'sunset' })
        .expect(200);
    }
  });

  it('leaves an all-day event on its own date, having no evening half', async () => {
    const created = await create({
      title: 'יום עיון',
      start: '2026-09-20T00:00:00.000Z',
      end: '2026-09-20T23:59:00.000Z',
      allDay: true,
    }).expect(201);

    const res = await list('2026-09-20T00:00:00.000Z', '2026-09-20T23:59:59.000Z').expect(200);
    const found = res.body.find((e: { id: string }) => e.id === created.body.id);
    expect(found.localDate).toBe(found.hebrewDay);
    expect(found.isEvening).toBe(false);
  });

  it('falls back to the civil day for a user with no location set', async () => {
    const other = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail('nogeo'), password: 'password123' })
      .expect(201);
    const t = other.body.accessToken;
    const cals = await request(app.getHttpServer())
      .get('/api/calendars')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    const cal = cals.body[0].id;
    await request(app.getHttpServer())
      .post(`/api/calendars/${cal}/events`)
      .set('Authorization', `Bearer ${t}`)
      .send({ title: 'ערב', start: EVENING, end: '2026-09-16T19:00:00.000Z' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/calendars/${cal}/events`)
      .set('Authorization', `Bearer ${t}`)
      .query({ start: '2026-09-16T00:00:00.000Z', end: '2026-09-16T23:59:59.000Z' })
      .expect(200);
    const found = res.body.find((e: { title: string }) => e.title === 'ערב');
    // Without a location there is no sunset to turn the day on, so the event
    // stays put rather than being moved on a guess.
    expect(found.hebrewDay).toBe('2026-09-16');
    expect(found.isEvening).toBe(false);
  });
});
