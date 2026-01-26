/**
 * Error Boundary Component
 * Catches React errors and displays fallback UI
 */

import * as React from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

// =============================================================================
// Types
// =============================================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// =============================================================================
// Error Boundary Class Component
// =============================================================================

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Call optional error handler
    this.props.onError?.(error, errorInfo);
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by ErrorBoundary:', error);
      console.error('Component stack:', errorInfo.componentStack);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          onReload={this.handleReload}
          onGoHome={this.handleGoHome}
        />
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// Error Fallback Component
// =============================================================================

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo?: React.ErrorInfo | null;
  onReset?: () => void;
  onReload?: () => void;
  onGoHome?: () => void;
}

export function ErrorFallback({
  error,
  errorInfo,
  onReset,
  onReload,
  onGoHome,
}: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = React.useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred. Please try again or contact support if the problem persists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {error.message || 'Unknown error'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-center">
            {onReset && (
              <Button variant="outline" onClick={onReset}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}
            {onReload && (
              <Button variant="outline" onClick={onReload}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload Page
              </Button>
            )}
            {onGoHome && (
              <Button variant="default" onClick={onGoHome}>
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            )}
          </div>

          {isDev && errorInfo && (
            <div className="pt-4 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="w-full"
              >
                <Bug className="h-4 w-4 mr-2" />
                {showDetails ? 'Hide' : 'Show'} Developer Details
              </Button>
              
              {showDetails && (
                <div className="mt-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Error Stack:</h4>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40">
                      {error?.stack || 'No stack trace available'}
                    </pre>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2">Component Stack:</h4>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Hook for Error Boundary
// =============================================================================

export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  if (error) {
    throw error;
  }

  return { captureError, resetError };
}

// =============================================================================
// Page Error Boundary
// =============================================================================

export function PageErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // In production, you would send this to an error tracking service
        console.error('Page error:', error);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
