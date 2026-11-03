# Especificación Técnica 10: Ecosistema PHP 8.1–8.5 (`sinfallas/basephpcomposer`), Blueprints 11X e Integración en Servidor MCP

**Estado:** Aprobado para Implementación (Hito 11)  
**Versión:** 1.0.0  
**Autor:** Arquitectura QA 11X  
**Modelo Ejecutor Objetivo:** Gemini 3.8 Flash High  

---

## 1. Propósito y Alcance

Esta especificación define la arquitectura técnica, las plantillas canónicas del directorio `php/` y las extensiones del servidor MCP (`@sinfallas/mcp-qa-11x`) para incorporar a **PHP (versiones 8.1, 8.2, 8.3, 8.4 y 8.5)** como ciudadano de primera clase dentro del estándar corporativo **QA Testing Blueprints (Nivel 11X)**.

El diseño aprovecha la flota de imágenes Docker multi-arquitectura (`linux/amd64` y `linux/arm64`) **[`sinfallas/basephpcomposer`](https://hub.docker.com/r/sinfallas/basephpcomposer)** (tags `8.1`, `8.2`, `8.3`, `8.4`, `8.5` y `latest`), garantizando el cumplimiento absoluto de la **Regla Cero (`Rule Zero`)**, las **13 capas de la pirámide de calidad 11X** y los **22 controles normativos DISA ASD STIG V6R5 + OWASP Developer Guide v4.2**.

> **DIRECTIVAS CRÍTICAS DE IMPLEMENTACIÓN PARA GEMINI 3.8 FLASH HIGH (HITO 11):**
> 1. **Cero Advertencias de Linter (`--max-warnings 0`):** En `mcp-server/`, ESLint ejecuta `eslint-plugin-sonarjs` y `eslint-plugin-security`. Cualquier warning rompe el build.
> 2. **Complejidad Cognitiva (`sonarjs/cognitive-complexity <= 15`):** Nunca anides múltiples `if/else` o bucles dentro de una sola función. Extrae funciones auxiliares pequeñas (`inspectPhpStack`, `mergeComposerJson`, `parseInfectionSummary`, etc.) tal como se entregan en esta especificación.
> 3. **Cero Cadenas Duplicadas (`sonarjs/no-duplicate-string`):** Define constantes en la cabecera del módulo (`const COMPOSER_JSON = 'composer.json';`, `const PHP_EXT = '.php';`) cuando un literal de cadena de $\ge 10$ caracteres o con separadores se utilice 3 o más veces.
> 4. **Seguridad de Ejecución (`DISA APSC-DV-002510`):** Prohibido usar `exec` o `shell: true` en TypeScript; usa exclusivamente `execFile(..., { shell: false })`.
> 5. **Cobertura Innegociable ($\ge 95.0\%$):** Todas las métricas de Vitest (`lines`, `branches`, `functions`, `statements`) en `mcp-server/` y de `tests/test_generar_manifiesto.unit.py` deben mantenerse $\ge 95.0\%$ ejecutadas dentro de contenedores efímeros `sinfallas/*`.

---

## 2. Arquitectura de la Imagen Base Oficial (`sinfallas/basephpcomposer:8.1-8.5`)

La imagen base oficial [`sinfallas/basephpcomposer`](https://hub.docker.com/r/sinfallas/basephpcomposer) está construida sobre `php:8.x-fpm-alpine` para arquitecturas `amd64` y `arm64`, e incluye pre-compiladas las extensiones nativas necesarias para que los contenedores efímeros de QA arranquen en $< 1\text{ s}$ sin compilar paquetes C en tiempo de prueba:

* **Extensiones C/PECL Preinstaladas:**
  * `pcov`: Motor ligero de cobertura de código en C (10x a 30x más rápido que Xdebug para alcanzar $\ge 95\%$ de cobertura en Pest / PHPUnit).
  * `redis`: Cliente nativo en C para conectar a alta velocidad con **KeyDB Multi-Threaded** (`eqalpha/keydb:alpine`) en gestión de sesiones concurrentes, bloqueo de cuentas e `Idempotency-Key`.
  * `pdo_pgsql` y `pgsql`: Drivers nativos para verificación real contra `postgres:17-alpine` y políticas **Row-Level Security (`FORCE RLS`)**.
  * `intl`: Extensión ICU indispensable para canonicalización Unicode **`\Normalizer::FORM_KC`** (`DISA APSC-DV-002520`).
  * `sodium` y `openssl`: Criptografía autenticada **AES-256-GCM**, **Argon2id** y zeroización nativa de secretos en RAM con **`sodium_memzero()`** (`DISA APSC-DV-002590`).
  * `opcache`: Con `opcache.save_comments=1` (preserva atributos PHP 8 `#[Route]` / DocBlocks para Doctrine, Symfony, Laravel y Swagger-PHP) y JIT (`opcache.jit=tracing`).
  * `gd` (con WebP, AVIF, JPEG, FreeType), `zip`, `sockets` (para clientes AMQP/Prometheus/Pumba), `exif`.
* **Gobernanza No-Root y Composer:**
  * Usuario sin privilegios `www` (`UID 1000`, `GID 1000`), `WORKDIR /var/www`.
  * Binario `/usr/bin/composer` con permisos `0755` y variables `COMPOSER_MEMORY_LIMIT=-1`, `COMPOSER_NO_INTERACTION=1`.
  * Configuración endurecida en `/usr/local/etc/php/conf.d/custom.ini` (`expose_php=Off`, `memory_limit=2048M`, `session.cookie_httponly=1`, `session.cookie_samesite=Strict`, `session.use_strict_mode=1`, `session.sid_length=48`).

---

## 3. Matriz de las 13 Capas de Calidad 11X para PHP (8.1–8.5)

| Capa | Dominio / Objetivo | Herramientas Canónicas PHP | Umbral / Invariante 11X | Meta `Makefile` |
| :---: | :--- | :--- | :--- | :--- |
| **01** | **Análisis Estático, Formato y SAST** | `friendsofphp/php-cs-fixer` (`@PER-CS2.0`), `vimeo/psalm` (`--taint-analysis`), `composer audit` | **0 errores de estilo, 0 alertas SAST Taint, 0 CVEs High/Critical** | `make qa-lint` |
| **02** | **Tipado Estricto y Complejidad** | `declare(strict_types=1);` + `phpstan/phpstan` (`level: max` + `phpstan-strict-rules`) + `tomasvotruba/cognitive-complexity` | **0 errores de tipos, Complejidad Cognitiva por método $\le 9$ (Grado A)** | `make qa-lint` |
| **03** | **Pruebas Unitarias Aisladas** | `pestphp/pest` (o `phpunit/phpunit` 11/12) + `pcov` (`pcov.enabled=1`) + `MockHandler` / `vfsStream` | **Cobertura $\ge 95.0\%$ (líneas y ramas), 100% aislamiento offline** | `make qa-unit` |
| **04** | **Paridad de Esquema BD y Migraciones**| `doctrine/migrations` (`doctrine:schema:validate` / `migrations:diff`) o Laravel Migrations vs `postgres:17-alpine` | **0 deriva de esquema (Schema Drift), políticas `FORCE RLS` activas** | `make qa-parity` |
| **05** | **Contratos Front-Back / OpenAPI** | `zircote/swagger-php` + `schemathesis` contra contenedor PHP + PostgreSQL + KeyDB | **0 discrepancias de esquema OpenAPI 3.1 y códigos HTTP** | `make qa-contracts` |
| **06** | **BDD Caja Negra API REST** | `sinfallas/karatelabs:latest` ejecutando `test/api_test.feature` | **100% escenarios Gherkin PASSED** | `make qa-bdd` |
| **07** | **BDD Aceptación UI (Headless)** | `sinfallas/karatelabs:latest` ejecutando `test/ui_business_flow.feature` | **100% escenarios UI PASSED en Chromium real** | `make qa-bdd` |
| **08** | **Pruebas de Mutación** | `infection/infection` (`vendor/bin/infection --min-msi=80 --min-covered-msi=80 --threads=4`) | **MSI $\ge 80\%$, Covered MSI $\ge 80\%$, 0 mutantes críticos vivos** | `make qa-mutation` |
| **09** | **Accesibilidad y Geometría Visual** | `@axe-core/playwright` + `Lighthouse CI` + ergonomía In-Flow Anti-JSDOM | **0 violaciones WCAG 2.1 AA, Lighthouse A11y $\ge 0.95$** | `make qa-e2e` |
| **10** | **Concurrencia y Estrés / Carga** | `locust` (headless) o `artillery` contra Nginx + PHP-FPM / Octane | **0% tasa de error, latencia P95 $< 200\text{ ms}$** | `make qa-stress` |
| **11** | **Seguridad Dinámica DAST & OSHP** | `zaproxy/zap-stable` + PSR-15 `OWASPSecureHeadersMiddleware` (`expose_php=Off`) | **0 alertas HIGH, cabeceras OSHP presentes, estado Fail-Secure** | `make qa-dast` |
| **12** | **Ingeniería del Caos y Resiliencia** | `gaiaadm/pumba:latest` (`netem` delay/loss) + `promphp/prometheus_client_php` (`/metrics`) | **0 excepciones fatales 500, métricas RED operativas** | `make qa-chaos` |
| **13** | **Fixtures Trimodales e Invariantes**| Payloads crudos (1: Virgen/Default, 2: Nominal, 3: Degradado) | **0 ceguera de mocks, 100% invariantes negativos verificados** | `make qa-unit` |

---

## 4. Estructura del Blueprint `php/` (Tareas 11.1 y 11.2)

Durante la ejecución del **Hito 11**, Gemini 3.8 Flash High debe crear el directorio `php/` en la raíz del repositorio con los siguientes archivos canónicos:

```text
php/
├── README.md                      # Manual operativo en español del stack PHP 8.1-8.5
├── docker-compose.qa.yml          # Orquestador efímero con sinfallas/basephpcomposer:8.5, postgres:17-alpine, keydb, karatelabs, zap, pumba
├── Makefile.example               # Metas qa-lint, qa-unit, qa-parity, qa-contracts, qa-bdd, qa-mutation, qa-dast, qa-chaos, qa-sbom, qa-all, clean
├── composer.json.example          # Dependencias y scripts 11X (pest, phpstan, psalm, php-cs-fixer, infection, cyclonedx-php-composer)
├── phpstan.neon.example           # Configuración nivel max (9) + strict-rules + cognitive-complexity <= 9
├── phpunit.xml.example            # Configuración estricta con PCOV y cobertura >= 95%
├── infection.json5.example        # Configuración de mutación con minMsi: 80 y minCoveredMsi: 80
├── php.ini.example                # Configuración endurecida PHP 8.1-8.5 (DISA STIG / OWASP)
├── limpieza.sh                    # Script universal de saneamiento con fallback efímero Alpine sin sudo
└── test/
    └── api_test.feature           # Escenarios BDD en Karate Labs para endpoints PHP
```

### 4.1. `php/docker-compose.qa.yml`
```yaml
services:
  postgres-qa:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: qa_user
      POSTGRES_PASSWORD: qa_password_ephemeral
      POSTGRES_DB: qa_db
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U qa_user -d qa_db"]
      interval: 3s
      timeout: 3s
      retries: 10

  keydb-qa:
    image: eqalpha/keydb:alpine
    command: keydb-server --server-threads 2 --appendonly no --save ""
    healthcheck:
      test: ["CMD", "keydb-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 10

  qa-php:
    image: sinfallas/basephpcomposer:${PHP_VERSION:-8.5}
    working_dir: /var/www
    user: "1000:1000"
    volumes:
      - .:/var/www
      - composer-cache:/tmp/composer-cache
    environment:
      APP_ENV: testing
      COMPOSER_CACHE_dir: /tmp/composer-cache
      DATABASE_URL: postgresql://qa_user:qa_password_ephemeral@postgres-qa:5432/qa_db?serverVersion=17&charset=utf8
      REDIS_URL: redis://keydb-qa:6379/0
      PCOV_ENABLED: "1"
    depends_on:
      postgres-qa:
        condition: service_healthy
      keydb-qa:
        condition: service_healthy

  karatelabs:
    image: sinfallas/karatelabs:latest
    working_dir: /workspace
    volumes:
      - .:/workspace
    environment:
      API_BASE_URL: http://qa-php:8000

volumes:
  composer-cache:
```

### 4.2. `php/composer.json.example`
```json
{
  "name": "organizacion/proyecto-php-11x",
  "description": "Plantilla Corporativa PHP 8.1-8.5 bajo Estandar QA 11X",
  "type": "project",
  "license": "MIT",
  "require": {
    "php": ">=8.1",
    "ext-ctype": "*",
    "ext-iconv": "*",
    "ext-intl": "*",
    "ext-json": "*",
    "ext-mbstring": "*",
    "ext-openssl": "*",
    "ext-pdo": "*",
    "ext-pdo_pgsql": "*",
    "ext-redis": "*",
    "ext-sodium": "*",
    "promphp/prometheus_client_php": "^2.14"
  },
  "require-dev": {
    "cyclonedx/cyclonedx-php-composer": "^5.1",
    "friendsofphp/php-cs-fixer": "^3.68",
    "infection/infection": "^0.29",
    "pestphp/pest": "^3.7",
    "phpstan/phpstan": "^2.1",
    "phpstan/phpstan-strict-rules": "^2.0",
    "phpunit/phpunit": "^11.5",
    "roave/security-advisories": "dev-latest",
    "tomasvotruba/cognitive-complexity": "^1.0",
    "vimeo/psalm": "^6.0"
  },
  "config": {
    "optimize-autoloader": true,
    "preferred-install": "dist",
    "sort-packages": true,
    "allow-plugins": {
      "cyclonedx/cyclonedx-php-composer": true,
      "infection/extension-installer": true,
      "pestphp/pest-plugin": true
    }
  },
  "scripts": {
    "qa:cs": "php-cs-fixer fix --dry-run --diff --using-cache=no",
    "qa:phpstan": "phpstan analyse --memory-limit=1G --no-progress",
    "qa:psalm": "psalm --no-progress --taint-analysis",
    "qa:audit": "composer audit --format=json",
    "qa:lint": [
      "@qa:cs",
      "@qa:phpstan",
      "@qa:psalm",
      "@qa:audit"
    ],
    "qa:unit": "php -d pcov.enabled=1 ./vendor/bin/pest --coverage --min=95",
    "qa:mutation": "php -d pcov.enabled=1 ./vendor/bin/infection --min-msi=80 --min-covered-msi=80 --threads=4 --no-progress",
    "qa:sbom": "@composer CycloneDX:make-sbom --spec-version=1.6 --output-format=JSON --output-file=sbom-php.cdx.json"
  }
}
```

### 4.3. `php/phpstan.neon.example`
```neon
includes:
    - vendor/phpstan/phpstan-strict-rules/rules.neon

parameters:
    level: max
    paths:
        - src
        - tests
    checkMissingCallableSignature: true
    checkUninitializedProperties: true
    checkTooWideReturnTypesInProtectedAndPublicMethods: true
    cognitive_complexity:
        class: 40
        function: 9
```

### 4.4. `php/infection.json5.example`
```json5
{
    "$schema": "vendor/infection/infection/resources/schema.json",
    "source": {
        "directories": [
            "src"
        ]
    },
    "timeout": 10,
    "logs": {
        "text": "infection.log",
        "summary": "infection-summary.log"
    },
    "mutators": {
        "@default": true
    },
    "minMsi": 80,
    "minCoveredMsi": 80
}
```

---

## 5. Implementación en Generador de Manifiesto (`scripts/generar-manifiesto.py`) (Tarea 11.2)

En `scripts/generar-manifiesto.py`:
1. Añadir `"php"` al diccionario `STACK_METADATA`:
   ```python
   "php": {
       "description": "APIs, Microservicios y Aplicaciones Backend en PHP 8.1-8.5 con PCOV, PHPStan, Psalm, Pest/PHPUnit, Infection y Karate BDD",
       "base_images": [
           "sinfallas/basephpcomposer:8.5",
           "postgres:17-alpine",
           "eqalpha/keydb:alpine",
           "sinfallas/karatelabs:latest",
       ],
   },
   ```
2. En `classify_stack_file(rel_path: str)`, agregar `"composer.json.example"` a la tupla de archivos con estrategia `"surgical_merge"`:
   ```python
   if name in (
       "package.json.example",
       "pyproject.toml.example",
       "composer.json.example",
       "Makefile.example",
   ):
       return target_name, "surgical_merge"
   ```
3. Actualizar `tests/test_generar_manifiesto.unit.py` para validar los **7 stacks** (incluyendo `"php"` y la estrategia `"surgical_merge"` para `"composer.json.example"`).

---

## 6. Implementación en el Servidor MCP (`mcp-server/src/`) (Tareas 11.3 a 11.6)

### 6.1. `mcp-server/src/types.ts`
Actualizar `StackNameSchema` para incluir `'php'`:
```typescript
export const StackNameSchema = z.enum([
  'python',
  'fastapi',
  'node-backend',
  'vue3',
  'react-frontend',
  'bash-scripts',
  'php',
]);
```

### 6.2. `mcp-server/src/tools/inspect-project.ts`
Añadir detección del stack `php` manteniendo la complejidad cognitiva $\le 15$:
```typescript
const COMPOSER_JSON_FILE = 'composer.json';
const PHPSTAN_NEON_FILE = 'phpstan.neon';

async function inspectPhpStack(
  projectPath: string,
  files: string[],
  detectedStacks: StackName[],
  strictModeFlags: Record<string, boolean>,
  missing11xFiles: string[],
): Promise<void> {
  const composerPath = path.join(projectPath, COMPOSER_JSON_FILE);
  const hasComposer = await fileExists(composerPath);
  const hasPhpFiles = files.some((f) => f.endsWith('.php'));
  if (!hasComposer && !hasPhpFiles) {
    return;
  }
  detectedStacks.push('php');
  const hasPhpstan =
    (await fileExists(path.join(projectPath, PHPSTAN_NEON_FILE))) ||
    (await fileExists(path.join(projectPath, 'phpstan.neon.dist')));
  const hasInfection =
    (await fileExists(path.join(projectPath, 'infection.json5'))) ||
    (await fileExists(path.join(projectPath, 'infection.json.dist')));
  strictModeFlags.phpstan_strict = hasPhpstan;
  strictModeFlags.infection_mutation = hasInfection;
  if (!hasPhpstan) {
    missing11xFiles.push(PHPSTAN_NEON_FILE);
  }
}
```
Invocar `await inspectPhpStack(...)` desde `inspectProjectConfig`.

### 6.3. `mcp-server/src/services/surgical-merger.ts`
Añadir `mergeComposerJson(existingRaw: string, templateRaw: string)` e integrarlo en `resolveSurgicalMerge` cuando `base === 'composer.json'`:
```typescript
  public mergeComposerJson(
    existingRaw: string,
    templateRaw: string,
  ): { content: string; changes: string[] } {
    const existing = JSON.parse(existingRaw) as Record<string, unknown>;
    const template = JSON.parse(templateRaw) as Record<string, unknown>;
    const changes: string[] = [];

    this.mergeJsonDictionarySection(existing, template, 'require-dev', changes);
    this.mergeJsonDictionarySection(existing, template, 'scripts', changes);

    const tplConfig = (template.config ?? {}) as Record<string, unknown>;
    if (Object.keys(tplConfig).length > 0) {
      const curConfig = (existing.config ?? {}) as Record<string, unknown>;
      existing.config = curConfig;
      this.mergeJsonDictionarySection(curConfig, tplConfig, 'allow-plugins', changes);
    }

    return {
      content: `${JSON.stringify(existing, null, 2)}\n`,
      changes,
    };
  }
```
*(Nota para Gemini 3.8 Flash High: Reutiliza o crea el helper privado `mergeJsonDictionarySection` para evitar duplicar bucles entre `mergePackageJson` y `mergeComposerJson` y mantener `sonarjs/cognitive-complexity <= 15`).*

### 6.4. `mcp-server/src/parsers/output-parsers.ts`
Ampliar los parsers ahorradores de tokens para soportar salidas de herramientas PHP:
1. **Cobertura (`parseCoverage`):** Detectar el resumen de cobertura de Pest / PHPUnit (`Lines:\s+(\d+(?:\.\d+)?)%` o `Total:\s+(\d+(?:\.\d+)?)%`) cuando el formato sea de PHPUnit/PCOV.
2. **Linters (`parseComplexityAndLinters`):** Detectar errores en formato tabla/línea de `PHPStan` (`Line\s+(\d+)` o `\[ERROR\] Found \d+ error`) y `Psalm` (`ERROR: [\w]+ - ([^:]+):(\d+):(\d+) - (.+)`).
3. **Mutación (`parseMutationScore`):** Detectar métricas de `Infection` (`Mutation Score Indicator \(MSI\):\s*(\d+(?:\.\d+)?)%`, `(\d+)\s+mutants were killed`, `(\d+)\s+mutants were not covered` / `(\d+)\s+escaped`).

### 6.5. `mcp-server/src/tools/security-auditor.ts` y `test-pyramid-auditor.ts`
1. En `security-auditor.ts`:
   * Incluir `.php` en la lista de extensiones de código escaneadas.
   * **`SEC-03` (Command Injection & Unsafe Deserialization):** Detectar en archivos `.php` llamadas a `unserialize(` que no contengan `'allowed_classes'` (o `allowed_classes`), y llamadas a `shell_exec(`, `passthru(`, `system(`, `eval(`.
   * **`SEC-04` (XXE):** Detectar en archivos `.php` `DOMDocument` / `loadXML(` o `simplexml_load_string(` sin `LIBXML_NONET`.
   * **`SEC-05` (Unicode NFKC):** Reconocer `Normalizer::FORM_KC` / `Normalizer::normalize` como patrón válido de canonicalización en proyectos PHP.
2. En `test-pyramid-auditor.ts`:
   * Soportar el stack `'php'` en la evaluación de las 13 capas (`phpstan.neon` / `psalm.xml` en L01–L02, `*Test.php` / `*.unit.php` en L03, migraciones Doctrine/Laravel en L04, `infection.json5` en L08) y en la detección de archivos fuente huérfanos en `src/**/*.php`.

---

## 7. Criterios de Aceptación y Compuerta 11X para el Hito 11

1. El directorio `php/` existe con todas sus plantillas `.example`, `docker-compose.qa.yml`, `README.md`, `limpieza.sh` (`0755`) y `test/api_test.feature`.
2. `python3 scripts/generar-manifiesto.py --check` pasa con código de salida `0` e indexa los 7 stacks (`python`, `fastapi`, `node-backend`, `vue3`, `react-frontend`, `bash-scripts`, `php`).
3. En contenedor efímero `sinfallas/base-node-ionic:26`, `pnpm run lint` (`--max-warnings 0`), `pnpm run typecheck`, `pnpm run test:unit` (cobertura $\ge 95.0\%$ en líneas, ramas, funciones y sentencias) y `pnpm run build` aprueban sin errores.
4. `mcp-server/test/mcp_cli_test.feature` valida que `manifest.json` contiene el stack `php`.
5. `./.agents/scripts/certify_task_completion.sh` aprueba las **10/10 etapas**.
