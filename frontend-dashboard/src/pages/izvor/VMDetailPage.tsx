import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export default function VMDetailPage() {
  const { vmId } = useParams();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">VM Details</h1>
        <p className="text-muted-foreground">VM ID: {vmId}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>VM Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">VM details will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
