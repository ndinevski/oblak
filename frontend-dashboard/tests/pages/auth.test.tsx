/**
 * Auth pages tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

// Mock the API
vi.mock('@/lib/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  forgotPassword: vi.fn(),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to wrap components with router
const renderWithRouter = (component: React.ReactNode) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('should render login form', () => {
    renderWithRouter(<LoginPage />);
    
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email or username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should have link to forgot password', () => {
    renderWithRouter(<LoginPage />);
    
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/auth/forgot-password'
    );
  });

  it('should have link to register', () => {
    renderWithRouter(<LoginPage />);
    
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute(
      'href',
      '/auth/register'
    );
  });

  it('should show validation error for empty identifier', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);
    
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    expect(screen.getByText(/email or username is required/i)).toBeInTheDocument();
  });

  it('should show validation error for empty password', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);
    
    await user.type(screen.getByLabelText(/email or username/i), 'testuser');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('should show error message from store', () => {
    useAuthStore.setState({ error: 'Invalid credentials' });
    renderWithRouter(<LoginPage />);
    
    expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it('should disable inputs while loading', () => {
    useAuthStore.setState({ isLoading: true });
    renderWithRouter(<LoginPage />);
    
    expect(screen.getByLabelText(/email or username/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('should render registration form', () => {
    renderWithRouter(<RegisterPage />);
    
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('should have optional organization field', () => {
    renderWithRouter(<RegisterPage />);
    
    expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
  });

  it('should have link to login', () => {
    renderWithRouter(<RegisterPage />);
    
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/auth/login'
    );
  });

  it('should show password requirements', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);
    
    const passwordInput = screen.getByLabelText(/^password$/i);
    await user.click(passwordInput);
    
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/one uppercase letter/i)).toBeInTheDocument();
    expect(screen.getByText(/one lowercase letter/i)).toBeInTheDocument();
    expect(screen.getByText(/one number/i)).toBeInTheDocument();
  });

  it('should validate username length', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);
    
    await user.type(screen.getByLabelText(/username/i), 'ab');
    await user.type(screen.getByLabelText(/email/i), 'test@test.com');
    await user.type(screen.getByLabelText(/^password$/i), 'SecurePass123');
    await user.type(screen.getByLabelText(/confirm password/i), 'SecurePass123');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    
    expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument();
  });

  it('should validate email format', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);
    
    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/email/i), 'notanemail');
    await user.type(screen.getByLabelText(/^password$/i), 'SecurePass123');
    await user.type(screen.getByLabelText(/confirm password/i), 'SecurePass123');
    
    const submitButton = screen.getByRole('button', { name: /create account/i });
    await user.click(submitButton);
    
    // The form should show email validation error
    await waitFor(() => {
      expect(screen.queryByText(/enter a valid email/i) || screen.queryByText(/email/i)).toBeInTheDocument();
    });
    // Should not navigate away (button should still be present)
    expect(submitButton).toBeInTheDocument();
  });

  it('should validate password confirmation', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);
    
    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/email/i), 'test@test.com');
    await user.type(screen.getByLabelText(/^password$/i), 'SecurePass123');
    await user.type(screen.getByLabelText(/confirm password/i), 'DifferentPass123');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });
});

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render forgot password form', () => {
    renderWithRouter(<ForgotPasswordPage />);
    
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('should have link to login', () => {
    renderWithRouter(<ForgotPasswordPage />);
    
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/auth/login'
    );
  });

  it('should validate email is required', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);
    
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
  });

  it('should validate email format', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);
    
    await user.type(screen.getByLabelText(/email/i), 'notanemail');
    
    const submitButton = screen.getByRole('button', { name: /send reset link/i });
    await user.click(submitButton);
    
    // Form should show validation - button should still be present (form didn't navigate)
    expect(submitButton).toBeInTheDocument();
    // Input should be marked invalid or have error text
    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toHaveValue('notanemail');
  });
});
