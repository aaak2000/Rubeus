import { describe, expect, it } from 'vitest';
import { ZmanimService } from './ZmanimService.js';
import type { GeoPoint } from './types.js';

const svc = new ZmanimService();
const jerusalem: GeoPoint = {
  latitude: 31.7683,
  longitude: 35.2137,
  tzid: 'Asia/Jerusalem',
  il: true,
  name: 'Jerusalem',
};

function toMinutes(hhmm: string | null): number {
  if (!hhmm) return NaN;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

describe('ZmanimService', () => {
  it('returns ordered zmanim for Jerusalem on the summer solstice', () => {
    const z = svc.forDate('2024-06-21', jerusalem);
    expect(z.date).toBe('2024-06-21');
    for (const key of ['sunrise', 'chatzot', 'sunset', 'tzeit']) {
      expect(z.times[key]).toMatch(/^\d{2}:\d{2}$/);
    }
    const sunrise = toMinutes(z.times.sunrise!);
    const chatzot = toMinutes(z.times.chatzot!);
    const sunset = toMinutes(z.times.sunset!);
    const tzeit = toMinutes(z.times.tzeit!);
    expect(sunrise).toBeLessThan(chatzot);
    expect(chatzot).toBeLessThan(sunset);
    expect(sunset).toBeLessThan(tzeit);
  });

  it('computes candle lighting before sunset', () => {
    const cl = svc.candleLighting('2024-06-21', jerusalem);
    expect(cl).toMatch(/^\d{2}:\d{2}$/);
    const sunset = toMinutes(svc.forDate('2024-06-21', jerusalem).times.sunset!);
    expect(toMinutes(cl)).toBeLessThan(sunset);
  });
});
