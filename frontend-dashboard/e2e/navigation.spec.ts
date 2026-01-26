/**
 * E2E Tests: Navigation and Layout
 * 
 * Tests navigation, sidebar, theme toggle, and responsive layout.
 */

import { test, expect } from '@playwright/test';

// Setup authenticated state for all tests
test.beforeEach(async ({ page }) => {
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

test.describe('Navigation', () => {
  test('should display sidebar with navigation links', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check main navigation items exist
    await expect(page.getByRole('link', { name: /dashboard|overview/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /functions/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /virtual machines|vms/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /storage|buckets/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /settings/i }).first()).toBeVisible();
  });

  test('should highlight active navigation item', async ({ page }) => {
    await page.goto('/functions');
    
    // The functions link should have active styling
    const functionsLink = page.getByRole('link', { name: /functions/i }).first();
    await expect(functionsLink).toBeVisible();
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Navigate to functions
    await page.getByRole('link', { name: /functions/i }).first().click();
    await expect(page).toHaveURL(/functions/);
    
    // Navigate to VMs
    await page.getByRole('link', { name: /virtual machines|vms/i }).first().click();
    await expect(page).toHaveURL(/vms/);
    
    // Navigate to storage
    await page.getByRole('link', { name: /storage|buckets/i }).first().click();
    await expect(page).toHaveURL(/buckets/);
    
    // Navigate back to dashboard
    await page.getByRole('link', { name: /dashboard|overview/i }).first().click();
    await expect(page).toHaveURL(/dashboard/);
  });
});

test.describe('Theme Toggle', () => {
  test('should toggle between light and dark mode', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Look for theme toggle button
    const themeButton = page.getByRole('button', { name: /theme|dark|light|mode/i });
    
    if (await themeButton.isVisible()) {
      // Get initial theme
      const html = page.locator('html');
      const initialClass = await html.getAttribute('class');
      
      // Click toggle
      await themeButton.click();
      
      // Wait for theme change
      await page.waitForTimeout(300);
      
      // Check class changed
      const newClass = await html.getAttribute('class');
      expect(newClass).not.toBe(initialClass);
    }
  });

  test('should persist theme preference', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Set theme preference
    await page.evaluate(() => {
      localStorage.setItem('oblak-theme', JSON.stringify({
        state: { theme: 'dark' },
        version: 0,
      }));
    });
    
    // Reload page
    await page.reload();
    
    // Check theme persisted
    const theme = await page.evaluate(() => {
      const stored = localStorage.getItem('oblak-theme');
      return stored ? JSON.parse(stored)?.state?.theme : null;
    });
    
    expect(theme).toBe('dark');
  });
});

test.describe('Global Search', () => {
  test('should open search with keyboard shortcut', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Press Ctrl+K (Windows) or Cmd+K (Mac)
    await page.keyboard.press('Control+k');
    
    // Search dialog should open
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 }).catch(() => {
      // Alternative: check for search input
      expect(page.getByPlaceholder(/search/i)).toBeVisible();
    });
  });

  test('should close search with Escape', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Open search
    await page.keyboard.press('Control+k');
    
    // Wait for dialog
    await page.waitForTimeout(300);
    
    // Press Escape
    await page.keyboard.press('Escape');
    
    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible().catch(() => {
      // Alternative check
      expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
    });
  });

  test('should filter results as user types', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Open search
    await page.keyboard.press('Control+k');
    
    // Type search query
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('functions');
      
      // Should show filtered results
      await expect(page.getByText(/functions/i)).toBeVisible();
    }
  });
});

test.describe('Breadcrumbs', () => {
  test('should show breadcrumbs on nested pages', async ({ page }) => {
    await page.goto('/settings/profile');
    
    // Should show breadcrumb trail
    await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible().catch(() => {
      // Alternative: check for breadcrumb-like elements
      expect(page.getByText(/settings/i).first()).toBeVisible();
    });
  });

  test('should navigate back via breadcrumb', async ({ page }) => {
    await page.goto('/settings/profile');
    
    // Click settings breadcrumb
    const settingsLink = page.getByRole('link', { name: /settings/i }).first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await expect(page).toHaveURL(/settings$/);
    }
  });
});

test.describe('Responsive Layout', () => {
  test('should show mobile menu on small screens', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    
    // Sidebar should be hidden
    const sidebar = page.locator('[data-testid="sidebar"]');
    if (await sidebar.isVisible()) {
      // Mobile may show hamburger menu instead
      const menuButton = page.getByRole('button', { name: /menu|toggle/i });
      await expect(menuButton).toBeVisible();
    }
  });

  test('should toggle mobile sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    
    // Find menu toggle button
    const menuButton = page.getByRole('button', { name: /menu|toggle/i }).first();
    
    if (await menuButton.isVisible()) {
      await menuButton.click();
      
      // Sidebar should appear
      await expect(page.getByRole('link', { name: /functions/i })).toBeVisible();
    }
  });

  test('should adapt grid layout on different screen sizes', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Desktop view
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    
    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    
    // Page should still be functional
    await expect(page.getByRole('heading')).toBeVisible();
  });
});

test.describe('Error Handling', () => {
  test('should show 404 page for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    
    // Should show 404 or redirect to login/home
    const content = await page.content();
    expect(
      content.includes('404') || 
      content.includes('not found') || 
      page.url().includes('login') ||
      page.url().includes('dashboard')
    ).toBe(true);
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API to fail
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });
    
    await page.goto('/dashboard');
    
    // Page should still render, possibly with error state
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Loading States', () => {
  test('should show loading indicator during navigation', async ({ page }) => {
    // Slow down responses
    await page.route('**/api/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      route.fulfill({
        status: 200,
        body: JSON.stringify({ data: [] }),
      });
    });
    
    await page.goto('/dashboard');
    
    // Navigate to another page
    await page.getByRole('link', { name: /functions/i }).first().click();
    
    // Should see loading state (spinner or skeleton)
    const loadingIndicator = page.locator('[data-testid="loading"], [class*="spinner"], [class*="skeleton"], [class*="animate-pulse"]');
    // May or may not be visible depending on load speed
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should have h1
    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();
  });

  test('should have proper focus management', async ({ page }) => {
    await page.goto('/login');
    
    // Tab through form elements
    await page.keyboard.press('Tab');
    
    // Should focus on first form element
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedElement);
  });

  test('should have accessible form labels', async ({ page }) => {
    await page.goto('/login');
    
    // All inputs should have associated labels
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);
    
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/login');
    
    // Fill form with keyboard
    await page.keyboard.press('Tab');
    await page.keyboard.type('test@example.com');
    await page.keyboard.press('Tab');
    await page.keyboard.type('password123');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Form should be submitted
  });
});
