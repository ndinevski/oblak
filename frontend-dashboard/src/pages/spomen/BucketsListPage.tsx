import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Plus, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function BucketsListPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Storage Buckets</h1>
          <p className="text-muted-foreground">Manage your object storage</p>
        </div>
        <Link to="/storage/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Bucket
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Your Buckets
          </CardTitle>
          <CardDescription>Store and manage objects with Spomen</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No buckets yet. Create your first bucket to get started.</p>
        </CardContent>
      </Card>
    </div>
  );
}
