import { expect, test, type Page } from '@playwright/test';

async function signUp(page: Page): Promise<void> {
  const email = `ads-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'הרשמה' }).click();
  await page.getByLabel('דוא״ל').fill(email);
  await page.getByLabel('סיסמה').fill('password123');
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page.locator('.calendar-page')).toBeVisible();
}

test.describe('advertising', () => {
  test('asks for consent with an equally prominent reject option', async ({ page }) => {
    await signUp(page);
    const banner = page.locator('.consent');
    await expect(banner).toBeVisible();

    const accept = page.getByRole('button', { name: 'אישור התאמה אישית' });
    const reject = page.getByRole('button', { name: 'מודעות כלליות בלבד' });
    await expect(accept).toBeVisible();
    await expect(reject).toBeVisible();

    // The regulator expects reject to be offered as plainly as accept, so the
    // two controls are the same size rather than one being a faint link.
    const [a, r] = [await accept.boundingBox(), await reject.boundingBox()];
    expect(Math.abs(a!.width - r!.width)).toBeLessThan(8);

    await reject.click();
    await expect(banner).toHaveCount(0);
  });

  test('does not show an interstitial before consent is answered', async ({ page }) => {
    await signUp(page);
    await expect(page.locator('.consent')).toBeVisible();
    // Navigate repeatedly with the banner still open. The banner carries its
    // own settings link, so drive the navigation from the primary nav.
    const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
    for (let i = 0; i < 4; i++) {
      await nav.getByRole('link', { name: i % 2 ? 'יומן' : 'הגדרות' }).click();
      await page.waitForTimeout(200);
    }
    // An ad covering the banner would leave the choice unanswerable.
    await expect(page.locator('.ad-interstitial')).toHaveCount(0);
    await expect(page.locator('.consent')).toBeVisible();
  });

  test('lets the user turn ads off, and remembers it', async ({ page }) => {
    await signUp(page);
    await page.getByRole('button', { name: 'מודעות כלליות בלבד' }).click();

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'מודעות' })).toBeVisible();
    // Rejecting personalization is reflected in the control.
    await expect(page.getByLabel('התאמה אישית של מודעות')).not.toBeChecked();

    await page.locator('.switch-label', { hasText: 'הצגת מודעות' }).click();
    await expect(page.getByLabel('התאמה אישית של מודעות')).toBeDisabled();

    await page.reload();
    await expect(page.locator('.ad-inline, .ad-interstitial')).toHaveCount(0);
  });

  test('labels the inline slot as advertising', async ({ page, isMobile }) => {
    await signUp(page);
    await page.getByRole('button', { name: 'מודעות כלליות בלבד' }).click();
    await page.goto('/');

    // Open a day: the drawer is where the inline slot lives.
    if (isMobile) await page.locator('.agenda-date').first().click();
    else await page.locator('.day-cell:not(.is-outside)').nth(5).click();
    await expect(page.locator('.day-drawer')).toBeVisible();

    const slot = page.locator('.day-drawer .ad-inline');
    await expect(slot).toHaveCount(1);
    // Always identifiable as an ad, whether or not one is booked.
    await expect(slot.locator('.ad-badge')).toHaveText('מודעה');
  });
});
