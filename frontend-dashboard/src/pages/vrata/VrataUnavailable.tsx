/**
 * Shown when Vrata itself cannot be reached.
 *
 * The dashboard stays usable without the gateway, so the Vrata pages render
 * this rather than erroring out.
 */

import { Waypoints } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function VrataUnavailable() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Waypoints className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Vrata is not reachable</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start the gateway with <code className="text-xs">make up-vrata</code>, and check that{' '}
            <code className="text-xs">VRATA_URL</code> is set in the backend environment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
