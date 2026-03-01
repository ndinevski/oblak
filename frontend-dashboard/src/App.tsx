import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { TooltipProvider } from '@/components/ui';
import { AuthInitializer } from '@/components/auth';
import { QueryProvider } from '@/providers';

function App() {
  return (
    <QueryProvider>
      <TooltipProvider>
        <AuthInitializer />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryProvider>
  );
}

export default App;
