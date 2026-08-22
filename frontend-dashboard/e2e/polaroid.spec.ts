import { test, expect, type Page } from '@playwright/test';

const DEMO_EMAIL = process.env.E2E_USER_EMAIL || 'demo@oblak.local';
const DEMO_PASSWORD = process.env.E2E_USER_PASSWORD || 'DemoPass123!';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel(/email or username/i).fill(DEMO_EMAIL);
  await page.getByLabel(/^password$/i).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');
}

test.beforeEach(async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.evaluate(() => localStorage.clear());
  await login(page);
});

test('polaroid photos page loads and shows heading', async ({ page }) => {
  await page.goto('/photos');
  await expect(page.getByRole('heading', { name: /photos/i })).toBeVisible();
});

test('polaroid albums page loads', async ({ page }) => {
  await page.goto('/photos/albums');
  await expect(page.getByRole('heading', { name: /albums/i })).toBeVisible();
});

test('polaroid people page loads', async ({ page }) => {
  await page.goto('/photos/people');
  await expect(page.getByRole('heading', { name: /people/i })).toBeVisible();
});

test('polaroid search page loads', async ({ page }) => {
  await page.goto('/photos/search');
  await expect(page.getByRole('heading', { name: /search/i })).toBeVisible();
});
