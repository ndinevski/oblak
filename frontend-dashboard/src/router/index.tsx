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

// Pristaniste (Containers) pages
const ContainersPage = lazy(() => import('@/pages/pristaniste/ContainersPage'));
const RepositoriesPage = lazy(() => import('@/pages/pristaniste/RepositoriesPage'));

// Tefter (Databases) pages
const DatabasesPage = lazy(() => import('@/pages/tefter/DatabasesPage'));
const DatabaseDetailPage = lazy(() => import('@/pages/tefter/DatabaseDetailPage'));

// Vrata (Gateway) pages
const RoutesPage = lazy(() => import('@/pages/vrata/RoutesPage'));

// Indeks (Key/Value) pages
const TablesPage = lazy(() => import('@/pages/indeks/TablesPage'));
const TableDetailPage = lazy(() => import('@/pages/indeks/TableDetailPage'));

// Red (Message Queue) pages
const QueuesPage = lazy(() => import('@/pages/red/QueuesPage'));
const QueueDetailPage = lazy(() => import('@/pages/red/QueueDetailPage'));
const TriggersPage = lazy(() => import('@/pages/red/TriggersPage'));

// Polaroid (Photos) pages
const PhotosTimelinePage = lazy(() => import('@/pages/polaroid/PhotosTimelinePage'));
const AlbumsListPage = lazy(() => import('@/pages/polaroid/AlbumsListPage'));
const AlbumDetailPage = lazy(() => import('@/pages/polaroid/AlbumDetailPage'));
const PeoplePage = lazy(() => import('@/pages/polaroid/PeoplePage'));
const PersonDetailPage = lazy(() => import('@/pages/polaroid/PersonDetailPage'));
const MapPage = lazy(() => import('@/pages/polaroid/MapPage'));
const SearchPage = lazy(() => import('@/pages/polaroid/SearchPage'));
const SharingPage = lazy(() => import('@/pages/polaroid/SharingPage'));
const PolaroidSettingsPage = lazy(() => import('@/pages/polaroid/PolaroidSettingsPage'));
const SharedLinkViewPage = lazy(() => import('@/pages/polaroid/SharedLinkViewPage'));

// Settings pages
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const ProfilePage = lazy(() => import('@/pages/settings/ProfilePage'));
const ActivityPage = lazy(() => import('@/pages/settings/ActivityPage'));
const QuotaPage = lazy(() => import('@/pages/settings/QuotaPage'));
const UsersPage = lazy(() => import('@/pages/settings/UsersPage'));
const ApiKeysPage = lazy(() => import('@/pages/settings/ApiKeysPage'));

// Observability pages
const ObservabilityOverviewPage = lazy(
  () => import('@/pages/observability/OverviewPage')
);
const LogsPage = lazy(() => import('@/pages/observability/LogsPage'));
const TracesPage = lazy(() => import('@/pages/observability/TracesPage'));
const TraceDetailPage = lazy(() => import('@/pages/observability/TraceDetailPage'));
const MetricsPage = lazy(() => import('@/pages/observability/MetricsPage'));
const ServiceMapPage = lazy(() => import('@/pages/observability/ServiceMapPage'));
const AlertsPage = lazy(() => import('@/pages/observability/AlertsPage'));

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

      // Pristaniste (Containers) routes
      {
        path: 'containers',
        element: (
          <SuspenseWrapper>
            <ContainersPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'images',
        element: (
          <SuspenseWrapper>
            <RepositoriesPage />
          </SuspenseWrapper>
        ),
      },

      // Tefter (Databases) routes
      {
        path: 'databases',
        element: (
          <SuspenseWrapper>
            <DatabasesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'databases/:name',
        element: (
          <SuspenseWrapper>
            <DatabaseDetailPage />
          </SuspenseWrapper>
        ),
      },

      // Vrata (Gateway) routes
      {
        path: 'gateway',
        element: (
          <SuspenseWrapper>
            <RoutesPage />
          </SuspenseWrapper>
        ),
      },

      // Indeks (Key/Value) routes
      {
        path: 'keyvalue',
        element: (
          <SuspenseWrapper>
            <TablesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'keyvalue/:name',
        element: (
          <SuspenseWrapper>
            <TableDetailPage />
          </SuspenseWrapper>
        ),
      },

      // Red (Message Queue) routes
      {
        path: 'queues',
        element: (
          <SuspenseWrapper>
            <QueuesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'queues/:name',
        element: (
          <SuspenseWrapper>
            <QueueDetailPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'triggers',
        element: (
          <SuspenseWrapper>
            <TriggersPage />
          </SuspenseWrapper>
        ),
      },

      // Observability routes
      {
        path: 'observability',
        children: [
          {
            index: true,
            element: (
              <SuspenseWrapper>
                <ObservabilityOverviewPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'logs',
            element: (
              <SuspenseWrapper>
                <LogsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'traces',
            element: (
              <SuspenseWrapper>
                <TracesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'traces/:traceId',
            element: (
              <SuspenseWrapper>
                <TraceDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'metrics',
            element: (
              <SuspenseWrapper>
                <MetricsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'services',
            element: (
              <SuspenseWrapper>
                <ServiceMapPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'alerts',
            element: (
              <SuspenseWrapper>
                <AlertsPage />
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

      // Polaroid (Photos) routes
      {
        path: 'photos',
        children: [
          {
            index: true,
            element: <SuspenseWrapper><PhotosTimelinePage /></SuspenseWrapper>,
          },
          {
            path: 'albums',
            element: <SuspenseWrapper><AlbumsListPage /></SuspenseWrapper>,
          },
          {
            path: 'albums/:albumId',
            element: <SuspenseWrapper><AlbumDetailPage /></SuspenseWrapper>,
          },
          {
            path: 'people',
            element: <SuspenseWrapper><PeoplePage /></SuspenseWrapper>,
          },
          {
            path: 'people/:personId',
            element: <SuspenseWrapper><PersonDetailPage /></SuspenseWrapper>,
          },
          {
            path: 'map',
            element: <SuspenseWrapper><MapPage /></SuspenseWrapper>,
          },
          {
            path: 'search',
            element: <SuspenseWrapper><SearchPage /></SuspenseWrapper>,
          },
          {
            path: 'sharing',
            element: <SuspenseWrapper><SharingPage /></SuspenseWrapper>,
          },
          {
            path: 'settings',
            element: <SuspenseWrapper><PolaroidSettingsPage /></SuspenseWrapper>,
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
          {
            path: 'users',
            element: (
              <SuspenseWrapper>
                <UsersPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'api-keys',
            element: (
              <SuspenseWrapper>
                <ApiKeysPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },

  // Public shared link route (no auth required)
  {
    path: '/share/:key',
    element: (
      <SuspenseWrapper>
        <SharedLinkViewPage />
      </SuspenseWrapper>
    ),
  },

  // Catch all - redirect to home
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export default router;
