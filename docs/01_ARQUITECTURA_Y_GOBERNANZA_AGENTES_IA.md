# 🤖 Arquitectura y Gobernanza de Agentes de Inteligencia Artificial (Nivel 11X)

> **PROPÓSITO:**  
> Este documento establece el estándar para orquestar, restringir y guiar a agentes de IA autónomos (Google Antigravity, Anthropic Claude Code / Claude Desktop, Hermes Agent de Nous Research, Cursor, Windsurf) para que operen como ingenieros Staff de QA y DevOps sin alucinaciones, sin deuda técnica y con total reproducibilidad.

---

## 1. De la Asistencia Pasiva a la Gobernanza Activa

Tratar a los modelos de lenguaje (LLMs) como simples autocompletadores de código genera código espagueti, mocks desconectados de la base de datos y regresiones silenciosas. En el estándar **11X**, el agente de IA es un operador autónomo sujeto a compuertas mecánicas estrictas:

```mermaid
graph TD
    A[Solicitud del Usuario] --> B[Agente de IA]
    B --> C{Lectura de Reglas .agents/rules/}
    C --> D[Diseño y Análisis de Radio de Impacto]
    D --> E[Implementación de Código]
    E --> F[Creación Obligatoria de Pruebas Multi-Capa]
    F --> G[Ejecución en Docker Efímero: Rule Zero]
    G --> H{¿Pasan Pruebas al 100% y Cobertura >= 95%?}
    H -- No --> E
    H -- Sí --> I[Compuerta certify_task_completion.sh]
    I --> J{¿Secretos = 0, Paridad ORM, Docs sincronizados?}
    J -- No --> K[Corrección Inmediata]
    K --> I
    J -- Sí --> L[Cierre Exitoso de Tarea]
```

---

## 2. La Estructura de Gobernanza `.agents/`

El directorio `.agents/` en la raíz de los proyectos representa el estándar moderno y portable de gobernanza:

1. **`rules/` (Reglas de Cumplimiento Innegociable):**
   - Directivas redactadas en Markdown que los agentes ingieren como System Prompts o reglas de proyecto.
   - Ejemplos: `mandatory_qa_pyramid_and_doc_sync.md`, `secure_development_and_testing_guidelines.md`, `anti_regression_and_side_effects_guardrail.md`.
2. **`skills/` (Habilidades y Playbooks de Dominio):**
   - Paquetes de instrucciones especializadas para flujos complejos (ej. `qa-11x-docker-certifier`, `docker-trivy-keydb-hardening`).
3. **`scripts/` (Compuertas Automatizadas en CLI):**
   - Scripts deterministas en Python y Bash que auditan el código antes de permitir el commit (`certify_task_completion.sh`, `verify_alembic_orm_parity.py`, `verify_zero_orphan_vue_components.py`).

---

## 3. Estrategia Lingüística y Optimización de Tokens ($\approx 35\%$ de Ahorro)

Un dilema común al gobernar agentes de IA es el idioma. En este ecosistema implementamos una **estrategia bimodal deliberada**:

### ¿Por qué las reglas internas están en inglés técnico de alta densidad?

1. **Economía de Tokens BPE (Byte-Pair Encoding):**
   - Los tokenizadores de frontera (Tiktoken de OpenAI, Claude Tokenizer, Gemini Tokenizer) fragmentan las palabras en español en un número significativamente mayor de tokens que el inglés técnico conciso.
   - Redactar `.agents/rules/` y `.agents/skills/` en inglés técnico ahorra aproximadamente un **35% de la ventana de contexto**, permitiendo que quepa más código fuente, esquemas de bases de datos y trazas de pruebas.
2. **Menor Latencia y Mayor Velocidad:**
   - Menos tokens de entrada equivalen a menor costo computacional y menor tiempo de respuesta por turno.
3. **Mayor Adherencia Lógica e Instruccional:**
   - Los modelos de frontera exhiben una adherencia más rigurosa a las directivas de seguridad y lógica cuando las restricciones están expresadas en la terminología canónica de la ingeniería de software (RFCs, **DISA ASD STIG V6R5**, **OWASP Developer Guide v4.2 / ASVS / WSTG / API Top 10 / OSHP / CycloneDX SBOM**, FIPS 140-3, ISO).

### Garantía de Salida en Español para Humanos (`OUTPUT LANGUAGE CONSTRAINT`)

Para asegurar una experiencia óptima para el equipo humano, todas las reglas incluyen la cláusula inviolable:
```markdown
> **OUTPUT LANGUAGE CONSTRAINT:**
> Always communicate with the user, provide status updates, explain reasoning,
> and write commit messages / user-facing documentation in Spanish.
```
Toda la documentación (`docs/`, `CHANGELOG.md`, `README.md`, `TESTING.md`) y las respuestas al usuario se mantienen estrictamente en español.

---

## 4. Compatibilidad Multi-Agente y Ecosistema MCP

Esta arquitectura funciona de forma nativa e idéntica en las principales herramientas de desarrollo asistido y agentes autónomos:

| Herramienta / Agente | Mecanismo de Ingestión MCP | Integración de Skills | Archivo de Entrada / Configuración |
| :--- | :--- | :--- | :--- |
| **Google Antigravity** | `mcp_config.json` (`npx -y @sinfallas/mcp-qa-11x@latest`) | Carga nativa en `.agents/skills/` | `.agents/` + `AGENTS.md` |
| **Anthropic Claude Code / Desktop** | `claude_desktop_config.json` (`stdio`) | `npx -y @sinfallas/mcp-qa-11x@latest install-skill --target claude` | `AGENTS.md` + `.agents/skills/` |
| **Hermes Agent (Nous Research)** | `config.yaml` (`mcp_servers`) | `npx -y @sinfallas/mcp-qa-11x@latest install-skill --target hermes` | `AI_MASTER_PROMPT.md` + `Makefile` |
| **Cursor / Windsurf** | `.cursor/mcp.json` (`mcpServers`) | `npx -y @sinfallas/mcp-qa-11x@latest install-skill --target cursor` | `AGENTS.md` y `.agents/rules/` |

---

## 5. El Servidor MCP Canónico (`@sinfallas/mcp-qa-11x`) y la Adopción Zero-Clone

Para evitar que los agentes deban clonar gigabytes de repositorios o saturar su ventana de contexto con cientos de archivos, el ecosistema se distribuye como servidor MCP oficial bajo el estándar de Anthropic / Linux Foundation:

1. **8 Recursos Dinámicos (`blueprint://*`):**
   - `blueprint://manifest`: Índice criptográfico con hashes SHA-256 de todos los stacks y archivos comunes.
   - `blueprint://core/philosophy`: Filosofía 11X y prompt maestro (`AI_MASTER_PROMPT.md`).
   - `blueprint://security/disa-owasp-22`: Síntesis técnica de los 22 patrones DISA ASD STIG V6R5 y OWASP v4.2.
   - `blueprint://{stack}/readme`: Especificación del stack solicitado (`fastapi`, `vue3`, `node-backend`, `python`, `react-frontend`, `bash-scripts`, `php`).
   - `blueprint://ui/refactoring-ui/{topic}`: Directivas tácticas visuales y WCAG 2.1 AA.
   - `blueprint://core/active-task-template`: Plantilla de seguimiento resiliente para agentes.
   - `blueprint://core/cleanup-script`: Script de saneamiento universal sin `sudo`.
   - `blueprint://core/roadmap-validator`: Validador de consistencia de hoja de ruta.

2. **10 Herramientas de Ejecución (`Tools`):**
   - `inspect_project_config`: Detección automática del stack y linters del proyecto usuario.
   - `fetch_blueprint_bundle`: Descarga quirúrgica de plantillas con validación de hashes SHA-256.
   - `bootstrap_or_merge_11x`: Fusión no destructiva inyectando configuraciones QA en proyectos existentes.
   - `inspect_ast_blast_radius`: Auditoría AST previa de radio de impacto para cambios en funciones o símbolos.
   - `clean_workspace_11x`: Purga segura de cachés y artefactos sin necesidad de privilegios `sudo`.
   - `audit_security_stig_owasp`: Auditoría estática de reglas DISA/OWASP (`SEC-01` a `SEC-10`) y Anti-JSDOM (`UI-11X-01`).
   - `run_ephemeral_qa`: Lanzamiento de pruebas en Docker efímero bajo la Regla Cero con retorno estructurado en JSON.
   - `certify_11x_gate`: Ejecución de la compuerta universal de certificación previa a la entrega de la tarea.
   - `audit_test_pyramid_gaps`: Auditoría de las 13 capas de la pirámide 11X, archivos huérfanos y plan de rescate priorizado.
   - `init_or_append_agents_md`: Inyector aditivo no destructivo del bloque conector QA 11X en `AGENTS.md`.

3. **Inyección de Skills en 1 Segundo (`install-skill`):**
   Cualquier agente puede autoinstalar las skills maestras (`qa-11x-architect` y `refactoring-ui`) ejecutando `npx -y @sinfallas/mcp-qa-11x@latest install-skill`, adquiriendo de inmediato todo el conocimiento corporativo 11X sin clonar el repositorio.

---

## 6. Colaboración Híbrida Humano + Agentes de IA

El estándar 11X no reemplaza al desarrollador humano ni lo relega a tareas secundarias; establece una simbiosis técnica estructurada:

* **El Rol del Humano:** Define requerimientos funcionales, valida la experiencia de usuario y aprueba decisiones arquitectónicas estratégicas.
* **El Rol del Agente de IA:** Asume el rol de Staff QA & DevOps Automation Engineer. Audita el radio de impacto AST, implementa código siguiendo tipado estricto, genera obligatoriamente pruebas unitarias y de integración ($\ge 95\%$), diseña escenarios BDD en Karate Labs, ejecuta la suite en Docker efímero (`Rule Zero`) y mantiene sincronizada la documentación técnica.
* **La Compuerta Objetiva:** Ni el humano ni el agente pueden eludir la compuerta universal de certificación. El pase de calidad se determina por asertos verificados, no por opiniones o complacencia.

---

## 7. El Protocolo de Cierre Obligatorio (Task Closure Gate — 10 Etapas)

Para erradicar el hábito de los agentes de dar tareas por terminadas con pruebas a medias o documentación desfasada, el agente debe ejecutar de forma implacable el protocolo de cierre:

1. **Creación Obligatoria de Pruebas 11X:** Ningún código nuevo puede carecer de pruebas unitarias (`>= 95%`) ni de escenarios BDD en Karate Labs para API y UI.
2. **Ejecución en Docker Efímero (`Rule Zero`):** Toda la suite debe ejecutarse y pasar al 100% dentro de contenedores efímeros (`make qa-all`).
3. **Sincronización Documental Continua:** Actualizar `docs/`, `CHANGELOG.md` (bajo `## [Unreleased]`), `ROADMAP.md`, `TESTING.md`, `README.md` y marcar `.agents/ACTIVE_TASK.md` como `COMPLETED (100%)`.
4. **Compuerta Universal de Certificación (10/10):** Ejecutar `./.agents/scripts/certify_task_completion.sh` verificando:
   - Secret Scanning (`verificar-secretos.sh`).
   - Auditoría de infraestructura y CVEs (Trivy, `auditar-infra.sh`).
   - Anti-colisión en claves de diccionarios JSON.
   - Cero componentes UI huérfanos sin pruebas unitarias.
   - Cero endpoints de API huérfanos entre frontend y backend.
   - Salud topológica y límites arquitectónicos AST.
   - Paridad ORM entre modelos SQLAlchemy y migraciones Alembic.
   - Sincronización criptográfica del manifiesto SHA-256 (`manifest.json`).
   - Consistencia estricta de `ROADMAP.md` y `ACTIVE_TASK.md`.
   - Sincronización incondicional de documentación y pruebas obligatorias.

Si cualquiera de los pasos falla, el agente tiene prohibido cerrar el turno.

---

## 8. Evolución Continua del Agente (`continuous_agent_evolution.md`)

Los agentes no deben ser estáticos. Si durante el desarrollo descubren:
- Una trampa recurrente (ej. un linter que falla por una regla de comillas),
- Una biblioteca que requiere un mock especial,
- Una oportunidad de optimizar el consumo de tokens o simplificar un procedimiento,

el agente tiene la directiva explícita de **actualizar de forma autónoma las reglas y skills** en `.agents/`, documentando el cambio en el `CHANGELOG.md`. De esta forma, el sistema "aprende" y transfiere el conocimiento a sesiones futuras.
