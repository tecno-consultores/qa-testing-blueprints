// SPDX-License-Identifier: MIT
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as devicesClient from './api/devicesClient';
import App from './App.vue';

describe('App.vue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mounts root landmark and renders DevicesDashboard', async () => {
    vi.spyOn(devicesClient, 'fetchDevices').mockResolvedValueOnce([]);
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.find('main').exists()).toBe(true);
    expect(wrapper.find('[data-testid="event-status-badge"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
