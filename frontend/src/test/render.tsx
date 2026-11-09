import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { DialogProvider } from '@/components/feedback/DialogProvider';

/** Render con los providers mínimos (sin AuthProvider) para tests de componente. */
export function renderWithProviders(ui: ReactElement, { route = '/', path = '*' } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DialogProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
              <Route path="/" element={<div>HOME</div>} />
            </Routes>
          </MemoryRouter>
        </DialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
