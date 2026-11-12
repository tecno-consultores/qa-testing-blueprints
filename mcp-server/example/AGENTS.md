# Telemetría de Flota — Gobernanza Específica del Dominio

## Reglas de Negocio Locales
- Todo dispositivo IoT registrado en `telemetry_devices` pertenece estrictamente a un `tenant_id` aislado mediante PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`).
- Los tableros operativos de telemetría mantienen refresco periódico con limpieza en `onUnmounted` y botón explícito de actualización manual.
