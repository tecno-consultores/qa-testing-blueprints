# Filosofía de Calidad (QA Philosophy)

Este documento expone los principios de ingeniería y las decisiones estratégicas que fundamentan el ecosistema `qa-testing-blueprints`. Su propósito no es explicar *cómo* ejecutar un comando, sino *por qué* la arquitectura fue diseñada con estas restricciones y herramientas específicas.

## 1. La Cobertura del 95% es un Piso, no una Meta
Exigir un 95% de cobertura en `kcov`, `Vitest` o `pytest` no es una métrica de vanidad, es una barrera de contención contra regresiones silenciosas. 
El desarrollo tradicional suele probar únicamente el "camino feliz". Al forzar el umbral del 95%, obligamos al desarrollador (o al agente de IA) a estructurar pruebas para los bloques `catch`, el manejo de excepciones de red, las desconexiones de bases de datos y las ramas lógicas oscuras que típicamente causan interrupciones en producción.

## 2. Paranoia Positiva: Las Pruebas de Mutación
Las pruebas unitarias tradicionales tienen un punto ciego: asumen que si la aserción pasa, la prueba es buena. 
Hemos integrado herramientas como `Stryker` (Node) y `mutmut` (Python) para atacar nuestras propias pruebas. Al alterar la lógica del código fuente de forma automatizada (cambiando operadores o anulando variables), verificamos si la suite de pruebas es capaz de detectar la anomalía. Si un mutante sobrevive, la prueba era un falso positivo. Esto garantiza que el código de prueba sea tan robusto como el código de producción.

## 3. Inmutabilidad y Contaminación de Estado
El mayor enemigo de la integración continua es el estado persistente. Los entornos locales acumulan variables de caché, versiones globales de lenguajes y paquetes huérfanos que enmascaran dependencias faltantes.
La decisión de eliminar las instalaciones locales y forzar el uso de `docker compose -f docker-compose.qa.yml run --rm` garantiza una inmutabilidad estricta. El contenedor nace sin estado, evalúa el código en un vacío absoluto y se destruye. Si el código pasa en este entorno efímero, está matemáticamente garantizado que pasará en el servidor de producción o en un despliegue dentro de un contenedor LXC.

## 4. Diseño Orientado a Inteligencia Artificial (AI-First)
Este repositorio no fue diseñado solo para humanos. Los archivos `.md` de cada carpeta actúan como "prompts" de sistema restrictivos.
Las IAs generativas tienden a buscar el camino de menor resistencia, a menudo inventando dependencias o sugiriendo atajos arquitectónicos. El lenguaje imperativo de nuestras guías ("NUNCA uses npm", "DEBES aislar este comando") establece los límites de alucinación del modelo. Al acotar el universo de herramientas de la IA a las imágenes `sinfallas/*`, garantizamos que el código generado encaje perfectamente en nuestro pipeline corporativo sin refactorización manual.

## 5. Racionalización de Herramientas Específicas
No elegimos el stack por popularidad, sino por determinismo y rendimiento en contenedores:

*   **`uv` (Python):** Se eligió sobre `pip` tradicional por su velocidad de resolución en milisegundos, crucial cuando las dependencias se instalan al vuelo en cada ejecución de un contenedor efímero.
*   **`pnpm` (Node):** Su arquitectura de enlaces simbólicos (symlinks) impide que los proyectos accedan a dependencias "fantasma" que no están declaradas explícitamente en el `package.json`, un vector de fallo común en `npm`.
*   **`BATS` + `mocking` (Bash):** Auditar scripts de automatización DevOps es crítico. Cuando un script gestiona túneles de red, altera tablas de enrutamiento o administra infraestructura, un error puede aislar un servidor. BATS permite interceptar binarios del sistema para validar la lógica del script sin ejecutar jamás una alteración real en el host.
*   **`Karate Labs` (BDD):** Se prefiere sobre Cucumber puro porque Karate no requiere escribir código "pegamento" (glue code) en Java o JavaScript para cada paso de Gherkin. Todo el flujo de llamadas API o interacciones de UI se resuelve nativamente dentro del archivo `.feature`, reduciendo el mantenimiento del ecosistema.
