# Solución de Problemas de Docker (Troubleshooting)

Este documento centraliza los fallos más comunes al operar con los *blueprints* de QA. Dado que nuestra arquitectura se basa en contenedores efímeros y volúmenes *bind*, la mayoría de los errores no provienen del código, sino de la interacción entre el demonio de Docker, la red interna y el sistema operativo anfitrión.

---

## 1. El Síndrome del Disco Lleno y las Redes Agotadas

**Síntoma:** 
Al intentar ejecutar una prueba, recibes errores como `no space left on device` o `could not find an available, non-overlapping IPv4 address pool`.

**¿Por qué sucede?**
Aunque usamos `docker compose -f docker-compose.qa.yml run --rm` (que elimina el contenedor al finalizar), Docker sigue almacenando en caché de forma agresiva:
1.  **Imágenes colgantes (Dangling images):** Versiones previas de `base-python-uv` o `base-bash-qa` que fueron actualizadas pero quedaron huérfanas en tu disco.
2.  **Redes Bridge:** Cada vez que levantas un entorno con `docker compose -f docker-compose.qa.yml up`, se crea una red virtual. Si el proceso se interrumpe abruptamente (ej. un corte eléctrico o un `Ctrl+C` agresivo), la red no se destruye, agotando el pool de direcciones IP (típicamente limitado a 31 redes simultáneas).

**La Solución:**
Ejecutar una purga profunda. Todos nuestros ecosistemas incluyen el archivo `limpiar.sh`.
```bash
# Limpia contenedores, redes huérfanas, imágenes sin uso y caché de compilación
sudo ./limpiar.sh
```
*Nota: Si estás depurando sin el script, el comando nativo equivalente es `docker system prune -af --volumes`.*

---

## 2. Permisos Denegados en Archivos Generados

**Síntoma:** 
Tus pruebas pasan, pero cuando intentas abrir el reporte de cobertura HTML en tu editor de código, o intentas borrar la carpeta `coverage_report/`, Linux te dice: `Permission denied`.

**¿Por qué sucede?**
Esto es un efecto secundario de los volúmenes *bind* (`- .:/app`). Si el contenedor efímero se ejecuta con el usuario `root` (el comportamiento por defecto en muchas imágenes Linux), los archivos que el contenedor crea físicamente en tu disco duro también le pertenecerán a `root`. Tu usuario local (ej. `ubuntu` o tu perfil de escritorio) no tiene privilegios para modificarlos.

**La Solución:**
Reclama la propiedad de los archivos en tu directorio de trabajo actual:
```bash
# Cambia el propietario de todos los archivos al usuario local actual
sudo chown -R $USER:$USER .
```
*Mejor Práctica:* El script `./limpiar.sh` incluido en nuestros *blueprints* ya incluye instrucciones con `sudo` o `rm -rf` ejecutadas como administrador precisamente para lidiar con la purga de estos artefactos bloqueados.

---

## 3. Salida Abrupta: "Exit Code 137" (OOM Killer)

**Síntoma:** 
El contenedor efímero muere repentinamente a mitad de la prueba arrojando un `Exit Code 137`. Esto suele ocurrir al correr pruebas E2E con **Playwright** (carpeta `vue3/`) o BDD con **Karate Labs**.

**¿Por qué sucede?**
El código 137 significa que el *OOM Killer* (Out Of Memory) del kernel de Linux asesinó al proceso porque consumió toda la memoria RAM disponible. Levantar múltiples instancias de navegadores Chromium (Playwright) o arrancar la Máquina Virtual de Java (Karate Labs) demanda enormes recursos en ráfagas cortas.

**La Solución:**
1.  **Limitar la concurrencia:** Instruye a tu herramienta para que no intente ejecutar tantas pruebas en paralelo.
    *   *Vitest/Playwright:* Ejecuta con `--workers=1` o `--threads=false`.
    *   *Karate:* Reduce el número de hilos (threads) en el comando de ejecución.
2.  **Ajustar los límites del host:** Si estás ejecutando Docker dentro de una Máquina Virtual, asegúrate de que tenga asignados al menos 4GB de RAM para ecosistemas UI/E2E.

---

## 4. Conflictos de Red: Puerto ya Asignado

**Síntoma:**
Al levantar la API de desarrollo o el servidor Nginx (`docker compose up -d`), Docker falla con: `Bind for 0.0.0.0:8000 failed: port is already allocated`.

**¿Por qué sucede?**
Un contenedor zombi de una sesión anterior sigue aferrado al puerto de tu máquina host, o tienes otro servicio (como un servidor de desarrollo local de Node o Python) ocupando el mismo puerto.

**La Solución:**
Identifica quién tiene secuestrado el puerto y destrúyelo.
```bash
# 1. Busca el contenedor que expone el puerto 8000 (o el que esté fallando)
docker ps | grep 8000

# 2. Mata el contenedor por su ID o Nombre (ej. fastapi_backend)
docker kill fastapi_backend

# 3. Baja toda la red del compose para asegurar un inicio limpio
docker compose -f docker-compose.qa.yml down
```

---

## 5. Docker Anidado: Ejecución en Contenedores LXC

**Síntoma:** 
Al intentar correr los *blueprints* dentro de un servidor de infraestructura basado en contenedores LXC, el demonio de Docker no arranca, los contenedores efímeros no tienen acceso a la red externa, o recibes errores de `TTY`.

**¿Por qué sucede?**
Un contenedor LXC comparte el kernel directamente con el host principal. Ejecutar Docker *dentro* de LXC se conoce como "virtualización anidada". Por seguridad, los perfiles de AppArmor y cgroups de los contenedores no privilegiados bloquean las operaciones de bajo nivel que Docker necesita para crear sus propias sub-redes virtuales.

**La Solución (Configuración del Host):**
Para que los *blueprints* de QA operen sin fricción en este entorno, el contenedor LXC debe tener habilitadas características específicas de anidamiento antes de arrancar.
1.  Asegúrate de que la configuración del contenedor LXC incluya las banderas de anidamiento (`nesting=1`).
2.  Verifica que `keyctl=1` esté activo si Docker tiene problemas manejando permisos.
3.  Usa `overlay2` como *storage driver* en la configuración de Docker (`/etc/docker/daemon.json`) para maximizar el rendimiento al escribir y borrar masivamente capas durante la creación y destrucción de los contenedores efímeros de QA.
