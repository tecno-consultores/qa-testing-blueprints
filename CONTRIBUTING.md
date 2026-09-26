# Guía de Contribución

¡Gracias por tu interés en mejorar **QA Testing Blueprints**! Este repositorio es la fuente de la verdad para la calidad del código de nuestros proyectos. Si deseas proponer nuevas herramientas de prueba, mejorar los prompts de la IA o refinar las arquitecturas de Docker, sigue estas pautas.

## 📜 Reglas de Oro para Contribuir

Para mantener la consistencia y la eficacia de estos blueprints, toda contribución debe respetar los siguientes principios:

1. **Imágenes Base Inmutables:** Nunca propongas cambios que requieran agregar un `Dockerfile` local o la instrucción `build:` en los `docker-compose.yml`. Todo debe funcionar utilizando exclusivamente nuestra flota de imágenes oficiales. Puedes y debes ajustar el tag de la imagen en el `docker-compose.yml` según la versión específica del lenguaje que requiera la prueba:
   * `sinfallas/base-python-uv:<tag>` (Tags disponibles: `3.10`, `3.11`, `3.12`, `3.13`, `3.14`,`latest`) para el Ecosistema Python/FastAPI.
   * `sinfallas/base-node-ionic:<tag>` (Tags disponibles: `22`, `23`, `24`, `25`, `latest`) para el Ecosistema Node.js/Vue 3.
   * `sinfallas/base-bash-qa:latest` para el Ecosistema Bash/DevOps.
   * `sinfallas/karatelabs:latest` para el Ecosistema BDD/Caja Negra.
2. **Efimeridad:** Los contenedores de prueba (excepto los servicios vivos) deben tener un ciclo de vida corto: nacen, instalan dependencias al vuelo, ejecutan las pruebas, arrojan el reporte y se destruyen (usando `docker compose run --rm`).
3. **Prompts Imperativos:** Si modificas los archivos `.md` que consumirá la IA, usa lenguaje directo, autoritario y restrictivo. Las IAs necesitan límites claros (ej. "NUNCA hagas esto", "DEBES usar X para Y").
4. **Umbral de Calidad (95%):** Toda nueva herramienta o entorno debe configurarse para hacer fallar el pipeline si la cobertura de código baja del 95%.

## 🛠️ Cómo proponer un cambio

### Si estás agregando una herramienta técnica
1. Haz un *fork* del repositorio y crea una rama descriptiva (`git checkout -b feature/agregar-k6-stresstest`).
2. Modifica el archivo de configuración correspondiente (`pyproject.toml`, `package.json`, etc.) y el orquestador `docker-compose.yml` si es estrictamente necesario (recuerda que puedes testear distintas versiones de lenguaje cambiando el tag de la imagen base).
3. Actualiza el archivo `.md` de la carpeta correspondiente documentando el comando de ejecución exacto para que la IA sepa usarlo.
4. Antes de hacer el Pull Request, ejecuta el script `./limpiar.sh` y lanza un Smoke Test local comprobando que tu herramienta funciona de manera efímera.

### Si estás mejorando la Documentación (`docs/` o `FAQ.md`)
1. Mantén la filosofía de "cero complacencia". Nuestra documentación es restrictiva y directa.
2. Si descubres un nuevo *Workaround* para Docker o una mejor integración con un servidor MCP / agente de IA, añade el ejemplo de código directamente en `docs/docker-troubleshooting.md` o `docs/ai-integration.md` respectivamente.
3. Asegúrate de que cualquier comando sugerido respete la regla de ejecución efímera.

### Pull Request (PR)
Abre un PR detallando:
* **¿Qué tecnología o documento estás modificando?**
* **¿Qué problema de calidad resuelve?**
* **Evidencia:** Adjunta un log de la terminal demostrando que el comando de prueba corre exitosamente dentro del ecosistema Docker preexistente.
