import { expect, type Page, test } from '@playwright/test';

/**
 * Where an evening event is drawn.
 *
 * The regression these cover was invisible to the existing week-view test,
 * which only asserted that `.week-view` rendered. An event at 21:00 belongs to
 * the *following* Hebrew day, and the week view's hour axis is a civil clock —
 * so placing it on the axis drew it a full day late. These assert placement.
 */

async function signUp(page: Page): Promise<void> {
  const email = `eve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'הרשמה' }).click();
  await page.getByLabel('דוא״ל').fill(email);
  await page.getByLabel('סיסמה').fill('password123');
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page.locator('.calendar-page')).toBeVisible();
  await page.getByRole('button', { name: 'מודעות כלליות בלבד' }).click();
}

/** Give the account a location, so sunset — and the Hebrew day — is defined. */
async function setJerusalem(page: Page): Promise<void> {
  await page.goto('/settings');
  await page.getByLabel('קו רוחב').fill('31.7683');
  await page.getByLabel('קו אורך').fill('35.2137');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('ההגדרות נשמרו')).toBeVisible();
}

/** Create a timed event on the selected day via the day drawer. */
async function createTimed(page: Page, title: string, start: string, end: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /אירוע חדש/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('כותרת').fill(title);
  await dialog.getByText('אירוע של יום שלם').click();
  await dialog.getByLabel('שעת התחלה').fill(start);
  await dialog.getByLabel('שעת סיום').fill(end);
  await dialog.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('האירוע נוצר')).toBeVisible();
}

test.describe('evening events', () => {
  test('the form says which civil evening a post-sunset time lands on', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'drives the month grid, which is not the mobile default');
    await signUp(page);
    await setJerusalem(page);
    await page.goto('/');

    const cell = page.locator('.day-cell:not(.is-outside)').nth(9);
    await cell.hover();
    await cell.locator('.day-add').click();

    const dialog = page.getByRole('dialog', { name: /אירוע חדש/ });
    await dialog.getByText('אירוע של יום שלם').click();
    await dialog.getByLabel('שעת התחלה').fill('09:00');
    await expect(page.locator('.day-hint')).not.toContainText('ליל');

    // Past sunset the same picked Hebrew day resolves to the previous evening.
    await dialog.getByLabel('שעת התחלה').fill('21:00');
    await expect(page.locator('.day-hint')).toContainText('ליל');
    await expect(page.locator('.day-hint')).toContainText('לאחר השקיעה');
  });

  test('an evening event is marked, and never drawn on the hour axis', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'drives the month grid, which is not the mobile default');
    await signUp(page);
    await setJerusalem(page);
    await page.goto('/');

    const today = page.locator('.day-cell.is-today');
    await today.hover();
    await today.locator('.day-add').click();
    await createTimed(page, 'סעודת ליל שבת', '21:00', '22:30');

    // Month grid: marked as an evening event.
    const chip = page.locator('.chip-evening', { hasText: 'סעודת ליל שבת' });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('ליל');

    // Week view: it belongs in the header band, not the hour axis. Drawn on the
    // axis it would sit at the 21:00 slot of a day it does not happen on.
    await page
      .getByRole('radiogroup', { name: 'תצוגת יומן' })
      .getByRole('radio', { name: 'שבוע' })
      .click();
    await expect(page.locator('.week-view')).toBeVisible();
    await expect(page.locator('.week-event', { hasText: 'סעודת ליל שבת' })).toHaveCount(0);
    await expect(
      page.locator('.week-head .chip-evening', { hasText: 'סעודת ליל שבת' }),
    ).toBeVisible();
  });

  test('a daytime event still sits on the hour axis', async ({ page, isMobile }) => {
    test.skip(isMobile, 'drives the month grid, which is not the mobile default');
    await signUp(page);
    await setJerusalem(page);
    await page.goto('/');

    const today = page.locator('.day-cell.is-today');
    await today.hover();
    await today.locator('.day-add').click();
    await createTimed(page, 'שיעור בוקר', '09:00', '10:00');

    await page
      .getByRole('radiogroup', { name: 'תצוגת יומן' })
      .getByRole('radio', { name: 'שבוע' })
      .click();
    const event = page.locator('.week-event', { hasText: 'שיעור בוקר' });
    await expect(event).toBeVisible();
    // 09:00 against an axis starting at 06:00 — three slots down, not at the top.
    const box = await event.boundingBox();
    const column = await page.locator('.week-column').first().boundingBox();
    expect(box!.y - column!.y).toBeGreaterThan(100);
  });
});
