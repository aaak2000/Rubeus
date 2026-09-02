import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'password123';

/** Register through the API and hand back the real token pair it issues. */
async function realTokens(
  page: Page,
): Promise<{ accessToken: string; refreshToken: string; user: unknown }> {
  const email = `gsi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const res = await page.request.post('http://127.0.0.1:3001/api/auth/register', {
    data: { email, password: PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe('signing in', () => {
  test('offers Google alongside the email form', async ({ page }) => {
    await page.goto('/login');
    const google = page.getByRole('button', { name: 'המשך עם Google' });
    await expect(google).toBeVisible();
    // Email registration stays: the provider is an addition, not a
    // replacement, and some people will not have a Google account.
    await expect(page.getByLabel('דוא״ל')).toBeVisible();
    await expect(page.getByLabel('סיסמה')).toBeVisible();
    await expect(page.getByRole('button', { name: 'התחברות', exact: true })).toBeVisible();
  });

  test('sends the browser to Google when the button is pressed', async ({ page }) => {
    await page.goto('/login');
    // Stop the navigation at the boundary: the point is where we send people,
    // not Google's own page.
    let sentTo: string | null = null;
    await page.route('https://accounts.google.com/**', (route) => {
      sentTo = route.request().url();
      return route.abort();
    });

    await page.getByRole('button', { name: 'המשך עם Google' }).click();
    await expect.poll(() => sentTo).toBeTruthy();

    const url = new URL(sentTo!);
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    // Never the calendar scope from here — that flow needs a review this one
    // does not, and mixing them would drag sign-in into it.
    expect(sentTo!).not.toContain('auth/calendar');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  test('turns the callback code into a signed-in session', async ({ page }) => {
    const tokens = await realTokens(page);
    // The exchange is a call to our own API, so it can be answered here with
    // a genuine token pair; everything after it is the real client.
    await page.route('**/api/auth/google/exchange', (route) => route.fulfill({ json: tokens }));

    await page.goto('/auth/callback?code=stand-in-code');

    await expect(page.locator('.calendar-page')).toBeVisible();
    // Landed on the calendar, not still on the callback page.
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('explains a code that has already been spent', async ({ page }) => {
    await page.route('**/api/auth/google/exchange', (route) =>
      route.fulfill({ status: 401, json: { message: 'Invalid or expired sign-in code' } }),
    );
    await page.goto('/auth/callback?code=already-used');

    await expect(page.getByText('ההתחברות לא הושלמה')).toBeVisible();
    await page.getByRole('button', { name: 'חזרה להתחברות' }).click();
    await expect(page.getByRole('button', { name: 'המשך עם Google' })).toBeVisible();
  });

  test('says so when the provider sends someone back without a session', async ({ page }) => {
    await page.goto('/login?error=google');
    await expect(page.getByRole('alert')).toContainText('Google');
  });
});
