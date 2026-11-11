# Preguntas Frecuentes (FAQ) - QA Testing Blueprints

Este documento resuelve las dudas arquitectónicas y los errores más comunes al implementar y ejecutar los ecosistemas de prueba estandarizados (Nivel 11X) en este repositorio.

## 🏗️ Filosofía y Ejecución

### ¿Por qué no puedo ejecutar `npm install`, `pip install` o las pruebas directamente en mi máquina local?
Para garantizar **inmutabilidad y paridad absoluta con producción**. El problema de "en mi máquina sí funciona" suele deberse a versiones globales ocultas de Node, Python o variables de entorno residuales. Al forzar el uso de contenedores efímeros (a través de los comandos simplificados como `make qa-unit`), el entorno nace completamente virgen, utilizando cachés aislados, ejecuta la suite y se autodestruye.

### Lefthook bloqueó mi `git commit`, ¿qué hago?
Nuestra política es **"Fail & Forbid" (Rechazo Educativo)**. Si Lefthook detectó errores de formato o un secreto *hardcodeado*, abortará tu commit. NO intentes evadirlo con `--no-verify`. Debes ejecutar el comando sugerido en la terminal (ej. `ruff format` o `Prettier`), revisar que el código haya quedado bien, y volver a intentar hacer commit.

### Todo mi código funciona y mi cobertura está en 100%, ¿por qué el pipeline sigue arrojando fallo?
Si superaste el 95% de cobertura, el pipeline ahora evalúa la **Deuda Técnica y Seguridad**. Es altamente probable que:
1. Herramientas como `SonarJS` (Node) o `Radon` (Python) detectaron **Complejidad Ciclomática** alta (Código Espagueti). Tendrás que refactorizar las funciones muy largas.
2. Fallaste los estándares de calidad de código visual (`Prettier`, `Ruff`).
3. Introdujiste vulnerabilidades detectadas por `ESLint Security` o `bandit` (SAST), o fallaste el escaneo dinámico de `OWASP ZAP` (DAST).
4. El rendimiento de Lighthouse (Vue3) bajó de 90.

### ¿Qué significa "contenedor efímero" y cómo guardo los reportes si el contenedor se borra?
Un contenedor efímero se crea dinámicamente con el flag `--rm`. Nace, ejecuta un comando único y muere. Los reportes (como la cobertura HTML o Flamegraphs de Profiling) no se pierden porque el `docker-compose.qa.yml` utiliza **volúmenes bind** (`- .:/app`), guardando los resultados directamente en tu disco duro físico.

## 🛡️ Herramientas y Casos Específicos

### ¿Por qué estoy obligado a usar librerías de Mocking (`nock`, `pytest-mock`) si la API a la que llamo es rápida?
Para garantizar el **determinismo y el aislamiento total**. Si tu prueba depende del internet o de una API de terceros que se cae temporalmente, tu prueba fallará (falso negativo) rompiendo el pipeline de CI/CD. Las pruebas unitarias jamás deben salir del contenedor.

### Estoy probando un script en Bash que formatea discos o reinicia servicios. ¿No es peligroso?
Es **extremadamente peligroso y está estrictamente prohibido**. Debes utilizar la técnica de *Mocking*. La imagen `sinfallas/base-bash-qa:latest` trae la librería `bats-mock` para interceptar binarios peligrosos e inyectar respuestas falsas.

### ¿Qué diferencia hay entre SAST (Bandit/ESLint) y DAST (OWASP ZAP)?
*   **SAST (Estático):** Escanea tu código fuente escrito como si fuera un libro, buscando vulnerabilidades de sintaxis o lógica antes de que el programa corra.
*   **DAST (Dinámico):** Es un hacker automatizado. Necesita que tu API esté viva y corriendo. ZAP le envía peticiones maliciosas reales (XSS, SQLi) evaluando si el servidor se rompe o expone cabeceras inseguras en las respuestas HTTP.

### ¿Qué son las Pruebas de Mutación (Stryker / mutmut)?
No prueban tu código, **prueban tus pruebas**. Alteran intencionalmente el código fuente original (cambian un `>` por `<`, o un `true` por `false`) y corren tu suite de pruebas de nuevo. Si tus pruebas unitarias dicen "Todo pasó" a pesar del daño, significa que tus pruebas tienen falsos positivos (no están auditando nada realmente).

### ¿Para qué utilizar Karate Labs (BDD) si ya tengo Vitest, Pytest o Supertest evaluando el código?
Porque cumplen propósitos distintos. Vitest/Pytest prueban cajas blancas (conocen el código interno). Karate Labs evalúa cajas negras: ataca el puerto vivo de la aplicación emulando a un usuario real mediante lenguaje natural (Gherkin).

### ¿Por qué me obligan a inyectar un middleware de Prometheus en mi código fuente?
Porque la Ingeniería del Caos a ciegas no sirve de nada. Si inyectamos latencia o pérdida de paquetes con Pumba, necesitamos ver el impacto real en los tiempos de respuesta (Métricas RED) de forma instantánea. Los middlewares seleccionados (`express-prom-bundle`, `prometheus-fastapi-instrumentator`) son de impacto cero y no alteran tu lógica de negocio.
*   **Nota para scripts (Bash/Python):** Para tareas efímeras que no levantan un servidor HTTP, no usamos middlewares. En su lugar, utilizamos inyecciones de comandos (ej. `curl`) para empujar las métricas hacia un **Pushgateway**, permitiendo que Prometheus las recolecte después de que el script haya terminado de ejecutarse.

### ¿Por qué Pumba (Caos) necesita acceder al socket de Docker (`/var/run/docker.sock`) si nuestra política prohíbe esto?
Porque la **Ingeniería del Caos** consiste en simular fallos catastróficos a nivel de infraestructura. Pumba necesita comunicarse con el demonio de Docker para interceptar el tráfico de red de otros contenedores o apagarlos abruptamente. Esta es una **excepción de seguridad documentada**, y es por ello que está oculta bajo el flag `--profile chaos` en el orquestador. Jamás se debe activar en un servidor de producción.

## 🚨 Resolución de Problemas (Troubleshooting)

### Docker me da "Permission Denied" o "ptrace(PTRACE_ATTACH)" al ejecutar Profilers (`clinic.js` o `py-spy`).
Por seguridad, el demonio de Docker bloquea la inspección de memoria entre procesos.
**Solución:** Asegúrate de que el servicio en el `docker-compose.qa.yml` tenga habilitados los privilegios del kernel:
```yaml
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp:unconfined
```

### ZAP (DAST) falla al escribir el `zap-report.html` (Permission Denied)
El contenedor de ZAP corre por defecto con el usuario no privilegiado `zap` (`UID 1000`), cumpliendo con las políticas de endurecimiento de contenedores (Trivy `DS002`, cero `user: root`).
**Solución:** Asegúrate de que el directorio de trabajo montado en `/zap/wrk` pertenezca al usuario `UID 1000` del host o tenga permisos de escritura antes de correr el escaneo. Al finalizar, ejecuta `./scripts/limpieza.sh` o `make clean` (el cual utiliza un fallback efímero en Docker Alpine para sanear artefactos sin requerir `sudo`).

### Docker se quedó sin espacio, está muy lento o las pruebas fallan porque detectan código viejo.
Los contenedores y gestores acumulan cachés masivos. 
**Solución:** Ejecuta el script maestro de saneamiento sin necesidad de `sudo`:
```bash
./scripts/limpieza.sh
# O utiliza la meta del Makefile en tu proyecto:
make clean-cache
```
Esto purga reportes temporales, artefactos de prueba y cachés huérfanas mediante una estrategia híbrida (eliminación local y fallback en Docker efímero con permisos internos de contenedor), limpiando también los volúmenes nombrados de caché (`pnpm-store` o `uv-cache`).

### ¿Por qué `scripts/limpieza.sh` y la herramienta MCP `clean_workspace_11x` ya no requieren `sudo`?
Los contenedores efímeros bajo la Regla Cero suelen crear archivos propiedad de `root` en los volúmenes montados. En lugar de forzar al usuario o al agente a ejecutar comandos de superusuario destructivos en la máquina anfitriona, el saneamiento ejecuta un contenedor efímero ultraligero de Alpine Linux (`sinfallas/base-node-ionic` o `alpine:latest`) montando el directorio con `uid 0` interno para purgar los artefactos de forma 100% segura y devolver el control limpio al usuario no privilegiado del host.

### El contenedor E2E de Vue 3 (Playwright / Lighthouse) se queja de un conflicto de red al intentar alcanzar la interfaz.
Asegúrate de haber levantado primero el servidor mock de producción en segundo plano ejecutando `docker compose -f docker-compose.qa.yml up -d ui-prod` antes de lanzar el comando efímero a través del Makefile:
```bash
make qa-e2e
```

## 🤖 Agentes de IA, Protocolo MCP y Skills Zero-Clone

### ¿Cómo interactúa un Agente de Inteligencia Artificial con este repositorio?
Un agente de IA (como Google Antigravity, Anthropic Claude Code / Claude Desktop, Hermes Agent de Nous Research, Cursor o Windsurf) puede interactuar de tres formas:
1. **Vía Servidor MCP (`@sinfallas/mcp-qa-11x`):** Se conecta por `stdio` mediante `npx -y @sinfallas/mcp-qa-11x@latest`. El servidor expone 12 herramientas operativas (como `inspect_project_config`, `bootstrap_or_merge_11x`, `fetch_blueprint_bundle`, `run_ephemeral_qa`, `certify_11x_gate`, `propose_skill_evolution_pr` y `reconcile_agents_governance`) y 9 recursos dinámicos (`blueprint://*`), permitiendo al agente auditar y fusionar código sin clonar el repositorio completo.
2. **Vía Skills Zero-Clone (`qa-11x-architect` y catálogo completo de 5 skills):** Se inyectan en su entorno junto con los scripts operativos y el conector de `AGENTS.md` ejecutando `npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts` o mediante el instalador universal `curl ... | sh`. El agente adquiere de inmediato el conocimiento de las 13 capas de calidad, los 22 patrones DISA/OWASP y la prevención Anti-JSDOM.
3. **Vía Reglas Locales (`.agents/` y `AGENTS.md`):** Si el agente opera dentro del repositorio clonado, lee automáticamente las directivas en `.agents/rules/` y mantiene la bitácora activa en `.agents/ACTIVE_TASK.md`, ejecutando la compuerta universal `./.agents/scripts/certify_task_completion.sh` antes de cerrar sus turnos.

### ¿Qué es el Servidor MCP `@sinfallas/mcp-qa-11x` y por qué es superior a clonar todo el repositorio?
El servidor MCP implementa la especificación abierta de Anthropic / Linux Foundation para exponer herramientas y recursos a modelos LLM. Permite una adopción **Zero-Clone**: en lugar de transferir cientos de archivos y megabytes al disco o saturar la ventana de contexto del agente, el agente consulta puntualmente la plantilla de su stack con verificación criptográfica SHA-256 (`DISA STIG V-222513`), ejecuta pruebas en Docker efímero y certifica la calidad mediante llamadas RPC limpias.

### ¿Cómo colaboran un desarrollador humano y un agente de IA en este estándar híbrido?
El estándar 11X define un modelo de trabajo en parejas (*Pair Programming Híbrido*):
- El **desarrollador humano** define los requisitos de negocio, aprueba cambios arquitectónicos y formula los prompts de alto nivel.
- El **agente de IA** actúa como un ingeniero Staff de QA y DevOps: analiza el radio de impacto AST (`inspect_blast_radius.py`), escribe el código de negocio, genera obligatoriamente las pruebas unitarias y de integración, crea los escenarios BDD en Karate Labs, ejecuta las pruebas en Docker efímero (`Rule Zero`) y mantiene sincronizada la documentación técnica (`docs/`, `CHANGELOG.md`, `ROADMAP.md`, `TESTING.md`).
- La **compuerta universal de certificación** (`certify_task_completion.sh`) actúa como el árbitro matemático objetivo que ninguno de los dos puede evadir antes del commit.

### ¿Por qué se eliminó la dependencia de GitHub Actions para publicar el servidor MCP a npm?
Siguiendo la filosofía de soberanía y aislamiento corporativo del estándar RoSGrid, delegar la publicación de paquetes con credenciales de npm (`NPM_TOKEN`) a *runners* remotos de CI/CD introduce riesgos de fuga de secretos y fallos de red externos fuera de nuestro control. El proceso de publicación se consolidó en el script soberano `scripts/publicar-mcp.sh`, el cual valida la compuerta 11X completa en Docker efímero local y maneja el token de npm de forma volátil en memoria con autodestrucción inmediata.

### ¿Cómo actualizo el Servidor MCP y las Skills en mi IDE después de publicar una nueva versión en npmjs y cómo valido que se descargaron los cambios?
Aunque en `mcp_config.json` tengas configurado `"@sinfallas/mcp-qa-11x@latest"`, el IDE mantiene en memoria el proceso `stdio` iniciado al arrancar y `npx` guarda copias en `~/.npm/_npx` (además de la caché de manifiestos en `~/.cache/qa-11x-blueprints`). Para forzar la actualización y validar la integridad criptográfica:
1. **Purga las cachés y reinstala las 5 Skills, Reglas y Scripts:**
   ```bash
   rm -rf ~/.npm/_npx ~/.cache/qa-11x-blueprints && npx -y @sinfallas/mcp-qa-11x@latest install-skill --target all --init-agents --include-scripts
   ```
2. **Reinicia el servidor MCP en tu IDE:** En Google Antigravity ve a **`...` (Additional Options) > MCP Servers > `qa-11x` > Restart** o ejecuta `Ctrl+Shift+P` -> **`Developer: Reload Window`**.
3. **Valida la versión y los hashes SHA-256 (`DISA STIG V-222513`):**
   * Verifica la versión en `npx`: `grep -rn '"version"' ~/.npm/_npx/*/node_modules/@sinfallas/mcp-qa-11x/package.json`
   * Verifica el manifiesto y documentación en caché: `grep -E '"blueprint_version"|"generated_at_utc"' ~/.cache/qa-11x-blueprints/manifest.json`
   * Durante la ejecución de `install-skill`, confirma que aparezca en consola `✔ [Skills 11X] 23 archivos verificados con SHA-256 (DISA STIG V-222513)`. Si algún archivo descargado no coincidiera exactamente con el hash SHA-256 del manifiesto oficial, el instalador abortará automáticamente por violación de integridad criptográfica.

### ¿Qué es la "Anti-Mock Blindness" (Ceguera de Mocks) y por qué se exige verificar contra PostgreSQL real y migraciones Alembic?
En pruebas unitarias, mockear llamadas a base de datos crea una falsa sensación de seguridad. Un modelo ORM puede tener tipos de datos incompatibles o columnas inexistentes que pasan los mocks con 100% de cobertura pero rompen la base de datos en producción. En el estándar 11X, todo cambio de modelo exige migración versionada y validación con `verify_alembic_orm_parity.py` ejecutándose contra una instancia real de PostgreSQL en Docker efímero.

### ¿Por qué JSDOM no detecta colisiones de diseño visual (Anti-JSDOM) y cómo se previene?
JSDOM es un simulador de nodos DOM en Node.js que no calcula renderizado CSS, cajas Flexbox/Grid ni coordenadas (`getBoundingClientRect()` devuelve `0x0`). Un pie de página fijo (`position: fixed`) puede superponerse a un formulario o tabla y JSDOM afirmará que los botones existen y son interactivos. La solución 11X prohíbe footers fijos, exige layouts in-flow (`margin-top: auto` en `<main>`) y valida la geometría real con Karate Labs UI o Playwright en Chromium.

### ¿Por qué las directivas internas de IA en `.agents/` están en inglés técnico si el proyecto documenta en español?
Por **economía de tokens y precisión lógica**. Los tokenizadores BPE fragmentan el español en ~35% más tokens que el inglés técnico de alta densidad. Redactar las reglas internas en inglés ahorra espacio de contexto para código y esquemas. Sin embargo, todas las directivas imponen la cláusula `OUTPUT LANGUAGE CONSTRAINT` para que las explicaciones al usuario y los manuales en `docs/` se mantengan 100% en español.

### ¿Por qué se utiliza KeyDB en lugar de Redis estándar?
KeyDB es un motor en memoria multi-hilo 100% compatible con Redis. Permite utilizar múltiples núcleos de CPU simultáneamente (`--server-threads 2`), multiplicando el rendimiento por 3x a 5x en operaciones de caché, rate limiting, pub/sub y bloqueos de idempotencia sin requerir ningún cambio en las librerías cliente.

