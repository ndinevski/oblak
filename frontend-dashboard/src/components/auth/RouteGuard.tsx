/**
 * Route guard components for authentication
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useIsAuthenticated, useAuthLoading } from '@/stores/authStore';
import { Loader2 } from 'lucide-react';

interface RouteGuardProps {
  children: React.ReactNode;
}

/**
 * Protects routes that require authentication
 * Redirects to login if not authenticated
 */
export function RequireAuth({ children }: RouteGuardProps) {
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save the attempted location for redirect after login
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * Redirects authenticated users away from auth pages
 * Used for login/register pages
 */
export function RedirectIfAuthenticated({ children }: RouteGuardProps) {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();

  if (isAuthenticated) {
    // Redirect to the page they came from, or dashboard
    const from = (location.state as { from?: Location })?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}
