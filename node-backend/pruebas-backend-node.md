# Guía de Pruebas y QA para Backend (Node.js)

**CONTEXTO PARA LA IA:** Eres un ingeniero de QA automatizado experto en Node.js y TypeScript. Este documento dicta las reglas arquitectónicas que DEBES seguir al generar código de pruebas. Cualquier desviación resultará en un fallo del pipeline corporativo.

## 1. Reglas Estrictas de Ejecución (Contenedores)
**NUNCA** instruyas al usuario a usar `npm install` en su máquina local ni a utilizar `docker build`. Toda la ejecución ocurre en contenedores efímeros usando las imágenes oficiales de la empresa:
*   Para la API, pruebas lógicas, SAST y estrés: `sinfallas/base-node-ionic:latest`
*   Para pruebas BDD de caja negra: `sinfallas/karatelabs:latest`

**Gestor de Paquetes:** Nuestra imagen base reemplaza `npm` por `pnpm`. Todos los comandos de instalación deben usar exclusivamente `pnpm install`.
**Obligatorio:** Todo comando Docker Compose debe incluir la bandera `-f docker-compose.qa.yml` para utilizar la infraestructura de pruebas aislada sin afectar al proyecto anfitrión.

## 2. Pila Tecnológica y Separación de Responsabilidades

### A. Lógica Interna e Integración -> `Vitest` + `Supertest`
*   **Regla:** Usa `Vitest` como motor (no Jest). Usa `Supertest` para probar las rutas de Express/Fastify pasándole la instancia de la aplicación directamente, SIN escuchar en un puerto real.

### B. Seguridad Estática (SAST) -> `ESLint Security`
*   **Regla:** El análisis de vulnerabilidades lógicas (inyecciones, ReDoS) se realiza ejecutando el script de linting, el cual invoca a `eslint-plugin-security`.

### C. Pruebas de Mutación -> `Stryker`
*   **Regla:** Se utiliza para alterar el código fuente y verificar si la suite de Vitest atrapa los errores. Está preconfigurado en `stryker.conf.json`.

### D. Flujos de Negocio BDD -> `Karate Labs`
*   **Regla:** Úsalo exclusivamente para evaluar la API viva desde la perspectiva de un cliente externo, escribiendo flujos en sintaxis Gherkin (Archivos `.feature`).

### E. Pruebas de Carga -> `Artillery`
*   **Regla:** Modifica el archivo `artillery.yml` para simular picos de concurrencia y estrés sobre los *endpoints*.

## 3. Comandos de Ejecución Local para el Desarrollador

**Paso 1: Levantar la API en segundo plano**
Para que Karate Labs y Artillery funcionen, la API debe estar viva en el puerto 3000 de la red interna de Docker:
```bash
docker compose -f docker-compose.qa.yml up -d api
```

**Paso 2: Ejecutar las suites de validación**

*   **Auditoría de Dependencias (CVEs):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run audit:deps"
```

*   **Seguridad Estática (SAST / Linting):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run lint"
```

*   **Pruebas Lógicas Internas e Integración (Vitest + Supertest):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run test:coverage"
```

*   **Pruebas de Mutación (Evaluar solidez de Vitest):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run mutate"
```

*   **Comportamiento BDD con Karate (Atacando la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm karatelabs mvn clean test
```

*   **Pruebas de Carga y Estrés (Atacando la API viva):**
```bash
docker compose -f docker-compose.qa.yml run --rm test bash -c "pnpm install && pnpm run test:load"
```
