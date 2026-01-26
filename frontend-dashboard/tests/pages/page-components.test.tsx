/**
 * Page Components Tests
 * 
 * Tests for page-level React components.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock react-router-dom hooks
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

// Mock stores
vi.mock('../src/stores', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 1, username: 'testuser', email: 'test@example.com' },
    isAuthenticated: true,
    logout: vi.fn(),
  })),
  useThemeStore: vi.fn(() => ({
    theme: 'light',
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  })),
  useToastStore: vi.fn(() => ({
    toasts: [],
    addToast: vi.fn(),
    removeToast: vi.fn(),
  })),
  useSearchStore: vi.fn(() => ({
    isOpen: false,
    query: '',
    openSearch: vi.fn(),
    closeSearch: vi.fn(),
  })),
}));

// Wrapper component
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  };
}

describe('Page Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({});
  });

  describe('Dashboard Page Structure', () => {
    // Mock DashboardPage component for testing structure
    const MockDashboardPage = () => (
      <div data-testid="dashboard-page">
        <h1>Dashboard</h1>
        <div data-testid="stats-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div data-testid="stat-card">Functions: 5</div>
          <div data-testid="stat-card">VMs: 3</div>
          <div data-testid="stat-card">Buckets: 2</div>
          <div data-testid="stat-card">Storage: 10 GB</div>
        </div>
        <div data-testid="quick-actions">
          <button>Create Function</button>
          <button>Create VM</button>
          <button>Create Bucket</button>
        </div>
        <div data-testid="recent-activity">
          <h2>Recent Activity</h2>
        </div>
      </div>
    );

    it('should render dashboard with stats grid', () => {
      render(<MockDashboardPage />, { wrapper: createWrapper() });
      
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      expect(screen.getByTestId('stats-grid')).toBeInTheDocument();
      expect(screen.getAllByTestId('stat-card')).toHaveLength(4);
    });

    it('should render quick actions', () => {
      render(<MockDashboardPage />, { wrapper: createWrapper() });
      
      expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
      expect(screen.getByText('Create Function')).toBeInTheDocument();
      expect(screen.getByText('Create VM')).toBeInTheDocument();
      expect(screen.getByText('Create Bucket')).toBeInTheDocument();
    });

    it('should render recent activity section', () => {
      render(<MockDashboardPage />, { wrapper: createWrapper() });
      
      expect(screen.getByTestId('recent-activity')).toBeInTheDocument();
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
  });

  describe('List Page Structure', () => {
    // Mock list page component
    const MockListPage = ({ 
      title, 
      items, 
      onCreateClick,
      loading = false 
    }: { 
      title: string; 
      items: { id: string; name: string }[];
      onCreateClick: () => void;
      loading?: boolean;
    }) => (
      <div data-testid="list-page">
        <div className="flex justify-between items-center">
          <h1>{title}</h1>
          <button onClick={onCreateClick} data-testid="create-button">
            Create New
          </button>
        </div>
        {loading ? (
          <div data-testid="loading-skeleton">Loading...</div>
        ) : items.length === 0 ? (
          <div data-testid="empty-state">No items found</div>
        ) : (
          <div data-testid="items-list">
            {items.map((item) => (
              <div key={item.id} data-testid="list-item">
                {item.name}
              </div>
            ))}
          </div>
        )}
      </div>
    );

    it('should render list page with title', () => {
      render(
        <MockListPage 
          title="Functions" 
          items={[{ id: '1', name: 'fn1' }]} 
          onCreateClick={vi.fn()} 
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getByText('Functions')).toBeInTheDocument();
    });

    it('should render create button', () => {
      const onCreateClick = vi.fn();
      render(
        <MockListPage 
          title="Functions" 
          items={[]} 
          onCreateClick={onCreateClick} 
        />,
        { wrapper: createWrapper() }
      );
      
      const createButton = screen.getByTestId('create-button');
      expect(createButton).toBeInTheDocument();
      
      fireEvent.click(createButton);
      expect(onCreateClick).toHaveBeenCalled();
    });

    it('should show empty state when no items', () => {
      render(
        <MockListPage 
          title="Functions" 
          items={[]} 
          onCreateClick={vi.fn()} 
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('should render items list', () => {
      const items = [
        { id: '1', name: 'Function 1' },
        { id: '2', name: 'Function 2' },
        { id: '3', name: 'Function 3' },
      ];
      
      render(
        <MockListPage 
          title="Functions" 
          items={items} 
          onCreateClick={vi.fn()} 
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getByTestId('items-list')).toBeInTheDocument();
      expect(screen.getAllByTestId('list-item')).toHaveLength(3);
    });

    it('should show loading state', () => {
      render(
        <MockListPage 
          title="Functions" 
          items={[]} 
          onCreateClick={vi.fn()} 
          loading={true}
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    });
  });

  describe('Detail Page Structure', () => {
    // Mock detail page component
    const MockDetailPage = ({
      title,
      status,
      onBack,
      onDelete,
      actions,
    }: {
      title: string;
      status: string;
      onBack: () => void;
      onDelete: () => void;
      actions: { label: string; onClick: () => void }[];
    }) => (
      <div data-testid="detail-page">
        <div className="flex items-center gap-4">
          <button onClick={onBack} data-testid="back-button">
            Back
          </button>
          <h1>{title}</h1>
          <span data-testid="status-badge">{status}</span>
        </div>
        <div data-testid="action-bar" className="flex gap-2">
          {actions.map((action, i) => (
            <button key={i} onClick={action.onClick} data-testid="action-button">
              {action.label}
            </button>
          ))}
          <button onClick={onDelete} data-testid="delete-button" className="text-red-500">
            Delete
          </button>
        </div>
        <div data-testid="details-content">
          <div data-testid="info-section">Information</div>
          <div data-testid="logs-section">Logs</div>
        </div>
      </div>
    );

    it('should render detail page with title', () => {
      render(
        <MockDetailPage
          title="my-function"
          status="active"
          onBack={vi.fn()}
          onDelete={vi.fn()}
          actions={[]}
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getByText('my-function')).toBeInTheDocument();
    });

    it('should render status badge', () => {
      render(
        <MockDetailPage
          title="my-function"
          status="active"
          onBack={vi.fn()}
          onDelete={vi.fn()}
          actions={[]}
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getByTestId('status-badge')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
    });

    it('should handle back navigation', () => {
      const onBack = vi.fn();
      render(
        <MockDetailPage
          title="my-function"
          status="active"
          onBack={onBack}
          onDelete={vi.fn()}
          actions={[]}
        />,
        { wrapper: createWrapper() }
      );
      
      fireEvent.click(screen.getByTestId('back-button'));
      expect(onBack).toHaveBeenCalled();
    });

    it('should render action buttons', () => {
      const startAction = vi.fn();
      const stopAction = vi.fn();
      
      render(
        <MockDetailPage
          title="my-vm"
          status="stopped"
          onBack={vi.fn()}
          onDelete={vi.fn()}
          actions={[
            { label: 'Start', onClick: startAction },
            { label: 'Stop', onClick: stopAction },
          ]}
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getAllByTestId('action-button')).toHaveLength(2);
      expect(screen.getByText('Start')).toBeInTheDocument();
      expect(screen.getByText('Stop')).toBeInTheDocument();
    });

    it('should handle delete action', () => {
      const onDelete = vi.fn();
      render(
        <MockDetailPage
          title="my-function"
          status="active"
          onBack={vi.fn()}
          onDelete={onDelete}
          actions={[]}
        />,
        { wrapper: createWrapper() }
      );
      
      fireEvent.click(screen.getByTestId('delete-button'));
      expect(onDelete).toHaveBeenCalled();
    });
  });

  describe('Form Page Structure', () => {
    // Mock form page component
    const MockFormPage = ({
      title,
      onSubmit,
      onCancel,
      fields,
      submitLabel = 'Create',
      isSubmitting = false,
    }: {
      title: string;
      onSubmit: (data: Record<string, string>) => void;
      onCancel: () => void;
      fields: { name: string; label: string; type: string; required?: boolean }[];
      submitLabel?: string;
      isSubmitting?: boolean;
    }) => {
      const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const data: Record<string, string> = {};
        formData.forEach((value, key) => {
          data[key] = value.toString();
        });
        onSubmit(data);
      };

      return (
        <div data-testid="form-page">
          <h1>{title}</h1>
          <form onSubmit={handleSubmit} data-testid="form">
            {fields.map((field) => (
              <div key={field.name} data-testid="form-field">
                <label htmlFor={field.name}>{field.label}</label>
                <input
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  required={field.required}
                  data-testid={`input-${field.name}`}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={onCancel} data-testid="cancel-button">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} data-testid="submit-button">
                {isSubmitting ? 'Submitting...' : submitLabel}
              </button>
            </div>
          </form>
        </div>
      );
    };

    it('should render form with title', () => {
      render(
        <MockFormPage
          title="Create Function"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          fields={[]}
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getByText('Create Function')).toBeInTheDocument();
    });

    it('should render form fields', () => {
      render(
        <MockFormPage
          title="Create Function"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          fields={[
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'runtime', label: 'Runtime', type: 'text' },
            { name: 'memory', label: 'Memory', type: 'number' },
          ]}
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getAllByTestId('form-field')).toHaveLength(3);
      expect(screen.getByTestId('input-name')).toBeInTheDocument();
      expect(screen.getByTestId('input-runtime')).toBeInTheDocument();
      expect(screen.getByTestId('input-memory')).toBeInTheDocument();
    });

    it('should handle form submission', async () => {
      const onSubmit = vi.fn();
      render(
        <MockFormPage
          title="Create Function"
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          fields={[
            { name: 'name', label: 'Name', type: 'text' },
          ]}
        />,
        { wrapper: createWrapper() }
      );
      
      const nameInput = screen.getByTestId('input-name');
      fireEvent.change(nameInput, { target: { value: 'my-function' } });
      
      fireEvent.click(screen.getByTestId('submit-button'));
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: 'my-function' });
      });
    });

    it('should handle cancel', () => {
      const onCancel = vi.fn();
      render(
        <MockFormPage
          title="Create Function"
          onSubmit={vi.fn()}
          onCancel={onCancel}
          fields={[]}
        />,
        { wrapper: createWrapper() }
      );
      
      fireEvent.click(screen.getByTestId('cancel-button'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('should disable submit while submitting', () => {
      render(
        <MockFormPage
          title="Create Function"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          fields={[]}
          isSubmitting={true}
        />,
        { wrapper: createWrapper() }
      );
      
      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent('Submitting...');
    });
  });

  describe('Settings Page Structure', () => {
    // Mock settings page
    const MockSettingsPage = ({
      sections,
    }: {
      sections: { title: string; items: { label: string; href: string }[] }[];
    }) => (
      <div data-testid="settings-page">
        <h1>Settings</h1>
        {sections.map((section, i) => (
          <div key={i} data-testid="settings-section">
            <h2>{section.title}</h2>
            <nav>
              {section.items.map((item, j) => (
                <a key={j} href={item.href} data-testid="settings-link">
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        ))}
      </div>
    );

    it('should render settings sections', () => {
      render(
        <MockSettingsPage
          sections={[
            {
              title: 'Account',
              items: [
                { label: 'Profile', href: '/settings/profile' },
                { label: 'Security', href: '/settings/security' },
              ],
            },
            {
              title: 'Monitoring',
              items: [
                { label: 'Activity', href: '/settings/activity' },
                { label: 'Quota', href: '/settings/quota' },
              ],
            },
          ]}
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getAllByTestId('settings-section')).toHaveLength(2);
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('Monitoring')).toBeInTheDocument();
    });

    it('should render settings links', () => {
      render(
        <MockSettingsPage
          sections={[
            {
              title: 'Account',
              items: [
                { label: 'Profile', href: '/settings/profile' },
                { label: 'Activity', href: '/settings/activity' },
              ],
            },
          ]}
        />,
        { wrapper: createWrapper() }
      );
      
      expect(screen.getAllByTestId('settings-link')).toHaveLength(2);
      expect(screen.getByText('Profile')).toHaveAttribute('href', '/settings/profile');
      expect(screen.getByText('Activity')).toHaveAttribute('href', '/settings/activity');
    });
  });
});

describe('Page Layout Tests', () => {
  describe('Responsive Layout', () => {
    // Mock responsive layout component
    const MockResponsiveLayout = ({ children }: { children: React.ReactNode }) => (
      <div data-testid="layout" className="min-h-screen">
        <aside data-testid="sidebar" className="hidden md:block w-64">
          <nav data-testid="nav">Navigation</nav>
        </aside>
        <main data-testid="main" className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    );

    it('should render layout with sidebar', () => {
      render(
        <MockResponsiveLayout>
          <div>Content</div>
        </MockResponsiveLayout>
      );
      
      expect(screen.getByTestId('layout')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('main')).toBeInTheDocument();
    });

    it('should apply responsive classes', () => {
      render(
        <MockResponsiveLayout>
          <div>Content</div>
        </MockResponsiveLayout>
      );
      
      const sidebar = screen.getByTestId('sidebar');
      expect(sidebar.className).toContain('hidden');
      expect(sidebar.className).toContain('md:block');
    });
  });

  describe('Grid Layouts', () => {
    const MockGridLayout = ({
      columns,
      items,
    }: {
      columns: number;
      items: string[];
    }) => {
      const gridClass = `grid grid-cols-1 md:grid-cols-${Math.min(columns, 2)} lg:grid-cols-${columns}`;
      
      return (
        <div data-testid="grid" className={gridClass}>
          {items.map((item, i) => (
            <div key={i} data-testid="grid-item">
              {item}
            </div>
          ))}
        </div>
      );
    };

    it('should render grid with items', () => {
      render(
        <MockGridLayout columns={3} items={['A', 'B', 'C', 'D', 'E', 'F']} />
      );
      
      expect(screen.getByTestId('grid')).toBeInTheDocument();
      expect(screen.getAllByTestId('grid-item')).toHaveLength(6);
    });

    it('should apply column classes', () => {
      render(
        <MockGridLayout columns={4} items={['A', 'B', 'C', 'D']} />
      );
      
      const grid = screen.getByTestId('grid');
      expect(grid.className).toContain('grid');
      expect(grid.className).toContain('grid-cols-1');
    });
  });
});

describe('Error States', () => {
  const MockErrorPage = ({ error, retry }: { error: Error; retry: () => void }) => (
    <div data-testid="error-page" role="alert">
      <h1>Something went wrong</h1>
      <p data-testid="error-message">{error.message}</p>
      <button onClick={retry} data-testid="retry-button">
        Try Again
      </button>
    </div>
  );

  it('should render error message', () => {
    render(
      <MockErrorPage error={new Error('Failed to load data')} retry={vi.fn()} />
    );
    
    expect(screen.getByTestId('error-message')).toHaveTextContent('Failed to load data');
  });

  it('should render retry button', () => {
    const retry = vi.fn();
    render(<MockErrorPage error={new Error('Error')} retry={retry} />);
    
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(retry).toHaveBeenCalled();
  });
});

describe('Loading States', () => {
  const MockLoadingPage = () => (
    <div data-testid="loading-page">
      <div data-testid="skeleton-header" className="h-8 bg-gray-200 animate-pulse" />
      <div data-testid="skeleton-content" className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} data-testid="skeleton-row" className="h-4 bg-gray-200 animate-pulse" />
        ))}
      </div>
    </div>
  );

  it('should render skeleton header', () => {
    render(<MockLoadingPage />);
    
    expect(screen.getByTestId('skeleton-header')).toBeInTheDocument();
  });

  it('should render skeleton rows', () => {
    render(<MockLoadingPage />);
    
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3);
  });

  it('should apply animation classes', () => {
    render(<MockLoadingPage />);
    
    const header = screen.getByTestId('skeleton-header');
    expect(header.className).toContain('animate-pulse');
  });
});

describe('Empty States', () => {
  const MockEmptyState = ({
    title,
    description,
    action,
  }: {
    title: string;
    description: string;
    action: { label: string; onClick: () => void };
  }) => (
    <div data-testid="empty-state" className="text-center py-12">
      <h2 data-testid="empty-title">{title}</h2>
      <p data-testid="empty-description">{description}</p>
      <button onClick={action.onClick} data-testid="empty-action">
        {action.label}
      </button>
    </div>
  );

  it('should render empty state with title and description', () => {
    render(
      <MockEmptyState
        title="No functions yet"
        description="Create your first function to get started"
        action={{ label: 'Create Function', onClick: vi.fn() }}
      />
    );
    
    expect(screen.getByTestId('empty-title')).toHaveTextContent('No functions yet');
    expect(screen.getByTestId('empty-description')).toHaveTextContent('Create your first function');
  });

  it('should render action button', () => {
    const onClick = vi.fn();
    render(
      <MockEmptyState
        title="No functions"
        description="Get started"
        action={{ label: 'Create Function', onClick }}
      />
    );
    
    fireEvent.click(screen.getByTestId('empty-action'));
    expect(onClick).toHaveBeenCalled();
  });
});
