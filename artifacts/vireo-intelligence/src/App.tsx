import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { FilterProvider } from '@/lib/filters';
import { TicketViewerProvider } from '@/components/ticket-sheet';
import { Shell } from '@/components/shell';
import Overview from '@/pages/overview';
import Weekly from '@/pages/weekly';
import Insights from '@/pages/insights';
import Ask from '@/pages/ask';
import Brief from '@/pages/brief';
import Validation from '@/pages/validation';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } } });

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/weekly" component={Weekly} />
          <Route path="/insights" component={Insights} />
          <Route path="/ask" component={Ask} />
          <Route path="/brief" component={Brief} />
          <Route path="/validation" component={Validation} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FilterProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <TicketViewerProvider>
              <Router />
            </TicketViewerProvider>
          </WouterRouter>
        </FilterProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
