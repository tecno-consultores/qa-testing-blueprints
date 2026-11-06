# Arquitectura del Ecosistema de Pruebas (Modelo C4)

Este documento describe gráficamente cómo interactúan las herramientas, contenedores y redes dentro de **QA Testing Blueprints**. Utilizamos una adaptación del Modelo C4 orientada a infraestructura efímera para ilustrar el aislamiento estricto de nuestras pruebas, incluyendo las nuevas capas de Seguridad Dinámica (DAST), Ingeniería del Caos y Observabilidad (Nivel 11X).

---

## Nivel 1: Diagrama de Contexto (System Context — Ecosistema Híbrido Humano + IA)
Muestra el panorama general: cómo los desarrolladores humanos y los agentes de IA interactúan con el sistema mediante el servidor MCP, las skills y la ejecución efímera.

```mermaid
flowchart TD
    Human["Desarrollador / QA Staff"]
    Agent["Agente de IA (Antigravity, Claude, Cursor, Hermes)"]
    MCP["Servidor MCP Node.js/TS (@sinfallas/mcp-qa-11x)"]
    Skill["Skills Zero-Clone (qa-11x-architect / refactoring-ui)"]
    Gate["Compuerta de Certificacion 11X (certify_task_completion.sh - 10 Etapas)"]
    QA["QA Testing Blueprints (Makefiles / Docker Compose Efimero)"]
    Host["Maquina Host (Docker Engine)"]
    Reports["Reportes y Artefactos (Coverage, ZAP, Chaos, Metricas RED)"]

    Agent -->|"1. Consulta 8 Resources y ejecuta 12 Tools (stdio)"| MCP
    Agent -->|"2. Ingiere directivas y reglas"| Skill
    Human -->|"3. Instala skills (npx install-skill) o clona repo"| Skill
    Human -->|"4. Delega tareas / Pair Programming"| Agent
    MCP -->|"5. Orquesta validaciones efimeras (Rule Zero)"| QA
    Agent -->|"6. Ejecuta compuerta universal antes de commit"| Gate
    Human -->|"7. Lanza comandos (make qa-all)"| QA
    Gate -->|"8. Valida 10 etapas (secretos, Trivy, ORM, etc.)"| QA
    QA -->|"9. Ejecuta en imagenes sinfallas/* aisladas"| Host
    Host -->|"10. Monta volumenes bind (.:/app)"| QA
    QA -->|"11. Emite reportes al morir el contenedor"| Reports
    Reports -->|"12. Ingeridos para auto-correccion"| Agent
    Reports -->|"13. Inspeccionados para auditoria"| Human

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
    subgraph ClienteIDE["Entorno del Cliente / IDE"]
        Client["Cliente IA / IDE (Antigravity / Claude / Cursor)"]
        MCPServer["@sinfallas/mcp-qa-11x (stdio / Node 20+)"]
        Client <-->|"JSON-RPC (stdio)"| MCPServer
    end

    subgraph RedQABridge["Red Virtual Aislada IPv4 (QA Bridge)"]
        API["App Viva (Nginx / Uvicorn / Node / PHP-FPM)"]
        Test["Contenedor QA Efimero (Vitest / Pytest / Pest, SAST)"]
        DB["PostgreSQL 17 (Persistencia Real, Alembic, RLS)"]
        KeyDB["KeyDB Multi-Hilo (Cache en Memoria, Rate Limit)"]
        Karate["Contenedor BDD / E2E (Karate Labs / Playwright)"]
        ZAP["Contenedor DAST (OWASP ZAP Baseline)"]
        Pumba["Inyector de Caos (Pumba --profile chaos)"]
        Prometheus["Observabilidad (Prometheus --profile chaos)"]
        PushGW["Pushgateway (Cache de Metricas)"]
        Graphify["AST y Blast Radius (sinfallas/remote-graphify)"]
        Cache["Cache Persistente (pnpm-store / uv-cache / composer-cache)"]
    end

    MCPServer -->|"run_ephemeral_qa / certify_11x_gate"| Test
    MCPServer -->|"inspect_ast_blast_radius"| Graphify
    MCPServer -->|"clean_workspace_11x (Alpine efimero)"| Cache

    Test -->|"Lee/Escribe Dependencias"| Cache
    Test -->|"Aislamiento Unitario (Mocks de Red)"| Test
    Test -->|"Valida Esquemas y Migraciones Reales"| DB
    Test -->|"Operaciones Atomicas / Rate Limiting"| KeyDB
    API -->|"Persiste Datos con RLS"| DB
    API -->|"Consulta Cache de Sesiones"| KeyDB
    Test -->|"Pruebas de Estres y CPU Profiling"| API
    Karate -->|"Peticiones HTTP Caja Negra (BDD)"| API
    ZAP -->|"Inyeccion XSS/SQL y Cabeceras"| API
    Pumba -->|"Inyecta Latencia y Mata Contenedores"| API
    Test -->|"Empuja metricas (cURL)"| PushGW
    Prometheus -->|"Scrapea Metricas (/metrics)"| API
    Prometheus -->|"Scrapea"| PushGW
    Graphify -->|"Expone topologia semantica AST"| API

    classDef ephemeral fill:#b33a3a,stroke:#800000,stroke-width:2px,color:#fff,stroke-dasharray: 5 5;
    classDef live fill:#228b22,stroke:#006400,stroke-width:2px,color:#fff;
    classDef chaos fill:#4b0082,stroke:#800080,stroke-width:2px,color:#fff,stroke-dasharray: 5 5;
    classDef ai fill:#d4af37,stroke:#8b6508,stroke-width:2px,color:#000;
    classDef obs fill:#e6522c,stroke:#8f3018,stroke-width:2px,color:#fff;
    classDef storage fill:#555,stroke:#999,stroke-width:2px,color:#fff;
    classDef datastore fill:#0052cc,stroke:#003366,stroke-width:2px,color:#fff;

    class Test,Karate,ZAP ephemeral;
    class Pumba chaos;
    class API live;
    class DB,KeyDB datastore;
    class Graphify ai;
    class Prometheus,PushGW obs;
    class Cache storage;
```

---

## Nivel 3: Diagrama de Componentes (Component Diagram - Flujo Interno)
Cadena de ejecución innegociable de 13 capas. Si un eslabón falla, el pipeline se aborta (Principio de Fallo Rápido).

```mermaid
flowchart TD
    subgraph Pipeline11X["Ejecucion del Pipeline (Estandar 11X - 13 Capas)"]
        direction TB

        Blast["0. Radio de Impacto y AST (inspect_blast_radius.py)"]
        Obs["1. Instrumentacion RED (Middleware o Pushgateway)"]
        IaC["2. Auditoria IaC y Secretos (Trivy / verificar-secretos.sh)"]
        SAST["3. Seguridad Estatica (Bandit / ESLint Security / Psalm)"]
        Static["4. Calidad y Complejidad (Radon <= B / SonarJS / PHPStan)"]
        Unit["5. Logica Unitaria Aislada (Pytest / Vitest / Pest)"]
        Coverage{"6. Cobertura Total >= 95%?"}
        Mutation["7. Pruebas de Mutacion (Stryker / Mutmut / Infection)"]
        Parity["8. Paridad de Esquema Real (Alembic / PostgreSQL 17)"]
        BDD["9. Comportamiento y Caja Negra (Karate Labs API y UI)"]
        Performance["10. Profiling de Rendimiento (py-spy / clinic.js)"]
        DAST["11. Seguridad Dinamica (OWASP ZAP Baseline)"]
        Chaos["12. Ingenieria del Caos (Pumba + Locust / Artillery)"]
    end

    Blast -->|"Impacto Acotado"| Obs
    Obs -->|"App Observable"| IaC
    IaC -->|"Infraestructura Segura"| SAST
    SAST -->|"Pasa"| Static
    Static -->|"Codigo Limpio"| Unit
    Unit --> Coverage
    Coverage -->|"Si"| Mutation
    Coverage -->|"No (Exit Code 1)"| FallaPipeline(("Falla el Pipeline"))
    Mutation -->|"Mutantes Sobreviven"| FallaPipeline
    Mutation -->|"Asertos Solidos"| Parity
    Parity -->|"0 Esquemas Huerfanos"| BDD
    BDD -->|"Contratos Validados"| Performance
    Performance -->|"Sin Cuellos de Botella"| DAST
    DAST -->|"Cabeceras Seguras"| Chaos
    Chaos -->|"Metricas RED Estables"| Exito(("Certificado 11X"))

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
4. **Blackbox Network Isolation (Fronteras):** Los contenedores BDD (Karate) o E2E (Playwright) están estrictamente separados de las pruebas unitarias mediante convenciones de archivo (`.e2e.ts` vs `.unit.ts`). No tienen acceso al código fuente; se comunican por peticiones HTTP puras simulando a un usuario real.
