# Arquitectura del Ecosistema de Pruebas (Modelo C4)

Este documento describe gráficamente cómo interactúan las herramientas, contenedores y redes dentro de **QA Testing Blueprints**. Utilizamos una adaptación del Modelo C4 orientada a infraestructura efímera para ilustrar el aislamiento estricto de nuestras pruebas, incluyendo las nuevas capas de Seguridad Dinámica (DAST), Ingeniería del Caos y Observabilidad (Nivel 11X).

---

## Nivel 1: Diagrama de Contexto (System Context — Ecosistema Híbrido Humano + IA)
Muestra el panorama general: cómo los desarrolladores humanos y los agentes de IA interactúan con el sistema mediante el servidor MCP, las skills y la ejecución efímera.

```mermaid
graph TD
    %% Entidades
    Human["👨‍💻 Desarrollador / QA Staff"]
    Agent["🤖 Agente de IA<br>(Antigravity, Claude, Cursor, Hermes)"]
    MCP["🧠 Servidor MCP Node.js/TS<br>(@sinfallas/mcp-qa-11x)"]
    Skill["⚡ Skills Zero-Clone<br>(qa-11x-architect / refactoring-ui)"]
    Gate["🚧 Compuerta de Certificación 11X<br>(certify_task_completion.sh - 10 Etapas)"]
    QA["🛡️ QA Testing Blueprints<br>(Makefiles / Docker Compose Efímero)"]
    Host["🖥️ Máquina Host (Docker Engine)"]
    Reports["📁 Reportes & Artefactos<br>(Coverage, ZAP, Chaos, Métricas RED)"]

    %% Relaciones
    Agent -- "1. Consulta 8 Resources & ejecuta 8 Tools (stdio)" --> MCP
    Agent -- "2. Ingiere directivas y reglas" --> Skill
    Human -- "3. Instala skills (npx install-skill) o clona repo" --> Skill
    Human -- "4. Delega tareas / Pair Programming" --> Agent
    MCP -- "5. Orquesta validaciones efímeras (Rule Zero)" --> QA
    Agent -- "6. Ejecuta compuerta universal antes de commit" --> Gate
    Human -- "7. Lanza comandos (make qa-all)" --> QA
    Gate -- "8. Valida 10 etapas (secretos, Trivy, ORM, etc.)" --> QA
    QA -- "9. Ejecuta en imágenes sinfallas/* aisladas" --> Host
    Host -- "10. Monta volúmenes bind (.:/app)" --> QA
    QA -- "11. Emite reportes al morir el contenedor" --> Reports
    Reports -- "12. Ingeridos para auto-corrección" --> Agent
    Reports -- "13. Inspeccionados para auditoría" --> Human

    classDef default fill:#111,stroke:#333,stroke-width:2px,color:#fff;
    classDef highlight fill:#0052cc,stroke:#003d99,stroke-width:2px,color:#fff;
    classDef barrier fill:#ff8c00,stroke:#b8860b,stroke-width:2px,color:#fff;
    classDef ai fill:#6b21a8,stroke:#9333ea,stroke-width:2px,color:#fff;
    class QA,Host highlight;
    class Gate,Hook barrier;
    class Agent,MCP,Skill ai;
```

---

## Nivel 2: Diagrama de Contenedores y Ecosistema MCP (Container Diagram)
Muestra la interacción entre los clientes de IA, el servidor MCP en Node.js/TypeScript y el orquestador `docker-compose.qa.yml` con su red virtual aislada y perfiles de ejecución.

```mermaid
graph LR
    subgraph "Entorno del Cliente / IDE"
        Client["🤖 Cliente IA / IDE<br>(Antigravity / Claude / Cursor)"]
        MCPServer["🧠 @sinfallas/mcp-qa-11x<br>(stdio / Node 20+)"]
        Client <-->|"JSON-RPC (stdio)"| MCPServer
    end

    subgraph "Red Virtual Aislada IPv4 (QA Bridge)"
        API["📦 App Viva \n (Nginx / Uvicorn / Node) \n Puerto Expuesto"]
        Test["🧪 Contenedor QA Efímero \n (Vitest/Pytest, SAST) \n Frontera: .unit.ts/.unit.py"]
        DB["🐘 PostgreSQL 17 \n (Persistencia Real, Alembic, RLS) \n Anti-Mock Blindness"]
        KeyDB["⚡ KeyDB Multi-Hilo \n (Caché en Memoria, Rate Limit) \n server-threads: 4"]
        Karate["🥋 Contenedor BDD / E2E \n (Karate Labs / Playwright) \n Frontera: .e2e.ts / .feature"]
        ZAP["🕷 Contenedor DAST \n (OWASP ZAP / zap-stable) \n Baseline Scan"]
        Pumba["🌪️ Inyector de Caos \n (Pumba) \n Perfil: --profile chaos"]
        Prometheus["📊 Observabilidad \n (Prometheus) \n Perfil: --profile chaos"]
        PushGW["📤 Pushgateway \n (Caché de Métricas) \n Perfil: --profile observability"]
        Graphify["🧠 AST & Blast Radius \n (sinfallas/remote-graphify) \n Perfil: --profile graphify"]
        Cache["🗄️ Caché Persistente \n (pnpm-store / uv-cache) \n Volumen Nombrado"]
    end

    %% Conexión MCP con Entorno Efímero
    MCPServer -- "run_ephemeral_qa / certify_11x_gate" --> Test
    MCPServer -- "inspect_ast_blast_radius" --> Graphify
    MCPServer -- "clean_workspace_11x (Alpine efímero)" --> Cache

    %% Flujos Internos
    Test -- "Lee/Escribe Dependencias" --> Cache
    Test -- "Aislamiento Unitario (Mocks de Red)" --> Test
    Test -- "Valida Esquemas y Migraciones Reales" --> DB
    Test -- "Operaciones Atómicas / Rate Limiting" --> KeyDB
    API -- "Persiste Datos con RLS" --> DB
    API -- "Consulta Caché de Sesiones" --> KeyDB
    Test -- "Pruebas de Estrés y CPU Profiling" --> API
    Karate -- "Peticiones HTTP Caja Negra (BDD)" --> API
    ZAP -- "Inyección XSS/SQL y Cabeceras" --> API
    Pumba -- "Inyecta Latencia y Mata Contenedores" --> API
    Test -- "Empuja métricas (cURL)" --> PushGW
    Prometheus -- "Scrapea Métricas (/metrics)" --> API
    Prometheus -- "Scrapea" --> PushGW
    Graphify -- "Expone topología semántica AST" --> API

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
graph TD
    subgraph "Ejecución del Pipeline (Estándar 11X - 13 Capas)"
        direction TB
        
        Blast["0️⃣ Radio de Impacto y AST \n (inspect_blast_radius.py / verify_topological_health)"]
        Obs["1️⃣ Instrumentación RED \n (Middleware o Pushgateway)"]
        IaC["2️⃣ Auditoría IaC y Secretos \n (Trivy / verificar-secretos.sh)"]
        SAST["3️⃣ Seguridad Estática \n (Bandit / ESLint Security)"]
        Static["4️⃣ Calidad y Complejidad \n (Radon <= B / SonarJS)"]
        Unit["5️⃣ Lógica Unitaria Aislada \n (Pytest / Vitest)"]
        Coverage{"6️⃣ Cobertura Total \n ¿Es >= 95%?"}
        Mutation["7️⃣ Pruebas de Mutación \n (Stryker / Mutmut)"]
        Parity["8️⃣ Paridad de Esquema Real \n (Alembic / PostgreSQL - verify_alembic_orm_parity)"]
        BDD["9️⃣ Comportamiento y Caja Negra \n (Karate Labs API & UI)"]
        Performance["🔟 Profiling de Rendimiento \n (py-spy / clinic.js)"]
        DAST["1️⃣1️⃣ Seguridad Dinámica \n (OWASP ZAP Baseline)"]
        Chaos["1️⃣2️⃣ Ingeniería del Caos \n (Pumba + Locust/Artillery)"]
    end

    %% Enlaces lógicos
    Blast -- "Impacto Acotado" --> Obs
    Obs -- "App Observable" --> IaC
    IaC -- "Infraestructura Segura" --> SAST
    SAST -- "Pasa" --> Static
    Static -- "Código Limpio" --> Unit
    Unit --> Coverage
    Coverage -- "Sí" --> Mutation
    Coverage -- "No (Exit Code 1)" --> FallaPipeline(("💥 Falla el Pipeline"))
    Mutation -- "Mutantes Sobreviven" --> FallaPipeline
    Mutation -- "Asertos Sólidos" --> Parity
    Parity -- "0 Esquemas Huérfanos" --> BDD
    BDD -- "Contratos Validados" --> Performance
    Performance -- "Sin Cuellos de Botella" --> DAST
    DAST -- "Cabeceras Seguras" --> Chaos
    Chaos -- "Métricas RED Estables" --> Exito(("✅ Certificado 11X"))

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
