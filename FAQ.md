# Preguntas Frecuentes (FAQ) - QA Testing Blueprints

Este documento resuelve las dudas arquitectónicas y los errores más comunes al implementar y ejecutar los ecosistemas de prueba estandarizados (10X) en este repositorio.

## 🏗️ Filosofía y Ejecución

### ¿Por qué no puedo ejecutar `npm install`, `pip install` o las pruebas directamente en mi máquina local?
Para garantizar **inmutabilidad y paridad absoluta con producción**. El problema de "en mi máquina sí funciona" suele deberse a versiones globales ocultas de Node, Python o variables de entorno residuales. Al forzar el uso de contenedores efímeros (`docker compose -f docker-compose.qa.yml run --rm`), el entorno nace completamente virgen, ejecuta la suite y se autodestruye.

### Todo mi código funciona y mi cobertura está en 100%, ¿por qué el pipeline sigue arrojando fallo?
Si superaste el 95% de cobertura, el pipeline ahora evalúa la **Deuda Técnica y Seguridad**. Es altamente probable que:
1. Herramientas como `SonarJS` (Node) o `Radon` (Python) detectaron **Complejidad Ciclomática** alta (Código Espagueti). Tendrás que refactorizar las funciones muy largas.
2. Fallaste los estándares de calidad de código visual (`Prettier`, `Ruff`).
3. Introdujiste vulnerabilidades detectadas por `ESLint Security` o `bandit`.
4. El rendimiento de Lighthouse (Vue3) bajó de 90.

### ¿Qué significa "contenedor efímero" y cómo guardo los reportes si el contenedor se borra?
Un contenedor efímero se crea dinámicamente con el flag `--rm`. Nace, ejecuta un comando único y muere. Los reportes (como la cobertura HTML o Flamegraphs de Profiling) no se pierden porque el `docker-compose.qa.yml` utiliza **volúmenes bind** (`- .:/app`), guardando los resultados directamente en tu disco duro físico.

## 🛡️ Herramientas y Casos Específicos

### ¿Por qué estoy obligado a usar librerías de Mocking (`nock`, `pytest-mock`) si la API a la que llamo es rápida?
Para garantizar el **determinismo y el aislamiento total**. Si tu prueba depende del internet o de una API de terceros que se cae temporalmente, tu prueba fallará (falso negativo) rompiendo el pipeline de CI/CD. Las pruebas unitarias jamás deben salir del contenedor.

### Estoy probando un script en Bash que formatea discos o reinicia servicios. ¿No es peligroso?
Es **extremadamente peligroso y está estrictamente prohibido**. Debes utilizar la técnica de *Mocking*. La imagen `sinfallas/base-bash-qa:latest` trae la librería `bats-mock` para interceptar binarios peligrosos e inyectar respuestas falsas.

### ¿Qué son las Pruebas de Mutación (Stryker / mutmut)?
No prueban tu código, **prueban tus pruebas**. Alteran intencionalmente el código fuente original (cambian un `>` por `<`, o un `true` por `false`) y corren tu suite de pruebas de nuevo. Si tus pruebas unitarias dicen "Todo pasó" a pesar del daño, significa que tus pruebas tienen falsos positivos (no están auditando nada realmente).

### ¿Para qué utilizar Karate Labs (BDD) si ya tengo Vitest, Pytest o Supertest evaluando el código?
Porque cumplen propósitos distintos. Vitest/Pytest prueban cajas blancas (conocen el código interno). Karate Labs evalúa cajas negras: ataca el puerto vivo de la aplicación emulando a un usuario real mediante lenguaje natural (Gherkin).

## 🚨 Resolución de Problemas (Troubleshooting)

### Docker me da "Permission Denied" o "ptrace(PTRACE_ATTACH)" al ejecutar Profilers (`clinic.js` o `py-spy`).
Por seguridad, el demonio de Docker bloquea la inspección de memoria entre procesos.
**Solución:** Asegúrate de que el servicio en el `docker-compose.qa.yml` tenga habilitados los privilegios del kernel:
```yaml
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp:unconfined
```

### Docker se quedó sin espacio, está muy lento o las pruebas fallan porque detectan código viejo.
Los contenedores y gestores acumulan cachés masivos. 
**Solución:** Ejecuta el script maestro de purga como administrador:
```bash
sudo ./limpieza.sh
```
Esto fuerza un `docker system prune -af` y borra reportes y dependencias huérfanas.

### El contenedor E2E de Vue 3 (Playwright / Lighthouse) se queja de un conflicto de red al intentar alcanzar la interfaz.
Asegúrate de haber levantado primero el servidor mock de producción en segundo plano ejecutando `docker compose -f docker-compose.qa.yml up -d ui-prod` antes de lanzar el comando efímero:
```bash
docker compose -f docker-compose.qa.yml run --rm ui-e2e npx playwright test
```
