import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Plus, Server } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function VMsListPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Virtual Machines</h1>
          <p className="text-muted-foreground">Manage your virtual machines</p>
        </div>
        <Link to="/vms/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New VM
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Your Virtual Machines
          </CardTitle>
          <CardDescription>Create and manage VMs with Izvor</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No VMs yet. Create your first VM to get started.</p>
        </CardContent>
      </Card>
    </div>
  );
}
