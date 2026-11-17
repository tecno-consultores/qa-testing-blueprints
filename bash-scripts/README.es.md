> **[DIRECTIVA DE SISTEMA PARA AGENTES DE IA]:** Actúa como un Ingeniero Staff de Automatización QA y Experto DevOps. Lee, analiza y aplica estrictamente las siguientes restricciones arquitectónicas redactadas en español. Debes generar código que se alinee perfectamente con estas reglas, utilizando exclusivamente los contenedores Docker efímeros, frameworks de pruebas y umbrales estrictos de calidad (p. ej. 95% de cobertura, SAST, Profiling) especificados a continuación. No sugieras instalaciones locales. Procesa la lógica técnica con tu máxima capacidad de razonamiento en inglés, pero emite tu respuesta final, explicaciones y comentarios de código en español.

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

# Guía de Pruebas y QA para Scripts (Bash/Shell)

**CONTEXTO PARA LA IA:** Eres un ingeniero de automatización DevOps experto en Bash (POSIX/Ubuntu 26.04). Este documento dicta las reglas arquitectónicas estrictas para auditar y probar scripts del sistema. 

## 1. Reglas Estrictas de Ejecución
**NUNCA** ejecutes pruebas ni scripts destructivos en el host local. Toda validación debe ocurrir de forma efímera en nuestra imagen oficial: `sinfallas/base-bash-qa@sha256:2d1f579e20ef384e85da839304dbae2d28231fcdc893c21cbe79861b44d675a7`.
*   Esta imagen contiene `bats`, `kcov`, `shellcheck`, `shfmt` y las librerías `bats-mock`/`bats-assert` preinstaladas en `/opt/bats-libs/`.
*   **Obligatorio:** Toda ejecución debe invocarse utilizando los comandos del `Makefile` proporcionado (ej. `make qa-unit`, `make qa-lint`) para garantizar la destrucción de la instancia post-validación y mantener el aislamiento.

## 2. Aislamiento y Mocking (Regla de Oro)
Tienes estrictamente prohibido permitir que las pruebas interactúen con el hardware, la red o el gestor de paquetes reales del contenedor.
*   **Comandos destructivos:** Si el script usa `rm`, `apt`, `systemctl`, `docker` o manipula interfaces de red, **DEBES** crear funciones de intercepción o utilizar `bats-mock` para falsear el éxito/fracaso de dichos comandos.
*   **Aislamiento de UID para `bats-mock`:** Bajo UIDs sin entrada en `/etc/passwd` (como `UID 1001` en GitHub Actions o `UID 501` en macOS), define `_USER=qa` en Compose/Docker y `export _USER="${_USER:-$(id -un 2>/dev/null || id -u)}"` antes de cargar `bats-mock` para evitar ruido de `id -un` en `stderr` / `$output`.
*   **Sistema de archivos:** Las manipulaciones de archivos deben hacerse en `$BATS_TEST_TMPDIR`.

## 3. Observabilidad mediante Pushgateway y Seguridad DevSecOps (DISA STIG & OWASP)
*   **Regla de Observabilidad:** Los scripts de Bash son procesos efímeros (tareas *batch*). Para monitorear su estado, éxito o tiempos de ejecución, **DEBES** inyectar comandos `curl` no bloqueantes que envíen métricas al servicio `pushgateway` habilitado en la red efímera.
*   **Seguridad por Diseño en Shell (`DISA V-222483, V-222513, V-222604, V-222645, V-222666` & `OWASP 4.3.3, 4.3.10`):**
    *   Usar modo estricto (`set -euo pipefail` o equivalente POSIX seguro), entrecomillar todas las expansiones de variables para impedir *Command Injection* y prohibir `eval`.
    *   Nunca escribir secretos, contraseñas ni tokens en logs o en la línea de comandos visible en `ps` (`V-222444`).
    *   Verificar hashes criptográficos SHA-256 / firmas antes de instalar o desplegar artefactos (`V-222513, V-222645`), alertar si la partición de auditoría supera el **75% de uso** (`V-222483`) y purgar credenciales/PII en scripts de respaldo o exportación de bases de datos (`V-222666`).
*   **Ejemplo de Inyección:**

```bash
# Al finalizar una tarea exitosa dentro del script (con timeout acotado y no bloqueante):
echo "script_success_total 1" | curl -fsS --connect-timeout 2 --max-time 4 -X POST --data-binary @- http://pushgateway:9091/metrics/job/bash_scripts >/dev/null 2>&1 || true
```

## 4. Comandos de Ejecución Local para el Desarrollador (y para la IA)

En lugar de construir comandos complejos de Docker, **DEBES** instruir al usuario (o ejecutar autónomamente si tienes acceso a terminal) utilizando el `Makefile` estandarizado, el cual agrupa estas validaciones:

* **Paso 0: Ingestión de Contexto y Grafo AST (`CLI-First`)**
Si eres un agente externo o usas terminal local, actualiza e inspecciona el grafo AST del stack sin levantar demonios HTTP:
```bash
./scripts/actualizar-grafos-graphify.sh bash-scripts
python3 .agents/scripts/inspect_blast_radius.py "<funcion_o_script>"
```
*(Inspecciona directamente el grafo AST y `ShellCheck`/`shfmt` sin levantar servicios de fondo en el puerto `8080`).*

* **Paso 1: Auditar sintaxis y seguridad (ShellCheck)**
* **Paso 2: Formateo estricto del código (shfmt)**
Ejecuta ambas validaciones estáticas con un solo comando:
```bash
make qa-lint
```

* **Paso 3: Pruebas unitarias y lógicas (BATS-core)**
* **Paso 4: Auditoría de Cobertura (kcov) - Exigencia del 95%**
Ejecuta las pruebas sobre `clean_artifacts.sh` (`test/ejemplo_mock.bats`) y genera el reporte de cobertura unificado con:
```bash
make qa-unit
```

* **Paso 5: Certificación de Observabilidad (Nivel 11X)**
Levanta Prometheus y Pushgateway y evalúa la emisión de métricas del script efímero:
```bash
make qa-observability
docker compose -f docker-compose.qa.yml run --rm -T -u "$(id -u):$(id -g)" qa-bash bash ./clean_artifacts.sh --dry-run
# O envía métrica tras limpieza real: ./clean_artifacts.sh --pushgateway-url http://pushgateway:9091
# Verifica la métrica en http://localhost:9090 y apaga con `make clean-cache` (o `--profile "*" down -v`).
```
