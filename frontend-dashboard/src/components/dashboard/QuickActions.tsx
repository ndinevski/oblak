import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@/components/ui';
import { LucideIcon, Zap, Server, Database } from 'lucide-react';

export interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  variant?: 'default' | 'outline' | 'secondary';
}

export interface QuickActionsProps {
  actions?: QuickAction[];
  className?: string;
}

/**
 * Default quick actions
 */
const defaultActions: QuickAction[] = [
  {
    label: 'New Function',
    href: '/functions/create',
    icon: Zap,
    variant: 'default',
  },
  {
    label: 'New VM',
    href: '/vms/create',
    icon: Server,
    variant: 'outline',
  },
  {
    label: 'New Bucket',
    href: '/storage/create',
    icon: Database,
    variant: 'outline',
  },
];

/**
 * QuickActions widget provides shortcuts to common actions
 */
export function QuickActions({ actions = defaultActions, className }: QuickActionsProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Get started quickly</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.href}
                variant={action.variant || 'outline'}
                size="sm"
                asChild
              >
                <Link to={action.href}>
                  <Icon className="h-4 w-4 mr-2" />
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default QuickActions;
