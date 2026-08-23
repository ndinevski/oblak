/**
 * Shown when Red itself cannot be reached.
 */

import { Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function RedUnavailable() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Red is not reachable</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start the message queue with <code className="text-xs">make up-red</code>, and check
            that <code className="text-xs">RED_URL</code> is set in the backend environment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
