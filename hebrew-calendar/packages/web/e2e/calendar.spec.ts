import { expect, test, type Page } from '@playwright/test';

/** Each spec registers its own account so runs never share state. */
async function signUp(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'הרשמה' }).click();
  await page.getByLabel('דוא״ל').fill(email);
  await page.getByLabel('סיסמה').fill('password123');
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page.locator('.calendar-page')).toBeVisible();
  return email;
}

test.describe('calendar', () => {
  test('signs up and shows a Hebrew calendar', async ({ page }) => {
    await signUp(page);
    // The Hebrew month and year lead; Gregorian is secondary.
    await expect(page.locator('.cal-hebrew')).not.toBeEmpty();
    await expect(page.locator('.cal-gregorian')).not.toBeEmpty();
  });

  test('creates, edits and deletes an event', async ({ page, isMobile }) => {
    await signUp(page);
    if (isMobile) test.skip(true, 'the month grid is not the mobile default view');

    const cell = page.locator('.day-cell:not(.is-outside)').nth(9);
    await cell.hover();
    await cell.locator('.day-add').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('כותרת').fill('בדיקת קצה');
    await dialog.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('האירוע נוצר')).toBeVisible();
    await expect(page.locator('.chip-event', { hasText: 'בדיקת קצה' })).toBeVisible();

    // Reopen for editing.
    await page.locator('.chip-event', { hasText: 'בדיקת קצה' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('כותרת').fill('בדיקת קצה — עודכן');
    await dialog.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.locator('.chip-event', { hasText: 'עודכן' })).toBeVisible();

    // Delete, confirming in the in-app dialog rather than a native confirm().
    await page.locator('.chip-event', { hasText: 'עודכן' }).click();
    await dialog.getByRole('button', { name: 'מחיקה' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'מחיקה' }).click();
    await expect(page.getByText('האירוע נמחק')).toBeVisible();
    await expect(page.locator('.chip-event', { hasText: 'עודכן' })).toHaveCount(0);
  });

  test('switches between all four views', async ({ page, isMobile }) => {
    await signUp(page);
    const switcher = page.getByRole('radiogroup', { name: 'תצוגת יומן' });
    for (const [name, selector] of [
      ['שבוע', '.week-view'],
      ['סדר יום', '.agenda, .empty-state'],
      ['שנה', '.year-view'],
      ['חודש', isMobile ? '.month-view' : '.month-grid'],
    ] as const) {
      await switcher.getByRole('radio', { name }).click();
      await expect(page.locator(selector).first()).toBeVisible();
    }
  });

  test('opens the day drawer with Hebrew zmanim labels', async ({ page, isMobile }) => {
    await signUp(page);
    if (isMobile) {
      await page.getByRole('radiogroup', { name: 'תצוגת יומן' }).getByRole('radio', { name: 'חודש' }).click();
    }
    await page.locator('.day-cell:not(.is-outside)').nth(5).click();
    const drawer = page.locator('.day-drawer');
    await expect(drawer).toBeVisible();
    // Zmanim are named in Hebrew, never by their API keys.
    await expect(drawer).toContainText('זמני היום');
    await expect(drawer).not.toContainText('alotHaShachar');
  });

  test('honours the theme choice', async ({ page }) => {
    await signUp(page);
    await page.locator('.theme-option[aria-label="כהה"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.theme-option[aria-label="בהיר"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('accessibility', () => {
  test('the month grid is keyboard navigable and dialogs restore focus', async ({ page, isMobile }) => {
    await signUp(page);
    if (isMobile) test.skip(true, 'keyboard navigation targets the desktop grid');

    const cells = page.locator('[role="gridcell"]');
    await expect(cells).toHaveCount(42);
    await cells.first().focus();
    const before = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));

    await page.keyboard.press('ArrowDown');
    const after = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(after).not.toBe(before);

    // Enter opens the create dialog; Escape closes it and returns focus.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Restoration is deferred a frame so it lands after the tree re-renders,
    // so poll rather than sampling the instant the dialog disappears.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('role')))
      .toBe('gridcell');
  });

  test('exposes a skip link as the first tab stop', async ({ page }) => {
    await signUp(page);
    await page.goto('/');
    // Wait for the shell to hydrate; tabbing mid-render lands on <body>.
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.skip-link')).toBeAttached();
    await page.keyboard.press('Tab');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.textContent?.trim()))
      .toBe('דילוג לתוכן הראשי');
  });

  test('publishes an accessibility statement', async ({ page }) => {
    await page.goto('/accessibility');
    await expect(page.getByRole('heading', { name: 'הצהרת נגישות' })).toBeVisible();
    await expect(page.getByText('WCAG 2.1')).toBeVisible();
  });
});
