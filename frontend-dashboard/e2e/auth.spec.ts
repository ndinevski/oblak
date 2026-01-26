/**
 * E2E Tests: Authentication Flow
 * 
 * Tests the complete authentication journey including login, register, logout.
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');
      
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
      await expect(page.getByLabel(/email|username/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('should have link to register page', async ({ page }) => {
      await page.goto('/login');
      
      const registerLink = page.getByRole('link', { name: /register|sign up|create account/i });
      await expect(registerLink).toBeVisible();
      
      await registerLink.click();
      await expect(page).toHaveURL(/register/);
    });

    test('should have link to forgot password', async ({ page }) => {
      await page.goto('/login');
      
      const forgotLink = page.getByRole('link', { name: /forgot/i });
      await expect(forgotLink).toBeVisible();
    });

    test('should show validation error for empty fields', async ({ page }) => {
      await page.goto('/login');
      
      await page.getByRole('button', { name: /sign in/i }).click();
      
      // Should show validation errors
      await expect(page.getByText(/required|enter/i)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');
      
      await page.getByLabel(/email|username/i).fill('invalid@example.com');
      await page.getByLabel(/password/i).fill('wrongpassword');
      await page.getByRole('button', { name: /sign in/i }).click();
      
      // Should show authentication error
      await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Register Page', () => {
    test('should display registration form', async ({ page }) => {
      await page.goto('/register');
      
      await expect(page.getByRole('heading', { name: /register|sign up|create/i })).toBeVisible();
      await expect(page.getByLabel(/username/i)).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/^password$/i)).toBeVisible();
    });

    test('should have link to login page', async ({ page }) => {
      await page.goto('/register');
      
      const loginLink = page.getByRole('link', { name: /login|sign in|already have/i });
      await expect(loginLink).toBeVisible();
      
      await loginLink.click();
      await expect(page).toHaveURL(/login/);
    });

    test('should validate password requirements', async ({ page }) => {
      await page.goto('/register');
      
      await page.getByLabel(/username/i).fill('testuser');
      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByLabel(/^password$/i).fill('weak');
      
      await page.getByRole('button', { name: /register|sign up|create/i }).click();
      
      // Should show password requirement error
      await expect(page.getByText(/password|characters|requirements/i)).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
      await page.goto('/register');
      
      await page.getByLabel(/email/i).fill('notanemail');
      await page.getByRole('button', { name: /register|sign up|create/i }).click();
      
      // Should show email validation error
      await expect(page.getByText(/valid email|email format/i)).toBeVisible();
    });
  });

  test.describe('Forgot Password', () => {
    test('should display forgot password form', async ({ page }) => {
      await page.goto('/forgot-password');
      
      await expect(page.getByRole('heading', { name: /forgot|reset/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /reset|send/i })).toBeVisible();
    });

    test('should have link back to login', async ({ page }) => {
      await page.goto('/forgot-password');
      
      const backLink = page.getByRole('link', { name: /back|login|sign in/i });
      await expect(backLink).toBeVisible();
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing protected route', async ({ page }) => {
      await page.goto('/dashboard');
      
      // Should be redirected to login
      await expect(page).toHaveURL(/login/);
    });

    test('should redirect to login when accessing functions page', async ({ page }) => {
      await page.goto('/functions');
      
      await expect(page).toHaveURL(/login/);
    });

    test('should redirect to login when accessing VMs page', async ({ page }) => {
      await page.goto('/vms');
      
      await expect(page).toHaveURL(/login/);
    });

    test('should redirect to login when accessing storage page', async ({ page }) => {
      await page.goto('/buckets');
      
      await expect(page).toHaveURL(/login/);
    });

    test('should redirect to login when accessing settings page', async ({ page }) => {
      await page.goto('/settings');
      
      await expect(page).toHaveURL(/login/);
    });
  });
});

test.describe('Authenticated User', () => {
  // Mock authenticated state
  test.beforeEach(async ({ page }) => {
    // Set up mock auth state in localStorage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('oblak-auth', JSON.stringify({
        state: {
          token: 'mock-jwt-token',
          user: {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
          },
          isAuthenticated: true,
        },
        version: 0,
      }));
    });
  });

  test('should access dashboard when authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should see dashboard content (not redirected to login)
    await expect(page.getByRole('heading', { name: /dashboard|overview/i })).toBeVisible({ timeout: 10000 });
  });

  test('should show user info in header', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should see some user indication
    await expect(page.getByText(/testuser|test@example.com|TU/i)).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to functions page', async ({ page }) => {
    await page.goto('/dashboard');
    
    const functionsLink = page.getByRole('link', { name: /functions/i }).first();
    await functionsLink.click();
    
    await expect(page).toHaveURL(/functions/);
  });

  test('should navigate to VMs page', async ({ page }) => {
    await page.goto('/dashboard');
    
    const vmsLink = page.getByRole('link', { name: /virtual machines|vms/i }).first();
    await vmsLink.click();
    
    await expect(page).toHaveURL(/vms/);
  });

  test('should navigate to storage page', async ({ page }) => {
    await page.goto('/dashboard');
    
    const storageLink = page.getByRole('link', { name: /storage|buckets/i }).first();
    await storageLink.click();
    
    await expect(page).toHaveURL(/buckets/);
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/dashboard');
    
    const settingsLink = page.getByRole('link', { name: /settings/i }).first();
    await settingsLink.click();
    
    await expect(page).toHaveURL(/settings/);
  });
});
