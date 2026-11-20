// SPDX-License-Identifier: MIT
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as devicesClient from '../api/devicesClient';
import DevicesDashboard, { classifyEventBadge } from './DevicesDashboard.vue';

describe('DevicesDashboard.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('maps all five operational event badge categories accurately', () => {
    expect(classifyEventBadge('outage')).toBe('CAÍDA');
    expect(classifyEventBadge('maintenance')).toBe('MANTENIMIENTO');
    expect(classifyEventBadge('backup')).toBe('RESPALDO');
    expect(classifyEventBadge('security')).toBe('SEGURIDAD');
    expect(classifyEventBadge('operation')).toBe('OPERACIÓN');
  });

  it('mounts dashboard, handles auto-refresh, registration errors, manual refresh, and cleans interval', async () => {
    const initialRows = [{ id: 'dev-01', hostname: 'core-gw-01', cpu_load_pct: '12.50' }];
    const polledRows = [...initialRows];
    const updatedRows = [
      ...initialRows,
      { id: 'dev-ui-02', hostname: 'branch-gw-01', cpu_load_pct: '21.40' },
    ];
    const fetchSpy = vi
      .spyOn(devicesClient, 'fetchDevices')
      .mockResolvedValueOnce(initialRows)
      .mockResolvedValueOnce(polledRows)
      .mockResolvedValueOnce(updatedRows)
      .mockRejectedValueOnce(new Error('Backend timeout'));
    const createSpy = vi
      .spyOn(devicesClient, 'createDevice')
      .mockResolvedValueOnce({
        id: 'dev-ui-02',
        hostname: 'branch-gw-01',
        cpu_load_pct: '21.40',
        audit_actor: 'operador.noc',
      })
      .mockRejectedValueOnce(new Error('HTTP 409 creating device'));
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    const wrapper = mount(DevicesDashboard);
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith(false);
    expect(wrapper.find('[data-testid="event-status-badge"]').text()).toBe('OPERACIÓN');
    expect(wrapper.text()).toContain('core-gw-01');
    expect(wrapper.find('footer.in-flow-footer').exists()).toBe(true);

    // Verifica recarga periódica automática cada 30s
    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const registerBtn = wrapper.findAll('button').find((b) => b.text().includes('Registrar Nodo'));
    expect(registerBtn).toBeDefined();
    await registerBtn?.trigger('click');
    await flushPromises();

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenLastCalledWith(true);
    expect(wrapper.text()).toContain('branch-gw-01');

    // Error en createDevice captura excepción sin rechazo no manejado
    await registerBtn?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('HTTP 409 creating device');
    expect(wrapper.find('[data-testid="event-status-badge"]').text()).toBe('CAÍDA');

    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('Refrescar'));
    expect(refreshBtn).toBeDefined();
    await refreshBtn?.trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain('Backend timeout');
    expect(wrapper.text()).toContain('core-gw-01');

    wrapper.unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
