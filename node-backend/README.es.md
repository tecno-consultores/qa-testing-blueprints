> **[DIRECTIVA DE SISTEMA PARA AGENTES DE IA]:** Actúa como un Ingeniero Staff de Automatización QA y Experto DevOps. Lee, analiza y aplica estrictamente las siguientes restricciones arquitectónicas redactadas en español. Debes generar código que se alinee perfectamente con estas reglas, utilizando exclusivamente los contenedores Docker efímeros, frameworks de pruebas y umbrales estrictos de calidad (p. ej. 95% de cobertura, SAST, Profiling) especificados a continuación. No sugieras instalaciones locales. Procesa la lógica técnica con tu máxima capacidad de razonamiento en inglés, pero emite tu respuesta final, explicaciones y comentarios de código en español.

> 🌐 **Idioma:** [🇺🇸 English (Canonical)](README.md) · **Español (Espejo 1:1)**

# Guía de Pruebas y QA para Backend (Node.js)

**CONTEXTO PARA LA IA:** Eres un ingeniero de QA automatizado experto en Node.js y TypeScript. Este documento dicta las reglas arquitectónicas corporativas de Nivel 11X que DEBES seguir innegociablemente al generar código de pruebas. El objetivo no es solo probar que el código funciona, sino garantizar su resiliencia bajo estrés extremo, auditar su complejidad y certificar su seguridad.

## 1. Reglas Estrictas de Ejecución (Contenedores Efímeros y Caché)
**NUNCA** instruyas al usuario a usar `npm install` en su máquina local, ni a utilizar `docker build`, ni a construir comandos manuales de `docker compose run`. Toda la ejecución ocurre de forma efímera a través del `Makefile` proporcionado, aprovechando los volúmenes de caché persistente:
*   Para la API, pruebas lógicas, SAST, profiling y estrés: `sinfallas/base-node-ionic:26@sha256:275f3d8bbfef87f4e836e4f77d92c0d199821154079b050eaef53ce33ae6de60`.
*   Para pruebas BDD de caja negra: `sinfallas/karatelabs:1.5.1@sha256:a9a52ca9c5491ab39b64f0b4fdc3dea879c2213c9bc995be58d6cd4b9a80cc89`.
*   Para Seguridad Dinámica (DAST): `zaproxy/zap-stable:2.15.0`.
*   Para Ingeniería del Caos y Observabilidad: `gaiaadm/pumba:0.10.1` y `prom/prometheus:v2.55.1`.
*   Para Extracción Efímera de Grafo AST (Graphify CLI): `sinfallas/remote-graphify@sha256:08aa6a6fc5e72f25bb6a37da632932fe295ba0d72fd971ae5b365eeea3f778b0`.

**Gestor de Paquetes y Zero-Trust:** Nuestra imagen base reemplaza `npm` por `pnpm` v12 (`ignore-scripts=true` en `.npmrc` y confianza de compilación en `pnpm-workspace.yaml#allowBuilds`).
**Obligatorio:** Utiliza las metas de ejecución limpias (ej. `make qa-unit`) para aislar infraestructura, ejecutar sin root con `no-new-privileges:true` y reutilizar la caché (`pnpm-store`).

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
*   **Regla de Aislamiento (Frontera Anti-Mock Blindness):** En pruebas unitarias (`.unit.ts` / `.spec.ts`), mockea APIs HTTP externas y temporizadores con `nock` o mocks de Vitest. NUNCA uses mocks ciegos de base de datos para certificar persistencia, transacciones o migraciones: valida esquemas SQL y modelos ORM contra PostgreSQL real en pruebas de integración/BDD.
*   **Contratos de Proveedor Pact V4 (`node --test`):** Los archivos de verificación de contrato Zero-Infra en `tests/contracts/*.test.ts` (ej. `tests/contracts/provider.pact.test.ts`) se separan estrictamente de Vitest (`vitest.config.ts` excluye `tests/contracts/**`) y se ejecutan de forma nativa con `pnpm run test:contracts` (`node --test`) y `make qa-contracts`.

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

### I. Ingestión Inteligente (Paso 0 - AST Graphify `CLI-First`)
*   **Regla (Exclusiva para ti, IA):** Tienes estrictamente prohibido generar código o pruebas a ciegas. Tu primer paso debe ser actualizar e inspeccionar el grafo AST mediante CLI (`./scripts/actualizar-grafos-graphify.sh node-backend` y `python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"`, o la tool MCP `inspect_ast_blast_radius`) sin levantar demonios de fondo que ocupen el puerto `8080`. Además, DEBES leer silenciosamente los lineamientos de dependencias, formato y linters definidos en `package.json`, `eslint.config.mjs`, `.prettierrc`, `tsconfig.json` y `tsconfig.build.json` para adaptar tu código a las convenciones estrictas del repositorio y evitar rechazos en el CI/CD.

### J. Seguridad por Diseño Obligatoria (DISA ASD STIG V6R5 & OWASP Developer Guide v4.2)
*   Al programar o auditar microservicios en Node.js/TypeScript, DEBES aplicar y probar los controles de **[`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md`](../docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.es.md)**:
    *   **Sesiones e Identidad (`APSC-DV-000010, 000070, 000080, 000530` & `OWASP 4.3.7`):** Límites de sesiones concurrentes, *idle timeouts* por rol (**10 min** admin / **15 min** estándar), rotación de ID de sesión tras login/elevación de privilegios, y bloqueo tras **3 intentos fallidos en 15 min** con verificación en tiempo constante.
    *   **Validación, Canonicalización y Anti-Prototype Pollution (`APSC-DV-002390, 002485, 002510, 002520` & `OWASP 4.3.5, 4.3.6`):** Normalización `.normalize('NFKC')` antes de validar, sanitización recursiva contra `__proto__`/`constructor`/`prototype` (`Object.create(null)`), prohibición de `child_process.exec` con shell, desactivación de entidades externas XML y validación de archivos por *Magic Bytes* e índices en lista blanca.
    *   **Auditoría Inmutable, Cabeceras OSHP, Fail-Secure y SBOM (`APSC-DV-000650, 001090, 001350, 002310` & `OWASP 4.3.10, 5.3.4, 5.4.4, 7.8`):** Logs UTC encadenados con HMAC-SHA256 sanitizados contra inyección CR/LF y sin secretos, alerta al **75% de almacenamiento de logs**, cabeceras **OWASP OSHP** (HSTS, CSP, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, supresión de `X-Powered-By`), arranque *Fail-Secure*, mitigación de OWASP API Top 10 (2023) y generación de **CycloneDX SBOM** (`@cyclonedx/cyclonedx-npm`).

## 3. Comandos de Ejecución Local para el Desarrollador (y para la IA)

En lugar de construir comandos complejos de Docker, **DEBES** instruir al usuario (o ejecutar autónomamente si tienes acceso a terminal) utilizando el `Makefile` estandarizado:

**Paso 0: Ingestión de Contexto y Grafo AST (`CLI-First`)**
Extrae/actualiza el grafo de conocimiento AST y consulta el radio de impacto antes de programar:
```bash
./scripts/actualizar-grafos-graphify.sh node-backend
python3 .agents/scripts/inspect_blast_radius.py "<simbolo_o_archivo>"
```

**Paso 1: Ejecución Efímera y Ciclo de Vida de Contenedores (`Rule Zero`)**
Las metas `qa-e2e`, `qa-dast` y `qa-stress` levantan `api` y realizan teardown automático al salir; ejecuta `make clean-cache` o `make clean` tras inspecciones manuales.

**Paso 2: Ejecutar las suites de validación (Pipeline Regular)**

*   **Auditoría de Vulnerabilidades (CVEs), Calidad y Tipado Estricto:**
```bash
make qa-lint
```

*   **Pruebas Lógicas Internas (Aisladas con Nock/Vitest) - Exigencia >= 95%:**
```bash
make qa-unit
```

*   **Contratos de Proveedor Pact V4 Zero-Infra (`node --test`):**
```bash
make qa-contracts
```

*   **Generación de SBOM CycloneDX:**
```bash
make qa-sbom
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
make qa-dast
```

**Paso 3: Certificación de Nivel 11X (Ingeniería del Caos y Observabilidad — independiente de `qa-all`)**
*ADVERTENCIA:* Este comando independiente (`qa-stress` está excluido de `qa-all`) activa el perfil de caos. Despierta a Pumba, Artillery y Prometheus simultáneamente para estresar la API simulando una red severamente degradada.
```bash
make qa-stress
```
*(Durante el ataque, visualiza métricas en vivo en `http://localhost:9090`. Al finalizar, revisa `chaos-report.json` generado localmente. Para profiling CPU/RAM, ejecuta `pnpm run profile:cpu` o `pnpm run profile:memory` dentro de `qa-node-backend`).*
