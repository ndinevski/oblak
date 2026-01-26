import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Route name mappings for breadcrumb display
 */
const routeNameMap: Record<string, string> = {
  '': 'Home',
  'functions': 'Functions',
  'vms': 'Virtual Machines',
  'storage': 'Storage',
  'settings': 'Settings',
  'profile': 'Profile',
  'create': 'Create',
  'auth': 'Authentication',
  'login': 'Login',
  'register': 'Register',
  'forgot-password': 'Forgot Password',
};

/**
 * Get display name for a route segment
 */
function getSegmentName(segment: string): string {
  // Check if it's a mapped route
  if (routeNameMap[segment]) {
    return routeNameMap[segment];
  }
  
  // Check if it's a UUID or ID (don't display as-is)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
    return 'Details';
  }
  
  // Capitalize first letter and replace hyphens with spaces
  return segment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface BreadcrumbItem {
  label: string;
  href: string;
  current?: boolean;
}

export interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
  showHome?: boolean;
}

/**
 * Breadcrumb component
 * Auto-generates breadcrumbs from the current route or accepts custom items
 */
export function Breadcrumb({ items, className, showHome = true }: BreadcrumbProps) {
  const location = useLocation();
  
  // Generate breadcrumb items from current path if not provided
  const breadcrumbItems = React.useMemo<BreadcrumbItem[]>(() => {
    if (items) return items;
    
    const pathSegments = location.pathname.split('/').filter(Boolean);
    
    // Don't show breadcrumbs on auth pages or home
    if (pathSegments.length === 0 || pathSegments[0] === 'auth') {
      return [];
    }
    
    const generatedItems: BreadcrumbItem[] = [];
    
    // Add home if enabled
    if (showHome) {
      generatedItems.push({
        label: 'Home',
        href: '/',
        current: false,
      });
    }
    
    // Build cumulative paths
    let currentPath = '';
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      generatedItems.push({
        label: getSegmentName(segment),
        href: currentPath,
        current: index === pathSegments.length - 1,
      });
    });
    
    return generatedItems;
  }, [items, location.pathname, showHome]);
  
  // Don't render if no items
  if (breadcrumbItems.length === 0) {
    return null;
  }
  
  return (
    <nav aria-label="Breadcrumb" className={cn('mb-4', className)}>
      <ol className="flex items-center space-x-2 text-sm text-muted-foreground">
        {breadcrumbItems.map((item, index) => (
          <li key={item.href} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 mx-2 flex-shrink-0" />
            )}
            {item.current ? (
              <span className="font-medium text-foreground" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link
                to={item.href}
                className="hover:text-foreground transition-colors flex items-center gap-1"
              >
                {index === 0 && showHome && (
                  <Home className="h-4 w-4" />
                )}
                <span className={index === 0 && showHome ? 'sr-only' : ''}>
                  {item.label}
                </span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
