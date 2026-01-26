import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Link } from 'react-router-dom';
import { User, Shield, Bell } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link to="/settings/profile">
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
              <CardDescription>Manage your personal information</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Card className="opacity-50 cursor-not-allowed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>Password and authentication settings</CardDescription>
          </CardHeader>
        </Card>

        <Card className="opacity-50 cursor-not-allowed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>Configure notification preferences</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
