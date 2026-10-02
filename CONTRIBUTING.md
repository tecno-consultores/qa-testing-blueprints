# Guía de Contribución

¡Gracias por tu interés en mejorar **QA Testing Blueprints**! Este repositorio es la fuente de la verdad para la calidad del código de nuestros proyectos. Si deseas proponer nuevas herramientas de prueba, mejorar los prompts de la IA o refinar las arquitecturas de Docker, sigue estas pautas.

## 📜 Reglas de Oro para Contribuir (El Estándar 10X)

Para mantener la consistencia y la eficacia de estos blueprints, toda contribución debe respetar los siguientes principios:

1. **Imágenes Base Inmutables:** Nunca propongas cambios que requieran agregar un `Dockerfile` local o la instrucción `build:` en los orquestadores `docker-compose.qa.yml`. Todo debe funcionar utilizando exclusivamente nuestra flota de imágenes oficiales.
   * `sinfallas/base-python-uv:<tag>` (`3.10` a `latest`) para Python/FastAPI.
   * `sinfallas/base-node-ionic:<tag>` (`22` a `latest`) para Node.js/Vue 3.
   * `sinfallas/base-bash-qa:latest` para Bash/DevOps.
   * `sinfallas/karatelabs:latest` para BDD/Caja Negra.
2. **Efimeridad y Aislamiento Estricto:** Los contenedores de prueba (excepto los servicios vivos) deben tener un ciclo de vida corto (usando `--rm`). Las pruebas jamás deben salir a Internet a menos que sean explícitamente de integración; el Mocking (`nock`, `pytest-mock`) es obligatorio.
3. **Prompts Imperativos:** Si modificas los archivos `.md` que consumirá la IA, usa lenguaje directo, autoritario y restrictivo. Las IAs necesitan límites claros (ej. "NUNCA hagas esto", "DEBES usar X para Y").
4. **Umbral de Calidad y Deuda Técnica:** Toda nueva herramienta o entorno debe configurarse para hacer fallar el pipeline corporativo si no se cumplen estos tres pilares:
   * La cobertura de código baja del **95%**.
   * La complejidad ciclomática del código supera el grado **B** (vía Radon o SonarJS).
   * El rendimiento en frontend (Lighthouse) cae por debajo de **90**.

## 🛠️ Cómo proponer un cambio

### Si estás agregando una herramienta técnica
1. Haz un *fork* del repositorio, crea una rama descriptiva (`git checkout -b feature/agregar-k6-stresstest`) e **instala inmediatamente los hooks de seguridad locales** ejecutando `./instalar-hooks.sh` en tu terminal. Sin este paso, la arquitectura rechazará tus commits.
2. Modifica el archivo de configuración (`pyproject.toml.example`, `package.json.example`, etc.) y el orquestador `docker-compose.qa.yml` si es estrictamente necesario. *(Nota: Si agregas herramientas de Profiling como `py-spy` o `clinic.js`, recuerda incluir los privilegios `cap_add: - SYS_PTRACE` y `security_opt: - seccomp:unconfined`)*.
3. Actualiza el archivo `.md` documentando el comando de ejecución exacto para que la IA sepa usarlo.
4. Antes de hacer el Pull Request, ejecuta el script `./limpieza.sh` y lanza un Smoke Test local comprobando que tu herramienta funciona de manera efímera.

### Si estás mejorando la Documentación (`docs/` o `FAQ.md`)
1. Mantén la filosofía de "cero complacencia". Nuestra documentación es restrictiva y directa.
2. Si descubres un nuevo *Workaround* para Docker o una mejor integración con un servidor MCP / agente de IA, añade el ejemplo de código directamente en `docs/docker-troubleshooting.md` o `docs/ai-integration.md` respectivamente.
3. Asegúrate de que cualquier comando sugerido respete la regla de ejecución efímera.

### Pull Request (PR)
Abre un PR detallando:
* **¿Qué tecnología o documento estás modificando?**
* **¿Qué problema de calidad resuelve?**
* **Evidencia:** Adjunta un log de la terminal demostrando que el comando de prueba corre exitosamente dentro del ecosistema Docker preexistente sin fallos de permisos.
