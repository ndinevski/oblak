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

test('sidebar navigation links are visible', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Impuls', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Izvor', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Spomen', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Activity Log', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Quota Usage', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
});

test('functions page shows seeded function data', async ({ page }) => {
  await page.goto('/functions');
  await expect(page.locator('h1', { hasText: 'Impuls' })).toBeVisible();
  await expect(page.getByText('demo-hello')).toBeVisible({ timeout: 15000 });
});

test('vms route is accessible for authenticated user', async ({ page }) => {
  await page.goto('/vms');
  await expect(page).toHaveURL('/vms');
  await expect(page.getByRole('link', { name: 'Izvor', exact: true })).toBeVisible();
});

test('storage page shows seeded bucket data', async ({ page }) => {
  await page.goto('/storage');
  await expect(page.getByRole('heading', { name: 'Spomen' })).toBeVisible();
  await expect(page.getByText('demo-assets')).toBeVisible({ timeout: 15000 });
});

test('settings pages are accessible', async ({ page }) => {
  await page.goto('/settings/activity');
  await expect(page.getByRole('heading', { name: 'Activity Log' })).toBeVisible();

  await page.goto('/settings/quota');
  await expect(page.getByRole('heading', { name: 'Quota Usage' })).toBeVisible();
});

test('quick actions link to valid create routes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'New Function' }).click();
  await expect(page).toHaveURL('/functions/new');

  await page.goto('/');
  await page.getByRole('link', { name: 'New VM' }).click();
  await expect(page).toHaveURL('/vms/new');

  await page.goto('/');
  await page.getByRole('link', { name: 'New Bucket' }).click();
  await expect(page).toHaveURL('/storage/new');
});
