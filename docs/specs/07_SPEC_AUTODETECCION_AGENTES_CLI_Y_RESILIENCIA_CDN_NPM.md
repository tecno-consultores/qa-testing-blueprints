# 🎯 Especificación 07: Autodetección Inteligente de Agentes en `install-skill` (`npx` / `curl`) y Resiliencia de Propagación CDN en `publicar-mcp.sh`

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Componentes Objetivo (Hito 8):** `mcp-server/src/cli/install-skill.ts`, `scripts/install-skill.sh`, `scripts/publicar-mcp.sh`, `mcp-server/tests/tools-and-resources.unit.ts`, `tests/test_install_skill.unit.py`, `tests/test_publicar_mcp.unit.py`, `mcp-server/test/mcp_cli_test.feature`  
**Audiencia de Ejecución:** Gemini 3.8 Flash High / Claude / Antigravity  
**Estado:** PLANIFICADO (ESPECIFICACIÓN APROBADA PARA IMPLEMENTACIÓN EN HITO 8)

---

## 1. Propósito y Contexto Empírico (*Dogfooding*)

Durante las pruebas reales de publicación y consumo (*Dogfooding*) de `@sinfallas/mcp-qa-11x@2.8.3` se identificaron dos fricciones operativas que deben erradicarse por diseño:

1. **Problema 1 — Falta de Autodetección por Defecto al ejecutar `npx -y @sinfallas/mcp-qa-11x install-skill`:**
   - En `mcp-server/src/cli/install-skill.ts`, la función `parseTargetArg(args)` inicializaba `let targetArg = 'workspace'` en lugar de `'auto'`.
   - Cuando un usuario ejecutaba `npx -y @sinfallas/mcp-qa-11x install-skill` desde su directorio `$HOME` (`/home/usuario`) sin pasar `--target`, el CLI creaba `/home/usuario/.agents/skills` (que Google Antigravity ignora cuando se abre un repositorio con `.git` propio) en lugar de detectar automáticamente que el usuario tiene instalado Google Antigravity (`~/.gemini`), Claude (`~/.claude`), Hermes (`~/.hermes`) o Cursor (`~/.cursor`) e instalar las skills en sus directorios globales oficiales (`~/.gemini/config/skills`, etc.).
2. **Problema 2 — Falso Error `E404` tras `npm publish` en `scripts/publicar-mcp.sh`:**
   - Cuando se publica un paquete nuevo o una nueva versión en `registry.npmjs.org`, el registro responde `+ @sinfallas/mcp-qa-11x@X.Y.Z` junto con el aviso `npm notice Your package is being processed and may take a few minutes to become available`.
   - La línea 235 de `scripts/publicar-mcp.sh` ejecutaba inmediatamente `npm view "${PKG_NAME}" version` sin bucle de reintento (*retry/backoff*), provocando que `set -e` abortara el script con `npm error code E404` antes de que la CDN global de npmjs terminara de propagar los metadatos y antes de ejecutar `scripts/limpieza.sh`.

---

## 2. Directivas de Calidad Innegociables para Gemini 3.8 Flash High

Al implementar este Hito, **Gemini 3.8 Flash High** DEBE respetar las siguientes restricciones estáticas para aprobar `pnpm run lint` (`eslint --max-warnings 0`) en el primer intento:

1. **`sonarjs/no-duplicate-string` (Umbral 3 en `src/**/*.ts`):**
   - Cualquier literal de cadena que se repita 3 o más veces en `mcp-server/src/cli/install-skill.ts` (por ejemplo, `'.agents'`, `'skills'`) DEBE extraerse como constante a nivel de módulo (`const SKILLS_DIR_NAME = 'skills';`, `const AGENTS_DIR_NAME = '.agents';`).
2. **`sonarjs/cognitive-complexity` ($\le 15$ por función):**
   - Dividir la lógica de resolución de destinos en funciones pequeñas y puras (`detectInstalledGlobalAgentDirs`, `isProjectWorkspaceDir`, `resolveAutoTargets`, `resolveDestinationDirs`).
3. **Regla Cero (`Rule Zero`):**
   - Ejecutar todas las pruebas (`vitest`, `eslint`, `tsc`, `pytest`, `shellcheck`) exclusivamente dentro de los contenedores Docker efímeros (`sinfallas/base-node-ionic:26`, `sinfallas/base-python-uv:3.15`).

---

## 3. Especificación Exacta de Cambios en `mcp-server/src/cli/install-skill.ts`

### 3.1. Reglas de Resolución de Destinos (`auto` por defecto)

1. **`parseTargetArg(args: string[]): string`:**
   - Cambiar el valor por defecto de `'workspace'` a `'auto'` (o tomar `process.env.QA_SKILL_TARGET || 'auto'`).
2. **`detectInstalledGlobalAgentDirs(homeDir: string): string[]`:**
   - Comprueba la existencia en `homeDir` de los directorios de agentes de IA soportados y devuelve sus rutas globales de skills:
     - Si existe `path.join(homeDir, '.gemini')` $\rightarrow$ añade `path.join(homeDir, '.gemini', 'config', SKILLS_DIR_NAME)` *(Google Antigravity)*.
     - Si existe `path.join(homeDir, '.claude')` $\rightarrow$ añade `path.join(homeDir, '.claude', SKILLS_DIR_NAME)` *(Claude Code / Desktop)*.
     - Si existe `path.join(homeDir, '.hermes')` $\rightarrow$ añade `path.join(homeDir, '.hermes', SKILLS_DIR_NAME)` *(Hermes Agent)*.
     - Si existe `path.join(homeDir, '.cursor')` $\rightarrow$ añade `path.join(homeDir, '.cursor', SKILLS_DIR_NAME)` *(Cursor Global)*.
3. **`isProjectWorkspaceDir(homeDir: string, cwd: string): boolean`:**
   - Si `path.resolve(cwd) === path.resolve(homeDir)`, devuelve **`false`** (evita ensuciar `$HOME/.agents/skills` cuando el usuario ejecuta el comando parado en su carpeta personal).
   - Devuelve **`true`** si en `cwd` existe cualquiera de los marcadores de proyecto: `.git`, `AGENTS.md`, `ROADMAP.md`, `package.json` o `pyproject.toml`.
4. **`resolveAutoTargets(homeDir: string, cwd: string): string[]`:**
   - Obtiene `const globalDirs = detectInstalledGlobalAgentDirs(homeDir);`.
   - Si `isProjectWorkspaceDir(homeDir, cwd)` es `true`, añade `path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME)` al inicio de la lista.
   - Si la lista combinada tiene al menos 1 destino, la devuelve (sin duplicados).
   - **Fallback:** Si no se detectó ningún agente global en `homeDir` y `cwd` no tiene marcadores de proyecto (ej. directorio vacío en CI), devuelve `[path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME)]`.
5. **`resolveAllTargets(homeDir: string, cwd: string): string[]`:**
   - Incluye siempre `path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME)` más todos los directorios retornados por `detectInstalledGlobalAgentDirs(homeDir)` (sin duplicados).
6. **Soporte explícito para `--target cursor`:**
   - `'workspace'` y `'local'` devuelven `[path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME)]`.
   - `'cursor'` devuelve `[path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME)]` y, si existe `path.join(homeDir, '.cursor')`, también `path.join(homeDir, '.cursor', SKILLS_DIR_NAME)`.

### 3.2. Implementación de Referencia para `mcp-server/src/cli/install-skill.ts`

```typescript
// Constantes a nivel de módulo para cumplir sonarjs/no-duplicate-string
const DIVIDER = '\n══════════════════════════════════════════════════════════════════════';
const AGENTS_DIR_NAME = '.agents';
const SKILLS_DIR_NAME = 'skills';

function parseTargetArg(args: string[]): string {
  let targetArg = process.env.QA_SKILL_TARGET || 'auto';
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--target' || args[i] === '-t') && args[i + 1]) {
      targetArg = args[i + 1];
      i++;
    } else if (args[i].startsWith('--target=')) {
      targetArg = args[i].split('=')[1];
    }
  }
  return targetArg;
}

function detectInstalledGlobalAgentDirs(homeDir: string): string[] {
  const dirs: string[] = [];
  if (fs.existsSync(path.join(homeDir, '.gemini'))) {
    dirs.push(path.join(homeDir, '.gemini', 'config', SKILLS_DIR_NAME));
  }
  if (fs.existsSync(path.join(homeDir, '.claude'))) {
    dirs.push(path.join(homeDir, '.claude', SKILLS_DIR_NAME));
  }
  if (fs.existsSync(path.join(homeDir, '.hermes'))) {
    dirs.push(path.join(homeDir, '.hermes', SKILLS_DIR_NAME));
  }
  if (fs.existsSync(path.join(homeDir, '.cursor'))) {
    dirs.push(path.join(homeDir, '.cursor', SKILLS_DIR_NAME));
  }
  return dirs;
}

function isProjectWorkspaceDir(homeDir: string, cwd: string): boolean {
  if (path.resolve(cwd) === path.resolve(homeDir)) {
    return false;
  }
  const markers = ['.git', 'AGENTS.md', 'ROADMAP.md', 'package.json', 'pyproject.toml'];
  return markers.some((marker) => fs.existsSync(path.join(cwd, marker)));
}

function resolveAllTargets(homeDir: string, cwd: string): string[] {
  const workspaceSkills = path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME);
  return Array.from(new Set([workspaceSkills, ...detectInstalledGlobalAgentDirs(homeDir)]));
}

function resolveAutoTargets(homeDir: string, cwd: string): string[] {
  const targets: string[] = [];
  if (isProjectWorkspaceDir(homeDir, cwd)) {
    targets.push(path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME));
  }
  targets.push(...detectInstalledGlobalAgentDirs(homeDir));
  if (targets.length === 0) {
    targets.push(path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME));
  }
  return Array.from(new Set(targets));
}

function resolveDestinationDirs(targetArg: string, homeDir: string, cwd: string): string[] {
  const workspaceSkills = path.join(cwd, AGENTS_DIR_NAME, SKILLS_DIR_NAME);
  switch (targetArg) {
    case 'workspace':
    case 'local':
      return [workspaceSkills];
    case 'cursor':
      return fs.existsSync(path.join(homeDir, '.cursor'))
        ? [workspaceSkills, path.join(homeDir, '.cursor', SKILLS_DIR_NAME)]
        : [workspaceSkills];
    case 'antigravity':
      return [path.join(homeDir, '.gemini', 'config', SKILLS_DIR_NAME)];
    case 'claude':
      return [path.join(homeDir, '.claude', SKILLS_DIR_NAME)];
    case 'hermes':
      return [path.join(homeDir, '.hermes', SKILLS_DIR_NAME)];
    case 'all':
      return resolveAllTargets(homeDir, cwd);
    default:
      return resolveAutoTargets(homeDir, cwd);
  }
}
```

---

## 4. Especificación Exacta de Cambios en `scripts/install-skill.sh`

Sincronizar la función `resolve_destination_dirs()` en `scripts/install-skill.sh` (líneas 185–227) para que el instalador POSIX `sh` tenga exactamente el mismo comportamiento que el CLI de Node.js:

```sh
resolve_destination_dirs() {
  _target="$1"
  _pwd="$(pwd)"
  case "${_target}" in
    workspace | local)
      printf "%s/.agents/skills\n" "${_pwd}"
      ;;
    antigravity)
      printf "%s/.gemini/config/skills\n" "${HOME_DIR}"
      ;;
    claude)
      printf "%s/.claude/skills\n" "${HOME_DIR}"
      ;;
    cursor)
      printf "%s/.agents/skills\n" "${_pwd}"
      if [ -d "${HOME_DIR}/.cursor" ]; then
        printf "%s/.cursor/skills\n" "${HOME_DIR}"
      fi
      ;;
    hermes)
      printf "%s/.hermes/skills\n" "${HOME_DIR}"
      ;;
    all)
      printf "%s/.agents/skills\n" "${_pwd}"
      if [ -d "${HOME_DIR}/.gemini" ] || [ -d "${HOME_DIR}/.gemini/antigravity" ]; then
        printf "%s/.gemini/config/skills\n" "${HOME_DIR}"
      fi
      if [ -d "${HOME_DIR}/.claude" ]; then
        printf "%s/.claude/skills\n" "${HOME_DIR}"
      fi
      if [ -d "${HOME_DIR}/.hermes" ]; then
        printf "%s/.hermes/skills\n" "${HOME_DIR}"
      fi
      if [ -d "${HOME_DIR}/.cursor" ]; then
        printf "%s/.cursor/skills\n" "${HOME_DIR}"
      fi
      ;;
    *)
      # Autodetección inteligente por defecto (auto)
      _found_any=0
      if [ "${_pwd}" != "${HOME_DIR}" ] && { [ -d "./.git" ] || [ -f "./ROADMAP.md" ] || [ -f "./AGENTS.md" ] || [ -f "./package.json" ] || [ -f "./pyproject.toml" ]; }; then
        printf "%s/.agents/skills\n" "${_pwd}"
        _found_any=1
      fi
      if [ -d "${HOME_DIR}/.gemini" ] || [ -d "${HOME_DIR}/.gemini/antigravity" ]; then
        printf "%s/.gemini/config/skills\n" "${HOME_DIR}"
        _found_any=1
      fi
      if [ -d "${HOME_DIR}/.claude" ]; then
        printf "%s/.claude/skills\n" "${HOME_DIR}"
        _found_any=1
      fi
      if [ -d "${HOME_DIR}/.hermes" ]; then
        printf "%s/.hermes/skills\n" "${HOME_DIR}"
        _found_any=1
      fi
      if [ -d "${HOME_DIR}/.cursor" ]; then
        printf "%s/.cursor/skills\n" "${HOME_DIR}"
        _found_any=1
      fi
      if [ "${_found_any}" -eq 0 ]; then
        printf "%s/.agents/skills\n" "${_pwd}"
      fi
      ;;
  esac
}
```

> **IMPORTANTE:** Tras modificar `scripts/install-skill.sh`, Gemini 3.8 Flash High DEBE ejecutar `python3 scripts/generar-manifiesto.py` para actualizar el hash SHA-256 y `size_bytes` de `scripts/install-skill.sh` en `/manifest.json`.

---

## 5. Especificación Exacta de Resiliencia CDN en `scripts/publicar-mcp.sh`

Reemplazar las líneas 234–236 de `scripts/publicar-mcp.sh`:
```bash
echo -e "\n🔍 Verificando publicación remota..."
docker run --rm "${IMAGE_NAME}" npm view "${PKG_NAME}" version
```
por un bucle tolerante a la consistencia eventual de la CDN de npmjs (hasta 6 intentos con espera de 5 segundos, sin abortar el script ni impedir la ejecución de `scripts/limpieza.sh` si la CDN tarda más de 30 segundos en replicar un paquete recién creado):

```bash
echo -e "\n🔍 Verificando propagación en el CDN de ${NPM_REGISTRY}..."
VERIFY_ATTEMPTS=6
VERIFY_DELAY=5
VERIFIED_REMOTE_VERSION=""

for attempt in $(seq 1 "${VERIFY_ATTEMPTS}"); do
  VERIFIED_REMOTE_VERSION="$(
    docker run --rm "${IMAGE_NAME}" \
      npm view "${PKG_NAME}@${PKG_VERSION}" version --registry "${NPM_REGISTRY}" 2>/dev/null || true
  )"
  if [ "${VERIFIED_REMOTE_VERSION}" = "${PKG_VERSION}" ]; then
    echo -e "\e[32m✔ Versión ${PKG_VERSION} verificada y disponible en el CDN de npmjs (intento ${attempt}/${VERIFY_ATTEMPTS}).\e[0m"
    break
  fi
  if [ "${attempt}" -lt "${VERIFY_ATTEMPTS}" ]; then
    echo "⏳ Esperando propagación asíncrona del CDN de npmjs (intento ${attempt}/${VERIFY_ATTEMPTS}, reintentando en ${VERIFY_DELAY}s)..."
    sleep "${VERIFY_DELAY}"
  fi
done

if [ "${VERIFIED_REMOTE_VERSION}" != "${PKG_VERSION}" ]; then
  echo -e "\e[33m⚠️ Aviso: npm publish concluyó con éxito (+ ${PKG_NAME}@${PKG_VERSION}), pero el CDN de npmjs aún está procesando la propagación inicial.\e[0m"
  echo "   Estará visible en unos instantes ejecutando: npm view ${PKG_NAME} version"
fi
```

---

## 6. Especificación de Pruebas Obligatorias para el Hito 8

### 6.1. Pruebas Unitarias TypeScript (`mcp-server/tests/tools-and-resources.unit.ts`)
1. Actualizar el test `'handles auto target when in git workspace and when outside git workspace'` para verificar que:
   - Al invocar `await runInstallSkillCli([], fetcher)` (sin argumentos) estando parado en `fakeHome` (`cwd === fakeHome`) donde existen `.gemini` y `.claude`:
     - Instala en `fakeHome/.gemini/config/skills/qa-11x-architect/SKILL.md` y `fakeHome/.claude/skills/qa-11x-architect/SKILL.md`.
     - **NO** crea `fakeHome/.agents/skills` (`expect(fs.existsSync(path.join(fakeHome, '.agents'))).toBe(false)`).
   - Al invocar `await runInstallSkillCli([], fetcher)` desde un proyecto con `.git` (`cwd !== fakeHome`):
     - Instala tanto en `<proyecto>/.agents/skills/` como en los agentes globales detectados en `fakeHome`.
   - Al invocar con `--target cursor` cuando existe `fakeHome/.cursor`:
     - Instala en `<proyecto>/.agents/skills/` y en `fakeHome/.cursor/skills/`.
   - Al invocar en un directorio aislado sin `.git` y con `isolatedHome` sin carpetas de agentes:
     - Hace fallback a `<isolatedCwd>/.agents/skills/`.

### 6.2. Pruebas Unitarias Python (`tests/test_install_skill.unit.py` y `tests/test_publicar_mcp.unit.py`)
1. En `tests/test_install_skill.unit.py`:
   - Añadir `test_auto_target_from_home_detects_global_agents_without_polluting_home_agents`: ejecuta `sh scripts/install-skill.sh` sin `--target` con `cwd=mock_home` y carpetas `.gemini` y `.claude` creadas dentro de `mock_home`; verifica que se instale en `.gemini/config/skills` y `.claude/skills` y que **no** exista `mock_home/.agents`.
2. En `tests/test_publicar_mcp.unit.py`:
   - Añadir prueba unitaria verificando que `scripts/publicar-mcp.sh` contiene el bucle de verificación tolerante a propagación de CDN (`VERIFY_ATTEMPTS` y manejo sin caída por `E404`).

### 6.3. Comandos de Certificación en Contenedor Efímero (Regla Cero)
```bash
# 1. Validar ShellCheck en scripts/install-skill.sh y scripts/publicar-mcp.sh
docker run --rm -v "$(pwd):/mnt" koalaman/shellcheck:stable /mnt/scripts/install-skill.sh /mnt/scripts/publicar-mcp.sh

# 2. Regenerar manifest.json tras editar scripts/install-skill.sh
python3 scripts/generar-manifiesto.py

# 3. Ejecutar linter (--max-warnings 0), typecheck y pruebas unitarias (>= 95%) de mcp-server
docker compose -f mcp-server/docker-compose.qa.yml run --rm qa-mcp sh -c "pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build"

# 4. Ejecutar pruebas unitarias de scripts en Python
docker run --rm -v "$(pwd):/app" -w /app sinfallas/base-python-uv:3.15 pytest tests/test_install_skill.unit.py tests/test_publicar_mcp.unit.py -v

# 5. Ejecutar compuerta de 10 etapas
bash .agents/scripts/certify_task_completion.sh
```
