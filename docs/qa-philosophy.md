# Filosofía de Calidad (QA Philosophy)

Este documento expone los principios de ingeniería y las decisiones estratégicas que fundamentan el ecosistema `qa-testing-blueprints`.

## 1. La Cobertura del 95% es un Piso, no una Meta
Exigir un 95% de cobertura en `kcov`, `Vitest` o `pytest` no es una métrica de vanidad, es una barrera de contención contra regresiones silenciosas. Obligamos a estructurar pruebas para los bloques `catch` y ramas lógicas oscuras.

## 2. Paranoia Positiva: Las Pruebas de Mutación
Herramientas como `Stryker` y `mutmut` atacan nuestras propias pruebas alterando la lógica del código fuente. Si un mutante sobrevive, la prueba era un falso positivo.

## 3. Inmutabilidad y Contaminación de Estado
El mayor enemigo de la CI es el estado persistente. Ejecutar los comandos encapsulados en los `Makefiles` (ej. `make qa-all`) garantiza que el entorno nazca sin estado, evalúe el código en un vacío absoluto, purgue la memoria y se destruya de forma segura.

## 4. Diseño Orientado a Inteligencia Artificial (AI-First)
El lenguaje imperativo de nuestras guías acota el universo de herramientas de la IA a las imágenes `sinfallas/*`, garantizando que el código generado encaje perfectamente sin alucinaciones.

## 5. Prevención de Deuda Técnica (Complejidad y Rendimiento)
No basta con que el código funcione, debe ser escalable y eficiente. Se han incorporado herramientas como `radon` (Python) y `eslint-plugin-sonarjs` (JS/TS) para analizar estáticamente la complejidad ciclomática. Complementamos esto con `py-spy` y `clinic.js` para auditar perfiles de CPU y memoria desde adentro del contenedor, interceptando cuellos de botella antes de los picos de carga externos.

## 6. Aislamiento Estricto de Red y la Frontera de Mocks
Para garantizar la naturaleza efímera, las pruebas unitarias puras (`.unit.py`, `.unit.ts`) nunca deben comunicarse con APIs ni redes externas. Exigimos el uso nativo de `unittest.mock` / `pytest-mock` (Python) y utilidades de intercepción como `msw` o `nock` (Node.js) para falsear respuestas HTTP externas sin latencia ni dependencia de terceros. Sin embargo, esta frontera de mocking jamás debe utilizarse ciegamente para suplantar la base de datos o esquemas relacionales (véase el principio 12).

## 7. Barreras Locales (Pre-Commit & Pre-Push)
El código de baja calidad o inseguro no debe tener el derecho de existir en el repositorio. Implementamos `Lefthook` y la compuerta de certificación `./.agents/scripts/certify_task_completion.sh` como guardias fronterizos. En el `pre-commit` rechazamos código sin formato o con secretos hardcodeados. En el `pre-push` ejecutamos Trivy para bloquear despliegues de IaC vulnerables (ej. puertos expuestos en Docker Compose). Educamos a los desarrolladores o IA a través del fallo inmediato.

## 8. Seguridad Total (SAST + DAST + IaC)
Asumimos que la infraestructura y el código son vulnerables por defecto. Las pruebas tradicionales no detectan inyecciones. Auditar estáticamente (Trivy para la infraestructura, Bandit para el código) previene errores tipográficos fatales, mientras que auditar dinámicamente con OWASP ZAP (`zaproxy/zap-stable`) ataca la aplicación viva para certificar que el servidor web no expone datos sensibles.

## 9. Resiliencia Extrema (Ingeniería del Caos)
Probar si la API funciona bajo condiciones perfectas de laboratorio ya no es suficiente. El Nivel 11X introduce la Ingeniería del Caos (Pumba). Degradamos intencionalmente la red interna insertando *jitter* y *packet loss* mientras la aplicación sufre picos de estrés. Certificamos que la arquitectura posea mecanismos de Auto-Recovery en lugar de entrar en un estado de *deadlock* permanente.

## 10. Observabilidad Universal (Métricas RED)
No podemos mejorar lo que no medimos. Forzamos la exposición de métricas (Rate, Errors, Duration) mediante middlewares no intrusivos acoplados a Prometheus (para servidores) o envíos asíncronos vía Pushgateway (para scripts). Esto permite a la Inteligencia Artificial y a los desarrolladores evaluar en tiempo real el daño causado por las pruebas destructivas, pasando de simples reportes estáticos a un diagnóstico "en vivo".

## 11. Seguridad Zero-Trust en Dependencias
El ecosistema bloquea proactivamente la ejecución silenciosa de scripts de instalación de terceros (ej. `.npmrc` con `ignore-scripts=true`). Ningún paquete descargado de internet tiene derecho a ejecutar código arbitrario en nuestra infraestructura durante su instalación, mitigando ataques de cadena de suministro (Supply Chain Attacks).

## 12. Anti-Ceguera de Mocks y Validación de Persistencia Real (Anti-Mock Blindness)
Uno de los mayores causantes de fallos críticos en producción es el falso sentido de seguridad que brindan los mocks de base de datos ("Mock Blindness"). Un mock siempre responde lo que el programador espera, ocultando desincronizaciones de esquema, violaciones de llaves foráneas, tipos incompatibles o fallos en políticas Row-Level Security (RLS). En Nivel 11X, toda mutación sobre modelos ORM exige una migración versionada (`alembic revision --autogenerate`) y su verificación obligatoria contra una base de datos real efímera (`postgres:17-alpine`) mediante scripts automatizados de paridad (`verify_alembic_orm_parity.py`).

## 13. Geometría Visual Anti-JSDOM (Renderizado en Navegador Real)
Entornos emulados como JSDOM o HappyDOM no computan CSS Layout, colisiones de capas, z-index ni dimensiones de bounding box (`0x0`). Probar componentes frontend exclusivamente con JSDOM oculta defectos visuales como pies de página fijos (`position: fixed`) que solapan botones de acción o tablas. En el Estándar 11X, los footers deben residir in-flow dentro de `<main>` (`margin-top: auto`) y la interactividad profunda debe certificarse en navegadores reales sin cabeza (*headless*) mediante **Playwright** y **Karate Labs UI**.

## 14. Gobernanza Bimodal de Agentes IA (Inglés de Alta Densidad / Español Operativo)
Para eliminar alucinaciones y prevenir el agotamiento de la ventana de contexto de los Modelos de Lenguaje (LLMs), las directivas internas de gobernanza (`.agents/rules/`, `.agents/skills/`) se redactan en inglés técnico de alta densidad, ahorrando aproximadamente un 35% de tokens BPE. Paralelamente, toda la documentación humana, explicaciones y registros operativos permanecen en español estricto, garantizando máxima fidelidad lógica sin sacrificar la soberanía técnica local.
