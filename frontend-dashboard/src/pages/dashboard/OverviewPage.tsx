import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Zap, Server, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to Oblak Cloud Dashboard</p>
      </div>

      {/* Service overview cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/functions">
          <Card className="hover:border-primary transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Functions</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <CardDescription>Active serverless functions</CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link to="/vms">
          <Card className="hover:border-primary transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Virtual Machines</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <CardDescription>Running VMs</CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link to="/storage">
          <Card className="hover:border-primary transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Storage Buckets</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <CardDescription>Active buckets</CardDescription>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your recent actions and events</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No recent activity</p>
        </CardContent>
      </Card>
    </div>
  );
}
