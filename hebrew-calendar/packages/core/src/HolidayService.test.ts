import { describe, expect, it } from 'vitest';
import { HolidayService } from './HolidayService.js';

const svc = new HolidayService();

describe('HolidayService', () => {
  it('finds Pesach on 15 Nisan (23 Apr 2024)', () => {
    const items = svc.onDate('2024-04-23', true);
    expect(items.some((i) => i.desc.includes('Pesach'))).toBe(true);
  });

  it('lists holidays and parasha across a range', () => {
    const items = svc.between('2024-04-20', '2024-04-30', { il: true });
    expect(items.length).toBeGreaterThan(0);
    // Parashat hashavua should appear as a "parashat" category item.
    expect(items.some((i) => i.categories.includes('parashat'))).toBe(true);
    // Every item carries a Hebrew title.
    expect(items.every((i) => i.titleHe.length > 0)).toBe(true);
  });

  it('computes the molad of a month', () => {
    const m = svc.molad(5784, 7); // Tishrei 5784
    expect(m.monthName.length).toBeGreaterThan(0);
    expect(m.dayOfWeek).toBeGreaterThanOrEqual(0);
    expect(m.dayOfWeek).toBeLessThanOrEqual(6);
    expect(m.chalakim).toBeGreaterThanOrEqual(0);
    expect(m.chalakim).toBeLessThan(1080);
  });
});
