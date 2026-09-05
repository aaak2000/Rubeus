import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, uniqueEmail } from './setup';

let app: INestApplication;
let token: string;
let calendarId: string;

const server = () => request(app.getHttpServer());

/** supertest's agent has no `.set`; the header goes on each request. */
const authGet = (url: string) => server().get(url).set('Authorization', `Bearer ${token}`);
const authPost = (url: string) => server().post(url).set('Authorization', `Bearer ${token}`);
const authPatch = (url: string) => server().patch(url).set('Authorization', `Bearer ${token}`);
const authDelete = (url: string) => server().delete(url).set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  ({ app } = await createTestApp());
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: uniqueEmail('events'), password: 'password123' })
    .expect(201);
  token = res.body.accessToken;
  const cals = await request(app.getHttpServer())
    .get('/api/calendars')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  calendarId = cals.body[0].id;
});
afterAll(async () => {
  await app?.close();
});

function createEvent(body: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post(`/api/calendars/${calendarId}/events`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function listEvents(start: string, end: string) {
  return request(app.getHttpServer())
    .get(`/api/calendars/${calendarId}/events`)
    .query({ start, end })
    .set('Authorization', `Bearer ${token}`);
}

describe('events', () => {
  it('creates a calendar for every new user', async () => {
    const res = await authGet('/api/calendars').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].isDefault).toBe(true);
  });

  it('round-trips a single event', async () => {
    const created = await createEvent({
      title: 'פגישה',
      start: '2024-06-21T06:00:00.000Z',
      end: '2024-06-21T07:00:00.000Z',
    }).expect(201);

    const list = await listEvents('2024-06-20T00:00:00Z', '2024-06-22T00:00:00Z').expect(200);
    const found = list.body.find((e: { id: string }) => e.id === created.body.id);
    expect(found.title).toBe('פגישה');
    // Resolved in the user's timezone (Asia/Jerusalem by default).
    expect(found.localDate).toBe('2024-06-21');
    expect(found.hebrew.text).toBeTruthy();
  });

  it('files a late-evening UTC instant under the correct local day', async () => {
    // 22:30Z on 21 June is 01:30 on 22 June in Jerusalem.
    await createEvent({
      title: 'אירוע לילה',
      start: '2024-06-21T22:30:00.000Z',
      end: '2024-06-21T23:30:00.000Z',
    }).expect(201);
    const list = await listEvents('2024-06-22T00:00:00Z', '2024-06-22T23:59:59Z').expect(200);
    expect(
      list.body.some(
        (e: { title: string; localDate: string }) =>
          e.title === 'אירוע לילה' && e.localDate === '2024-06-22',
      ),
    ).toBe(true);
  });

  it('expands a weekly RRULE into concrete occurrences', async () => {
    await createEvent({
      title: 'סדרה שבועית',
      start: '2024-01-03T07:00:00.000Z',
      end: '2024-01-03T08:00:00.000Z',
      rrule: 'FREQ=WEEKLY;COUNT=4',
    }).expect(201);
    const list = await listEvents('2024-01-01T00:00:00Z', '2024-02-15T00:00:00Z').expect(200);
    const occurrences = list.body.filter((e: { title: string }) => e.title === 'סדרה שבועית');
    expect(occurrences).toHaveLength(4);
    expect(occurrences.every((e: { isOccurrence: boolean }) => e.isOccurrence)).toBe(true);
    expect(occurrences.map((e: { localDate: string }) => e.localDate)).toEqual([
      '2024-01-03',
      '2024-01-10',
      '2024-01-17',
      '2024-01-24',
    ]);
  });

  it('expands a Hebrew yahrzeit onto the right Hebrew date each year', async () => {
    // 2014-03-02 is 30 Adar I 5774 — the leap-year edge case.
    await createEvent({
      title: 'יארצייט',
      start: '2014-03-02T00:00:00.000Z',
      end: '2014-03-02T23:59:59.000Z',
      allDay: true,
      hebrewRecurrence: 'yahrzeit',
      hebrewRecurrenceDate: '2014-03-02',
    }).expect(201);
    const list = await listEvents('2020-01-01T00:00:00Z', '2020-12-31T00:00:00Z').expect(200);
    const occ = list.body.filter((e: { title: string }) => e.title === 'יארצייט');
    expect(occ).toHaveLength(1);
    expect(occ[0].localDate).toBe('2020-02-25'); // 30 Sh'vat 5780
  });

  it('updates and deletes an event', async () => {
    const created = await createEvent({
      title: 'טיוטה',
      start: '2024-05-01T06:00:00.000Z',
      end: '2024-05-01T07:00:00.000Z',
    }).expect(201);

    await authPatch(`/api/calendars/${calendarId}/events/${created.body.id}`)
      .send({ title: 'מעודכן' })
      .expect(200);

    await authDelete(`/api/calendars/${calendarId}/events/${created.body.id}`).expect(200);
    const after = await listEvents('2024-05-01T00:00:00Z', '2024-05-02T00:00:00Z').expect(200);
    expect(after.body.some((e: { id: string }) => e.id === created.body.id)).toBe(false);
  });

  it('rejects unknown fields rather than ignoring them', async () => {
    await createEvent({
      title: 'x',
      start: '2024-05-01T06:00:00.000Z',
      end: '2024-05-01T07:00:00.000Z',
      unexpected: 'value',
    }).expect(400);
  });

  it('requires a bounded date range', async () => {
    await listEvents('2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z').expect(400);
    await listEvents('2024-06-10T00:00:00Z', '2024-06-01T00:00:00Z').expect(400);
  });

  it("refuses access to another user's calendar", async () => {
    const other = await server()
      .post('/api/auth/register')
      .send({ email: uniqueEmail('intruder'), password: 'password123' })
      .expect(201);
    await server()
      .get(`/api/calendars/${calendarId}/events`)
      .query({ start: '2024-06-01T00:00:00Z', end: '2024-06-02T00:00:00Z' })
      .set('Authorization', `Bearer ${other.body.accessToken}`)
      .expect(403);
  });
});

describe('ICS import and export', () => {
  const ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hcal//test//EN',
    'BEGIN:VEVENT',
    'UID:imported-event-1',
    'SUMMARY:אירוע מיובא',
    'DTSTAMP:20240601T090000Z',
    'DTSTART:20240601T090000Z',
    'DTEND:20240601T100000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  // The second regression this suite exists for: ImportIcsDto.ics carried no
  // validation decorator, so whitelist:true stripped it and import crashed.
  it('imports events from an ICS document', async () => {
    const res = await authPost(`/api/calendars/${calendarId}/import.ics`)
      .send({ ics: ICS })
      .expect(201);
    expect(res.body.imported).toBe(1);
    const list = await listEvents('2024-06-01T00:00:00Z', '2024-06-02T00:00:00Z').expect(200);
    expect(list.body.some((e: { title: string }) => e.title === 'אירוע מיובא')).toBe(true);
  });

  it('rejects an empty import body', async () => {
    await authPost(`/api/calendars/${calendarId}/import.ics`).send({}).expect(400);
  });

  it('exports the calendar as iCalendar', async () => {
    const res = await authGet(`/api/calendars/${calendarId}/export.ics`).expect(200);
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain('BEGIN:VEVENT');
  });

  it('refuses to sync a calendar that is not linked to a provider', async () => {
    const res = await authPost(`/api/calendars/${calendarId}/sync`).expect(400);
    expect(res.body.message).toMatch(/not linked/i);
  });
});

describe('recurrence on the civil calendar', () => {
  it('repeats weekly on the weekday the rule names', async () => {
    // 2026-10-06 is a Tuesday.
    const created = await createEvent({
      title: 'שיעור שבועי',
      start: '2026-10-06T17:00:00.000Z',
      end: '2026-10-06T18:00:00.000Z',
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
    }).expect(201);
    expect(created.body.rrule).toBe('FREQ=WEEKLY;BYDAY=TU');

    const res = await listEvents('2026-10-01', '2026-10-31').expect(200);
    const days = res.body
      .filter((e: { title: string }) => e.title === 'שיעור שבועי')
      .map((e: { localDate: string }) => e.localDate);
    // Every Tuesday in October 2026, and nothing else.
    expect(days).toEqual(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
  });

  it('carries the description through', async () => {
    const created = await createEvent({
      title: 'עם תיאור',
      description: 'מה שצריך לזכור על האירוע',
      start: '2026-11-02T09:00:00.000Z',
      end: '2026-11-02T10:00:00.000Z',
    }).expect(201);
    expect(created.body.description).toBe('מה שצריך לזכור על האירוע');

    const res = await listEvents('2026-11-01', '2026-11-03').expect(200);
    const row = res.body.find((e: { id: string }) => e.id === created.body.id);
    expect(row.description).toBe('מה שצריך לזכור על האירוע');
  });
});

describe('changing what an event repeats on', () => {
  it('clears the Hebrew anchor when the event moves to a civil rule', async () => {
    // The bug this pins: `x ? new Date(x) : undefined` treated an explicit
    // null as "unchanged", so the anchor date survived a switch away from
    // Hebrew recurrence and could never be cleared at all.
    const created = await createEvent({
      title: 'עובר ללועזי',
      start: '2026-07-20T09:00:00.000Z',
      end: '2026-07-20T10:00:00.000Z',
      hebrewRecurrence: 'yahrzeit',
      hebrewRecurrenceDate: '2026-07-20',
    }).expect(201);
    expect(created.body.hebrewRecurrenceDate).not.toBeNull();

    const updated = await authPatch(`/api/calendars/${calendarId}/events/${created.body.id}`)
      .send({
        hebrewRecurrence: null,
        hebrewRecurrenceDate: null,
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
      })
      .expect(200);

    expect(updated.body.hebrewRecurrence).toBeNull();
    expect(updated.body.hebrewRecurrenceDate).toBeNull();
    expect(updated.body.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('removes recurrence entirely when both are cleared', async () => {
    const created = await createEvent({
      title: 'חוזר ואז לא',
      start: '2026-08-03T09:00:00.000Z',
      end: '2026-08-03T10:00:00.000Z',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
    }).expect(201);

    await authPatch(`/api/calendars/${calendarId}/events/${created.body.id}`)
      .send({ rrule: null, hebrewRecurrence: null, hebrewRecurrenceDate: null })
      .expect(200);

    const res = await listEvents('2026-08-01', '2026-08-31').expect(200);
    const days = res.body
      .filter((e: { title: string }) => e.title === 'חוזר ואז לא')
      .map((e: { localDate: string }) => e.localDate);
    // Once only — the Mondays after it are gone.
    expect(days).toEqual(['2026-08-03']);
  });

  it('leaves a field alone when the body does not mention it', async () => {
    const created = await createEvent({
      title: 'עריכה חלקית',
      description: 'תיאור מקורי',
      start: '2026-09-07T09:00:00.000Z',
      end: '2026-09-07T10:00:00.000Z',
      hebrewRecurrence: 'birthday',
      hebrewRecurrenceDate: '2026-09-07',
    }).expect(201);

    // Editing only the title must not wipe everything else.
    const updated = await authPatch(`/api/calendars/${calendarId}/events/${created.body.id}`)
      .send({ title: 'כותרת חדשה' })
      .expect(200);

    expect(updated.body.title).toBe('כותרת חדשה');
    expect(updated.body.description).toBe('תיאור מקורי');
    expect(updated.body.hebrewRecurrence).toBe('birthday');
    expect(updated.body.hebrewRecurrenceDate).not.toBeNull();
  });
});
