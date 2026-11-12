<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { createDevice, fetchDevices, type TelemetryDeviceDto } from '../api/devicesClient';

const devices = ref<TelemetryDeviceDto[]>([]);
const errorBanner = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function classifyEventBadge(category: 'outage' | 'maintenance' | 'backup' | 'security' | 'operation'): string {
  const mapping: Record<typeof category, string> = {
    outage: 'CAÍDA',
    maintenance: 'MANTENIMIENTO',
    backup: 'RESPALDO',
    security: 'SEGURIDAD',
    operation: 'OPERACIÓN',
  };
  return mapping[category];
}

async function loadDevices(manualRefresh = false): Promise<void> {
  try {
    devices.value = await fetchDevices(manualRefresh);
    errorBanner.value = null;
  } catch (err) {
    // Anti-destructive catch: preserva el último estado conocido válido en devices.value
    errorBanner.value = err instanceof Error ? err.message : 'Error de red';
  }
}

async function handleQuickRegister(): Promise<void> {
  const idempotencyKey = crypto.randomUUID();
  await createDevice({ id: 'dev-ui-01', hostname: 'branch-gw-01', cpu_load_pct: 21.4 }, idempotencyKey);
  await loadDevices(true);
}

onMounted(() => {
  void loadDevices(false);
  pollTimer = setInterval(() => {
    void loadDevices(false);
  }, 30000);
});

onUnmounted(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>

<template>
  <main class="dashboard-shell">
    <header class="dashboard-header">
      <h1>Consola Operativa de Dispositivos</h1>
      <div class="dashboard-actions">
        <button type="button" @click="loadDevices(true)">🔄 Refrescar</button>
        <button type="button" @click="handleQuickRegister">+ Registrar Nodo</button>
      </div>
    </header>

    <p v-if="errorBanner" role="alert">{{ errorBanner }}</p>

    <table class="telemetry-table">
      <thead>
        <tr>
          <th scope="col">ID</th>
          <th scope="col">Hostname</th>
          <th scope="col">CPU (%)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in devices" :key="item.id">
          <td>{{ item.id }}</td>
          <td>{{ item.hostname }}</td>
          <td class="metric-cell">{{ item.cpu_load_pct }}</td>
        </tr>
      </tbody>
    </table>

    <footer class="in-flow-footer">
      <span>Telemetría Multi-Tenant 11X</span>
    </footer>
  </main>
</template>

<style scoped>
.dashboard-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.metric-cell {
  font-variant-numeric: tabular-nums;
}

.in-flow-footer {
  margin-top: auto;
  padding: 1rem 0;
}
</style>
