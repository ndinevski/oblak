import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';

describe('App', () => {
  it('renders the dashboard header', () => {
    render(<App />);
    expect(screen.getByText('Oblak Cloud Dashboard')).toBeInTheDocument();
  });

  it('renders all three service cards', () => {
    render(<App />);
    expect(screen.getByText('Impuls')).toBeInTheDocument();
    expect(screen.getByText('Izvor')).toBeInTheDocument();
    expect(screen.getByText('Spomen')).toBeInTheDocument();
  });

  it('displays service descriptions', () => {
    render(<App />);
    expect(screen.getByText('Function as a Service')).toBeInTheDocument();
    expect(screen.getByText('Virtual Machines')).toBeInTheDocument();
    expect(screen.getByText('Object Storage')).toBeInTheDocument();
  });
});
