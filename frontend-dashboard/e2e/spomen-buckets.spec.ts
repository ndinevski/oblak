import { test, expect, type Page } from '@playwright/test';

const DEMO_EMAIL = process.env.E2E_USER_EMAIL || 'demo@oblak.local';
const DEMO_PASSWORD = process.env.E2E_USER_PASSWORD || 'DemoPass123!';
const TEST_BUCKET_PREFIX = 'e2e-bucket-';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel(/email or username/i).fill(DEMO_EMAIL);
  await page.getByLabel(/^password$/i).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');
}

async function getApiToken(page: Page): Promise<string> {
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

async function cleanupTestBuckets(page: Page) {
  const token = await getApiToken(page);

  const listResponse = await page.request.get('http://localhost:1337/api/buckets?page=1&pageSize=100', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(listResponse.ok()).toBeTruthy();
  const payload = await listResponse.json();
  const bucketsRaw = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.data)
      ? payload.data.data
      : [];
  const buckets = bucketsRaw as Array<{ id: number; name: string }>;

  const testBuckets = buckets.filter((bucket) => bucket.name.startsWith(TEST_BUCKET_PREFIX));

  for (const bucket of testBuckets) {
    await page.request.delete(`http://localhost:1337/api/buckets/${bucket.id}?force=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
}

test.beforeEach(async ({ page }) => {
  await cleanupTestBuckets(page);
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.evaluate(() => localStorage.clear());
  await login(page);
});

test('bucket lifecycle via UI: list, create, open, edit, delete', async ({ page }) => {
  const bucketName = `${TEST_BUCKET_PREFIX}${Date.now().toString().slice(-6)}`;
  const createdDescription = 'Created by Playwright bucket lifecycle test';
  const updatedDescription = 'Updated by Playwright bucket lifecycle test';

  await page.goto('/storage');
  await expect(page.getByRole('heading', { name: 'Spomen Buckets' })).toBeVisible();

  await page.getByTestId('bucket-new-button').click();
  await expect(page).toHaveURL('/storage/new');

  await page.getByTestId('bucket-name-input').fill(bucketName);
  await page.getByTestId('bucket-description-input').fill(createdDescription);
  await page.getByTestId('bucket-create-submit').click();

  await expect(page).toHaveURL(/\/storage\/\d+$/);
  await expect(page.getByRole('heading', { name: bucketName })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(createdDescription)).toBeVisible();

  const bucketId = Number(page.url().split('/').pop());
  expect(Number.isFinite(bucketId)).toBeTruthy();

  await page.getByTestId('bucket-edit-open').click();
  await expect(page).toHaveURL(/\/storage\/\d+\/edit$/);
  await page.getByTestId('bucket-edit-description').fill(updatedDescription);
  await page.getByTestId('bucket-edit-policy').click();
  await page.getByRole('option', { name: 'Public Read', exact: true }).click();
  await page.getByTestId('bucket-edit-save').click();

  await expect(page.getByText(updatedDescription)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Public Read')).toBeVisible();

  await page.goto('/storage');
  await page.getByTestId('bucket-search-input').fill(bucketName);
  await expect(page.getByText(bucketName)).toBeVisible({ timeout: 10000 });

  await page.getByTestId(`bucket-menu-${bucketId}`).first().click();
  await page.getByTestId(`bucket-delete-${bucketId}`).click();
  await page.getByTestId('bucket-delete-confirm').click();

  const matchingBucketCards = page.locator('[data-testid^="bucket-card-"]').filter({ hasText: bucketName });
  await expect(matchingBucketCards).toHaveCount(0, { timeout: 15000 });
});
