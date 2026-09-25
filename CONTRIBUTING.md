# Guía de Contribución

¡Gracias por tu interés en mejorar **QA Testing Blueprints**! Este repositorio es la fuente de la verdad para la calidad del código de nuestros proyectos. Si deseas proponer nuevas herramientas de prueba, mejorar los prompts de la IA o refinar las arquitecturas de Docker, sigue estas pautas.

## 📜 Reglas de Oro para Contribuir

Para mantener la consistencia y la eficacia de estos blueprints, toda contribución debe respetar los siguientes principios:

1. **Imágenes Base Inmutables:** Nunca propongas cambios que requieran agregar un `Dockerfile` local o la instrucción `build:` en los `docker-compose.yml`. Todo debe funcionar utilizando `sinfallas/base-python-uv:3.13` o `sinfallas/karatelabs:latest`.
2. **Efimeridad:** Los contenedores de prueba (excepto los servicios vivos como la API o Nginx) deben tener un ciclo de vida corto: nacen, ejecutan las pruebas, arrojan el reporte y se destruyen (usando `docker compose run --rm`).
3. **Prompts Imperativos:** Si modificas los archivos `.md` que consumirá la IA, usa lenguaje directo, autoritario y restrictivo. Las IAs necesitan límites claros (ej. "NUNCA hagas esto", "DEBES usar X para Y").

## 🛠️ Cómo proponer un cambio o agregar una herramienta

Si crees que nos falta una herramienta crítica (ej. pruebas de carga para WebSockets, o auditoría de seguridad para contenedores), sigue este flujo:

### 1. Preparación Local
1. Haz un *fork* del repositorio y crea una rama descriptiva (`git checkout -b feature/agregar-k6-stresstest`).
2. Modifica el archivo de configuración correspondiente (ej. agrega la dependencia al bloque `[dev]` en `pyproject.toml` o `package.json`).
3. Ajusta el orquestador si es necesario (`tox.ini` o `playwright.config.ts`).

### 2. Actualización del "Prompt" (El archivo Markdown)
Cualquier herramienta nueva debe estar documentada para que la IA sepa usarla. Edita el archivo `.md` de la carpeta correspondiente y asegúrate de:
* Agregar la herramienta a la sección **Pila Tecnológica Requerida**.
* Explicar en **Arquitectura de las Pruebas** en qué casos exactos la IA debe usar esta herramienta (para evitar solapamientos).
* Agregar el comando de ejecución exacto en la sección de **Comandos de Ejecución Local**.

### 3. Prueba de Humo (Smoke Test)
Antes de enviar tu código, levanta el entorno de la carpeta que modificaste:
1. Ejecuta el script de limpieza (`./limpiar.sh`) para asegurar que no hay cachés ocultos.
2. Ejecuta el nuevo comando que acabas de agregar al archivo `.md` y verifica que el contenedor efímero descargue la herramienta, la ejecute y devuelva un código de salida exitoso (o un reporte de fallo esperado).

### 4. Pull Request (PR)
Abre un PR detallando:
* **¿Qué tecnología estás agregando/modificando?**
* **¿Qué problema de calidad resuelve?**
* **Evidencia:** Adjunta un log de la terminal demostrando que el comando de prueba corre exitosamente dentro del ecosistema Docker preexistente.

Nuestros revisores evaluarán si la herramienta justifica el peso extra en la resolución de dependencias y si las instrucciones para la IA son lo suficientemente claras para no generar alucinaciones.
