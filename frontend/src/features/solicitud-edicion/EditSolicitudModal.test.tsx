import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { DialogProvider } from '@/components/feedback/DialogProvider';
import { PdfViewerProvider } from '@/components/pdf/PdfViewerProvider';
import { mapSolicitud } from '@/lib/solicitud';

const patch = vi.fn(async () => ({}));
const deletePdf = vi.fn(async () => ({}));
vi.mock('@/api/endpoints', () => ({
  solicitudesApi: { patch: (...a: unknown[]) => patch(...(a as [])), deletePdf: (...a: unknown[]) => deletePdf(...(a as [])), uploadPdf: vi.fn(), list: async () => [] },
  recepcionadoApi: {}, pdfApi: {},
}));
vi.mock('@/auth/AuthProvider', () => ({ useCurrentUser: () => ({ id: 9, nombre: 'Editor Uno' }) }));

import EditSolicitudModal from './EditSolicitudModal';

const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient()}><ToastProvider><DialogProvider><PdfViewerProvider>{ui}</PdfViewerProvider></DialogProvider></ToastProvider></QueryClientProvider>,
);

const sol = mapSolicitud({
  id: 11, solicitante: 'Juan', empresa: 'ANDES', obra: 'OBRA', proceso: 'P', monto: 3000, estado: 'PENDIENTE',
  fecha_solicitud: '2026-01-02', fecha_de_pago: '2026-01-09', mes_de_proceso: 'ENERO', observaciones: '</textarea><img src=x onerror=alert(1)>',
  folio_uno: 'A', monto_por_folio_uno: 1000, forma_pago_folio_uno: 'DEPOSITO', pdf_folio_uno: 'doc_pdf/a.pdf',
  folio_dos: 'B', monto_por_folio_dos: 2000, forma_pago_folio_dos: 'VALE VISTA',
});

describe('EditSolicitudModal', () => {
  it('observaciones como texto, cuadratura y guardado con transición legacy', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    wrap(<EditSolicitudModal solicitud={sol} onClose={onClose} />);
    expect(screen.getByLabelText('Observaciones')).toHaveValue('</textarea><img src=x onerror=alert(1)>');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('¡Montos Cuadrados!')).toBeInTheDocument();
    const submit = screen.getByTestId('edit-modal-submit');
    expect(submit).toBeEnabled();

    const montos = screen.getAllByLabelText('Monto');
    await user.clear(montos[1]);
    await user.type(montos[1], '500');
    expect(screen.getByText('Falta por Distribuir')).toBeInTheDocument();
    expect(screen.getByText(/^\$ 1\.?500$/)).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.clear(montos[1]);
    await user.type(montos[1], '2000');
    expect(montos[1]).toHaveValue('2.000');

    await user.click(submit);
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [id, body] = patch.mock.calls[0] as unknown as [number, Record<string, unknown>];
    expect(id).toBe(11);
    expect(body).toMatchObject({ estado: 'APROBADO NIVEL 1', reviso: 'Subgerente de Capital Humano', solicitante: 'Editor Uno', monto_por_folio_dos: 2000 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Limpiar folio: confirma, PATCH y borra PDF', async () => {
    const user = userEvent.setup();
    patch.mockClear();
    wrap(<EditSolicitudModal solicitud={sol} onClose={() => {}} />);
    await user.click(screen.getByTestId('clear-folio-uno'));
    expect(await screen.findByText('¿Está seguro de que desea limpiar todos los datos del Folio UNO?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Confirmar/ }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(11, { folio_uno: null, monto_por_folio_uno: 0, forma_pago_folio_uno: null }));
    await waitFor(() => expect(deletePdf).toHaveBeenCalledWith(11, 'pdf_folio_uno', 'doc_pdf/a.pdf'));
    expect(await screen.findByText('Folio UNO sincronizado con éxito')).toBeInTheDocument();
  });
});
