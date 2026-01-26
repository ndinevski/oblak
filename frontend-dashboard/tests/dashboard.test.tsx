/**
 * Dashboard components tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Zap, Server, Database } from 'lucide-react';
import { ResourceCard } from '@/components/dashboard/ResourceCard';
import { QuotaWidget } from '@/components/dashboard/QuotaWidget';
import { RecentActivity, type ActivityItem } from '@/components/dashboard/RecentActivity';
import { QuickActions } from '@/components/dashboard/QuickActions';

// Wrapper for tests requiring router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

// Wrapper for tests requiring QueryClient
const QueryWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('ResourceCard', () => {
  it('renders with basic props', () => {
    render(
      <RouterWrapper>
        <ResourceCard title="Functions" value={5} icon={Zap} />
      </RouterWrapper>
    );
    expect(screen.getByText('Functions')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(
      <RouterWrapper>
        <ResourceCard title="Functions" value={5} description="Active functions" icon={Zap} />
      </RouterWrapper>
    );
    expect(screen.getByText('Active functions')).toBeInTheDocument();
  });

  it('renders as link when href provided', () => {
    render(
      <RouterWrapper>
        <ResourceCard title="Functions" value={5} icon={Zap} href="/functions" />
      </RouterWrapper>
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/functions');
  });

  it('renders positive trend', () => {
    render(
      <RouterWrapper>
        <ResourceCard title="Functions" value={5} icon={Zap} trend={{ value: 10 }} />
      </RouterWrapper>
    );
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('renders negative trend', () => {
    render(
      <RouterWrapper>
        <ResourceCard title="Functions" value={5} icon={Zap} trend={{ value: -5 }} />
      </RouterWrapper>
    );
    expect(screen.getByText('5%')).toBeInTheDocument();
  });
});

describe('QuotaWidget', () => {
  it('renders quota items', () => {
    const quotas = [
      { name: 'Functions', used: 3, max: 10 },
      { name: 'VMs', used: 2, max: 5 },
    ];
    render(<QuotaWidget quotas={quotas} />);
    expect(screen.getByText('Resource Quotas')).toBeInTheDocument();
    expect(screen.getByText('Functions')).toBeInTheDocument();
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(screen.getByText('VMs')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<QuotaWidget quotas={[]} />);
    expect(screen.getByText('No quota information available')).toBeInTheDocument();
  });

  it('renders unit when provided', () => {
    const quotas = [{ name: 'Storage', used: 25, max: 50, unit: 'GB' }];
    render(<QuotaWidget quotas={quotas} />);
    expect(screen.getByText('25 / 50 GB')).toBeInTheDocument();
  });

  it('calculates percentage correctly', () => {
    const quotas = [{ name: 'Test', used: 50, max: 100 }];
    render(<QuotaWidget quotas={quotas} />);
    expect(screen.getByText('50% used')).toBeInTheDocument();
  });

  it('renders progressbar with correct aria attributes', () => {
    const quotas = [{ name: 'Test', used: 30, max: 100 }];
    render(<QuotaWidget quotas={quotas} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '30');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });
});

describe('RecentActivity', () => {
  const mockActivities: ActivityItem[] = [
    {
      id: '1',
      type: 'function_created',
      message: 'Created function hello-world',
      timestamp: new Date(),
      resourceName: 'hello-world',
    },
    {
      id: '2',
      type: 'vm_started',
      message: 'Started VM web-server',
      timestamp: new Date(),
    },
  ];

  it('renders activity list', () => {
    render(<RecentActivity activities={mockActivities} />);
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('Created function hello-world')).toBeInTheDocument();
    expect(screen.getByText('Started VM web-server')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<RecentActivity activities={[]} />);
    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('limits displayed items', () => {
    const manyActivities: ActivityItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      type: 'function_created',
      message: `Activity ${i}`,
      timestamp: new Date(),
    }));
    render(<RecentActivity activities={manyActivities} maxItems={3} />);
    expect(screen.getByText('Activity 0')).toBeInTheDocument();
    expect(screen.getByText('Activity 2')).toBeInTheDocument();
    expect(screen.queryByText('Activity 3')).not.toBeInTheDocument();
  });

  it('renders resource name when provided', () => {
    render(<RecentActivity activities={mockActivities} />);
    expect(screen.getByText('hello-world')).toBeInTheDocument();
  });
});

describe('QuickActions', () => {
  it('renders default actions', () => {
    render(
      <RouterWrapper>
        <QuickActions />
      </RouterWrapper>
    );
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new function/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new vm/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new bucket/i })).toBeInTheDocument();
  });

  it('renders custom actions', () => {
    const customActions = [
      { label: 'Custom Action', href: '/custom', icon: Zap },
    ];
    render(
      <RouterWrapper>
        <QuickActions actions={customActions} />
      </RouterWrapper>
    );
    expect(screen.getByRole('link', { name: /custom action/i })).toHaveAttribute('href', '/custom');
  });

  it('links have correct hrefs', () => {
    render(
      <RouterWrapper>
        <QuickActions />
      </RouterWrapper>
    );
    expect(screen.getByRole('link', { name: /new function/i })).toHaveAttribute('href', '/functions/create');
    expect(screen.getByRole('link', { name: /new vm/i })).toHaveAttribute('href', '/vms/create');
    expect(screen.getByRole('link', { name: /new bucket/i })).toHaveAttribute('href', '/storage/create');
  });
});
