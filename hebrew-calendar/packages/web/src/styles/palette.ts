/**
 * The token palette in data form, mirroring `tokens.css`.
 *
 * Kept in sync deliberately so the contrast suite can assert, in CI, that every
 * foreground/background pairing the UI actually uses meets WCAG 2.1 AA. If you
 * change a colour in tokens.css, change it here and the test will confirm it.
 */
export interface Palette {
  surface: string;
  canvas: string;
  sunken: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
  primary: string;
  primaryTint: string;
  primaryTintInk: string;
  danger: string;
  dangerTint: string;
  dangerTintInk: string;
  success: string;
  successTint: string;
  successTintInk: string;
  holiday: string;
  holidayTint: string;
  holidayTintInk: string;
  recurrenceTint: string;
  recurrenceTintInk: string;
  border: string;
  borderStrong: string;
  onAccent: string;
}

export const lightPalette: Palette = {
  surface: '#ffffff',
  canvas: '#f7f8fa',
  sunken: '#f1f3f6',
  ink: '#14161a',
  inkMuted: '#5a6472',
  inkSubtle: '#6b7480',
  primary: '#2b57c4',
  primaryTint: '#eaf0fd',
  primaryTintInk: '#1e46a4',
  danger: '#b4232c',
  dangerTint: '#fdecec',
  dangerTintInk: '#97202a',
  success: '#1c7a4d',
  successTint: '#e6f5ed',
  successTintInk: '#145f3c',
  holiday: '#8a5300',
  holidayTint: '#fdf1dd',
  holidayTintInk: '#7a4900',
  recurrenceTint: '#e8f3f1',
  recurrenceTintInk: '#14615a',
  border: '#e2e5ea',
  borderStrong: '#8b93a3',
  onAccent: '#ffffff',
};

export const darkPalette: Palette = {
  surface: '#14171d',
  canvas: '#0c0e12',
  sunken: '#101318',
  ink: '#e9ecf1',
  inkMuted: '#9aa3b2',
  inkSubtle: '#848d9c',
  primary: '#8fb0ff',
  primaryTint: '#182338',
  primaryTintInk: '#a9c4ff',
  danger: '#ff9b9b',
  dangerTint: '#33191b',
  dangerTintInk: '#ffaeae',
  success: '#6ede9f',
  successTint: '#12251c',
  successTintInk: '#7fe3ac',
  holiday: '#f0c274',
  holidayTint: '#2b2213',
  holidayTintInk: '#f2c983',
  recurrenceTint: '#10262a',
  recurrenceTintInk: '#79d6cb',
  border: '#262c36',
  borderStrong: '#5d687a',
  onAccent: '#0c0e12',
};

/** WCAG 2.1 relative luminance of an `#rrggbb` colour. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.1 contrast ratio between two `#rrggbb` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}
