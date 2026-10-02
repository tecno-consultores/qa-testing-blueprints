# Filosofía de Calidad (QA Philosophy)

Este documento expone los principios de ingeniería y las decisiones estratégicas que fundamentan el ecosistema `qa-testing-blueprints`.

## 1. La Cobertura del 95% es un Piso, no una Meta
Exigir un 95% de cobertura en `kcov`, `Vitest` o `pytest` no es una métrica de vanidad, es una barrera de contención contra regresiones silenciosas. Obligamos a estructurar pruebas para los bloques `catch` y ramas lógicas oscuras.

## 2. Paranoia Positiva: Las Pruebas de Mutación
Herramientas como `Stryker` y `mutmut` atacan nuestras propias pruebas alterando la lógica del código fuente. Si un mutante sobrevive, la prueba era un falso positivo.

## 3. Inmutabilidad y Contaminación de Estado
El mayor enemigo de la CI es el estado persistente. Ejecutar con `docker compose -f docker-compose.qa.yml run --rm` garantiza que el entorno nazca sin estado, evalúe el código en un vacío absoluto y se destruya.

## 4. Diseño Orientado a Inteligencia Artificial (AI-First)
El lenguaje imperativo de nuestras guías acota el universo de herramientas de la IA a las imágenes `sinfallas/*`, garantizando que el código generado encaje perfectamente sin alucinaciones.

## 5. Prevención de Deuda Técnica (Complejidad y Rendimiento)
No basta con que el código funcione, debe ser escalable y eficiente. Se han incorporado herramientas como `radon` (Python) y `eslint-plugin-sonarjs` (JS/TS) para analizar estáticamente la complejidad ciclomática. Complementamos esto con `py-spy` y `clinic.js` para auditar perfiles de CPU y memoria desde adentro del contenedor, interceptando cuellos de botella antes de los picos de carga externos.

## 6. Aislamiento Estricto de Red (Mocking)
Para garantizar la naturaleza efímera, las pruebas unitarias y de integración temprana nunca deben comunicarse con el exterior. Exigimos el uso nativo de `unittest.mock` (Python) y utilidades de intercepción como `msw` o `nock` (Node.js) para falsear respuestas de red y simular comportamientos críticos sin latencia ni dependencia de terceros.

## 7. Barrera Pre-Commit (Fail & Forbid)
El código de baja calidad no debe tener el derecho de existir en el repositorio. Implementamos `Lefthook` como un guardia fronterizo estrictamente local. Si el código carece de formato, rompe convenciones semánticas (`commitlint`) o contiene secretos hardcodeados, el commit es rechazado. Educamos a los desarrolladores o IA a través del fallo inmediato.

## 8. Seguridad Total (SAST + DAST + IaC)
Asumimos que la infraestructura y el código son vulnerables por defecto. Las pruebas tradicionales no detectan inyecciones. Auditar estáticamente (Trivy para la infraestructura, Bandit para el código) previene errores tipográficos fatales, mientras que auditar dinámicamente con OWASP ZAP (DAST) ataca la aplicación viva para certificar que el servidor web no expone datos sensibles.

## 9. Resiliencia Extrema (Ingeniería del Caos)
Probar si la API funciona bajo condiciones perfectas de laboratorio ya no es suficiente. El Nivel 11X introduce la Ingeniería del Caos (Pumba). Degradamos intencionalmente la red interna insertando *jitter* y *packet loss* mientras la aplicación sufre picos de estrés. Certificamos que la arquitectura posea mecanismos de Auto-Recovery en lugar de entrar en un estado de *deadlock* permanente.
