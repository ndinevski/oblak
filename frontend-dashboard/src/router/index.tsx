import { createBrowserRouter, Navigate } from 'react-router-dom';

// Lazy load pages for code splitting
import { lazy, Suspense } from 'react';
import { Spinner } from '@/components/ui';
import { RequireAuth, RedirectIfAuthenticated } from '@/components/auth/RouteGuard';

// Layout components
const DashboardLayout = lazy(() => import('@/layouts/DashboardLayout'));
const AuthLayout = lazy(() => import('@/layouts/AuthLayout'));

// Auth pages
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));

// Dashboard pages
const OverviewPage = lazy(() => import('@/pages/dashboard/OverviewPage'));

// Impuls (FaaS) pages
const FunctionsListPage = lazy(() => import('@/pages/impuls/FunctionsListPage'));
const FunctionDetailPage = lazy(() => import('@/pages/impuls/FunctionDetailPage'));
const CreateFunctionPage = lazy(() => import('@/pages/impuls/CreateFunctionPage'));
const EditFunctionPage = lazy(() => import('@/pages/impuls/EditFunctionPage'));

// Izvor (VMs) pages
const VMsListPage = lazy(() => import('@/pages/izvor/VMsListPage'));
const VMDetailPage = lazy(() => import('@/pages/izvor/VMDetailPage'));
const CreateVMPage = lazy(() => import('@/pages/izvor/CreateVMPage'));

// Spomen (Storage) pages
const BucketsListPage = lazy(() => import('@/pages/spomen/BucketsListPage'));
const BucketDetailPage = lazy(() => import('@/pages/spomen/BucketDetailPage'));
const CreateBucketPage = lazy(() => import('@/pages/spomen/CreateBucketPage'));
const EditBucketPage = lazy(() => import('@/pages/spomen/EditBucketPage'));

// Settings pages
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const ProfilePage = lazy(() => import('@/pages/settings/ProfilePage'));
const ActivityPage = lazy(() => import('@/pages/settings/ActivityPage'));
const QuotaPage = lazy(() => import('@/pages/settings/QuotaPage'));

// Loading fallback
const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center">
    <Spinner size="lg" />
  </div>
);

// Suspense wrapper for lazy components
const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

export const router = createBrowserRouter([
  // Public auth routes
  {
    path: '/auth',
    element: (
      <SuspenseWrapper>
        <RedirectIfAuthenticated>
          <AuthLayout />
        </RedirectIfAuthenticated>
      </SuspenseWrapper>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/auth/login" replace />,
      },
      {
        path: 'login',
        element: (
          <SuspenseWrapper>
            <LoginPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'register',
        element: (
          <SuspenseWrapper>
            <RegisterPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'forgot-password',
        element: (
          <SuspenseWrapper>
            <ForgotPasswordPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },

  // Protected dashboard routes
  {
    path: '/',
    element: (
      <SuspenseWrapper>
        <RequireAuth>
          <DashboardLayout />
        </RequireAuth>
      </SuspenseWrapper>
    ),
    children: [
      {
        index: true,
        element: (
          <SuspenseWrapper>
            <OverviewPage />
          </SuspenseWrapper>
        ),
      },

      // Impuls (Functions) routes
      {
        path: 'functions',
        children: [
          {
            index: true,
            element: (
              <SuspenseWrapper>
                <FunctionsListPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'new',
            element: (
              <SuspenseWrapper>
                <CreateFunctionPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ':functionId',
            element: (
              <SuspenseWrapper>
                <FunctionDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ':functionId/edit',
            element: (
              <SuspenseWrapper>
                <EditFunctionPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },

      // Izvor (VMs) routes
      {
        path: 'vms',
        children: [
          {
            index: true,
            element: (
              <SuspenseWrapper>
                <VMsListPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'new',
            element: (
              <SuspenseWrapper>
                <CreateVMPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ':vmId',
            element: (
              <SuspenseWrapper>
                <VMDetailPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },

      // Spomen (Storage) routes
      {
        path: 'storage',
        children: [
          {
            index: true,
            element: (
              <SuspenseWrapper>
                <BucketsListPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'new',
            element: (
              <SuspenseWrapper>
                <CreateBucketPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ':bucketId',
            element: (
              <SuspenseWrapper>
                <BucketDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ':bucketId/edit',
            element: (
              <SuspenseWrapper>
                <EditBucketPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },

      // Settings routes
      {
        path: 'settings',
        children: [
          {
            index: true,
            element: (
              <SuspenseWrapper>
                <SettingsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'profile',
            element: (
              <SuspenseWrapper>
                <ProfilePage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'activity',
            element: (
              <SuspenseWrapper>
                <ActivityPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'quota',
            element: (
              <SuspenseWrapper>
                <QuotaPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },

  // Catch all - redirect to home
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export default router;
