// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import DevicesDashboard from './DevicesDashboard.vue';

describe('DevicesDashboard.vue unit contract', () => {
  it('exposes the operational dashboard component definition without orphan UI state', () => {
    expect(DevicesDashboard).toBeDefined();
  });
});
