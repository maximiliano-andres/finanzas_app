import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { DialogProvider } from '@/components/feedback/DialogProvider';
import { PdfViewerProvider } from '@/components/pdf/PdfViewerProvider';
import { ManualProvider } from '@/components/manual/ManualProvider';
import { QueryErrorNotifier } from '@/components/feedback/QueryErrorNotifier';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // evita re-descargar al cambiar de sección (antes: refetch completo en cada navegación)
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        // No reintentar errores de cliente (4xx); sí errores de red/5xx una vez.
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
      },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <QueryErrorNotifier />
        <DialogProvider>
          <AuthProvider>
            <PdfViewerProvider>
              <ManualProvider>{children}</ManualProvider>
            </PdfViewerProvider>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
