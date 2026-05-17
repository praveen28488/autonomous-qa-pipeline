import { test, expect } from '@playwright/test';

test.describe('pipeline smoke', () => {
  test('runner is functional', async ({ page }) => {
    await page.goto('https://playwright.dev');
    await expect(page).toHaveTitle(/Playwright/);
  });

  test('page object model pattern works', async ({ page }) => {
    await page.goto('https://playwright.dev/docs/intro');
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
  });
});
