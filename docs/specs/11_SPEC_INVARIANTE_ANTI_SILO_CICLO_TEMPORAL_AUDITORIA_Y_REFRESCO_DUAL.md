# 🛡️ Especificación Técnica 11: Auditores Automáticos para el Invariante Anti-Silo, Ciclo Temporal de 3 Fases, Auditoría Semántica Anti-UUID y Refresco Dual (Hito 12)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Componentes Objetivo (Hito 12):** `mcp-server/src/tools/security-auditor.ts`, `mcp-server/src/tools/test-pyramid-auditor.ts`, `mcp-server/tests/security-auditor.unit.ts`, `mcp-server/tests/test-pyramid-auditor.unit.ts`, `mcp-server/test/mcp_cli_test.feature`  
**Modelo Ejecutor Objetivo:** Gemini 3.8 Flash High / Antigravity  
**Estado:** IMPLEMENTADO Y CERTIFICADO (HITO 12 COMPLETADO AL 100%)

---

## 1. Propósito y Justificación Empírica (Hallazgos UAT de Producción)

Durante las pruebas de aceptación (UAT) con hardware real en proyectos certificados con $\ge 95\%$ de cobertura unitaria (`pytest-cov` y `Vitest`), se demostró empíricamente que la métrica de cobertura de líneas/ramas por sí sola no detecta desconexiones funcionales entre módulos cuando existen 4 antipatrones:

1. **Pruebas por Silos con Mocks en la Frontera (*Silo Mock Blindness*):**
   - El test del Módulo A (`POST /api/v1/maintenance/windows` o mutación de identidad/estado) solo verifica que el endpoint devuelva `HTTP 200/201` e inserte en su tabla.
   - Por separado, el test del Módulo B consumidor (Wallboard NOC, Centro de Mando o Inventario) inyecta un mock JSON manual con `admin_state: "MAINTENANCE"`.
   - **Falla real:** En producción, `GET /api/v1/inventory/routers` jamás cruzaba `maintenance_windows`. Ambos tests pasaban al 100% en su silo, pero la pantalla principal nunca reflejaba el estado de mantenimiento.

2. **Aserciones Tautológicas y Omisión del Ciclo de Vida Temporal de 3 Fases (*2-State Static Blindness*):**
   - Vistas de ventanas programadas codificadas como ternarios binarios (`{{ w.is_cancelled ? 'Cancelada' : 'Programada' }}`) alcanzaban 100% de cobertura probando `true` y `false`, omitiendo el estado activo intermedio **`En Curso` / `Activa`** cuando `starts_at <= ahora <= ends_at`, o no detectaban que un scheduler de reversión temporal (ej. Safe Mode de 60s) se cancelaba prematuramente a los 50ms dentro de la misma petición HTTP.

3. **Mocks Ciegos sobre la Bitácora de Auditoría (`patch("...write_audit_log", AsyncMock)`) y Fuga de UUIDs Crudos:**
   - Reemplazar `write_audit_log` con un `AsyncMock()` vacío sin inspeccionar `call_args` ocultaba que el endpoint enviaba `actor_username=claims.get("sub")` (el UUID v4 crudo `5046a660-b1ba-423d-bf0b-a6f0fd80c40b` en lugar del `username` legible) y omitía `resource_display_name` / `router_display_name`.

4. **Etiquetas `else` Genéricas de Dominio y Ausencia de Refresco Dual en Vistas de Monitoreo:**
   - Clasificadores de eventos en UI con `else return 'MAINTENANCE'` etiquetaban respaldos o renovaciones de sesión como `MANTENIMIENTO`, y vistas/mapas en tiempo real carecían de botón manual **`[ 🔄 Refrescar ]`** (`?refresh=true`) o dejaban `setInterval` activos sin limpieza `clearInterval` en `onUnmounted`.

> **DIRECTIVAS CRÍTICAS DE IMPLEMENTACIÓN PARA GEMINI 3.8 FLASH HIGH (HITO 12):**
> 1. **Cero Advertencias de Linter (`--max-warnings 0`):** En `mcp-server/`, ESLint ejecuta `eslint-plugin-sonarjs` y `eslint-plugin-security`. Cualquier warning rompe el build.
> 2. **Complejidad Cognitiva (`sonarjs/cognitive-complexity <= 15`):** Ninguna función puede superar complejidad cognitiva 15. Divide cada regla nueva en funciones auxiliares pequeñas (`checkSec11AuditAntiUuidAndBlindMocks`, `checkUi11x02DualRefreshAndSemanticElse`, `detectThreePhaseTemporalTests`, etc.) tal como se especifica abajo.
> 3. **Cero Cadenas Duplicadas (`sonarjs/no-duplicate-string`):** Declara constantes en la parte superior del archivo para referencias repetidas (`SEC_11_REF`, `UI_11X_02_REF`, etc.).
> 4. **Cobertura Innegociable ($\ge 95.0\%$):** Todas las métricas de Vitest (`lines`, `branches`, `functions`, `statements`) deben mantenerse $\ge 95.0\%$ ejecutadas dentro del contenedor efímero `sinfallas/base-node-ionic:26` (`Rule Zero`).

---

## 2. Ampliación de `mcp-server/src/tools/security-auditor.ts` (Tarea 12.1)

Gemini 3.8 Flash High DEBE ampliar `mcp-server/src/tools/security-auditor.ts` incorporando las reglas **`SEC-11`** y **`UI-11X-02`**.

### 2.1. Constantes a Añadir en la Cabecera de `mcp-server/src/tools/security-auditor.ts`

```typescript
const SEC_11_REF = 'APSC-DV-001350 / Anti-Silo Audit Rule 3';
const UI_11X_02_REF = 'Standard 11X / Anti-Silo UI Rule 3 & 4';
```

### 2.2. Implementación de `checkSec11AuditAntiUuidAndBlindMocks` en `mcp-server/src/tools/security-auditor.ts`

Esta función audita dos condiciones:
1. En archivos de código (`.py`, `.ts`, `.js`, `.php`): detecta si se asigna `claims.get("sub")`, `claims["sub"]`, `token.sub` o `payload.sub` directamente a `actor_username` (filtrando un UUID v4 crudo en lugar de un nombre de usuario legible).
2. En archivos de prueba (`test_*.py`, `*.unit.py`, `*.unit.ts`, `*Test.php`): detecta si se mockea `write_audit_log` / `writeAuditLog` con `AsyncMock` / `MagicMock` / `vi.fn()` sin que el archivo contenga ninguna aserción sobre sus argumentos (`assert_called`, `assert_awaited`, `call_args`, `toHaveBeenCalledWith`).

```typescript
function isTestFilePath(relPath: string): boolean {
  return (
    relPath.includes('.unit.') ||
    relPath.includes('.spec.') ||
    relPath.includes('.test.') ||
    relPath.includes('test_') ||
    relPath.endsWith('Test.php')
  );
}

function checkRawSubInActorUsername(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const rawSubPattern =
    /actor_username\s*[:=]\s*(?:claims\.get\(\s*["']sub["']\s*\)|claims\[\s*["']sub["']\s*\]|(?:token|payload|jwt_payload)\.sub\b)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) continue;
    if (rawSubPattern.test(line)) {
      findings.push({
        rule_id: 'SEC-11',
        severity: 'HIGH',
        stig_owasp_ref: SEC_11_REF,
        file: relPath,
        line: i + 1,
        message:
          'Asignación directa de JWT "sub" (UUID crudo) a actor_username detectada en bitácora de auditoría.',
        remediation:
          'Resolver actor_username a un nombre humano legible (ej. user.username o claims.get("username")) y nunca almacenar un UUID v4 crudo como nombre visible.',
      });
    }
  }
  return findings;
}

function checkBlindAuditMockInTests(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  const fullContent = lines.join('\n');
  const mocksAudit =
    fullContent.includes('write_audit_log') ||
    fullContent.includes('writeAuditLog');
  if (!mocksAudit) return [];

  const hasMockReplacement =
    fullContent.includes('AsyncMock') ||
    fullContent.includes('MagicMock') ||
    fullContent.includes('vi.fn()');
  if (!hasMockReplacement) return [];

  const hasPayloadAssertion =
    fullContent.includes('assert_called') ||
    fullContent.includes('assert_awaited') ||
    fullContent.includes('call_args') ||
    fullContent.includes('toHaveBeenCalledWith');

  if (hasPayloadAssertion) return [];

  const lineIdx = lines.findIndex(
    (l) => l.includes('write_audit_log') || l.includes('writeAuditLog')
  );

  return [
    {
      rule_id: 'SEC-11',
      severity: 'HIGH',
      stig_owasp_ref: SEC_11_REF,
      file: relPath,
      line: lineIdx >= 0 ? lineIdx + 1 : 1,
      message:
        'Mock ciego sobre write_audit_log detectado sin aserciones sobre los argumentos recibidos (assert_called_once / call_args).',
      remediation:
        'Inspeccionar explícitamente los argumentos pasados a write_audit_log verificando que actor_username y resource_display_name sean legibles y no UUIDs crudos.',
    },
  ];
}

function checkSec11AuditSemanticIntegrity(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    !relPath.endsWith('.py') &&
    !relPath.endsWith('.ts') &&
    !relPath.endsWith('.js') &&
    !relPath.endsWith('.php')
  ) {
    return [];
  }
  if (isTestFilePath(relPath)) {
    return checkBlindAuditMockInTests(relPath, lines);
  }
  return checkRawSubInActorUsername(relPath, lines);
}
```

### 2.3. Implementación de `checkUi11x02DualRefreshAndSemanticElse` en `mcp-server/src/tools/security-auditor.ts`

Esta función audita dos antipatrones de interfaz en archivos `.vue`, `.tsx`, `.jsx` y `.ts`:
1. **Cláusulas `else` genéricas de dominio:** Detecta `else return 'MAINTENANCE'` / `'MANTENIMIENTO'` / `'CAÍDA'` / `'CRITICAL'` que asignan por defecto una etiqueta de dominio específica a cualquier evento no coincidente.
2. **Fuga de `setInterval` sin limpieza (`clearInterval`):** Detecta componentes `.vue` o `.tsx` que invocan `setInterval(` sin incluir `clearInterval(` en el mismo archivo para su limpieza al desmontar (`onUnmounted` / `useEffect`).

```typescript
function checkCatchAllDomainElse(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const catchAllPattern =
    /\belse\s*\{?\s*return\s+["'](?:MAINTENANCE|MANTENIMIENTO|CAÍDA|CAIDA|CRITICAL|SECURITY|SEGURIDAD)["']/i;

  for (let i = 0; i < lines.length; i++) {
    if (catchAllPattern.test(lines[i])) {
      findings.push({
        rule_id: 'UI-11X-02',
        severity: 'MEDIUM',
        stig_owasp_ref: UI_11X_02_REF,
        file: relPath,
        line: i + 1,
        message:
          'Cláusula else genérica detectada devolviendo una insignia de dominio específica (ej. MAINTENANCE / MANTENIMIENTO).',
        remediation:
          'Mapear explícitamente cada categoría de evento (CAÍDA, MANTENIMIENTO, RESPALDO, SEGURIDAD, OPERACIÓN) y usar una etiqueta neutral (OPERACIÓN / INFO) en el caso por defecto.',
      });
    }
  }
  return findings;
}

function checkUncleanedSetInterval(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (!relPath.endsWith('.vue') && !relPath.endsWith('.tsx') && !relPath.endsWith('.jsx')) {
    return [];
  }
  const fullContent = lines.join('\n');
  if (!fullContent.includes('setInterval(')) return [];
  if (fullContent.includes('clearInterval(')) return [];

  const lineIdx = lines.findIndex((l) => l.includes('setInterval('));
  return [
    {
      rule_id: 'UI-11X-02',
      severity: 'HIGH',
      stig_owasp_ref: UI_11X_02_REF,
      file: relPath,
      line: lineIdx >= 0 ? lineIdx + 1 : 1,
      message:
        'Uso de setInterval() en componente UI sin limpieza correspondiente con clearInterval() en onUnmounted / useEffect.',
      remediation:
        'Almacenar el identificador del intervalo y limpiarlo con clearInterval() dentro de onUnmounted (Vue 3) o en el retorno de useEffect (React).',
    },
  ];
}

function checkUi11x02DualRefreshAndSemanticElse(
  relPath: string,
  lines: string[]
): SecurityFinding[] {
  if (
    !relPath.endsWith('.vue') &&
    !relPath.endsWith('.tsx') &&
    !relPath.endsWith('.jsx') &&
    !relPath.endsWith('.ts')
  ) {
    return [];
  }
  if (isTestFilePath(relPath)) return [];

  return [
    ...checkCatchAllDomainElse(relPath, lines),
    ...checkUncleanedSetInterval(relPath, lines),
  ];
}
```

### 2.4. Conexión en `scanSingleFile` (`mcp-server/src/tools/security-auditor.ts`)

Añadir `...checkSec11AuditSemanticIntegrity(relPath, lines)` y `...checkUi11x02DualRefreshAndSemanticElse(relPath, lines)` al arreglo retornado por `scanSingleFile(absPath, relPath)`.

---

## 3. Ampliación de `mcp-server/src/tools/test-pyramid-auditor.ts` (Tarea 12.2)

Gemini 3.8 Flash High DEBE actualizar `mcp-server/src/tools/test-pyramid-auditor.ts` para evaluar en las Capas **05**, **07** y **13** los nuevos invariantes cuando el proyecto contenga las estructuras correspondientes:

### 3.1. Evolución de Capa 13 (`evaluateLayer13TrimodalFixtures`) — Ciclo Temporal de 3 Fases

Añadir detección automática de entidades gobernadas por ventanas de tiempo (`starts_at`, `ends_at`, `expires_at`, `ttl_seconds`, `maintenance_window`, `safe_mode`) y verificar si la suite de pruebas valida las 3 fases temporales:

```typescript
function projectHasTemporalEntities(
  projectPath: string,
  files: string[]
): boolean {
  for (const f of files) {
    if (
      (f.includes('src/') || f.includes('app/')) &&
      (f.endsWith('.py') || f.endsWith('.ts') || f.endsWith('.vue') || f.endsWith('.php'))
    ) {
      const content = readFileContentSafe(projectPath, f);
      if (
        (content.includes('starts_at') && content.includes('ends_at')) ||
        content.includes('safe_mode') ||
        content.includes('maintenance_window')
      ) {
        return true;
      }
    }
  }
  return false;
}

function detectThreePhaseTemporalTests(
  projectPath: string,
  files: string[]
): boolean {
  for (const f of files) {
    if (
      f.includes('.unit.') ||
      f.includes('.spec.') ||
      f.includes('test_') ||
      f.endsWith('Test.php')
    ) {
      const content = readFileContentSafe(projectPath, f).toLowerCase();
      const hasScheduled =
        content.includes('programada') ||
        content.includes('scheduled') ||
        content.includes('pending');
      const hasActive =
        content.includes('en curso') ||
        content.includes('in_progress') ||
        content.includes('activa') ||
        content.includes('active');
      const hasExpiredOrCancelled =
        content.includes('cancelada') ||
        content.includes('cancelled') ||
        content.includes('expired') ||
        content.includes('expirada') ||
        content.includes('reverted');
      if (hasScheduled && hasActive && hasExpiredOrCancelled) {
        return true;
      }
    }
  }
  return false;
}
```

Integrar esta validación dentro de `evaluateLayer13TrimodalFixtures`:
- Si `projectHasTemporalEntities(projectPath, files)` es `true`:
  - Si `detectThreePhaseTemporalTests(projectPath, files)` es `true`, añadir `'Ciclo temporal de 3 fases verificado (Programada, En Curso, Expirada/Cancelada)'` a `detected_evidence`.
  - Si es `false`, degradar `status` de `COVERED` a `PARTIAL` y añadir a `missing_requirements`: `'Entidades con ventana temporal (starts_at/ends_at) detectadas sin pruebas de las 3 fases del reloj (Programada, En Curso, Expirada/Cancelada).'`.

### 3.2. Evolución de Capa 07 (`evaluateLayer07BddUiKarate`) — Invariante de Refresco Dual en Vistas Operativas

Añadir la función `checkOperationalViewsDualRefresh(projectPath, files)`:

```typescript
function checkOperationalViewsDualRefresh(
  projectPath: string,
  files: string[]
): { applicable: boolean; passed: boolean } {
  const operationalViews = files.filter((f) =>
    /(?:views|pages)\/.*?(?:Dashboard|Noc|Wallboard|Monitor|Map|Console).*?\.(?:vue|tsx|jsx)$/i.test(f)
  );
  if (operationalViews.length === 0) {
    return { applicable: false, passed: true };
  }

  for (const view of operationalViews) {
    const content = readFileContentSafe(projectPath, view);
    const hasAutoRefresh =
      content.includes('setInterval') ||
      content.includes('WebSocket') ||
      content.includes('useWebSocket');
    const hasManualRefresh =
      content.includes('Refrescar') ||
      content.includes('refresh=true') ||
      content.includes('handleRefresh') ||
      content.includes('onRefresh');
    if (!hasAutoRefresh || !hasManualRefresh) {
      return { applicable: true, passed: false };
    }
  }

  return { applicable: true, passed: true };
}
```

En `evaluateLayer07BddUiKarate`:
- Si `dualRefresh.applicable && dualRefresh.passed`, añadir `'Invariante de Refresco Dual (Auto + Manual [ 🔄 Refrescar ]) en vistas operativas'` a `detected_evidence`.
- Si `dualRefresh.applicable && !dualRefresh.passed`, si el estado era `COVERED`, pasar a `PARTIAL` y añadir a `missing_requirements`: `'Vistas de monitoreo/dashboard detectadas sin Invariante de Refresco Dual (setInterval/WebSocket + botón manual [ 🔄 Refrescar ]).'`

---

## 4. Requisitos de Pruebas Unitarias y BDD para el Hito 12 (Tarea 12.3)

1. **En `mcp-server/tests/security-auditor.unit.ts`:**
   - Añadir pruebas unitarias verificando:
     - Detección de `SEC-11` cuando un endpoint Python/TS asigna `actor_username = claims.get("sub")`.
     - Detección de `SEC-11` cuando un archivo `test_audit.unit.py` reemplaza `write_audit_log` con `AsyncMock()` sin llamar a `assert_called` / `call_args`.
     - Pasa limpio (`0` hallazgos `SEC-11`) cuando el test de auditoría incluye `mock_audit.assert_awaited_once()` o `call_args`.
     - Detección de `UI-11X-02` cuando un componente `.vue` tiene `else return 'MAINTENANCE'` o usa `setInterval(` sin `clearInterval(`.
2. **En `mcp-server/tests/test-pyramid-auditor.unit.ts`:**
   - Añadir pruebas unitarias verificando:
     - Que un proyecto con `starts_at` y `ends_at` en sus modelos exige las 3 fases temporales (`Programada`, `En Curso`, `Cancelada`) en la Capa 13.
     - Que una vista `NocDashboard.vue` es evaluada frente al Invariante de Refresco Dual en la Capa 07.
3. **Ejecución en Contenedor Efímero (`Rule Zero`):**
   ```bash
   docker compose -f mcp-server/docker-compose.qa.yml run --rm mcp-server sh -c "pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build"
   ./.agents/scripts/certify_task_completion.sh
   ```
