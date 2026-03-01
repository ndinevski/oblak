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
});

test('redirects anonymous user from protected routes', async ({ page }) => {
  await page.goto('/vms');
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test('shows validation errors on empty login form', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/required/i).first()).toBeVisible();
});

test('shows error for invalid credentials', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByLabel(/email or username/i).fill('nobody@example.com');
  await page.getByLabel(/^password$/i).fill('WrongPassword123!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByText(/invalid|identifier|password|unauthorized|error|failed/i).first()).toBeVisible({ timeout: 10000 });
});

test('logs in with seeded demo user', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText(/welcome back/i)).toBeVisible();
});

test('redirects authenticated user away from auth pages', async ({ page }) => {
  await login(page);
  await page.goto('/auth/login');
  await expect(page).toHaveURL('/');
});
