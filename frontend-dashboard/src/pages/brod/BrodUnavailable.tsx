/**
 * Shown when Brod itself cannot be reached.
 *
 * The dashboard stays usable without the container service, so the Brod pages
 * render this rather than erroring out.
 */

import { Boxes } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { BrodHealth } from '@/lib/api/brod';

export function BrodUnavailable({ health }: { health?: BrodHealth }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Boxes className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Brod is not reachable</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start the container service with <code className="text-xs">make up-brod</code>, and
            check that <code className="text-xs">BROD_URL</code> is set in the backend
            environment.
          </p>
          {(health?.engine_error || health?.registry_error) && (
            <p className="max-w-md break-words pt-2 text-xs text-muted-foreground/80">
              {health.engine_error || health.registry_error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
