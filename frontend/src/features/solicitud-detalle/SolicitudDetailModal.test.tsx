import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { DialogProvider } from '@/components/feedback/DialogProvider';
import { PdfViewerProvider } from '@/components/pdf/PdfViewerProvider';
import { solicitudesApi } from '@/api/endpoints';
import SolicitudDetailModal from './SolicitudDetailModal';
import { rec, sol } from './__fixtures__/factories';

vi.mock('@/features/solicitud-edicion/EditSolicitudModal', () => ({ default: () => <div data-testid="edit-modal" /> }));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><ToastProvider><DialogProvider><PdfViewerProvider>{ui}</PdfViewerProvider></DialogProvider></ToastProvider></QueryClientProvider>,
  );
}

describe('SolicitudDetailModal', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('muestra datos, folios y cierra con ESC', () => {
    const onClose = vi.fn();
    wrap(<SolicitudDetailModal solicitud={sol({ id: 77, folio_uno: '4500', monto_por_folio_uno: 1000, folio_dos: '4501', observaciones: '<b>x</b>' })} onClose={onClose} />);
    expect(screen.getByText('Detalle de Solicitud #77')).toBeInTheDocument();
    expect(screen.getByText('#4500')).toBeInTheDocument();
    expect(screen.getByText('#4501')).toBeInTheDocument();
    expect(screen.getByText('<b>x</b>')).toBeInTheDocument(); // texto, sin HTML
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('eliminar: confirma, DELETE y cierra', async () => {
    const spy = vi.spyOn(solicitudesApi, 'remove').mockResolvedValue({});
    const onClose = vi.fn();
    wrap(<SolicitudDetailModal solicitud={sol({ id: 5, estado: 'ESPERANDO' })} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('detail-delete'));
    fireEvent.click(await screen.findByText('Confirmar'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(5));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText('Solicitud eliminada exitosamente')).toBeInTheDocument();
  });

  it('editar abre EditSolicitudModal; recepcionado no ofrece acciones', () => {
    const { unmount } = wrap(<SolicitudDetailModal solicitud={sol({ estado: 'RECHAZADO' })} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Editar y Reenviar'));
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument();
    unmount();
    wrap(<SolicitudDetailModal solicitud={rec({ estado: 'ESPERANDO', tipo_solicitud: 'Recepcionado' })} isRecepcionado onClose={() => {}} />);
    expect(screen.queryByTestId('detail-delete')).toBeNull();
    expect(screen.queryByTestId('detail-edit')).toBeNull();
  });
});
