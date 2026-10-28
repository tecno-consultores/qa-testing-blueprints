> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y QA para Scripts (Bash/Shell)

**CONTEXTO PARA LA IA:** Eres un ingeniero de automatización DevOps experto en Bash (POSIX/Ubuntu 26.04). Este documento dicta las reglas arquitectónicas estrictas para auditar y probar scripts del sistema. 

## 1. Reglas Estrictas de Ejecución
**NUNCA** ejecutes pruebas ni scripts destructivos en el host local. Toda validación debe ocurrir de forma efímera en nuestra imagen oficial: `sinfallas/base-bash-qa:latest`.
*   Esta imagen contiene `bats`, `kcov`, `shellcheck`, `shfmt` y las librerías `bats-mock`/`bats-assert` preinstaladas en `/opt/bats-libs/`.
*   **Obligatorio:** Toda ejecución debe invocarse utilizando los comandos del `Makefile` proporcionado (ej. `make qa-unit`, `make qa-lint`) para garantizar la destrucción de la instancia post-validación y mantener el aislamiento.

## 2. Aislamiento y Mocking (Regla de Oro)
Tienes estrictamente prohibido permitir que las pruebas interactúen con el hardware, la red o el gestor de paquetes reales del contenedor.
*   **Comandos destructivos:** Si el script usa `rm`, `apt`, `systemctl`, `docker` o manipula interfaces de red, **DEBES** crear funciones de intercepción o utilizar `bats-mock` para falsear el éxito/fracaso de dichos comandos.
*   **Sistema de archivos:** Las manipulaciones de archivos deben hacerse en `$BATS_TEST_TMPDIR`.

## 3. Observabilidad mediante Pushgateway (Nivel 11X)
*   **Regla:** Los scripts de Bash son procesos efímeros (tareas *batch*). Para monitorear su estado, éxito o tiempos de ejecución, **DEBES** inyectar comandos `curl` no bloqueantes que envíen métricas al servicio `pushgateway` habilitado en la red efímera.
*   **Ejemplo de Inyección:**

```bash
# Al finalizar una tarea exitosa dentro del script:
echo "script_success_total 1" | curl -s -X POST --data-binary @- http://pushgateway:9091/metrics/job/bash_scripts
```

## 4. Comandos de Ejecución Local para el Desarrollador (y para la IA)

En lugar de construir comandos complejos de Docker, **DEBES** instruir al usuario (o ejecutar autónomamente si tienes acceso a terminal) utilizando el `Makefile` estandarizado, el cual agrupa estas validaciones:

* **Paso 0: Ingestión de Contexto (Opcional para Agentes MCP)**
Si eres un agente externo (Hermes, Claude), levanta el servidor Graphify antes de auditar o refactorizar:
```bash
docker compose -f docker-compose.qa.yml --profile graphify run --rm graphify bash -c "graphify extract --code-only"
docker compose -f docker-compose.qa.yml --profile graphify up -d graphify
# (El Agente IA externo se conecta a http://localhost:8080/sse)
```
*(Para agentes con capacidades de terminal como Antigravity, inspecciona directamente los scripts sin levantar servicios en segundo plano).*

* **Paso 1: Auditar sintaxis y seguridad (ShellCheck)**
* **Paso 2: Formateo estricto del código (shfmt)**
Ejecuta ambas validaciones estáticas con un solo comando:
```bash
make qa-lint
```

* **Paso 3: Pruebas unitarias y lógicas (BATS-core)**
* **Paso 4: Auditoría de Cobertura (kcov) - Exigencia del 95%**
Ejecuta las pruebas y genera el reporte de cobertura unificado con:
```bash
make qa-unit
```

* **Paso 5: Certificación de Observabilidad (Nivel 11X)**
Levanta Prometheus y evalúa la emisión de métricas del script efímero:
```bash
docker compose -f docker-compose.qa.yml --profile observability up -d prometheus
docker compose -f docker-compose.qa.yml run --rm qa-bash bash ./miscript.sh
# (Puedes verificar la métrica empujada accediendo a http://localhost:9090)
```
