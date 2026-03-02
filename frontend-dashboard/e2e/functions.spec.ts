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

async function getApiToken(page: Page) {
  const response = await page.request.post('http://localhost:1337/api/auth/local', {
    data: {
      identifier: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.jwt as string;
}

async function cleanupTestFunctions(page: Page) {
  const token = await getApiToken(page);

  const response = await page.request.get('http://localhost:1337/api/functions?page=1&pageSize=100', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const functions = (payload.data || []) as Array<{ name: string; documentId: string }>;

  const testFunctions = functions.filter((fn) =>
    fn.name.startsWith('e2e-fn-') || fn.name.startsWith('svc-ui-smoke-')
  );

  for (const fn of testFunctions) {
    await page.request.delete(`http://localhost:1337/api/functions/${fn.documentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
}

async function selectComboboxOption(page: Page, index: number, optionName: string) {
  await page.getByRole('combobox').nth(index).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await cleanupTestFunctions(page);
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.evaluate(() => localStorage.clear());
  await login(page);
});

test('functions list supports search and runtime/status filters', async ({ page }) => {
  await page.goto('/functions');

  await expect(page.getByRole('heading', { name: 'Impuls Functions' })).toBeVisible();

  await page.getByPlaceholder('Search functions...').fill('demo-hello');
  await expect(page.getByText('demo-hello')).toBeVisible({ timeout: 15000 });

  await page.getByPlaceholder('Search functions...').fill('');

  // Combobox order: runtime first, status second.
  await selectComboboxOption(page, 0, 'Node.js 20');
  await selectComboboxOption(page, 1, 'Active');

  await expect(page.getByRole('heading', { name: 'Impuls Functions' })).toBeVisible();
});

test('function lifecycle via UI: create, edit, invoke, delete', async ({ page }) => {
  const functionName = `e2e-fn-${Date.now().toString().slice(-6)}`;
  const updatedDescription = 'Updated by Playwright function lifecycle test';

  await page.goto('/functions/new');

  await page.getByLabel('Function Name *').fill(functionName);
  await page.getByLabel('Description').fill('Created by Playwright UI lifecycle test');

  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.locator('#code').fill(
    'exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ ok: true, from: "playwright", event }) });'
  );

  await page.getByRole('button', { name: 'Create Function' }).click();

  await expect(page).toHaveURL('/functions');
  await expect(page.getByText(functionName)).toBeVisible({ timeout: 15000 });

  await page.getByText(functionName).first().click();
  await expect(page.getByRole('heading', { name: functionName })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/\/functions\/\d+\/edit$/);

  await page.getByLabel('Description').fill(updatedDescription);
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page).toHaveURL(/\/functions\/\d+$/);

  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('button', { name: 'Invoke Function' }).click();
  await expect(page.getByText('Success')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();

  await expect(page).toHaveURL('/functions');
  await expect(page.getByText(functionName)).not.toBeVisible({ timeout: 15000 });
});
