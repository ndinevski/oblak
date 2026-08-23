/**
 * Shown when Pristaniste itself cannot be reached.
 *
 * The dashboard stays usable without the container service, so the Pristaniste pages
 * render this rather than erroring out.
 */

import { Boxes } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { PristanisteHealth } from '@/lib/api/pristaniste';

export function PristanisteUnavailable({ health }: { health?: PristanisteHealth }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Boxes className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Pristaniste is not reachable</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start the container service with <code className="text-xs">make up-pristaniste</code>, and
            check that <code className="text-xs">PRISTANISTE_URL</code> is set in the backend
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
