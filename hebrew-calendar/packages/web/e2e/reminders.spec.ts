import { expect, test, type Page } from '@playwright/test';

async function signUp(page: Page): Promise<void> {
  const email = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'הרשמה' }).click();
  await page.getByLabel('דוא״ל').fill(email);
  await page.getByLabel('סיסמה').fill('password123');
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page.locator('.calendar-page')).toBeVisible();
  // Answer consent so the banner cannot sit over anything under test.
  await page.getByRole('button', { name: 'מודעות כלליות בלבד' }).click();
}

test.describe('memorial register', () => {
  test('adds a name and shows when the next observance falls', async ({ page }) => {
    await signUp(page);
    await page
      .getByRole('navigation', { name: 'ניווט ראשי' })
      .getByRole('link', { name: 'תזכורות' })
      .click();
    await expect(page.getByRole('heading', { name: 'תזכורות' })).toBeVisible();
    await expect(page.locator('.empty-state')).toBeVisible();

    await page.getByRole('button', { name: 'הוספת שם' }).first().click();
    await page.getByRole('textbox', { name: 'שם', exact: true }).fill('סבא יוסף');
    await page.getByLabel('תאריך הפטירה (לועזי)').fill('2019-07-20');
    await page.getByRole('button', { name: 'שמירה' }).click();

    const card = page.locator('.yz-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.yz-name')).toHaveText('סבא יוסף');
    // A countdown, not a raw date: the question is "when", not "which day".
    await expect(card.locator('.yz-countdown')).toHaveText(/היום|מחר|עוד \d+ ימים/);
  });

  test('the after-sunset switch changes the Hebrew date it resolves to', async ({ page }) => {
    await signUp(page);
    await page.goto('/reminders');
    await page.getByRole('button', { name: 'הוספת שם' }).first().click();
    await page.getByRole('textbox', { name: 'שם', exact: true }).fill('בדיקה');
    await page.getByLabel('תאריך הפטירה (לועזי)').fill('2019-07-20');

    const hint = page.locator('.day-hint');
    await expect(hint).toBeVisible();
    const daytime = await hint.textContent();

    await page.getByText('הפטירה הייתה אחרי השקיעה').click();
    // The Hebrew day begins at sunset, so an evening death is a day later —
    // and the form has to show that, or the switch is unexplained.
    await expect(hint).not.toHaveText(daytime!);
  });

  test('offers the subscription that removes ads', async ({ page }) => {
    await signUp(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'מנוי ללא פרסומות' })).toBeVisible();
    await expect(page.locator('.sub-price')).toContainText('לחודש');
    // Every calendar feature stays open; only ads are behind it.
    await expect(page.getByText('כל יכולות היומן פתוחות')).toBeVisible();
  });

  test('offers notifications, and does not prompt for permission unasked', async ({ page }) => {
    // Record every request for the permission. Asserting on
    // `Notification.permission` instead would test the browser's starting
    // state — which is "denied" in headless Chromium — rather than what the
    // app does, and a prompt on load is the fastest route to a permanent
    // refusal that cannot be undone from inside the page.
    await page.addInitScript(() => {
      (window as unknown as { __permissionAsks: number }).__permissionAsks = 0;
      const real = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = ((...args: unknown[]) => {
        (window as unknown as { __permissionAsks: number }).__permissionAsks++;
        return (real as (...a: unknown[]) => Promise<NotificationPermission>)(...args);
      }) as typeof Notification.requestPermission;
    });

    await signUp(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'התראות' })).toBeVisible();
    await expect(page.getByLabel('התראות במכשיר הזה')).not.toBeChecked();
    expect(
      await page.evaluate(() => (window as unknown as { __permissionAsks: number }).__permissionAsks),
    ).toBe(0);
  });
});
