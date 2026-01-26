import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { TooltipProvider } from '@/components/ui';
import { QueryProvider } from '@/providers';

function App() {
  return (
    <QueryProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryProvider>
  );
}

export default App;
