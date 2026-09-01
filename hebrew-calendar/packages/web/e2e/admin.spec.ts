import { expect, type Page, test } from '@playwright/test';

/** The address the server's ADMIN_EMAILS allowlist names, set in the config. */
const OPERATOR = 'e2e-operator@example.test';
const PASSWORD = 'password123';

/**
 * Sign in as the operator, registering the account the first time.
 *
 * The account outlives a single run — the suite shares one database — so this
 * has to cope with it existing already, rather than assuming a clean slate.
 */
async function signInAsOperator(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'הרשמה' }).click();
  await page.getByLabel('דוא״ל').fill(OPERATOR);
  await page.getByLabel('סיסמה').fill(PASSWORD);
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();

  const calendar = page.locator('.calendar-page');
  // Either the calendar, or the "already registered" message from a previous
  // run of this suite against the same database.
  await calendar.or(page.getByRole('alert')).first().waitFor();
  if (!(await calendar.isVisible())) {
    // The link that switches the form to sign-in, not the submit button.
    await page.getByRole('button', { name: 'התחברות' }).click();
    await page.getByLabel('דוא״ל').fill(OPERATOR);
    await page.getByLabel('סיסמה').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'התחברות' }).click();
    await calendar.waitFor();
  }
  const consent = page.getByRole('button', { name: 'מודעות כלליות בלבד' });
  if (await consent.count()) await consent.click();
}

async function signUpPlainUser(page: Page): Promise<void> {
  const email = `plain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'הרשמה' }).click();
  await page.getByLabel('דוא״ל').fill(email);
  await page.getByLabel('סיסמה').fill(PASSWORD);
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page.locator('.calendar-page')).toBeVisible();
}

test.describe('campaign management', () => {
  test.beforeEach(async ({ page }) => {
    // No house ad, so no interstitial can land on the controls under test.
    // Pacing already forbids one over a dialog, but not over the page behind.
    await page.route('**/api/ads/next*', (route) => route.fulfill({ json: { ad: null } }));
  });

  test('an ordinary account is told it has no business here', async ({ page }) => {
    await signUpPlainUser(page);
    await page.goto('/admin/ads');
    // The server refuses; the page says so plainly rather than showing an
    // empty campaign list that looks like there is simply no inventory.
    await expect(page.getByText('אין הרשאה')).toBeVisible();
    await expect(page.getByRole('button', { name: 'קמפיין חדש' })).toHaveCount(0);
  });

  test('an ordinary account is not shown the way in', async ({ page }) => {
    await signUpPlainUser(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'מנוי ללא פרסומות' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ניהול פרסומות' })).toHaveCount(0);
  });

  test('the operator adds a campaign and pauses it', async ({ page }) => {
    await signInAsOperator(page);

    await page.goto('/settings');
    await page.getByRole('link', { name: 'ניהול פרסומות' }).click();
    await expect(page.getByRole('heading', { name: 'ניהול פרסומות' })).toBeVisible();

    const advertiser = `מפרסם ${Date.now()}`;
    await page.getByRole('button', { name: 'קמפיין חדש' }).first().click();
    // Scoped to the dialog: existing rows carry aria-labels built from their
    // own titles, which a page-wide lookup for "כותרת" also matches.
    const form = page.getByRole('dialog');
    await form.getByLabel('מפרסם').fill(advertiser);
    await form.getByLabel('כותרת').fill('כותרת המודעה');
    await form.getByLabel('תיאור').fill('טקסט המודעה כפי שהקוראים יראו אותו.');
    await form.getByLabel('כתובת היעד').fill('https://example.test/landing');
    await form.getByRole('button', { name: 'שמירה' }).click();

    const card = page.locator('.camp-card').filter({ hasText: advertiser });
    await expect(card).toBeVisible();
    // The copy readers will see belongs on the row, not only in the form.
    await expect(card).toContainText('טקסט המודעה כפי שהקוראים יראו אותו.');
    // No click rate before anything has been shown — "0%" would read as
    // "nobody clicked" rather than "nobody has seen it".
    await expect(card.locator('.camp-stat').nth(2)).toContainText('—');

    // The native checkbox is visually hidden by design, so the label is what a
    // person clicks — and what a test must click too.
    await card.locator('.switch-label').click();
    await expect(card).toHaveClass(/is-paused/);
  });

  test('the operator cannot save a target that would run as script', async ({ page }) => {
    await signInAsOperator(page);
    await page.goto('/admin/ads');

    await page.getByRole('button', { name: 'קמפיין חדש' }).first().click();
    const form = page.getByRole('dialog');
    await form.getByLabel('מפרסם').fill('מפרסם');
    await form.getByLabel('כותרת').fill('כותרת');
    // targetUrl becomes an href in the client, so this would run in the page
    // of everyone shown the ad.
    await form.getByLabel('כתובת היעד').fill('javascript:alert(1)');
    await form.getByRole('button', { name: 'שמירה' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.toast').first()).toContainText('http');
  });
});
