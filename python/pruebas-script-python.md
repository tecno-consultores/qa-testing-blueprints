# Guía de Pruebas y Validación para Scripts Python (Standalone/Librerías)

Este documento contiene las instrucciones ("prompt") que debes seguir como asistente de IA o desarrollador para generar, estructurar y ejecutar pruebas automatizadas para proyectos Python bajo nuestro estándar corporativo.

## 1. Reglas Estrictas de Ejecución (Docker)
**NUNCA** debes instruir la construcción de imágenes locales mediante `docker build` o `build:` en el `docker-compose.yml`. Todo el entorno de pruebas debe ejecutarse de forma efímera utilizando la imagen oficial: `sinfallas/base-python-uv:3.13`.

La instalación de dependencias se realiza exclusivamente en tiempo de ejecución usando el gestor `uv`, a través del siguiente comando:
`uv pip install --system -e '.[dev]'`

## 2. Pila Tecnológica Requerida
Al generar código, configurar el entorno o plantear soluciones, debes asegurar la implementación de estas herramientas:

*   **Linting y Formateo:** `ruff` (validación de calidad de código visual y lógica temprana).
*   **Tipado Estricto:** `mypy` (prevención de excepciones en tiempo de ejecución).
*   **Seguridad y Auditoría:** `uv pip audit` (CVEs de dependencias) y `bandit` (vulnerabilidades SAST en el código base).
*   **Pruebas Lógicas Base:** `pytest` como motor principal.
*   **Aislamiento y Mocks:** `unittest.mock` (librería estándar).
*   **Integración HTTP:** `requests` (para peticiones reales) y `python-dotenv` (para inyectar credenciales).
*   **Cobertura (Coverage):** `pytest-cov` (se exige un mínimo del 95%).
*   **Pruebas de Mutación:** `mutmut` (para validar si las pruebas fallan cuando el código lógico cambia).
*   **Matriz de Compatibilidad:** `tox` potenciado por `tox-uv`.

## 3. Arquitectura de las Pruebas a Generar

Cuando redactes código de pruebas (`tests/`), debes separarlo estrictamente en dos enfoques:

### A. Pruebas Unitarias (Mockeadas / Aisladas)
*   **Propósito:** Validar la lógica pura de la librería sin depender de red o credenciales.
*   **Regla:** Utiliza `@patch` para interceptar la librería `requests`. Simula respuestas JSON exitosas, así como fallos catastróficos.
*   **Restricción:** Estas pruebas NO deben requerir un archivo `.env` válido ni realizar conexiones reales al exterior.

### B. Pruebas de Integración (Reales)
*   **Propósito:** Validar que los contratos y la comunicación con servicios externos sigan funcionando.
*   **Regla:** Usa `python-dotenv` para cargar variables de entorno. Utiliza el decorador `@pytest.mark.integration`.
*   **Restricción:** Estas pruebas SÍ utilizan la red y requieren credenciales.

## 4. Comandos de Ejecución Local

Utiliza estos comandos asumiendo que existe el `docker-compose.yml` estándar:

*   **Auditoría Rápida (Seguridad + Pruebas Unitarias sin Red):**
    ```bash
    docker compose run --rm test bash -c "uv pip install --system -e '.[dev]' && uv pip audit && bandit -r src/ && pytest -m 'not integration' -v"
    ```

*   **Prueba Exclusiva de Integración (Conexión Real):**
    ```bash
    docker compose run --rm test bash -c "uv pip install --system -e '.[dev]' && pytest -m integration -v"
    ```

*   **Pruebas de Mutación (Evaluar solidez de los tests):**
    ```bash
    docker compose run --rm test bash -c "uv pip install --system -e '.[dev]' && mutmut run"
    ```

*   **Validación Completa Pre-Commit (Pipeline Tox con Matriz):**
    ```bash
    docker compose run --rm -e UV_PYTHON_DOWNLOADS=true test bash -c "uv pip install --system -e '.[dev]' && tox"
    ```
