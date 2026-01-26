import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export default function BucketDetailPage() {
  const { bucketId } = useParams();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bucket Details</h1>
        <p className="text-muted-foreground">Bucket ID: {bucketId}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bucket Objects</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Bucket contents will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
