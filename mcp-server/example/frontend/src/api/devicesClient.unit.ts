// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevice, fetchDevices } from './devicesClient';

describe('devicesClient API adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches devices with optional refresh=true query flag and propagates HTTP errors', async () => {
    const sample = [{ id: 'dev-01', hostname: 'core-gw-01', cpu_load_pct: '12.50' }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => sample,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => sample,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      });
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchDevices()).toEqual(sample);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/devices', { method: 'GET' });

    expect(await fetchDevices(true)).toEqual(sample);
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/devices?refresh=true', { method: 'GET' });

    await expect(fetchDevices()).rejects.toThrow('HTTP 503 loading devices');
  });

  it('creates devices with Idempotency-Key header and propagates HTTP errors', async () => {
    const created = {
      id: 'dev-02',
      hostname: 'edge-gw-02',
      cpu_load_pct: '18.20',
      audit_actor: 'operador.noc',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => created,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
      });
    vi.stubGlobal('fetch', fetchMock);

    const payload = { id: 'dev-02', hostname: 'edge-gw-02', cpu_load_pct: 18.2 };
    expect(await createDevice(payload, 'idem-key-0002')).toEqual(created);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/devices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-key-0002',
      },
      body: JSON.stringify(payload),
    });

    await expect(createDevice(payload, 'idem-key-dup')).rejects.toThrow(
      'HTTP 409 creating device'
    );
  });
});
