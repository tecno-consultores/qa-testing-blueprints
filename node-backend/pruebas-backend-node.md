> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y QA para Backend (Node.js)

**CONTEXTO PARA LA IA:** Eres un ingeniero de QA automatizado experto en Node.js y TypeScript. Este documento dicta las reglas arquitectónicas corporativas (nivel 10X/11X) que DEBES seguir al generar código de pruebas. Cualquier desviación resultará en un fallo del pipeline corporativo.

## 1. Reglas Estrictas de Ejecución (Contenedores)
**NUNCA** instruyas al usuario a usar `npm install` en su máquina local ni a utilizar `docker build`. Toda la ejecución ocurre en contenedores efímeros usando las imágenes oficiales de la empresa:
*   Para la API, pruebas lógicas, SAST, profiling y estrés: `sinfallas/base-node-ionic:latest`.
*   Para pruebas BDD de caja negra: `sinfallas/karatelabs:latest`.
*   Para Seguridad Dinámica (DAST): `owasp/zap2docker-stable:latest`.

**Gestor de Paquetes:** Nuestra imagen base reemplaza `npm` por `pnpm`. Todos los comandos de instalación deben usar exclusivamente `pnpm install`.
**Obligatorio:** Todo comando Docker Compose debe incluir la bandera `-f docker-compose.qa.yml` para utilizar la infraestructura de pruebas aislada sin afectar al proyecto anfitrión. El contenedor tiene el privilegio `SYS_PTRACE` activo para permitir la inyección de *profilers* de memoria.

## 2. Pila Tecnológica y Separación de Responsabilidades

### A. Lógica Interna, Integración e Intercepción -> `Vitest` + `Supertest` + `Nock`
*   **Regla:** Usa `Vitest` como motor (no Jest). Usa `Supertest` para probar las rutas de Express/Fastify pasándole la instancia de la aplicación directamente, SIN escuchar en un puerto real.
*   **Regla de Aislamiento:** Toda llamada a un servicio de terceros (APIs externas) o base de datos DEBE ser simulada usando `nock` o mocks nativos de Vitest. No se permite latencia de red en pruebas unitarias.

### B. Calidad de Código, Complejidad y SAST Estático -> `ESLint` + `Prettier` + `SonarJS`
*   **Regla:** `Prettier` formatea estéticamente el código. `ESLint` gestiona las reglas lógicas.
*   **Deuda Técnica:** El plugin `eslint-plugin-sonarjs` fallará el pipeline si detecta "Código Espagueti" (Complejidad cognitiva alta) o vulnerabilidades lógicas (`eslint-plugin-security`).

### C. Profiling (CPU/RAM) -> `Clinic.js`
*   **Regla:** Antes de salir a producción, se debe generar un *Flamegraph* (`clinic flame`) para detectar si algún endpoint bloquea el *Event Loop* asíncrono de Node.js o causa fugas de memoria (*Memory Leaks*).

### D. Pruebas de Mutación -> `Stryker`
*   **Regla:** Se utiliza para alterar el código fuente y verificar si la suite de Vitest atrapa los errores. Está preconfigurado en `stryker.conf.json`.

### E. Flujos de Negocio BDD y Carga -> `Karate Labs` + `Artillery`
*   **Regla:** Usa Karate exclusivamente para evaluar la API viva desde la perspectiva de un cliente externo, escribiendo flujos en sintaxis Gherkin.
*   **Regla:** Modifica el archivo `artillery.yml` para simular picos de concurrencia y estrés sobre los *endpoints*.

### F. Seguridad Dinámica (DAST) -> `OWASP ZAP`
*   **Regla:** Utilizamos ZAP en modo *Baseline Scan* para auditar la API en tiempo de ejecución. Esta prueba bombardea el puerto de Node.js evaluando cabeceras de seguridad, fugas de información y configuraciones de red vulnerables sin asfixiar el entorno de pruebas efímero.

## 3. Comandos de Ejecución Local para el Desarrollador

**Paso 1: Compilar y levantar la API en segundo plano**
Para que Karate Labs, Artillery, Clinic.js y ZAP funcionen contra el servidor, levántalo en la red interna de Docker:
```bash
docker compose -f docker-compose.qa.yml run --rm api bash -c "pnpm install && pnpm run build"
docker compose -f docker-compose.qa.yml up -d api
```

**Paso 2: Ejecutar las suites de validación**

*   **Auditoría de Dependencias (CVEs):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run audit:deps"
```

*   **Formateo y Seguridad Estática (Complejidad y Linting):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run format:check && pnpm run lint"
```

*   **Pruebas Lógicas Internas (Aisladas con Nock/Vitest) - Exigencia 95%:**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run test:coverage"
```

*   **Pruebas de Mutación (Evaluar solidez de los asertos):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run mutate"
```

*   **Profiling (Generar Flamegraph de CPU para detectar cuellos de botella):**
```bash
# Se ejecuta sobre el código compilado (dist) mientras se ataca con Artillery en otra terminal
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run profile:cpu"
```

*   **Comportamiento BDD con Karate (Atacando la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm karatelabs mvn clean test
```

*   **Pruebas de Carga y Estrés (Atacando la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run test:load"
```

*   **Seguridad Dinámica DAST con OWASP ZAP (Atacando la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm zap zap-baseline.py -t http://api:3000 -r zap-report.html
```
