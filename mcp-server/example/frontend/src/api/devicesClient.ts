// SPDX-License-Identifier: MIT

export interface TelemetryDeviceDto {
  id: string;
  hostname: string;
  cpu_load_pct: string;
}

export interface CreateDeviceResponseDto extends TelemetryDeviceDto {
  audit_actor: string;
}

export interface CreateTelemetryDeviceDto {
  id: string;
  hostname: string;
  cpu_load_pct: number;
}

export async function fetchDevices(
  forceRefresh = false,
  tenantId = 'tenant-demo'
): Promise<TelemetryDeviceDto[]> {
  const query = forceRefresh ? '?refresh=true' : '';
  const response = await fetch(`/api/v1/devices${query}`, {
    method: 'GET',
    headers: {
      'X-Tenant-Id': tenantId,
      'X-Auth-Tenant': tenantId,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading devices`);
  }
  return (await response.json()) as TelemetryDeviceDto[];
}

export async function createDevice(
  payload: CreateTelemetryDeviceDto,
  idempotencyKey: string,
  tenantId = 'tenant-demo'
): Promise<CreateDeviceResponseDto> {
  const response = await fetch('/api/v1/devices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-Auth-Tenant': tenantId,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} creating device`);
  }
  return (await response.json()) as CreateDeviceResponseDto;
}
