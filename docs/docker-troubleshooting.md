# Solución de Problemas de Docker (Troubleshooting)

Este documento centraliza los fallos más comunes al operar con los *blueprints* de QA. Dado que nuestra arquitectura se basa en contenedores efímeros y volúmenes *bind*, la mayoría de los errores no provienen del código, sino de la interacción entre el demonio de Docker, la red interna y el sistema operativo anfitrión.

---

## 1. El Síndrome del Disco Lleno y las Redes Agotadas

**Síntoma:** 
Al intentar ejecutar una prueba, recibes errores como `no space left on device` o `could not find an available, non-overlapping IPv4 address pool`.

**¿Por qué sucede?**
Docker sigue almacenando en caché de forma agresiva: imágenes colgantes (Dangling images) o Redes Bridge no destruidas tras interrupciones abruptas.

**La Solución:**
Ejecutar la purga profunda:
```bash
sudo ./limpiar.sh
```

---

## 2. Permisos Denegados en Archivos Generados

**Síntoma:** 
Linux te dice: `Permission denied` al intentar manipular reportes generados.

**¿Por qué sucede?**
Efecto secundario de los volúmenes *bind*. El contenedor efímero se ejecuta con `root` y crea los archivos con ese propietario.

**La Solución:**
```bash
sudo chown -R $USER:$USER .
```

---

## 3. Salida Abrupta: "Exit Code 137" (OOM Killer)

**Síntoma:** 
El contenedor muere arrojando `Exit Code 137`. Suele ocurrir con Playwright o Karate Labs.

**¿Por qué sucede?**
El *OOM Killer* de Linux asesinó al proceso por consumir toda la memoria RAM.

**La Solución:**
Limitar la concurrencia (`--workers=1`) o asignar más RAM al entorno de Docker.

---

## 4. Conflictos de Red: Puerto ya Asignado

**Síntoma:**
Error `Bind for 0.0.0.0:8000 failed: port is already allocated`.

**La Solución:**
Mata el contenedor secuestrador y baja toda la red del compose.
```bash
docker ps | grep 8000
docker kill fastapi_backend
docker compose -f docker-compose.qa.yml down
```

---

## 5. Errores de Permisos al Ejecutar Profilers (SYS_PTRACE)

**Síntoma:**
Al utilizar herramientas avanzadas de análisis de recursos y profiling como `py-spy` en Python o `clinic.js` en Node.js, el contenedor falla con mensajes de permisos denegados o errores de `ptrace(PTRACE_ATTACH)`.

**¿Por qué sucede?**
Por defecto, Docker aplica un perfil estricto de `seccomp` que prohíbe que un proceso inspeccione la memoria de otro proceso mediante llamadas al sistema de bajo nivel.

**La Solución:**
Debes otorgar capacidades extendidas temporalmente al contenedor en tu archivo `docker-compose.qa.yml`:
```yaml
    cap_add:
      - SYS_PTRACE
```
