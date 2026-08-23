import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Avatar,
  AvatarFallback,
  ScrollArea,
  Button,
  ThemeDropdown,
  Toaster,
  GlobalSearch,
  SearchTrigger,
  useGlobalSearchShortcut,
  ErrorBoundary,
} from '@/components/ui';
import {
  LayoutDashboard,
  Zap,
  Server,
  Database,
  Boxes,
  Camera,
  Activity,
  PieChart,
  Settings,
  LogOut,
  User,
  Menu,
  X,
  PanelLeft,
  PanelLeftClose,
  Gauge,
  ScrollText,
  GitBranch,
  LineChart,
  Network,
  BellRing,
  Container,
  Package,
  Waypoints,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

const primaryNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
];

const servicesNavigation = [
  { name: 'Impuls', href: '/functions', icon: Zap },
  { name: 'Izvor', href: '/vms', icon: Server },
  { name: 'Spomen', href: '/storage', icon: Boxes },
  { name: 'Brod', href: '/containers', icon: Container },
  { name: 'Brod Images', href: '/images', icon: Package },
  { name: 'Tefter', href: '/databases', icon: Database },
  { name: 'Vrata', href: '/gateway', icon: Waypoints },
  { name: 'Polaroid', href: '/photos', icon: Camera },
];

const monitoringNavigation = [
  { name: 'Observability', href: '/observability', icon: Gauge },
  { name: 'Logs', href: '/observability/logs', icon: ScrollText },
  { name: 'Traces', href: '/observability/traces', icon: GitBranch },
  { name: 'Metrics', href: '/observability/metrics', icon: LineChart },
  { name: 'Service Map', href: '/observability/services', icon: Network },
  { name: 'Alerts', href: '/observability/alerts', icon: BellRing },
  { name: 'Activity Log', href: '/settings/activity', icon: Activity },
  { name: 'Quota Usage', href: '/settings/quota', icon: PieChart },
];

const bottomNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
];

/** Every href the sidebar can highlight, used to resolve the active one. */
export const ALL_NAV_HREFS = [
  ...primaryNavigation,
  ...servicesNavigation,
  ...monitoringNavigation,
  ...bottomNavigation,
].map((item) => item.href);

/**
 * Resolves which single nav item should be highlighted.
 *
 * React Router's own `isActive` marks a link active for every descendant path,
 * so a parent like /observability stayed highlighted alongside its own child
 * (/observability/logs). Longest match wins here instead, which means a parent
 * never steals a child's highlight and a child never leaves its parent lit.
 *
 * This also covers the case a parent has no nav entry of its own for a given
 * sub-path: /settings/profile has no item, so /settings stays highlighted.
 */
export function resolveActiveHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;

  for (const href of hrefs) {
    const isMatch =
      pathname === href || pathname.startsWith(href.endsWith('/') ? href : `${href}/`);
    if (isMatch && (best === null || href.length > best.length)) {
      best = href;
    }
  }

  return best;
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isCompact = sidebarCollapsed && !sidebarOpen;
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();

  // One resolved winner rather than per-link matching, so exactly one sidebar
  // item is ever highlighted.
  const activeHref = resolveActiveHref(location.pathname, ALL_NAV_HREFS);

  // Enable Cmd+K global search shortcut
  useGlobalSearchShortcut();

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const getInitials = () => {
    if (user?.username) {
      return user.username.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 lg:transition-[width] lg:duration-200',
          isCompact ? 'lg:w-20' : 'lg:w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div
            className={cn(
              'flex h-16 items-center border-b border-border',
              isCompact ? 'px-2 justify-center' : 'px-4 justify-between'
            )}
          >
            {!isCompact && (
              <NavLink to="/" className="flex min-w-0 items-center gap-2 overflow-hidden">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-lg">O</span>
                </div>
                <span className="font-semibold text-lg whitespace-nowrap leading-none">Oblak Console</span>
              </NavLink>
            )}

            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'hidden lg:inline-flex',
                isCompact ? 'h-9 w-full rounded-lg justify-center' : 'h-10 w-10'
              )}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCompact ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="space-y-5 px-2">
              {primaryNavigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  title={isCompact ? item.name : undefined}
                  className={cn(
                    'flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
                    isCompact ? 'justify-center px-2' : 'gap-3 px-3',
                    activeHref === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span
                    className={cn(
                      'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200',
                      isCompact ? 'max-w-0 opacity-0' : 'max-w-[12rem] opacity-100'
                    )}
                  >
                    {item.name}
                  </span>
                </NavLink>
              ))}

              <div className="space-y-1">
                <p
                  className={cn(
                    'overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground/80 transition-[max-height,max-width,opacity,padding] duration-200',
                    isCompact ? 'max-h-0 max-w-0 opacity-0 px-0 py-0' : 'max-h-8 max-w-[12rem] opacity-100 px-3 py-1'
                  )}
                >
                  Services
                </p>
                {servicesNavigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    title={isCompact ? item.name : undefined}
                    className={cn(
                      'flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
                      isCompact ? 'justify-center px-2' : 'gap-3 px-3',
                      activeHref === item.href
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span
                      className={cn(
                        'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200',
                        isCompact ? 'max-w-0 opacity-0' : 'max-w-[12rem] opacity-100'
                      )}
                    >
                      {item.name}
                    </span>
                  </NavLink>
                ))}
              </div>

              <div className="space-y-1">
                <p
                  className={cn(
                    'overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground/80 transition-[max-height,max-width,opacity,padding] duration-200',
                    isCompact ? 'max-h-0 max-w-0 opacity-0 px-0 py-0' : 'max-h-8 max-w-[12rem] opacity-100 px-3 py-1'
                  )}
                >
                  Monitoring
                </p>
                {monitoringNavigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    title={isCompact ? item.name : undefined}
                    className={cn(
                      'flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
                      isCompact ? 'justify-center px-2' : 'gap-3 px-3',
                      activeHref === item.href
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span
                      className={cn(
                        'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200',
                        isCompact ? 'max-w-0 opacity-0' : 'max-w-[12rem] opacity-100'
                      )}
                    >
                      {item.name}
                    </span>
                  </NavLink>
                ))}
              </div>
            </nav>
          </ScrollArea>

          {/* Bottom navigation */}
          <div className="border-t border-border p-2">
            <nav className="space-y-1">
              {bottomNavigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  title={isCompact ? item.name : undefined}
                  className={cn(
                    'flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
                    isCompact ? 'justify-center px-2' : 'gap-3 px-3',
                    activeHref === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span
                    className={cn(
                      'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200',
                      isCompact ? 'max-w-0 opacity-0' : 'max-w-[12rem] opacity-100'
                    )}
                  >
                    {item.name}
                  </span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-border px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Global Search */}
          <div className="hidden md:block ml-4">
            <SearchTrigger className="w-64" />
          </div>

          <div className="flex-1" />

          {/* Theme toggle */}
          <ThemeDropdown className="mr-2" />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarFallback>{getInitials()}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Components */}
      <GlobalSearch />
      <Toaster />
    </div>
  );
}
