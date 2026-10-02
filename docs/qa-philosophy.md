# Filosofía de Calidad (QA Philosophy)

Este documento expone los principios de ingeniería y las decisiones estratégicas que fundamentan el ecosistema `qa-testing-blueprints`.

## 1. Barrera Pre-Commit (Fail & Forbid)
El código de baja calidad no debe llegar al repositorio. Implementamos `Lefthook` como un guardia fronterizo local. Si el código carece de formato, rompe convenciones semánticas o contiene secretos hardcodeados, el commit es rechazado brutal y educativamente en la máquina del desarrollador.

## 2. La Cobertura del 95% es un Piso, no una Meta
Exigir un 95% de cobertura en `kcov`, `Vitest` o `pytest` no es una métrica de vanidad, es una barrera de contención contra regresiones silenciosas. Obligamos a estructurar pruebas para los bloques `catch` y ramas lógicas oscuras.

## 3. Paranoia Positiva: Las Pruebas de Mutación
Herramientas como `Stryker` y `mutmut` atacan nuestras propias pruebas alterando la lógica del código fuente. Si un mutante sobrevive, la prueba era un falso positivo.

## 4. Inmutabilidad y Contaminación de Estado
El mayor enemigo de la CI es el estado persistente. Ejecutar con `docker compose -f docker-compose.qa.yml run --rm` garantiza que el entorno nazca sin estado, evalúe el código en un vacío absoluto y se destruya.

## 5. Auditoría Total: Infraestructura (IaC), Estática (SAST) y Dinámica (DAST)
Asumimos que el código es vulnerable por defecto.
*   **IaC (Trivy):** Audita que nuestros orquestadores Docker no tengan escalamiento de privilegios o imágenes base comprometidas (0-days).
*   **SAST (Bandit / ESLint Security):** Lee el código fuente buscando inyecciones SQL o eval() maliciosos antes de ejecutarlo.
*   **DAST (OWASP ZAP):** Ataca la aplicación en vivo. Un código perfecto estáticamente puede ser vulnerable si el servidor web (Nginx/Uvicorn) expone cabeceras inseguras o configuraciones CORS laxas.

## 6. Prevención de Deuda Técnica (Complejidad y Rendimiento)
No basta con que el código funcione, debe ser escalable y eficiente. Analizamos estáticamente la complejidad ciclomática (`radon`, `SonarJS`) y complementamos con `py-spy` / `clinic.js` para auditar la memoria desde adentro del contenedor, interceptando cuellos de botella antes de producción.

## 7. Aislamiento Estricto de Red (Mocking)
Las pruebas unitarias y de integración temprana nunca deben comunicarse con el exterior. Exigimos el uso nativo de `unittest.mock`, `msw` o `nock` para falsear respuestas de red y simular comportamientos críticos sin latencia.

## 8. Ingeniería del Caos (Sobrevivir > Funcionar)
El Nivel 11X abandona la falsa seguridad de las "redes perfectas". Usamos `Pumba` para inyectar latencia extrema (Jitter) y matar contenedores aleatoriamente bajo picos de carga. Si la API se ahoga y no se recupera sola (Auto-Recovery), la arquitectura ha fallado.
