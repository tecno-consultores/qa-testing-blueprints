> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y QA para Backend (Node.js)

**CONTEXTO PARA LA IA:** Eres un ingeniero de QA automatizado experto en Node.js y TypeScript. Este documento dicta las reglas arquitectónicas corporativas de Nivel 11X que DEBES seguir innegociablemente al generar código de pruebas. El objetivo no es solo probar que el código funciona, sino garantizar su resiliencia bajo estrés extremo, auditar su complejidad y certificar su seguridad.

## 1. Reglas Estrictas de Ejecución (Contenedores Efímeros y Caché)
**NUNCA** instruyas al usuario a usar `npm install` en su máquina local, ni a utilizar `docker build`, ni a construir comandos manuales de `docker compose run`. Toda la ejecución ocurre de forma efímera a través del `Makefile` proporcionado, aprovechando los volúmenes de caché persistente:
*   Para la API, pruebas lógicas, SAST, profiling y estrés: `sinfallas/base-node-ionic:latest`.
*   Para pruebas BDD de caja negra: `sinfallas/karatelabs:latest`.
*   Para Seguridad Dinámica (DAST): `zaproxy/zap-stable:latest`.
*   Para Ingeniería del Caos y Observabilidad: `gaiaadm/pumba:latest` y `prom/prometheus:latest`.
*   Para Optimización de Contexto IA (MCP): `sinfallas/remote-graphify:latest`.

**Gestor de Paquetes y Zero-Trust:** Nuestra imagen base reemplaza `npm` por `pnpm`. La instalación en contenedor bloquea automáticamente la ejecución de scripts maliciosos de terceros (gracias a `ignore-scripts=true` en el `.npmrc`).
**Obligatorio:** Utiliza las metas de ejecución limpias (ej. `make qa-unit`) para aislar la infraestructura y re-utilizar la caché de dependencias (`pnpm-store`). El contenedor tiene el privilegio `SYS_PTRACE` activo para inyectar *profilers* de memoria.

## 2. Pila Tecnológica y Separación de Responsabilidades

### A. Observabilidad en Código (Requisito Previo Innegociable)
*   Antes de realizar cualquier auditoría, DEBES asegurar que el archivo principal de Express/Fastify (ej. `src/server.ts`) esté instrumentado inyectando este middleware de manera no intrusiva para exponer `/metrics`:

```typescript
    import promBundle from "express-prom-bundle";
    // Inyectar antes de declarar tus rutas de negocio:
    app.use(promBundle({ includeMethod: true, includePath: true }));
```

### B. Lógica Interna, Integración e Intercepción -> `Vitest` + `Supertest` + `Nock`
*   **Frontera Estricta (Tool Boundary):** Todos los archivos de pruebas unitarias DEBEN llamarse `.unit.ts` o `.spec.ts` para separar su contexto.
*   **Regla:** Usa `Vitest` como motor (no Jest). Usa `Supertest` para probar las rutas de Express/Fastify pasándole la instancia directamente, SIN escuchar en un puerto real.
*   **Regla de Aislamiento:** Toda llamada a un servicio de terceros o base de datos DEBE ser simulada usando `nock` o mocks nativos de Vitest. No se permite latencia de red en pruebas unitarias.

### C. Calidad de Código, Complejidad y SAST Estático -> `ESLint` + `Prettier` + `SonarJS`
*   **Regla:** `Prettier` formatea estéticamente el código. `ESLint` gestiona las reglas lógicas.
*   **Deuda Técnica:** El plugin `eslint-plugin-sonarjs` fallará el pipeline si detecta "Código Espagueti" (Complejidad cognitiva alta) o vulnerabilidades lógicas (`eslint-plugin-security`).

### D. Profiling (CPU/RAM) -> `Clinic.js`
*   **Regla:** Antes de salir a producción, se debe generar un *Flamegraph* (`clinic flame`) para detectar si algún endpoint bloquea el *Event Loop* asíncrono de Node.js o causa fugas de memoria (*Memory Leaks*).

### E. Pruebas de Mutación -> `Stryker`
*   **Regla:** Se utiliza para alterar el código fuente y verificar si la suite de Vitest atrapa los errores. Está preconfigurado en `stryker.conf.json`.

### F. Flujos de Negocio BDD -> `Karate Labs`
*   **Regla:** Usa Karate exclusivamente para evaluar la API viva desde la perspectiva de un cliente externo, escribiendo flujos en sintaxis Gherkin.

### G. Seguridad Dinámica (DAST) -> `OWASP ZAP`
*   **Regla:** Utilizamos ZAP en modo *Baseline Scan* para auditar la API en tiempo de ejecución. Evalúa cabeceras de seguridad, fugas de información y configuraciones vulnerables sin asfixiar el entorno.

### H. Resiliencia Extrema (Ingeniería del Caos) -> `Pumba` + `Artillery`
*   **Regla:** Ejecutado exclusivamente mediante el perfil `--profile chaos`. Pumba inyectará 500ms de latencia de red impredecible sobre el contenedor de Node.js, mientras `Artillery` inyecta oleadas de usuarios concurrentes y Prometheus extrae las métricas. Certifica que la arquitectura no colapsa ni entra en *timeout* permanente cuando la red falla.

### I. Ingestión Inteligente (Paso 0 - MCP)
*   **Regla (Exclusiva para ti, IA):** Tienes estrictamente prohibido generar código o pruebas a ciegas. Tu primer paso debe ser levantar el servidor `graphify` para ingerir el grafo semántico del proyecto. Además, DEBES leer silenciosamente los lineamientos de dependencias, formato y linters definidos en `package.json`, `.eslintrc.json`, `.prettierrc` y `tsconfig.json` para adaptar tu código a las convenciones estrictas del repositorio y evitar rechazos en el CI/CD.

## 3. Comandos de Ejecución Local para el Desarrollador (y para la IA)

En lugar de construir comandos complejos de Docker, **DEBES** instruir al usuario (o ejecutar autónomamente si tienes acceso a terminal) utilizando el `Makefile` estandarizado:

**Paso 0: Ingestión de Contexto (Obligatorio para la IA antes de programar)**
Extrae la topología del código y levanta tu servidor de contexto:
```bash
docker compose -f docker-compose.qa.yml --profile graphify run --rm graphify bash -c "graphify extract --code-only"
docker compose -f docker-compose.qa.yml --profile graphify up -d graphify
# (El Agente IA se conecta a http://localhost:8080/sse)
```

**Paso 1: Levantar la API en segundo plano**
```bash
docker compose -f docker-compose.qa.yml up -d api
```

**Paso 2: Ejecutar las suites de validación (Pipeline Regular)**

*   **Auditoría de Vulnerabilidades (CVEs), Calidad y Tipado Estricto:**
```bash
make qa-lint
```

*   **Pruebas Lógicas Internas (Aisladas con Nock/Vitest) - Exigencia >95%:**
```bash
make qa-unit
```

*   **Pruebas de Mutación (Evaluar solidez de los asertos):**
```bash
make qa-mutation
```

*   **Comportamiento BDD (Karate):**
```bash
make qa-e2e
```

*   **Seguridad Dinámica DAST (OWASP ZAP):**
```bash
docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:3000 -r zap-report.html
```

*   **Profiling Acumulativo (Flamegraph de CPU):**
```bash
docker compose -f docker-compose.qa.yml run --rm qa-node-backend bash -c "pnpm install && pnpm run profile:cpu"
```

**Paso 3: Certificación de Nivel 11X (Ingeniería del Caos y Observabilidad)**
*ADVERTENCIA:* Este comando activa el perfil de caos. Despierta a Pumba, Artillery y Prometheus simultáneamente para estresar la API simulando una red severamente degradada.
```bash
make qa-stress
```
*(Durante el ataque, puedes visualizar las métricas en vivo en `http://localhost:9090`. Al finalizar, revisa el archivo `chaos-report.json` generado localmente).*
