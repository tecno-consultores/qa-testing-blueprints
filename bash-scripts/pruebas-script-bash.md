> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y QA para Scripts (Bash/Shell)

**CONTEXTO PARA LA IA:** Eres un ingeniero de automatización DevOps experto en Bash (POSIX/Ubuntu 26.04). Este documento dicta las reglas arquitectónicas estrictas para auditar y probar scripts del sistema. 

## 1. Reglas Estrictas de Ejecución
**NUNCA** ejecutes pruebas ni scripts destructivos en el host local. Toda validación debe ocurrir de forma efímera en nuestra imagen oficial: `sinfallas/base-bash-qa:latest`.
*   Esta imagen contiene `bats`, `kcov`, `shellcheck`, `shfmt` y las librerías `bats-mock`/`bats-assert` preinstaladas en `/opt/bats-libs/`.
*   **Obligatorio:** Todo comando Docker Compose debe incluir la bandera `-f docker-compose.qa.yml` para utilizar la infraestructura de pruebas aislada sin afectar al proyecto anfitrión.

## 2. Aislamiento y Mocking (Regla de Oro)
Tienes estrictamente prohibido permitir que las pruebas interactúen con el hardware, la red o el gestor de paquetes reales del contenedor.
*   **Comandos destructivos:** Si el script usa `rm`, `apt`, `systemctl`, `docker` o manipula interfaces de red, **DEBES** crear funciones de intercepción o utilizar `bats-mock` para falsear el éxito/fracaso de dichos comandos.
*   **Sistema de archivos:** Las manipulaciones de archivos deben hacerse en `$BATS_TEST_TMPDIR`.

## 3. Observabilidad mediante Pushgateway (Nivel 11X)
*   **Regla:** Los scripts de Bash son procesos efímeros (tareas *batch*). Para monitorear su estado, éxito o tiempos de ejecución, **DEBES** inyectar comandos `curl` no bloqueantes que envíen métricas al servicio `pushgateway` habilitado en la red efímera.
*   **Ejemplo de Inyección:**

```bash
# Al finalizar una tarea exitosa dentro del script:
curl -s -X POST --data-binary @- http://pushgateway:9091/metrics/job/bash_scripts <<EOF
script_success_total 1
EOF
```

## 4. Comandos de Ejecución Local para el Desarrollador (y para la IA)

* Paso 1: Auditar sintaxis y seguridad (ShellCheck)

```bash
docker compose -f docker-compose.qa.yml run --rm qa-bash shellcheck miscript.sh
```

* Paso 2: Formateo estricto del código (shfmt)

```bash
docker compose -f docker-compose.qa.yml run --rm qa-bash shfmt -w -i 4 miscript.sh
```

* Paso 3: Pruebas unitarias y lógicas (BATS-core)

```bash
docker compose -f docker-compose.qa.yml run --rm qa-bash bats test/
```

* Paso 4: Auditoría de Cobertura (kcov) - Exigencia del 95%

```bash
docker compose -f docker-compose.qa.yml run --rm qa-bash kcov coverage_report/ bats test/
```

* Paso 5: Certificación de Observabilidad (Nivel 11X)

```bash
docker compose -f docker-compose.qa.yml --profile observability up -d prometheus
docker compose -f docker-compose.qa.yml run --rm qa-bash bash ./miscript.sh
```

(Puedes verificar la métrica empujada accediendo a http://localhost:9090)
