# Preguntas Frecuentes (FAQ) - QA Testing Blueprints

Este documento resuelve las dudas arquitectónicas y los errores más comunes al implementar y ejecutar los ecosistemas de prueba estandarizados en este repositorio.

## 🏗️ Filosofía y Ejecución

### ¿Por qué no puedo ejecutar `npm install`, `pip install` o las pruebas directamente en mi máquina local?
Para garantizar **inmutabilidad y paridad absoluta con producción**. El problema de "en mi máquina sí funciona" suele deberse a versiones globales ocultas de Node, Python o variables de entorno residuales en tu sistema operativo. Al forzar el uso de contenedores efímeros (`docker compose run --rm`), el entorno de pruebas nace completamente virgen, instala dependencias estrictamente definidas, ejecuta la suite y se autodestruye.
> 📖 *Lee más en [`docs/qa-philosophy.md`](docs/qa-philosophy.md).*

### Todo mi código funciona y hace lo que debe, ¿por qué el pipeline arroja un error de fallo?
Es altamente probable que tu código no haya superado la **regla estricta del 95% de cobertura**. No basta con que el "camino feliz" funcione. Nuestras configuraciones (`pytest-cov` para Python, `Vitest` para Node/Vue3, y `kcov` para Bash) están programadas para fallar el pipeline si dejas bloques `catch`, condiciones `if/else` o funciones auxiliares sin probar. 

### ¿Qué significa "contenedor efímero" y cómo guardo los reportes si el contenedor se borra?
Un contenedor efímero se crea dinámicamente con el flag `--rm`. Nace, ejecuta un comando único y muere. Los reportes no se pierden porque el `docker-compose.yml` utiliza **volúmenes bind** (`- .:/app`), lo que significa que el contenedor guarda los resultados directamente en tu disco duro físico antes de destruirse.

## 🛡️ Herramientas y Casos Específicos

### Estoy probando un script en Bash que formatea discos (`fdisk`) o reinicia servicios de red (`systemctl`). ¿No es peligroso ejecutar esto, incluso en Docker?
Es **extremadamente peligroso y está estrictamente prohibido**. Para probar scripts destructivos, debes utilizar la técnica de *Mocking*. La imagen `sinfallas/base-bash-qa:latest` ya trae preinstalada la librería `bats-mock`. Debes configurar tus pruebas en BATS para interceptar binarios peligrosos e inyectar respuestas falsas.

### ¿Para qué utilizar Karate Labs (BDD) si ya tengo Vitest, Pytest o Supertest evaluando el código?
Porque cumplen propósitos distintos. Vitest/Pytest prueban cajas blancas (conocen el código y auditan funciones matemáticas o de BD). Karate Labs evalúa cajas negras: ataca el puerto vivo de la aplicación emulando a un usuario real mediante lenguaje natural (Gherkin).

### ¿Qué son las Pruebas de Mutación (Stryker / mutmut)?
No prueban tu código, **prueban tus pruebas**. Herramientas como Stryker alteran intencionalmente el código fuente original (cambian un `>` por `<`, o un `true` por `false`) y corren tu suite de pruebas de nuevo. Si tus pruebas unitarias dicen "Todo pasó" a pesar del daño, significa que tus pruebas tienen falsos positivos.

## 🚨 Resolución de Problemas (Troubleshooting)

### Docker se quedó sin espacio, está muy lento o las pruebas fallan porque detectan código viejo.
Los contenedores y gestores de paquetes acumulan cachés masivos. 
**Solución:** Ejecuta el script maestro de purga como administrador:
```bash
sudo ./limpiar.sh
```
Esto fuerza un `docker system prune -af` y borra dependencias huérfanas.

### El contenedor E2E de Vue 3 (Playwright) se queja de un conflicto de red al intentar alcanzar la interfaz.
Asegúrate de haber levantado primero el servidor mock de producción en segundo plano ejecutando `docker compose up -d ui-prod` antes de lanzar el comando efímero de Playwright:
```bash
docker compose run --rm ui-e2e npx playwright test
```

> 🛠️ **¿Tienes errores extraños de red, Exit Code 137, o estás usando Proxmox/LXC?** 
> Consulta nuestra guía avanzada en [`docs/docker-troubleshooting.md`](docs/docker-troubleshooting.md).
