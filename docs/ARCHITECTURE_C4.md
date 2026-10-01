# Arquitectura del Ecosistema de Pruebas (Modelo C4)

Este documento describe gráficamente cómo interactúan las herramientas, contenedores y redes dentro de **QA Testing Blueprints**. Utilizamos una adaptación del Modelo C4 orientada a infraestructura efímera para ilustrar el aislamiento estricto de nuestras pruebas.

---

## Nivel 1: Diagrama de Contexto (System Context)
Muestra el panorama general: cómo los usuarios (o IAs) interactúan con el sistema de pruebas y cómo este se relaciona con la máquina anfitriona.

```mermaid
graph TD
    %% Entidades
    Dev["👨‍💻 Desarrollador / Agente IA"]
    QA["🛡️ QA Testing Blueprints (Docker Compose)"]
    Host["🖥️ Máquina Host (Proxmox / LXC / Local)"]
    Reports["📁 Reportes (Coverage, Flamegraphs, HTML)"]

    %% Relaciones (sintaxis robusta con comillas dobles)
    Dev -- "1. Lanza comandos efímeros (run --rm)" --> QA
    QA -- "2. Usa motor Docker y solicita permisos PTRACE" --> Host
    Host -- "3. Monta volúmenes bind (.:/app)" --> QA
    QA -- "4. Escribe artefactos al morir" --> Reports
    Reports -- "5. Analiza fallos para corregir" --> Dev

    classDef default fill:#111,stroke:#333,stroke-width:2px,color:#fff;
    classDef highlight fill:#0052cc,stroke:#003d99,stroke-width:2px,color:#fff;
    class QA highlight;
```

---

## Nivel 2: Diagrama de Contenedores (Container Diagram)
Muestra el interior del orquestador `docker-compose.qa.yml`. Destaca cómo separamos las responsabilidades en diferentes contenedores que conviven en una red virtual aislada para evitar conflictos de puertos en el host.

```mermaid
graph LR
    subgraph "Red Virtual Aislada (QA Bridge)"
        API["📦 App Viva (Modo Producción/Dev) \n (Nginx / Uvicorn / Node) \n Puerto Expuesto"]
        Test["🧪 Contenedor QA Efímero \n (Vitest, Pytest, SAST, Profilers) \n Muere al terminar"]
        Karate["🥋 Contenedor BDD \n (Karate Labs / Maven) \n Muere al terminar"]
    end

    %% Flujos Internos
    Test -- "Intercepción / Mocking de BD" --> Test
    Test -- "Pruebas de Estrés y CPU Profiling" --> API
    Karate -- "Peticiones HTTP Caja Negra" --> API

    classDef ephemeral fill:#b33a3a,stroke:#800000,stroke-width:2px,color:#fff,stroke-dasharray: 5 5;
    classDef live fill:#228b22,stroke:#006400,stroke-width:2px,color:#fff;
    class Test,Karate ephemeral;
    class API live;
```

---

## Nivel 3: Diagrama de Componentes (Component Diagram - Flujo Interno)
Hacemos un "zoom" dentro del **Contenedor QA Efímero** para entender la cadena de ejecución innegociable. Si un eslabón falla, el pipeline se aborta antes de ejecutar el siguiente (Principio de Fallo Rápido / Fail Fast).

*Nota: Este diagrama representa un ecosistema agnóstico aplicable tanto a Python como a Node/Vue.*

```mermaid
graph TD
    subgraph "Ejecución del Pipeline en el Contenedor Efímero"
        direction TB
        
        SAST["1️⃣ Auditoría de Seguridad \n (Bandit / npm audit / ESLint Security)"]
        Static["2️⃣ Deuda Técnica y Complejidad \n (Radon / SonarJS / Ruff)"]
        Unit["3️⃣ Lógica Unitaria y Mocking \n (Pytest / Vitest)"]
        Coverage{"4️⃣ Cobertura Total \n ¿Es >= 95%?"}
        Mutation["5️⃣ Pruebas de Mutación \n (Stryker / Mutmut)"]
        Performance["6️⃣ Profiling de Rendimiento \n (py-spy / clinic.js / Lighthouse)"]
    end

    %% Enlaces lógicos (sintaxis robusta con comillas dobles)
    SAST -- "Pasa" --> Static
    Static -- "Código Limpio" --> Unit
    Unit --> Coverage
    Coverage -- "Sí" --> Mutation
    Coverage -- "No (Exit Code 1)" --> FallaPipeline(("💥 Falla el PR"))
    Mutation -- "Mutantes Sobreviven" --> FallaPipeline
    Mutation -- "Pruebas Sólidas" --> Performance
    Performance --> Exito(("✅ Aprobado"))

    classDef pass fill:#2e8b57,stroke:#fff,color:#fff;
    classDef fail fill:#b22222,stroke:#fff,color:#fff;
    class Exito pass;
    class FallaPipeline fail;
```

---

## Patrones Arquitectónicos Clave

1. **Sidecar / Atacante-Defensor:** El `Contenedor QA Efímero` actúa como un atacante temporal que bombardea a la `App Viva`. Nunca instalamos herramientas de prueba dentro de la imagen de producción.
2. **Shift-Left Security:** (Nivel 3). Obligamos a ejecutar las validaciones estáticas (SAST y Complejidad) antes de gastar poder de cómputo corriendo pruebas matemáticas o de mutación pesadas.
3. **Blackbox Network Isolation:** El contenedor de BDD (Karate) no tiene acceso al código fuente. Su única forma de comunicarse con la aplicación es a través de peticiones TCP/IP puras en la red aislada, garantizando que el contrato de la API es válido en el mundo real.
