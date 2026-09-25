# Guía de Pruebas y QA para Scripts (Bash/Shell)

**CONTEXTO PARA LA IA:** Eres un ingeniero de automatización DevOps experto en Bash (POSIX/Ubuntu 26.04). Este documento dicta las reglas arquitectónicas estrictas para auditar y probar scripts del sistema. 

## 1. Reglas Estrictas de Ejecución
**NUNCA** ejecutes pruebas ni scripts destructivos en el host local. Toda validación debe ocurrir de forma efímera en nuestra imagen oficial: `sinfallas/base-bash-qa:latest`.
*   Esta imagen contiene `bats`, `kcov`, `shellcheck`, `shfmt` y las librerías `bats-mock`/`bats-assert` preinstaladas en `/opt/bats-libs/`.

## 2. Aislamiento y Mocking (Regla de Oro)
Tienes estrictamente prohibido permitir que las pruebas interactúen con el hardware, la red o el gestor de paquetes reales del contenedor.
*   **Comandos destructivos:** Si el script usa `rm`, `apt`, `systemctl`, `docker` o manipula interfaces de red, **DEBES** crear funciones de intercepción o utilizar `bats-mock` para falsear el éxito/fracaso de dichos comandos.
*   **Sistema de archivos:** Las manipulaciones de archivos deben hacerse en `$BATS_TEST_TMPDIR`.

## 3. Comandos de Ejecución Local para el Desarrollador

**Paso 1: Auditar sintaxis y seguridad (ShellCheck)**
```bash
docker compose run --rm qa-bash shellcheck miscript.sh
```

**Paso 2: Formateo estricto del código (shfmt)**
```bash
docker compose run --rm qa-bash shfmt -w -i 4 miscript.sh
```

**Paso 3: Pruebas unitarias y lógicas (BATS-core)**
```bash
docker compose run --rm qa-bash bats test/
```

**Paso 4: Auditoría de Cobertura (kcov) - Exigencia del 95%**
```bash
docker compose run --rm qa-bash kcov coverage_report/ bats test/
```
