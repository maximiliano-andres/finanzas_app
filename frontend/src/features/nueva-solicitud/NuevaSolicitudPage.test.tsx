import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { DialogProvider } from '@/components/feedback/DialogProvider';
import { PdfViewerProvider } from '@/components/pdf/PdfViewerProvider';
import { ManualProvider } from '@/components/manual/ManualProvider';
import { ApiError } from '@/api/client';

const create = vi.fn();
vi.mock('@/api/endpoints', () => ({
  catalogosApi: {
    empresas: async () => [{ id: 1, empresa: 'ANDES', codigo: '93' }],
    procesosAuxiliares: async () => [{ id: 2, numero: '1', detalle: 'OBRA NORTE', auxiliar: '0010', estado: 'ACTIVO' }],
    procesos: async () => [{ id: 3, nombre: 'REMUN', proceso: 'x', cuenta_objeto: '4101', auxiliar: '01', estado: 'ACTIVO' }],
  },
  solicitudesApi: { create: (f: FormData) => create(f), list: async () => [] },
  recepcionadoApi: {}, historicoApi: {}, usuariosApi: {}, pdfApi: {},
}));
vi.mock('@/auth/AuthProvider', () => ({ useCurrentUser: () => ({ id: 5, nombre: 'Ana Pérez' }) }));

import NuevaSolicitudPage from './NuevaSolicitudPage';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider><DialogProvider><PdfViewerProvider><ManualProvider>
        <MemoryRouter initialEntries={['/nueva-solicitud']}>
          <Routes>
            <Route path="/nueva-solicitud" element={ui} />
            <Route path="/mis-solicitudes" element={<p>MIS SOLICITUDES</p>} />
          </Routes>
        </MemoryRouter>
      </ManualProvider></PdfViewerProvider></DialogProvider></ToastProvider>
    </QueryClientProvider>,
  );
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByRole('option', { name: 'ANDES' })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText(/Mes de Proceso/), 'MARZO');
  fireEvent.change(screen.getByLabelText(/Fecha Emisión/), { target: { value: '2026-03-01' } });
  fireEvent.change(screen.getByLabelText(/Fecha Estimada Pago/), { target: { value: '2026-03-20' } });
  await user.selectOptions(screen.getByLabelText(/Empresa Mandante/), '1');
  await user.selectOptions(screen.getByLabelText(/Unidad de Negocio/), '2');
  await user.selectOptions(screen.getByLabelText(/Proceso Operativo/), '3');
  await user.type(screen.getByLabelText('Número de Folio'), 'F-1');
  await user.type(screen.getByLabelText('Monto'), '1500000');
  await user.selectOptions(screen.getByLabelText('Forma Pago'), 'DEPOSITO');
}

describe('NuevaSolicitudPage', () => {
  beforeEach(() => { create.mockReset(); });

  it('muestra errores literales al validar vacío', async () => {
    const user = userEvent.setup();
    wrap(<NuevaSolicitudPage />);
    await user.click(screen.getByTestId('limpiar-formulario'));
    await user.click(screen.getByTestId('validar-previsualizar'));
    expect(await screen.findByText('Debe seleccionar un mes de proceso')).toBeInTheDocument();
    expect(screen.getByText('Debe ingresar la fecha de proceso')).toBeInTheDocument();
    expect(screen.getByText(/Faltan campos obligatorios: Mes de Proceso, Fecha de Proceso/)).toBeInTheDocument();
  });

  it('deriva campos, previsualiza y envía una sola vez', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    create.mockImplementation(() => new Promise<void>((r) => { resolve = r; }));
    wrap(<NuevaSolicitudPage />);
    await fillValid(user);
    expect(screen.getByLabelText('Código UNE')).toHaveValue('930010');
    expect(screen.getByLabelText('Glosa Técnica (Automática)')).toHaveValue('REMUN OBRA NORTE MAR');
    expect(screen.getByLabelText(/Monto Total/)).toHaveValue('1.500.000');
    await user.click(screen.getByTestId('validar-previsualizar'));
    expect(await screen.findByText('Voucher de Solicitud')).toBeInTheDocument();
    const confirmBtn = screen.getByTestId('confirmar-solicitud');
    await user.click(confirmBtn);
    await user.click(confirmBtn);
    expect(create).toHaveBeenCalledTimes(1);
    const fd = create.mock.calls[0][0] as FormData;
    expect(fd.get('estado')).toBe('ESPERANDO');
    expect(fd.get('solicitante')).toBe('Ana Pérez');
    expect(fd.get('monto')).toBe('1500000');
    expect(fd.getAll('folio')).toEqual(['F-1']);
    resolve();
    expect(await screen.findByText('MIS SOLICITUDES')).toBeInTheDocument();
  });

  it('muestra el detalle del backend en error (folio duplicado)', async () => {
    const user = userEvent.setup();
    create.mockRejectedValue(new ApiError('http', 400, 'x', { status: 'error', code: 400, detail: "El folio 'F-1' ya existe en solicitudes." }));
    wrap(<NuevaSolicitudPage />);
    await fillValid(user);
    await user.click(screen.getByTestId('validar-previsualizar'));
    await user.click(await screen.findByTestId('confirmar-solicitud'));
    expect(await screen.findByText("Error: El folio 'F-1' ya existe en solicitudes.")).toBeInTheDocument();
    expect(screen.queryByText('Voucher de Solicitud')).not.toBeInTheDocument();
  });
});
