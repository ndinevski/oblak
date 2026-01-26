import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Label } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

export default function CreateFunctionPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Function</h1>
        <p className="text-muted-foreground">Deploy a new serverless function</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Function Configuration</CardTitle>
          <CardDescription>Configure your new serverless function</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Function Name</Label>
              <Input id="name" placeholder="my-function" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="runtime">Runtime</Label>
              <Input id="runtime" placeholder="python3.11" />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Create Function</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/functions')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
