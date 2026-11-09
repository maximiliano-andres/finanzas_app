import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';
import { renderWithProviders } from '@/test/render';

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Correo electrónico'), email);
  if (password) await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: /Ingresar al Sistema/ }));
  return user;
}

describe('LoginPage', () => {
  it('muestra el aviso de sesión expirada desde ?error=session_expired', async () => {
    renderWithProviders(<LoginPage />, { route: '/login?error=session_expired', path: '/login' });
    expect(await screen.findByText('Su sesión ha expirado. Por favor, inicie sesión nuevamente.')).toBeInTheDocument();
  });

  it('campos vacíos → no llama a la API', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login' });
    await submit('', '');
    expect(await screen.findByText('Por favor complete todos los campos')).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it('dominio no permitido → mensaje y foco en email', async () => {
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login' });
    await submit('x@gmail.com', 'Clave#123');
    expect(await screen.findByText('Por favor ingrese un email válido (@flujopago.cl o @grupodemo.cl)')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
  });

  it.each([
    [401, { status: 'error', code: 401, message: 'Error de Credenciales: Email o contraseña incorrectos' }, 'Error de Credenciales: Email o contraseña incorrectos'],
    [422, { detail: [{ msg: 'x' }] }, 'Datos de inicio de sesión inválidos'],
    [429, { status: 'error', code: 429, message: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' }, 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.'],
    [500, { status: 'error', code: 500, message: 'detalle interno' }, 'Error interno del servidor. Por favor intente más tarde'],
  ])('HTTP %i → mensaje del original', async (status, body, msg) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(body, status));
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login' });
    await submit('a@flujopago.cl', 'Clave#123');
    expect(await screen.findByText(msg)).toBeInTheDocument();
  });

  it('red caída → mensaje de conexión', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login' });
    await submit('a@flujopago.cl', 'Clave#123');
    expect(await screen.findByText('No se pudo conectar con el servidor. Verifique su conexión a internet')).toBeInTheDocument();
  });

  it('doble clic no envía dos veces y el botón queda deshabilitado mientras espera', async () => {
    let resolve!: (r: Response) => void;
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((r) => { resolve = r; }));
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login' });
    const user = await submit('a@flujopago.cl', 'Clave#123');
    await user.click(screen.getByRole('button', { name: /Ingresando/ }));
    expect(screen.getByRole('button', { name: /Ingresando/ })).toBeDisabled();
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(f.mock.calls[0][1]!.body));
    expect(body).toEqual({ email: 'a@flujopago.cl', password: 'Clave#123', remember_device: false });
    resolve(jsonRes({ status: 'success', data: { access_token: 't' } }));
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
  });

  it('mostrar/ocultar contraseña', async () => {
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login' });
    const pw = screen.getByLabelText('Contraseña');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(pw).toHaveAttribute('type', 'text');
  });
});
