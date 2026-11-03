# Guía de Contribución (Ecosistema Híbrido Humano + Agentes IA)

¡Gracias por tu interés en mejorar **QA Testing Blueprints**! Este repositorio es la fuente de la verdad para la calidad del código, la seguridad por diseño y la gobernanza técnica de nuestros proyectos.

Este ecosistema está diseñado para ser desarrollado, mantenido y extendido tanto por **desarrolladores e ingenieros humanos** como por **Agentes de Inteligencia Artificial autónomos** (Google Antigravity, Anthropic Claude Code / Desktop, Hermes Agent de Nous Research, Cursor, Windsurf). Toda contribución debe respetar las directivas de calidad corporativa Nivel 11X.

---

## 📜 Reglas de Oro para Contribuir (El Estándar 11X)

Para mantener la consistencia y la eficacia de estos blueprints, toda contribución (humana o automatizada) debe respetar los siguientes principios:

1. **Imágenes Base Inmutables:** Nunca propongas cambios que requieran agregar un `Dockerfile` local o la instrucción `build:` en los orquestadores `docker-compose.qa.yml`. Todo debe funcionar utilizando exclusivamente nuestra flota de imágenes oficiales:
   * `sinfallas/base-python-uv` (`3.10` a `3.15`) para Python/FastAPI.
   * `sinfallas/base-node-ionic` (`22` a `26`) para Node.js/Vue 3 y el Servidor MCP.
   * `sinfallas/base-bash-qa:latest` para Bash/DevOps.
   * `sinfallas/karatelabs:latest` para BDD/Caja Negra.
   * `sinfallas/remote-graphify:latest` para Optimización de Contexto IA (análisis AST).
   * *Nota: Se permite el uso de imágenes oficiales consolidadas exclusivamente para Sidecars periféricos (ej. `prom/prometheus:latest`, `zaproxy/zap-stable:latest`, `postgres:17-alpine`, `eqalpha/keydb:alpine`).*
   * **REGLA DE CACHÉ:** Si agregas una imagen que dependa de un gestor de paquetes (`uv`, `pnpm`), DEBES declarar obligatoriamente volúmenes nombrados para sus cachés (ej. `/root/.cache/uv` o `/pnpm`) en el orquestador.

2. **Efimeridad Absoluta y Regla Cero (`Rule Zero`):** Toda ejecución de pruebas, linters o scripts debe ocurrir dentro de contenedores efímeros (usando `--rm`). Jamás ejecutes pruebas directamente en el host anfitrión. Las pruebas unitarias jamás deben salir a Internet; el Mocking (`nock`, `pytest-mock`) es obligatorio. Para persistencia y esquemas de base de datos rige la regla **Anti-Mock Blindness** (validación obligatoria contra base de datos real efímera).
3. **Prompts Imperativos y Optimización Bimodal:**
   * Las directivas internas para consumo de LLMs en `.agents/rules/` y `.agents/skills/` se redactan en **inglés técnico conciso de alta densidad** para ahorrar un 35% de tokens BPE.
   * Toda la documentación para humanos (`docs/`, `CHANGELOG.md`, `README.md`, `TESTING.md`) y respuestas de cara al usuario se redactan estrictamente en **español** (`OUTPUT LANGUAGE CONSTRAINT`).
4. **Umbral de Calidad y Deuda Técnica Innegociables:**
   * Cobertura de código unitario $\ge \mathbf{95\%}$ de líneas y ramas.
   * Complejidad ciclomática Grado **A** o **B** (`CC <= 5`, `MI >= B`).
   * Accesibilidad web WCAG 2.1 AA (0 violaciones en `@axe-core`) y rendimiento en Lighthouse $\ge \mathbf{90}$.
   * Cumplimiento estricto de **DISA ASD STIG V6R5** y **OWASP Developer Guide v4.2** documentadas en [`docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md`](docs/04_GUIA_DESARROLLO_SEGURO_Y_MITIGACION_DE_VULNERABILIDADES.md).
5. **IPv4 Estricto:** Toda configuración de red en los `docker-compose.qa.yml` debe utilizar exclusivamente el driver `bridge` estándar en IPv4. Prohibido habilitar `enable_ipv6: true` para evitar conflictos de enrutamiento y NAT.

---

## 🤖 Protocolo Obligatorio para Agentes de Inteligencia Artificial

Si eres un **Agente de IA** (o un desarrollador operando en conjunto con uno) contribuyendo a este repositorio, DEBES acatar incondicionalmente el siguiente ciclo:

1. **Lectura de Directivas:** Lee `.agents/rules/` y `AGENTS.md` antes de generar cualquier propuesta.
2. **Bitácora Activa:** Inicia o actualiza el archivo `.agents/ACTIVE_TASK.md` desglosando las fases de la tarea con casillas `- [ ]` en tiempo real.
3. **Inspección AST Preventiva:** Audita el radio de impacto de símbolos compartidos con `python3 .agents/scripts/inspect_blast_radius.py "<simbolo>"` antes de modificar código.
4. **Pirámide de Pruebas Obligatoria:** Todo código nuevo o modificado debe incorporar sus correspondientes pruebas unitarias ($\ge 95\%$) y escenarios BDD en Karate Labs (`api_test.feature` y `ui_business_flow.feature`).
5. **Compuerta Universal de Certificación (10/10):** Ejecuta `./.agents/scripts/certify_task_completion.sh` y asegura que las **10 etapas** pasen limpiamente antes de dar la tarea por concluida.
6. **Sincronización Criptográfica del Manifiesto:** Si agregas o modificas plantillas o archivos comunes, regenera `manifest.json` ejecutando `python3 scripts/generar-manifiesto.py` y verifica con `--check`.

---

## 🛠️ Cómo proponer un cambio

### Si estás agregando una herramienta técnica o modificando un stack
1. Haz un *fork* del repositorio, crea una rama descriptiva (`git checkout -b feature/agregar-k6-stresstest`) e **instala inmediatamente los hooks de seguridad locales** ejecutando `./instalar-hooks.sh` en tu terminal.
2. Modifica el archivo de configuración (`pyproject.toml.example`, `package.json.example`, etc.) y el orquestador `docker-compose.qa.yml` si es estrictamente necesario. *(Nota: Si agregas herramientas de Profiling como `py-spy` o `clinic.js`, recuerda incluir los privilegios `cap_add: - SYS_PTRACE` y `security_opt: - seccomp:unconfined`)*.
3. Actualiza la documentación correspondiente en `docs/` y los `Makefiles` documentando el comando de ejecución exacto.
4. Antes de hacer el commit o Pull Request, ejecuta el saneamiento `./scripts/limpieza.sh` y certifica la suite completa ejecutando `./.agents/scripts/certify_task_completion.sh` en local (**10 compuertas en verde**).

### Si estás mejorando la Documentación, MCP o Skills
1. Si mejoras el servidor MCP (`mcp-server/`), asegúrate de que pase `pnpm run lint`, `pnpm run typecheck` y que la cobertura de pruebas unitarias se mantenga en $\ge 95\%$.
2. Si actualizas skills en `.agents/skills/` (`qa-11x-architect`, `refactoring-ui`), mantén el formato estándar de `SKILL.md` y actualiza las referencias en `docs/specs/`.
3. Mantén la filosofía de "cero complacencia": la documentación es concisa, restrictiva y orientada a la erradicación de errores.

### Pull Request (PR)
Abre un PR detallando:
* **¿Qué tecnología, documento, herramienta MCP o skill estás modificando?**
* **¿Qué problema de calidad, seguridad o gobernanza resuelve?**
* **Evidencia:** Adjunta el log de la terminal demostrando que `./.agents/scripts/certify_task_completion.sh` pasó con éxito (10/10 etapas) y que las pruebas corren en Docker efímero sin requerir privilegios de superusuario en el host.
