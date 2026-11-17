> 🌐 **Idioma:** [🇺🇸 English (Canonical)](ARCHITECTURE_C4.md) · **Español (Espejo 1:1)**

# Arquitectura del Ecosistema de Pruebas (Modelo C4)

Este documento describe gráficamente cómo interactúan las herramientas, contenedores y redes dentro de **QA Testing Blueprints (`QA-11X v3.1`)**. Utilizamos una adaptación del Modelo C4 orientada a infraestructura efímera para ilustrar el aislamiento estricto de nuestras pruebas a lo largo de **10 stacks hidratables + `architecture/` + `mcp-server/` (= 12 entornos de matriz)**, incluyendo las capas de Seguridad Dinámica (DAST), Ingeniería del Caos, Mobile W3C Bridge (`sinfallas/base-mobile-appium:26`) y Observabilidad (Nivel 11X).

---

## Nivel 1: Diagrama de Contexto (System Context — Ecosistema Híbrido Humano + IA)
Muestra el panorama general: cómo los desarrolladores humanos y los agentes de IA interactúan con el sistema mediante el servidor MCP, las skills modulares y la ejecución efímera.

```mermaid
flowchart TD
    Human["Desarrollador / QA Staff"]
    Agent["Agente de IA (Antigravity, Claude, Cursor, Hermes)"]
    MCP["Servidor MCP Node.js/TS (@sinfallas/mcp-qa-11x v3.2.0)"]
    Skill["Skills Zero-Clone (11 Skills Modulares < 20 KB)"]
    Gate["Compuerta de Certificación 11X (certify_task_completion.sh - 10 Etapas)"]
    QA["QA Testing Blueprints (10 Stacks Hidratables + architecture/ + mcp-server/ = 12 Entornos de Matriz / Docker Efímero)"]
    Host["Máquina Host (Docker Engine)"]
    Reports["Reportes y Artefactos (Coverage, ZAP, Chaos, Métricas RED)"]

    Agent -->|"1. Consulta 13 Resources y ejecuta 19 Tools (stdio)"| MCP
    Agent -->|"2. Ingiere directivas y reglas"| Skill
    Human -->|"3. Instala skills (npx install-skill) o clona repo"| Skill
    Human -->|"4. Delega tareas / Pair Programming"| Agent
    MCP -->|"5. Orquesta validaciones efímeras (Rule Zero)"| QA
    Agent -->|"6. Ejecuta compuerta universal antes de commit"| Gate
    Human -->|"7. Lanza comandos (make qa-all)"| QA
    Gate -->|"8. Valida 10 etapas (secretos, Trivy, ORM, etc.)"| QA
    QA -->|"9. Ejecuta en imágenes sinfallas/* aisladas"| Host
    Host -->|"10. Monta volúmenes bind (.:/app)"| QA
    QA -->|"11. Emite reportes al morir el contenedor"| Reports
    Reports -->|"12. Ingeridos para auto-corrección"| Agent
    Reports -->|"13. Inspeccionados para auditoría"| Human

    classDef default fill:#111,stroke:#333,stroke-width:2px,color:#fff;
    classDef highlight fill:#0052cc,stroke:#003d99,stroke-width:2px,color:#fff;
    classDef barrier fill:#ff8c00,stroke:#b8860b,stroke-width:2px,color:#fff;
    classDef ai fill:#6b21a8,stroke:#9333ea,stroke-width:2px,color:#fff;
    class QA,Host highlight;
    class Gate barrier;
    class Agent,MCP,Skill ai;
```

---

## Nivel 2: Diagrama de Contenedores y Ecosistema MCP (Container Diagram)
Muestra la interacción entre los clientes de IA, el servidor MCP en Node.js/TypeScript y el orquestador `docker-compose.qa.yml` con su red virtual aislada y perfiles de ejecución.

```mermaid
flowchart LR
    subgraph ClientIDE["Entorno del Cliente / IDE"]
        Client["Cliente IA / IDE (Antigravity / Claude / Cursor)"]
        MCPServer["@sinfallas/mcp-qa-11x (stdio / Node >= 24)"]
        Client <-->|"JSON-RPC (stdio)"| MCPServer
    end

    subgraph QABridge["Red Virtual Aislada IPv4 (QA Bridge)"]
        API["App Viva (Nginx / Uvicorn / Node / PHP-FPM)"]
        Test["Contenedor QA Efímero (Vitest / Pytest / Pest, SAST)"]
        DB["PostgreSQL 17 (Persistencia Real, Alembic, RLS)"]
        KeyDB["KeyDB Multi-Hilo (Caché en Memoria, Rate Limit)"]
        Karate["Contenedor BDD / E2E (Karate 1.5.1 / Playwright)"]
        Mobile["Mobile W3C Bridge (sinfallas/base-mobile-appium:26 / APPIUM_HOME)"]
        ZAP["Contenedor DAST (OWASP ZAP Baseline)"]
        Pumba["Inyector de Caos (Pumba --profile chaos)"]
        Prometheus["Observabilidad (Prometheus --profile chaos)"]
        PushGW["Pushgateway (Caché de Métricas)"]
        Graphify["AST y Blast Radius (sinfallas/remote-graphify)"]
        Cache["Caché Persistente (pnpm-store / uv-cache / composer-cache)"]
    end

    MCPServer -->|"run_ephemeral_qa / certify_11x_gate"| Test
    MCPServer -->|"inspect_ast_blast_radius"| Graphify
    MCPServer -->|"clean_workspace_11x (Alpine efímero)"| Cache

    Test -->|"Lee/Escribe Dependencias"| Cache
    Test -->|"Aislamiento Unitario (Mocks de Red)"| Test
    Test -->|"Valida Esquemas y Migraciones Reales"| DB
    Test -->|"Operaciones Atómicas / Rate Limiting"| KeyDB
    API -->|"Persiste Datos con RLS"| DB
    API -->|"Consulta Caché de Sesiones"| KeyDB
    Test -->|"Pruebas de Estrés y CPU Profiling"| API
    Karate -->|"Peticiones HTTP Caja Negra (BDD)"| API
    Mobile -->|"Lee/Escribe pnpm-store"| Cache
    Mobile -->|"Contratos W3C / HTTP BFF"| API
    ZAP -->|"Inyección XSS/SQL y Cabeceras"| API
    Pumba -->|"Inyecta Latencia y Mata Contenedores"| API
    Test -->|"Empuja métricas (cURL)"| PushGW
    Prometheus -->|"Scrapea Métricas (/metrics)"| API
    Prometheus -->|"Scrapea"| PushGW
    Graphify -->|"Expone topología semántica AST"| API

    classDef ephemeral fill:#b33a3a,stroke:#800000,stroke-width:2px,color:#fff,stroke-dasharray: 5 5;
    classDef live fill:#228b22,stroke:#006400,stroke-width:2px,color:#fff;
    classDef chaos fill:#4b0082,stroke:#800080,stroke-width:2px,color:#fff,stroke-dasharray: 5 5;
    classDef ai fill:#d4af37,stroke:#8b6508,stroke-width:2px,color:#000;
    classDef obs fill:#e6522c,stroke:#8f3018,stroke-width:2px,color:#fff;
    classDef storage fill:#555,stroke:#999,stroke-width:2px,color:#fff;
    classDef datastore fill:#0052cc,stroke:#003366,stroke-width:2px,color:#fff;

    class Test,Karate,Mobile,ZAP ephemeral;
    class Pumba chaos;
    class API live;
    class DB,KeyDB datastore;
    class Graphify ai;
    class Prometheus,PushGW obs;
    class Cache storage;
```

---

## Nivel 3: Diagrama de Componentes (Component Diagram - Flujo Interno)
Cadena de ejecución innegociable de 13 capas más meta-compuertas transversales. Si un eslabón falla, el pipeline se aborta (Principio de Fallo Rápido).

```mermaid
flowchart TD
    subgraph Pipeline11X["Ejecución del Pipeline (Estándar 11X — Canon L01..L13)"]
        direction TB

        Blast["Transversal: Radio de Impacto, Topología AST y FINOS CALM"]
        L01["L01: Análisis Estático, Secretos e IaC (Ruff / ESLint / Trivy 0.76.2)"]
        L02["L02: Tipado Estricto y Complejidad (Mypy / Radon Grado A CC <= 5 / SonarJS / PHPStan)"]
        L03["L03: Pruebas Unitarias Aisladas (Pytest / Vitest / Pest / BATS)"]
        Coverage{"Compuerta L03: ¿Cobertura Total >= 95%?"}
        L04["L04: Esquema DB Real y Paridad ORM (Alembic / PostgreSQL 17 RLS)"]
        L05["L05: Contratos de Integración y Fuzzing (Pact V4 / Schemathesis)"]
        L06L07["L06-L07: Karate Labs API (Idempotency-Key) y UI HTTP/OSHP/SSG"]
        L08["L08: Pruebas de Mutación (Mutmut / Stryker / Infection MSI >= 80%)"]
        L09["L09: Playwright Screenplay, WCAG 2.1 AA, Geometría Visual y Lighthouse"]
        L10["L10: Rendimiento y Carga (grafana/k6:2.4.0 / Locust / Artillery)"]
        L11["L11: Seguridad Dinámica DAST (OWASP ZAP Baseline)"]
        L12["L12: Ingeniería del Caos y Métricas RED (Pumba + Prometheus)"]
        L13["L13: Fixtures Trimodales, Reloj 3 Fases y Compuerta 10/10"]
    end

    Blast -->|"Impacto Acotado y CALM OK"| L01
    L01 -->|"0 Secretos / 0 Críticos"| L02
    L02 -->|"Tipos Limpios y CC <= 5"| L03
    L03 --> Coverage
    Coverage -->|"Sí"| L04
    Coverage -->|"No (Exit Code 1)"| FallaPipeline(("Falla el Pipeline"))
    L04 -->|"0 Deriva de Esquema"| L05
    L05 -->|"Contratos Verificados"| L06L07
    L06L07 -->|"API y HTTP/OSHP Pasan"| L08
    L08 -->|"Mutantes Sobreviven"| FallaPipeline
    L08 -->|"MSI >= 80%"| L09
    L09 -->|"WCAG y Geometría Pasan"| L10
    L10 -->|"Sin Cuellos de Botella"| L11
    L11 -->|"Cabeceras Seguras"| L12
    L12 -->|"Métricas RED Estables"| L13
    L13 -->|"Certificado 10/10"| Exito(("Certificado 11X"))

    classDef pass fill:#2e8b57,stroke:#fff,color:#fff;
    classDef fail fill:#b22222,stroke:#fff,color:#fff;
    class Exito pass;
    class FallaPipeline fail;
```

---

## Patrones Arquitectónicos Clave

1. **Shift-Left Security:** Obligamos a ejecutar validaciones IaC (Trivy) y SAST (Lefthook) localmente antes de gastar poder de cómputo en CI/CD.
2. **Sidecar / Atacante-Defensor:** Herramientas como ZAP o Locust actúan como atacantes temporales que bombardean a la App Viva. Nunca se instalan dentro de la imagen de producción.
3. **Resiliencia por Caos (Chaos Engineering):** Probar si la API funciona no es suficiente. Usamos Pumba para degradar intencionalmente la red interna (Jitter, Packet Loss) y Prometheus para certificar que la latencia (P99) no se dispare indefinidamente.
4. **Blackbox Network Isolation (Fronteras):** Los contenedores BDD (Karate) o E2E (Playwright, `sinfallas/base-mobile-appium:26`) están estrictamente separados de las pruebas unitarias mediante convenciones de archivo (`.e2e.ts` vs `.unit.ts`). No tienen acceso al código fuente; se comunican por peticiones HTTP puras o protocolos W3C WebDriver simulando a un usuario real.
