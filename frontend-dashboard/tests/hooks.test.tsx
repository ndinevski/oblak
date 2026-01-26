import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys, useInvalidateQueries } from '@/hooks/useQuery';
import { ReactNode } from 'react';

// Create a wrapper with QueryClient for testing
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('Query Keys', () => {
  describe('auth keys', () => {
    it('has base auth key', () => {
      expect(queryKeys.auth).toEqual(['auth']);
    });

    it('generates user key', () => {
      expect(queryKeys.user()).toEqual(['auth', 'user']);
    });
  });

  describe('functions keys', () => {
    it('has base functions key', () => {
      expect(queryKeys.functions).toEqual(['functions']);
    });

    it('generates functions list key', () => {
      expect(queryKeys.functionsList()).toEqual(['functions', 'list']);
    });

    it('generates function detail key', () => {
      expect(queryKeys.functionDetail('123')).toEqual(['functions', 'detail', '123']);
    });

    it('generates function logs key', () => {
      expect(queryKeys.functionLogs('123')).toEqual(['functions', 'logs', '123']);
    });
  });

  describe('vms keys', () => {
    it('has base vms key', () => {
      expect(queryKeys.vms).toEqual(['vms']);
    });

    it('generates vms list key', () => {
      expect(queryKeys.vmsList()).toEqual(['vms', 'list']);
    });

    it('generates vm detail key', () => {
      expect(queryKeys.vmDetail('vm-1')).toEqual(['vms', 'detail', 'vm-1']);
    });

    it('generates vm metrics key', () => {
      expect(queryKeys.vmMetrics('vm-1')).toEqual(['vms', 'metrics', 'vm-1']);
    });
  });

  describe('buckets keys', () => {
    it('has base buckets key', () => {
      expect(queryKeys.buckets).toEqual(['buckets']);
    });

    it('generates buckets list key', () => {
      expect(queryKeys.bucketsList()).toEqual(['buckets', 'list']);
    });

    it('generates bucket detail key', () => {
      expect(queryKeys.bucketDetail('bucket-1')).toEqual(['buckets', 'detail', 'bucket-1']);
    });

    it('generates bucket objects key', () => {
      expect(queryKeys.bucketObjects('bucket-1')).toEqual(['buckets', 'objects', 'bucket-1']);
    });
  });

  describe('dashboard keys', () => {
    it('has base dashboard key', () => {
      expect(queryKeys.dashboard).toEqual(['dashboard']);
    });

    it('generates overview key', () => {
      expect(queryKeys.overview()).toEqual(['dashboard', 'overview']);
    });

    it('generates activity key', () => {
      expect(queryKeys.activity()).toEqual(['dashboard', 'activity']);
    });
  });
});

describe('useInvalidateQueries', () => {
  it('returns invalidation functions', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useInvalidateQueries(), { wrapper });

    expect(result.current.invalidateFunctions).toBeDefined();
    expect(result.current.invalidateVMs).toBeDefined();
    expect(result.current.invalidateBuckets).toBeDefined();
    expect(result.current.invalidateDashboard).toBeDefined();
    expect(result.current.invalidateAll).toBeDefined();
  });

  it('invalidation functions are callable', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useInvalidateQueries(), { wrapper });

    // These should not throw
    await result.current.invalidateFunctions();
    await result.current.invalidateVMs();
    await result.current.invalidateBuckets();
    await result.current.invalidateDashboard();
    await result.current.invalidateAll();
  });
});
