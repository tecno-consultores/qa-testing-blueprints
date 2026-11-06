> **[SYSTEM DIRECTIVE FOR AI AGENTS]:** Act as a Staff QA Automation Engineer and DevOps Expert. Read, parse, and strictly enforce the following architectural constraints written in Spanish. You must generate code that perfectly aligns with these rules, using exclusively the ephemeral Docker containers, testing frameworks, and strict quality thresholds (e.g., 95% coverage, SAST, Profiling) specified below. Do not suggest local installations. Process the technical logic at your highest reasoning capacity in English, but output your final response, explanations, and code comments in Spanish.

# Guía de Pruebas y QA para Frontend (Vue 3)

**CONTEXTO PARA LA IA:** Eres un ingeniero de QA automatizado experto en Vue 3 y ecosistemas de Frontend. Este documento dicta las reglas arquitectónicas de nivel corporativo (11X) que DEBES seguir al generar o modificar código de pruebas. Cualquier desviación resultará en un fallo del pipeline.

## 1. Reglas Estrictas de Ejecución (Contenedores y Caché)
**NUNCA** instruyas al usuario a instalar dependencias de Node localmente, ni a usar `docker build`, ni a ejecutar comandos manuales largos de `docker compose`. Toda la ejecución ocurre en contenedores efímeros usando el orquestador aislado de QA y aprovechando los volúmenes de caché persistente (`pnpm-store`).

*   **Gestor de Paquetes y Zero-Trust:** Usamos `pnpm` en lugar de `npm`. La ejecución silenciosa de *scripts* maliciosos durante la instalación está bloqueada por el `.npmrc`. Revisa `package.json` si dependencias como `esbuild` o `playwright` fallan.
*   **Obligatorio:** Utiliza las metas predefinidas en el `Makefile` (ej. `make qa-unit`) para aislar la infraestructura y re-utilizar la caché de dependencias.
*   **Para pruebas lógicas (Vitest) y Mutación:** Usamos el contenedor ligero `qa-vue3` (`sinfallas/base-node-ionic:26`; tags disponibles: `22`, `24`, `26` y `latest`).
*   **Para Lighthouse y UI E2E (Playwright):** Usamos el contenedor pesado `ui-e2e`.
*   **Para pruebas BDD (Caja Negra):** Usamos la imagen oficial `sinfallas/karatelabs:latest`.
*   **Para Observabilidad (Métricas de Servidor):** Usamos los contenedores `nginx/nginx-prometheus-exporter:latest` y `prom/prometheus:latest`.
*   **Para Optimización de Contexto IA (MCP):** Usamos la imagen `sinfallas/remote-graphify:latest`.

## 2. Pila Tecnológica y Separación de Responsabilidades

### A. Lógica y Componentes Aislados -> `Vitest` + `jsdom` (Advertencia Anti-JSDOM)
*   **Cuándo usarlo:** Para probar *composables*, stores de Pinia, y renderizado de componentes Vue aislados.
*   **Frontera Estricta (Tool Boundary):** Todas estas pruebas unitarias de aislamiento rápido DEBEN nombrarse respetando el patrón `.unit.ts` o `.spec.ts`.
*   **Regla:** Mockea todas las llamadas a la red. Vitest debe ejecutarse en milisegundos. Cobertura innegociable del 95%.
*   **Advertencia Anti-JSDOM (Geometría Visual):** `jsdom` NO calcula modelos de caja ni colisiones visuales (`0x0` bounding box). Tienes estrictamente prohibido usar elementos `position: fixed` flotantes para pies de página que tapen botones de acción o tablas. Todo footer debe ser in-flow (`margin-top: auto`) dentro de `<main>`. Valida siempre el comportamiento visual en navegador real mediante Playwright o Karate Labs.

### B. Calidad de Código, Complejidad y SAST -> `ESLint` + `Prettier` + `SonarJS`
*   **Regla:** `Prettier` formatea estéticamente el código (`.vue`, `.ts`).
*   **Deuda Técnica:** El plugin `eslint-plugin-sonarjs` fallará si la complejidad cognitiva de un componente o función es demasiado alta. `eslint-plugin-security` detectará vulnerabilidades estáticas.

### C. Pruebas de Mutación Frontend -> `Stryker`
*   **Regla:** Verifica si la suite de Vitest realmente audita el DOM y la lógica alterando los archivos `.vue` y `.ts` con mutantes. Está preconfigurado en `stryker.conf.json`.

### D. Regresión Visual, Accesibilidad, Diseño (`refactoring-ui`) y Rendimiento -> `Playwright` + `@axe-core` + `Lighthouse CI`
*   **Frontera Estricta (Tool Boundary):** Todas las pruebas que requieran levantar navegadores y atacar la UI en vivo DEBEN nombrarse usando `.e2e.ts`.
*   **Sistema de Diseño Determinista (`.agents/skills/refactoring-ui/`):** Al diseñar o estilizar componentes `.vue`, aplica las reglas de `.agents/skills/refactoring-ui/SKILL.md` y sus 9 referencias (`hierarchy.md`, `layout.md`, `type.md`, `color.md`, `depth.md`, `dark-mode.md`, etc.): 1 solo botón primario sólido por vista, tonos OKLCH sin texto translúcido (`text-white/70` prohibido), `tabular-nums` en columnas numéricas para evitar *Cumulative Layout Shift* (`CLS = 0`), `outline-hidden` en vez de `outline-none`, y cero scroll horizontal en `375x667`, `768x1024` y `1440x900`.
*   **Playwright / Axe:** Navega la aplicación, valida el DOM profundo, accesibilidad WCAG 2.1 AA (0 violaciones) y compara capturas de pantalla de la interfaz.
*   **Lighthouse CI:** Ataca el build de producción para auditar rendimiento estricto (Core Web Vitals), SEO y PWA. Si el *Performance Score* baja de 90, el pipeline falla.

### E. Flujos de Negocio BDD -> `Karate Labs`
*   **Regla:** Úsalo exclusivamente para pruebas de aceptación (Gherkin en `test/ui_business_flow.feature`) validando que el usuario puede completar flujos críticos en el navegador.

### F. Observabilidad -> `Nginx Prometheus Exporter`
*   **Regla:** El monitoreo del frontend se realiza externamente a través de los logs de acceso de Nginx para no agregar dependencias al código de la aplicación. Esto se ejecuta mediante el perfil `--profile observability`.

### G. Ingestión Inteligente (Paso 0 - MCP / AST CLI-First)
*   **Regla (Exclusiva para ti, IA):** Tienes estrictamente prohibido generar código o pruebas a ciegas. Si tienes acceso a shell (Antigravity), audita componentes y dependencias vía scripts directos sin ocupar el puerto 8080. Si eres un agente externo (Hermes, Claude), conéctate al servidor MCP `sinfallas/remote-graphify:latest`. Además, DEBES leer silenciosamente las configuraciones de linters, dependencias y *scripts* prohibidos en `package.json` y `vite.config.ts` para evitar fallos de pipeline.

### H. Seguridad Frontend Obligatoria (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   Al construir o probar componentes en Vue 3 y tiendas Pinia, DEBES aplicar y verificar con pruebas unitarias/BDD los controles de **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md)**:
    *   **Purga Total en Logout y Confirmación Explícita (`DISA V-222388, V-222392, V-222578` & `OWASP 4.3.7`):** Al cerrar sesión o expirar por inactividad (**10 min** rol privilegiado / **15 min** rol estándar, `V-222389/000080`), limpiar por completo `sessionStorage.clear()`, `localStorage.clear()`, `CacheStorage` y stores en memoria, mostrando un mensaje explícito de cierre de sesión exitoso.
    *   **Notificación de Último Acceso y Cero Secretos en Campos Ocultos (`DISA V-222437, V-222601` & `OWASP 4.3.6 FV-2`):** Mostrar al usuario tras autenticar la fecha/hora de su último inicio de sesión y NUNCA almacenar datos sensibles o privilegios en campos `<input type="hidden">` ni en `localStorage`.
    *   **Defensa Anti-XSS, Anti-Prototype Pollution y Cabeceras OSHP (`DISA V-222602, V-222609` & `OWASP 4.3.5, 5.4.4`):** Escapar dinámicamente entradas con `escapeHtml` antes de usar `v-html`/`innerHTML`, sanitizar objetos JSON contra `__proto__`/`constructor`/`prototype` (`Object.create(null)`), enviar `X-CSRF-Token` e `Idempotency-Key` en mutaciones y preservar el último estado válido en tiendas Pinia ante fallos de red (manejo de errores no destructivo).

## 3. Comandos de Ejecución Local para el Desarrollador (y para la IA)

En lugar de construir comandos complejos de Docker, **DEBES** instruir al usuario (o ejecutar autónomamente si tienes acceso a terminal) utilizando el `Makefile` estandarizado:

**Paso 0: Ingestión de Contexto (Opcional para Agentes MCP)**
Extrae la topología del código fuente (componentes Vue y dependencias TS) y levanta tu servidor de contexto si requieres MCP externo:
```bash
docker compose -f docker-compose.qa.yml --profile graphify run --rm graphify bash -c "graphify extract --code-only"
docker compose -f docker-compose.qa.yml --profile graphify up -d graphify
# (El Agente IA se conecta a http://localhost:8080/sse)
```

**Paso 1: Ejecutar las suites de Validación Lógica (No requieren Build)**

*   **Validación Estática (CVEs, Linting, Complejidad SonarJS, Type-checking y Prettier):**
```bash
make qa-lint
```

*   **Pruebas Unitarias Aisladas (Vitest - Exigencia 95%):**
```bash
make qa-unit
```

*   **Auditoría de Componentes Huérfanos (Cero componentes .vue sin test unitario):**
```bash
make qa-orphans
```

*   **Pruebas de Mutación Frontend (Stryker):**
```bash
make qa-mutation
```
```bash
make qa-mutation
```

**Paso 2: Compilar y Ejecutar las suites End-to-End (Atacando Nginx)**
*(Nota: Las metas `qa-perf`, `qa-e2e` y `qa-bdd` compilan el Frontend de Vue y levantan `ui-prod` automáticamente antes de probar).*

*   **Rendimiento y Core Web Vitals (Lighthouse CI):**
```bash
make qa-perf
```

*   **Regresión Visual, E2E y Accesibilidad (Playwright):**
```bash
make qa-e2e
```

*   **Pruebas de Aceptación BDD (Karate UI):**
```bash
make qa-bdd
```

**Paso 3: Certificación de Observabilidad en Vivo (Nivel 11X)**
Levanta Prometheus y el sidecar de Nginx para monitorear las interacciones de los tests E2E y BDD en tiempo real.
```bash
make qa-obs
```
