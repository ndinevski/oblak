import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export default function FunctionDetailPage() {
  const { functionId } = useParams();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Function Details</h1>
        <p className="text-muted-foreground">Function ID: {functionId}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Function Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Function details will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
