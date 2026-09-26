# Guía de Pruebas y QA para Frontend (Vue 3)

**CONTEXTO PARA LA IA:** Eres un ingeniero de QA automatizado experto en Vue 3. Este documento dicta las reglas arquitectónicas que DEBES seguir al generar o modificar código de pruebas en este repositorio. Cualquier desviación de estas reglas resultará en un fallo del pipeline.

## 1. Reglas Estrictas de Ejecución (Contenedores)
**NUNCA** instruyas al usuario a instalar dependencias de Node localmente ni a usar `docker build`. Toda la ejecución ocurre en contenedores efímeros usando el orquestador aislado de QA.

*   **Obligatorio:** Todo comando Docker Compose debe incluir la bandera `-f docker-compose.qa.yml` para evitar conflictos con la configuración del proyecto anfitrión.
*   **Para pruebas de lógica y UI E2E:** Usamos un contenedor Node/Playwright efímero (`ui-e2e`).
*   **Para pruebas BDD (Caja Negra):** Usamos la imagen oficial `sinfallas/karatelabs:latest`.

## 2. Pila Tecnológica y Separación de Responsabilidades
Tienes prohibido duplicar esfuerzos. Usa la herramienta correcta para el objetivo correcto:

### A. Lógica y Componentes -> `Vitest`
*   **Cuándo usarlo:** Para probar *composables* (ej. `useAuth`), stores de Pinia, transformación de datos, y renderizado rápido de componentes UI aislados.
*   **Regla:** Mockea todas las llamadas a la red. Vitest debe ejecutarse en milisegundos.

### B. Regresión Visual y Accesibilidad -> `Playwright` + `@axe-core`
*   **Cuándo usarlo:** Para navegar la aplicación real ensamblada, validar el DOM profundo, asegurar el cumplimiento de accesibilidad (a11y) y tomar capturas de pantalla de la interfaz.
*   **Regla Visual:** Las pruebas deben correr contra el servidor de producción (`ui-prod`) con la API en modo mock (`MOCK_MODE=true`) para que la telemetría gráfica no fluctúe y rompa los *snapshots*.

### C. Flujos de Negocio BDD -> `Karate Labs`
*   **Cuándo usarlo:** Para pruebas de aceptación de alto nivel escritas en sintaxis Gherkin (Archivos `.feature`).
*   **Regla:** Úsalo exclusivamente para validar que el usuario puede completar flujos críticos en el navegador (ej. "Dado que hago login, Cuando hago clic en Comprar, Entonces veo la confirmación"). No lo uses para probar si un botón tiene el color correcto (eso es trabajo de Playwright).

## 3. Comandos de Ejecución Local para el Desarrollador

**Paso 1: Compilar la aplicación y preparar el entorno**
Antes de levantar el servidor Nginx de producción, debes generar el build compilado en la carpeta `dist/`:
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e bash -c "npm install && npm run build"
```
Una vez compilado, levanta el servidor que servirá la UI:
```bash
docker compose -f docker-compose.qa.yml up -d ui-prod
```

**Paso 2: Ejecutar las suites**

*   **Validación Estática (Linting y Type-checking en Vue):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e bash -c "npm run type-check && npm run lint"
```

*   **Pruebas Unitarias (Vitest):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e npm run test:unit
```

*   **Regresión Visual, E2E y Accesibilidad (Playwright):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e npx playwright test
```

*   **Actualizar Snapshots (Solo si hubo un rediseño intencional):**
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e npx playwright test --update-snapshots
```

*   **Pruebas de Aceptación BDD (Karate UI):**
```bash
docker compose -f docker-compose.qa.yml run --rm karatelabs mvn clean test
```
