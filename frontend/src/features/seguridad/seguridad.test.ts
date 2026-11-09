import { describe, expect, it } from 'vitest';
import { deviceIcon, deviceStatus, formatDeviceDate } from './SeguridadPage';

describe('Seguridad — dispositivos de confianza', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  it('estado vencido / por vencer (≤5 días) / ok', () => {
    expect(deviceStatus('2026-11-01T00:00:00', now)).toBe('expired');
    expect(deviceStatus(null, now)).toBe('expired');
    expect(deviceStatus('2026-11-09T00:00:00', now)).toBe('expiring');
    expect(deviceStatus('2026-12-01T00:00:00', now)).toBe('ok');
  });
  it('fechas naive UTC y con zona (corrige "Invalid Date")', () => {
    expect(formatDeviceDate('2026-11-06T12:00:00')).not.toBe('—');
    expect(formatDeviceDate('2026-11-06T12:00:00+00:00')).not.toBe('—');
    expect(formatDeviceDate(null)).toBe('—');
  });
  it('ícono por nombre', () => {
    expect(deviceIcon('Safari en iOS')).toBe('fa-mobile-screen-button');
    expect(deviceIcon('Chrome en Windows')).toBe('fa-desktop');
    expect(deviceIcon('Firefox en Linux')).toBe('fa-terminal');
    expect(deviceIcon(null)).toBe('fa-laptop');
  });
});
