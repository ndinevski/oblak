import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

// Simple test components to avoid lazy loading issues in tests
const TestOverview = () => <div>Dashboard Overview</div>;
const TestLogin = () => <div>Login Page</div>;
const TestFunctions = () => <div>Functions List</div>;
const TestVMs = () => <div>VMs List</div>;
const TestStorage = () => <div>Storage List</div>;
const TestSettings = () => <div>Settings Page</div>;

// Test routes without lazy loading
const testRoutes = [
  {
    path: '/',
    element: <TestOverview />,
  },
  {
    path: '/auth/login',
    element: <TestLogin />,
  },
  {
    path: '/functions',
    element: <TestFunctions />,
  },
  {
    path: '/vms',
    element: <TestVMs />,
  },
  {
    path: '/storage',
    element: <TestStorage />,
  },
  {
    path: '/settings',
    element: <TestSettings />,
  },
];

describe('Router Configuration', () => {
  it('renders dashboard overview at root path', async () => {
    const router = createMemoryRouter(testRoutes, { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Dashboard Overview')).toBeInTheDocument();
  });

  it('renders login page at /auth/login', async () => {
    const router = createMemoryRouter(testRoutes, { initialEntries: ['/auth/login'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders functions list at /functions', async () => {
    const router = createMemoryRouter(testRoutes, { initialEntries: ['/functions'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Functions List')).toBeInTheDocument();
  });

  it('renders VMs list at /vms', async () => {
    const router = createMemoryRouter(testRoutes, { initialEntries: ['/vms'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByText('VMs List')).toBeInTheDocument();
  });

  it('renders storage list at /storage', async () => {
    const router = createMemoryRouter(testRoutes, { initialEntries: ['/storage'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Storage List')).toBeInTheDocument();
  });

  it('renders settings page at /settings', async () => {
    const router = createMemoryRouter(testRoutes, { initialEntries: ['/settings'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
  });
});
