import { describe, expect, it } from 'vitest';
import { contrastRatio, darkPalette, lightPalette, type Palette } from './palette';

/** Every pairing the interface actually renders, with its WCAG minimum. */
function pairings(t: Palette): Array<[string, string, string, number]> {
  return [
    ['body text on surface', t.ink, t.surface, 4.5],
    ['body text on canvas', t.ink, t.canvas, 4.5],
    ['muted text on surface', t.inkMuted, t.surface, 4.5],
    ['muted text on canvas', t.inkMuted, t.canvas, 4.5],
    ['muted text on sunken', t.inkMuted, t.sunken, 4.5],
    ['subtle text on surface', t.inkSubtle, t.surface, 4.5],
    ['primary link on surface', t.primary, t.surface, 4.5],
    ['label on primary button', t.onAccent, t.primary, 4.5],
    ['text on primary tint', t.primaryTintInk, t.primaryTint, 4.5],
    ['danger text on surface', t.danger, t.surface, 4.5],
    ['text on danger tint', t.dangerTintInk, t.dangerTint, 4.5],
    ['success text on surface', t.success, t.surface, 4.5],
    ['text on success tint', t.successTintInk, t.successTint, 4.5],
    ['holiday text on surface', t.holiday, t.surface, 4.5],
    ['text on holiday tint', t.holidayTintInk, t.holidayTint, 4.5],
    ['text on recurrence tint', t.recurrenceTintInk, t.recurrenceTint, 4.5],
    // WCAG 1.4.11: UI component boundaries and focus indicators need 3:1.
    ['strong border on surface', t.borderStrong, t.surface, 3],
    ['focus ring on surface', t.primary, t.surface, 3],
  ];
}

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
])('%s theme meets WCAG 2.1 AA', (_name, palette) => {
  it.each(pairings(palette))('%s', (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
