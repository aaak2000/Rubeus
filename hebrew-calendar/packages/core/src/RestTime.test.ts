import { describe, expect, it } from 'vitest';
import { isRestTime, restWindowAt } from './RestTime.js';
import type { GeoPoint } from './types.js';

const JLM: GeoPoint = {
  latitude: 31.7683,
  longitude: 35.2137,
  tzid: 'Asia/Jerusalem',
  il: true,
  name: 'Jerusalem',
};

// 2024-06-21 is a Friday. Sunset in Jerusalem is ~19:47 IDT (16:47Z), so
// candle lighting is ~19:29 IDT (16:29Z) and Shabbat runs to nightfall on
// Saturday 2024-06-22, ~20:30 IDT (17:30Z).
describe('restWindowAt — Shabbat', () => {
  it('is not rest time on Friday afternoon, before candle lighting', () => {
    const w = restWindowAt(new Date('2024-06-21T12:00:00Z'), JLM, true);
    expect(w.isRest).toBe(false);
  });

  it('is rest time on Friday evening, after candle lighting', () => {
    const w = restWindowAt(new Date('2024-06-21T17:30:00Z'), JLM, true);
    expect(w.isRest).toBe(true);
    expect(w.reason).toBe('shabbat');
    expect(w.label).toBe('שבת');
    expect(w.endsAt).toBeInstanceOf(Date);
  });

  it('is rest time through Shabbat day', () => {
    expect(restWindowAt(new Date('2024-06-22T09:00:00Z'), JLM, true).isRest).toBe(true);
  });

  it('is no longer rest time after nightfall on Saturday', () => {
    const w = restWindowAt(new Date('2024-06-22T18:30:00Z'), JLM, true);
    expect(w.isRest).toBe(false);
  });

  it('reports when the current rest period ends', () => {
    const w = restWindowAt(new Date('2024-06-22T09:00:00Z'), JLM, true);
    // Nightfall on the Saturday, i.e. later the same evening.
    expect(w.endsAt!.toISOString().slice(0, 10)).toBe('2024-06-22');
    expect(w.endsAt!.getTime()).toBeGreaterThan(Date.parse('2024-06-22T17:00:00Z'));
  });

  it('is not rest time midweek', () => {
    expect(restWindowAt(new Date('2024-06-19T12:00:00Z'), JLM, true).isRest).toBe(false);
  });
});

describe('restWindowAt — festivals', () => {
  it('treats Rosh Hashana as rest time', () => {
    // 1 Tishrei 5785 falls on Thursday 2024-10-03; the festival begins the
    // evening before.
    const w = restWindowAt(new Date('2024-10-03T09:00:00Z'), JLM, true);
    expect(w.isRest).toBe(true);
    expect(w.reason).toBe('yomtov');
    expect(w.label).toBeTruthy();
  });

  it('does not treat Chol HaMoed as rest time', () => {
    // 2024-10-20 is Chol HaMoed Sukkot, a weekday on which work is permitted.
    const w = restWindowAt(new Date('2024-10-20T09:00:00Z'), JLM, true);
    expect(w.isRest).toBe(false);
  });
});

describe('restWindowAt — without a location', () => {
  it('reports no rest period rather than guessing', () => {
    const w = restWindowAt(new Date('2024-06-22T09:00:00Z'), null, true);
    expect(w.isRest).toBe(false);
    expect(w.reason).toBeNull();
  });

  it('isRestTime mirrors restWindowAt', () => {
    expect(isRestTime(JLM, true, new Date('2024-06-22T09:00:00Z'))).toBe(true);
    expect(isRestTime(JLM, true, new Date('2024-06-19T09:00:00Z'))).toBe(false);
  });
});
