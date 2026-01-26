import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Plus, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function FunctionsListPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Functions</h1>
          <p className="text-muted-foreground">Manage your serverless functions</p>
        </div>
        <Link to="/functions/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Function
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Your Functions
          </CardTitle>
          <CardDescription>Deploy and manage serverless functions with Impuls</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No functions yet. Create your first function to get started.</p>
        </CardContent>
      </Card>
    </div>
  );
}
