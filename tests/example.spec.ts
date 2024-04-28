import { test, expect, chromium } from '@playwright/test';

test('test', async ({ browser }) => {
  try {
      await chromium.launch({ headless: false, slowMo: 500 });
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      await page1.goto('http://localhost:31000/auth/login?test=1&name=1&admin=true');
      await page2.goto('http://localhost:31000/auth/login?test=1&name=2&admin=false');

      await page1.getByRole('button', { name: 'Create New Game' }).click();
      await page1.getByLabel('Rank Limit').click();
      await page1.getByLabel('Rank Limit').fill('1');
      await page1.getByRole('button', { name: 'Submit' }).click();
      page1.once('dialog', dialog => {
        console.log(`Dialog message: ${dialog.message()}`);
        dialog.dismiss().catch(() => {});
      });

      await page2.waitForSelector('.game-card');
      await page2.locator('.game-card:first-of-type').locator('role=button[name="Join Game"]').click();

      for (let i = 0; i < 3; i++) {
        await page1.getByRole('button', { name: 'Draw Card' }).click();
        await page2.getByRole('button', { name: 'Draw Card' }).click();
      }

      for (let i = 0; i < 2; i++) {
        await page1.locator('.can-play').nth(0).click();
        await page2.locator('.can-play').nth(0).click();
      }

      await page1.locator('.can-play').nth(0).click();
      await page1.getByRole('button', { name: 'Leave Game' }).click();

      await page1.waitForTimeout(1000);
      await page2.waitForTimeout(1000);
    }
    catch (error) {
      console.error("An error occurred in the test:", error);
      process.exit(1);
    }
    finally {
      await browser.close();
    }

});

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Click the get started link.
  await page.getByRole('link', { name: 'Get started' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
