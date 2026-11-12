// SPDX-License-Identifier: MIT

export interface TelemetryDeviceDto {
  id: string;
  hostname: string;
  cpu_load_pct: string;
}

export interface CreateTelemetryDeviceDto {
  id: string;
  hostname: string;
  cpu_load_pct: number;
}

export async function fetchDevices(forceRefresh = false): Promise<TelemetryDeviceDto[]> {
  const query = forceRefresh ? '?refresh=true' : '';
  const response = await fetch(`/api/v1/devices${query}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading devices`);
  }
  return (await response.json()) as TelemetryDeviceDto[];
}

export async function createDevice(
  payload: CreateTelemetryDeviceDto,
  idempotencyKey: string
): Promise<TelemetryDeviceDto> {
  const response = await fetch('/api/v1/devices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} creating device`);
  }
  return (await response.json()) as TelemetryDeviceDto;
}
