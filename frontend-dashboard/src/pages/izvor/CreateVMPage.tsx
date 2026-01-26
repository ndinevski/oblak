import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Label } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

export default function CreateVMPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Virtual Machine</h1>
        <p className="text-muted-foreground">Launch a new virtual machine</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>VM Configuration</CardTitle>
          <CardDescription>Configure your new virtual machine</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">VM Name</Label>
              <Input id="name" placeholder="my-vm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Input id="template" placeholder="ubuntu-22.04" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cores">CPU Cores</Label>
                <Input id="cores" type="number" placeholder="2" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memory">Memory (MB)</Label>
                <Input id="memory" type="number" placeholder="2048" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Create VM</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/vms')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
