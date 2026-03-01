import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Link } from 'react-router-dom';
import { User, Shield, Bell, Key } from 'lucide-react';

interface SettingsCardProps {
  to?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  disabled?: boolean;
}

function SettingsCard({ to, icon: Icon, title, description, disabled }: SettingsCardProps) {
  const content = (
    <Card className={disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary transition-colors cursor-pointer'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (disabled || !to) return content;
  return <Link to={to}>{content}</Link>;
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      {/* Account Settings */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Account</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SettingsCard
            to="/settings/profile"
            icon={User}
            title="Profile"
            description="Manage your personal information and display name"
          />
          <SettingsCard
            icon={Shield}
            title="Security"
            description="Password and two-factor authentication"
            disabled
          />
          <SettingsCard
            icon={Key}
            title="API Keys"
            description="Manage API keys for programmatic access"
            disabled
          />
        </div>
      </div>

      {/* Preferences */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Preferences</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SettingsCard
            icon={Bell}
            title="Notifications"
            description="Configure notification preferences"
            disabled
          />
        </div>
      </div>
    </div>
  );
}
