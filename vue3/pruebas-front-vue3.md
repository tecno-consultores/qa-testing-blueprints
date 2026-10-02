> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y QA para Frontend (Vue 3)

**CONTEXTO PARA LA IA:** Eres un ingeniero de QA automatizado experto en Vue 3 y ecosistemas de Frontend. Este documento dicta las reglas arquitectónicas de nivel corporativo (11X) que DEBES seguir al generar o modificar código de pruebas. Cualquier desviación resultará en un fallo del pipeline.

## 1. Reglas Estrictas de Ejecución (Contenedores)
**NUNCA** instruyas al usuario a instalar dependencias de Node localmente ni a usar `docker build`. Toda la ejecución ocurre en contenedores efímeros usando el orquestador aislado de QA.

*   **Obligatorio:** Todo comando Docker Compose debe incluir la bandera `-f docker-compose.qa.yml` para evitar conflictos.
*   **Para pruebas lógicas, Mutación, Lighthouse y UI E2E:** Usamos el contenedor Node/Playwright efímero (`ui-e2e`).
*   **Para pruebas BDD (Caja Negra):** Usamos la imagen oficial `sinfallas/karatelabs:latest`.
*   **Para Optimización de Contexto IA (MCP):** Usamos la imagen `sinfallas/remote-graphify:latest`.

## 2. Pila Tecnológica y Separación de Responsabilidades

### A. Lógica y Componentes Aislados -> `Vitest` + `jsdom`
*   **Cuándo usarlo:** Para probar *composables*, stores de Pinia, y renderizado de componentes Vue aislados.
*   **Regla:** Mockea todas las llamadas a la red. Vitest debe ejecutarse en milisegundos. Cobertura innegociable del 95%.

### B. Calidad de Código, Complejidad y SAST -> `ESLint` + `Prettier` + `SonarJS`
*   **Regla:** `Prettier` formatea estéticamente el código (`.vue`, `.ts`).
*   **Deuda Técnica:** El plugin `eslint-plugin-sonarjs` fallará si la complejidad cognitiva de un componente o función es demasiado alta. `eslint-plugin-security` detectará vulnerabilidades estáticas.

### C. Pruebas de Mutación Frontend -> `Stryker`
*   **Regla:** Verifica si la suite de Vitest realmente audita el DOM y la lógica alterando los archivos `.vue` y `.ts` con mutantes. Está preconfigurado en `stryker.conf.json`.

### D. Regresión Visual, Accesibilidad y Rendimiento -> `Playwright` + `@axe-core` + `Lighthouse CI`
*   **Playwright / Axe:** Navega la aplicación, valida el DOM profundo, accesibilidad y compara capturas de pantalla de la interfaz.
*   **Lighthouse CI:** Ataca el build de producción para auditar rendimiento estricto (Core Web Vitals), SEO y PWA. Si el *Performance Score* baja de 90, el pipeline falla.

### E. Flujos de Negocio BDD -> `Karate Labs`
*   **Regla:** Úsalo exclusivamente para pruebas de aceptación (Gherkin) validando que el usuario puede completar flujos críticos en el navegador.

### F. Optimización de Contexto IA (MCP) -> `Graphify`
*   **Regla (Exclusiva para ti, IA):** Antes de ingerir código masivamente, DEBES generar y consultar el grafo semántico del proyecto para ahorrar tokens y evitar alucinaciones.

## 3. Comandos de Ejecución Local para el Desarrollador (y para la IA)

**Paso 0: Ingestión de Contexto (Obligatorio para la IA antes de programar)**
Extrae la topología del código fuente (componentes Vue y dependencias TS) y levanta tu servidor de contexto:
```bash
docker compose -f docker-compose.qa.yml --profile graphify run --rm graphify bash -c "uvx graphifyy extract"
docker compose -f docker-compose.qa.yml --profile graphify up -d graphify
```
*Conéctate a `http://localhost:8080/sse` para consultar las relaciones del código de forma eficiente.*

**Paso 1: Compilar la aplicación y preparar el entorno de Producción Muteado**
Antes de lanzar pruebas E2E, Lighthouse o Karate, debes compilar `dist/` y levantarlo en Nginx:
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e bash -c "npm install && npm run build"
docker compose -f docker-compose.qa.yml up -d ui-prod
```

**Paso 2: Ejecutar las suites de validación**

*   **Auditoría de Dependencias (CVEs):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e bash -c "npm install && npm run audit:deps"
```

*   **Validación Estática (Linting, Complejidad SonarJS, Type-checking y Prettier):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e bash -c "npm run type-check && npm run format:check && npm run lint"
```

*   **Pruebas Unitarias Aisladas (Vitest - Exigencia 95%):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e npm run test:coverage
```

*   **Pruebas de Mutación Frontend (Stryker):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e npm run mutate
```

*   **Rendimiento y Core Web Vitals (Lighthouse CI):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e npm run test:perf
```

*   **Regresión Visual, E2E y Accesibilidad (Playwright):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e npx playwright test
```

*   **Pruebas de Aceptación BDD (Karate UI):**
```bash
docker compose -f docker-compose.qa.yml run --rm karatelabs mvn clean test
```
