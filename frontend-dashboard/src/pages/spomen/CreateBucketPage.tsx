import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Label } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

export default function CreateBucketPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Bucket</h1>
        <p className="text-muted-foreground">Create a new storage bucket</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Bucket Configuration</CardTitle>
          <CardDescription>Configure your new storage bucket</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Bucket Name</Label>
              <Input id="name" placeholder="my-bucket" />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Create Bucket</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/storage')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
