import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

// Test that the app can be imported
describe('App', () => {
  it('renders the router provider', async () => {
    const routes = [
      {
        path: '/',
        element: <div>Test Home</div>,
      },
    ];
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Test Home')).toBeInTheDocument();
  });
});
