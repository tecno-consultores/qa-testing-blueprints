> 📜 **Aviso de Archivo Histórico (Spec 19 §3.4):** Especificación histórica preservada en español como registro arquitectónico inmutable (exenta de espejo bilingüe EN/ES). Para rutas y métricas vigentes, véase [README.es.md](README.es.md).

# 🛑 Especificación Técnica 17: Cortacircuitos Anti-Loop y Memoria Determinista de Hallazgos (Hito 22)

**Proyecto:** QA Testing Blueprints (`tecno-consultores/qa-testing-blueprints`)  
**Componentes Objetivo (`Hito 22`):** `.agents/scripts/track_findings_state.py`, `tests/test_track_findings_state.unit.py`, `mcp-server/src/services/qa-evidence.ts`, `mcp-server/src/tools/ephemeral-runner.ts`, `.agents/scripts/certify_task_completion.sh`  
**Superficie Pública MCP:** Se mantienen intactas las **18 Tools** y **12 Resources** vigentes  
**Estado:** IMPLEMENTADO Y CERTIFICADO (HITO 22 — 100%)

---

## 1. Propósito y Ubicación Arquitectónica Real

Cuando un agente autónomo corrige un error en un archivo y rompe otro módulo dependiente (*whack-a-mole* u oscilación `A -> B -> A`), suele desperdiciar decenas de iteraciones y cuota re-ejecutando linters y pruebas unitarias sin cambiar de estrategia. El tracker determinista `track_findings_state.py` persiste huellas normalizadas de los hallazgos entre corridas locales para informar deltas reales y activar un cortacircuitos bloqueante (**`exit 42`**) exactamente en los dos puntos donde ocurren las re-ejecuciones:

1. **Durante el ciclo de desarrollo (`run_ephemeral_qa` en `ephemeral-runner.ts`):** Registra fallos de `stage="lint" | "unit" | "integration"` junto a la huella de `.agents/.qa-evidence.json` (`qa-evidence.ts`) y emite la alerta estructurada `BREAKER_42` vía `diagnosticFormatter.ts` sin crear nuevas herramientas MCP.
2. **Al cierre (`certify_task_completion.sh`):** Consolida los resultados de compuertas para verificar estabilidad sin oscilaciones antes de certificar `10/10`.

---

## 2. Fingerprinting Determinista Invariante al Desplazamiento de Líneas

Para evitar que la inserción de líneas encima de un fallo oculte un bucle real, cada hallazgo proveniente de Ruff, Mypy, ESLint, PHPStan, Pytest, Vitest, Karate, Trivy o `verify_diff_coverage.py` se normaliza a una tupla canónica antes de calcular su identificador `SHA-256` truncado a 16 caracteres hexadecimales:

```text
Tupla Canónica = (layer, stack, relative_file, rule_or_test_name, canonical_symbol_or_message)
```

- **Regla de Invariancia:** Antes de hashear se eliminan números de línea/columna crudos, direcciones de memoria, marcas de tiempo, duraciones en milisegundos y rutas temporales (`/tmp/...`).
- **Aislamiento por Rama y Sesión:** El estado se almacena en `.agents/.cache/certify_state.json` (directorio con permisos `0700`, archivo con permisos `0600`) indexado por `session_key = "{branch}:{merge_base_sha}"` y reteniendo un máximo de `10` corridas históricas por sesión.
- **Firma CLI Congelada:**  
  `python3 .agents/scripts/track_findings_state.py --state-file .agents/.cache/certify_state.json --findings-input <json_path_or_stdin> --max-streak 3 [--reset-state]`

---

## 3. Máquina de Estados y Regla Calibrada de Disparo (`EXIT 42`)

En cada corrida `R_n`, el conjunto de huellas activas se compara contra `[R_1, ..., R_{n-1}]` clasificando cada hallazgo en una de cuatro categorías:

| Estado del Hallazgo | Condición Exacta | Efecto en Contadores |
| :--- | :--- | :--- |
| **`RESOLVED`** | Presente en `R_{n-1}` y ausente en `R_n`. | Reinicia racha del hallazgo. |
| **`PERSISTENT`** | Presente en `R_{n-1}` y presente en `R_n`. | Incrementa `consecutive_streak += 1`. |
| **`REGRESSION_OSCILLATION`** | Presente en `R_k` (`k < n-1`), ausente en `R_{n-1}`, y **reaparece** en `R_n`. | Incrementa contador de oscilaciones (`oscillations += 1`). |
| **`NEW`** | Nunca observado en `[R_1, ..., R_{n-1}]`. | Inicializa `consecutive_streak = 1`. |

### Calibración de Salida y Umbral Óptimo (`max-streak = 3`)

- **Por qué `3` y no `2`:** Un umbral `streak >= 2` penalizaría ciclos normales de depuración (fallo inicial `#1` + primer intento parcial `#2`). Fijar `consecutive_streak >= 3` permite dos intentos de corrección antes de bloquear, mientras cualquier oscilación verdadera (`oscillations >= 1`) dispara el bloqueo de inmediato.
- **Códigos de salida:**
  - `0` (`[PASS] CERTIFY-STATE`): `0` hallazgos activos. Emite 1 línea con resueltos/persistentes/nuevos/oscilaciones.
  - `1` (`[FAIL] CERTIFY-STATE`): Existen hallazgos activos sin superar el umbral de bucle.
  - `42` (`[BREAKER-42] ANTI-LOOP ACTIVADO`): Existe al menos un hallazgo con `consecutive_streak >= 3` **o** `oscillations >= 1`. Imprime únicamente los hallazgos bloqueantes y la directiva obligatoria de detener ediciones a ciegas, consultar `inspect_ast_blast_radius` (`changed_since_ref`) y aplicar las 4 fases de `qa-11x-systematic-debugging`. El flag `--reset-state` queda reservado para intervención humana explícita.

---

## 4. Gobernanza *Thin-Client* Sin Inflar `.agents/rules/`

Respetando la arquitectura *Thin-Client* y `mcp-server/src/cli/reconcile-agents.ts` (que mantiene fijo el conjunto de 7 reglas canónicas más `git_closure_gate.md`), **no se crean archivos adicionales en `.agents/rules/`**. La directiva de respuesta ante `BREAKER-42` (`exit 42`) se incorpora como inciso compacto *Dual-Consumer* en:
- `.agents/rules/anti_regression_and_side_effects_guardrail.md` (regla LLM existente).
- `.agents/skills/qa-11x-systematic-debugging/SKILL.md` (manteniendo el límite `< 20 KB`).
- `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.es.md` (manual humano en español).

---

## 5. Desglose en Micro-Tareas Atómicas (`Hito 22`) y Verificación Rule Zero

| Micro-Tarea | Alcance Exacto | Verificación Efímera (`Rule Zero`) |
| :--- | :--- | :--- |
| **`22.1`** | Crear `.agents/scripts/track_findings_state.py` (parte 1: normalización invariante a números de línea, almacenamiento `0600` por `branch:merge_base` y `--reset-state`). | Validación `ruff` (`CC <= 5`) y `mypy --strict` en `sinfallas/base-python-uv:3.15`. |
| **`22.2`** | Completar `track_findings_state.py` (parte 2: máquina de estados `RESOLVED`/`PERSISTENT`/`REGRESSION_OSCILLATION`/`NEW` y disparo `exit 42` con `streak >= 3` u `oscillation >= 1`). | Prueba CLI offline (`--network none`) con stdin JSON simulado. |
| **`22.3`** | Crear `tests/test_track_findings_state.unit.py` (`>= 95%` cobertura) probando desplazamiento de líneas, cambio de rama, umbral `streak == 3`, oscilación `A -> B -> A` y `--reset-state`. | `docker run --rm --network none -e COVERAGE_FILE=/tmp/.coverage -u "$(id -u):$(id -g)" -v "$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 uv run --with pytest --with pytest-cov pytest tests/test_track_findings_state.unit.py` |
| **`22.4`** | Integrar seguimiento de rachas y señal `BREAKER_42` en `mcp-server/src/services/qa-evidence.ts` y `mcp-server/src/tools/ephemeral-runner.ts` sin alterar las 18 Tools MCP. | `make lint` en `sinfallas/base-node-ionic:26`. |
| **`22.5`** | Crear pruebas unitarias TS en `mcp-server/tests/` (`>= 95%` cobertura) y conectar `track_findings_state.py` en `.agents/scripts/certify_task_completion.sh`. | `make test-mcp` en `sinfallas/base-node-ionic:26` + `make certify`. |
| **`22.6`** | Documentar `BREAKER-42` en `anti_regression_and_side_effects_guardrail.md`, `qa-11x-systematic-debugging/SKILL.md` (`< 20 KB`) y `docs/05_ARQUITECTURA_Y_GOBERNANZA_AGENTES_IA.md`. | `./scripts/actualizar-grafos-graphify.sh`, `make sync-governance`, `make lint-docs` y `make certify`. |
