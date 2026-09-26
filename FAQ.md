# Preguntas Frecuentes (FAQ) - QA Testing Blueprints

Este documento resuelve las dudas arquitectónicas y los errores más comunes al implementar y ejecutar los ecosistemas de prueba estandarizados en este repositorio.

## 🏗️ Filosofía y Ejecución

### ¿Por qué no puedo ejecutar `npm install`, `pip install` o las pruebas directamente en mi máquina local?
Para garantizar **inmutabilidad y paridad absoluta con producción**. El problema de "en mi máquina sí funciona" suele deberse a versiones globales ocultas de Node, Python o variables de entorno residuales en tu sistema operativo. Al forzar el uso de contenedores efímeros (`docker compose run --rm`), el entorno de pruebas nace completamente virgen, instala dependencias estrictamente definidas, ejecuta la suite y se autodestruye.

### Todo mi código funciona y hace lo que debe, ¿por qué el pipeline arroja un error de fallo?
Es altamente probable que tu código no haya superado la **regla estricta del 95% de cobertura**. No basta con que el "camino feliz" funcione. Nuestras configuraciones (`pytest-cov` para Python, `Vitest` para Node/Vue3, y `kcov` para Bash) están programadas para fallar el pipeline si dejas bloques `catch`, condiciones `if/else` o funciones auxiliares sin probar. Revisa el reporte en consola para ver exactamente qué líneas te faltó cubrir.

### ¿Qué significa "contenedor efímero" y cómo guardo los reportes si el contenedor se borra?
Un contenedor efímero se crea dinámicamente con el flag `--rm` (ej. `docker compose run --rm test`). Nace, ejecuta un comando único y muere. Los reportes (como la cobertura HTML, reportes de accesibilidad de Playwright o fallos de Stryker) no se pierden porque el `docker-compose.yml` utiliza **volúmenes bind** (`- .:/app`), lo que significa que el contenedor guarda los resultados directamente en tu disco duro físico antes de destruirse.

## 🛡️ Herramientas y Casos Específicos

### Estoy probando un script en Bash que formatea discos (`fdisk`) o reinicia servicios de red (`systemctl`). ¿No es peligroso ejecutar esto, incluso en Docker?
Es **extremadamente peligroso y está estrictamente prohibido**. Para probar scripts destructivos, debes utilizar la técnica de *Mocking*. La imagen `sinfallas/base-bash-qa:latest` ya trae preinstalada la librería `bats-mock`. Debes configurar tus pruebas en BATS para interceptar binarios peligrosos (`rm`, `apt`, `systemctl`) e inyectar respuestas falsas. De este modo, auditas cómo reacciona la lógica de tu script sin ejecutar jamás el comando real en el sistema host.

### ¿Para qué utilizar Karate Labs (BDD) si ya tengo Vitest, Pytest o Supertest evaluando el código?
Porque cumplen propósitos distintos:
*   **Vitest / Pytest (Caja Blanca/Gris):** Conocen tu código fuente. Prueban si una función específica de la base de datos o un algoritmo matemático devuelve el dato correcto.
*   **Karate Labs (Caja Negra):** No sabe de qué color es tu código ni en qué lenguaje está escrito. Ataca el puerto vivo de la aplicación (como un usuario real) y valida que el flujo de negocio completo (ej. Hacer login, agregar al carrito, recibir correo) funcione correctamente usando sintaxis Gherkin de lenguaje natural.

### ¿Qué son las Pruebas de Mutación (Stryker / mutmut)?
No prueban tu código, **prueban tus pruebas**. Herramientas como Stryker alteran intencionalmente el código fuente original (cambian un `>` por `<`, o un `true` por `false`) y corren tu suite de pruebas de nuevo. Si tus pruebas unitarias dicen "Todo pasó correctamente" a pesar de que el código fuente fue dañado deliberadamente, significa que tus pruebas son inútiles o tienen falsos positivos.

## 🚨 Resolución de Problemas (Troubleshooting)

### Docker se quedó sin espacio, está muy lento o las pruebas fallan porque detectan código viejo.
Los gestores como `pnpm` o `uv` y los contenedores de Docker acumulan capas invisibles, redes huérfanas y cachés de paquetes que pueden corromper el entorno. 

**Solución:** Cada entorno (`python/`, `fastapi/`, `node-backend/`, `vue3/`, `bash-scripts/`) incluye un script maestro llamado `limpiar.sh`. Ejecútalo como administrador:
```bash
sudo ./limpiar.sh
```
Esto purgará profunda y agresivamente dependencias huérfanas (`node_modules`, `dist`, reportes antiguos) y forzará un `docker system prune -af`, dejando tu ecosistema prístino para la siguiente ejecución.

### El contenedor E2E de Vue 3 (Playwright) se queja de un conflicto de red al intentar alcanzar la interfaz.
Asegúrate de haber levantado primero el servidor mock de producción en segundo plano. Playwright no compila tu aplicación; simplemente navega hacia ella. 
Debes ejecutar `docker compose up -d ui-prod` para encender Nginx en la red interna de Docker antes de lanzar el comando efímero de Playwright:
```bash
docker compose run --rm ui-e2e npx playwright test
```
