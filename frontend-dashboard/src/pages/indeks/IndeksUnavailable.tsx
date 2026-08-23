/**
 * Shown when Indeks itself cannot be reached.
 */

import { Table2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function IndeksUnavailable() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Table2 className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Indeks is not reachable</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start the key/value store with <code className="text-xs">make up-indeks</code>, and
            check that <code className="text-xs">INDEKS_URL</code> is set in the backend
            environment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
