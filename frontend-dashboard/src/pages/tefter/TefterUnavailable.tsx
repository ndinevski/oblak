/**
 * Shown when Tefter itself cannot be reached.
 *
 * The dashboard stays usable without the database service, so the Tefter pages
 * render this rather than erroring out.
 */

import { Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { TefterHealth } from '@/lib/api/tefter';

export function TefterUnavailable({ health }: { health?: TefterHealth }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Database className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Tefter is not reachable</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start the database service with <code className="text-xs">make up-tefter</code>, and
            check that <code className="text-xs">TEFTER_URL</code> is set in the backend
            environment.
          </p>
          {health?.runtime_error && (
            <p className="max-w-md break-words pt-2 text-xs text-muted-foreground/80">
              {health.runtime_error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
