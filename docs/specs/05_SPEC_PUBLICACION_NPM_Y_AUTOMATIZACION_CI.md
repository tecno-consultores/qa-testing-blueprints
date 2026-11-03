# 📦 Especificación 05: Guía Paso a Paso de Publicación en npm (Node.js) y Arquitectura Soberana sin CI/CD Externo

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Paquete Objetivo:** `@sinfallas/mcp-qa-11x` (con alcance de usuario/organización) o `mcp-qa-11x` (nombre directo)  
**Audiencia:** Guía paso a paso desde cero para el Autor del Proyecto y publicación soberana en Docker efímero  
**Estado:** APROBADO PARA IMPLEMENTACIÓN

---

## 1. Resumen: ¿Cómo funciona publicar un paquete en Node.js (`npm`)?

Publicar en **npm** (`https://www.npmjs.com`) es gratuito para paquetes públicos. Una vez publicado, cualquier persona o Agente de IA en cualquier parte del mundo podrá ejecutar tu servidor MCP o instalar tu Skill con un solo comando sin clonar el repositorio:
```bash
# Levantar el servidor MCP automáticamente:
npx -y @sinfallas/mcp-qa-11x@latest

# O instalar el catálogo de 5 Skills, scripts y conector AGENTS.md en 1 segundo:
npx -y @sinfallas/mcp-qa-11x@latest install-skill --init-agents --include-scripts
```

---

## 2. Paso a Paso Manual (Primera Vez en la Historia)

Si nunca has publicado en npm, sigue exactamente estos **6 pasos sencillos**:

### Paso 1: Crear tu cuenta gratuita en npmjs.com
1. Entra en **[https://www.npmjs.com/signup](https://www.npmjs.com/signup)**.
2. Elige tu nombre de usuario (por ejemplo, `sinfallas`), tu correo electrónico y contraseña.
3. Verifica tu correo con el código que te enviará npm.
4. **Activar 2FA (Obligatorio en npm moderno):** En tu perfil de npm $\rightarrow$ *Account* $\rightarrow$ *Two-Factor Authentication*, activa 2FA con tu aplicación autenticadora (Google Authenticator / Authy / 1Password) o llave de seguridad.

> **Nota sobre el nombre del paquete (`name` en `package.json`):**
> - Si tu usuario en npm se llama `sinfallas`, tienes derecho automático a publicar cualquier paquete bajo el prefijo **`@sinfallas/<nombre>`** (por ejemplo: `"name": "@sinfallas/mcp-qa-11x"`).
> - Si además creas en npm una Organización gratuita llamada `tecno-consultores` (*Add Organization* $\rightarrow$ *Free Unlimited Public Packages*), también podrás publicar bajo **`@tecno-consultores/mcp-qa-11x`**.
> - O si prefieres un nombre sin `@`, puedes usar directamente **`"name": "mcp-qa-11x"`**.

---

### Paso 2: Generar un Token de Acceso (Granular Access Token) en la Web de npm
Para no meter tu usuario y contraseña en la terminal y cumplir con la regla de contenedores efímeros:
1. En la web de npmjs.com, haz clic en tu avatar (arriba a la derecha) $\rightarrow$ **Access Tokens**.
2. Haz clic en **Generate New Token** $\rightarrow$ **Granular Access Token**.
3. Configúralo así:
   - **Token name:** `qa-testing-blueprints-publish`
   - **Expiration:** `90 days` (o `365 days`).
   - **Packages and scopes — Permissions:** Selecciona **Read and write** (*All packages*).
   - Marca la casilla **Bypass two-factor authentication (2FA)** para automatizar la publicación autónoma sin interrupción interactiva.
4. Copia el token generado (empieza por `npm_...`). Guárdalo en un lugar seguro; solo se muestra una vez.

---

### Paso 3: Compilar y Verificar el Paquete en Contenedor Efímero (Dry-Run)
Siguiendo nuestra **Regla Cero** (sin instalar Node en tu Ubuntu), compilamos y probamos qué archivos se van a empaquetar usando nuestra imagen oficial `sinfallas/base-node-ionic:26`:

```bash
cd mcp-server

# 1. Instalar dependencias, ejecutar linters, pruebas 11X (>=95% cobertura) y compilar TypeScript a ./dist
make qa-all
docker compose -f docker-compose.qa.yml run --rm qa-mcp pnpm run build

# 2. Simular el empaquetado (Dry-Run) para ver qué archivos exactos subirán a npm
docker compose -f docker-compose.qa.yml run --rm qa-mcp npm pack --dry-run
```
Verás en pantalla que solo se incluyen `dist/**/*.js`, `package.json` y `README.md` (ningún archivo basura ni secreto).

---

### Paso 4: Publicar el Paquete a npm desde el Contenedor Efímero
Con tu token `npm_...` a mano, ejecuta este comando pasándole el token como variable de entorno efímera en memoria (nunca queda guardado en ningún archivo del repositorio):

```bash
cd mcp-server

NPM_TOKEN="npm_TU_TOKEN_AQUI" \
docker compose -f docker-compose.qa.yml run --rm \
  -e NPM_TOKEN \
  qa-mcp sh -c 'npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN" && npm publish --access public'
```

*(Nota: el flag `--access public` es indispensable la primera vez cuando el nombre del paquete lleva `@sinfallas/...` para indicar a npm que el paquete es público y gratuito).*

---

## 3. Publicación Autónoma sin Runners Externos (`scripts/publicar-mcp.sh` — Modelo RoSGrid)

Siguiendo el estándar de arquitectura de **RoSGrid**, la publicación no depende obligatoriamente de runners remotos de CI/CD (GitHub Actions o GitLab CI), eliminando el riesgo de fuga de credenciales o fallos de red en plataformas externas.

El flujo autónomo central se orquesta mediante el script [`scripts/publicar-mcp.sh`](../../scripts/publicar-mcp.sh):

```text
.env en la raíz (NPM_TOKEN) ──> scripts/publicar-mcp.sh ──> Docker Efímero (sinfallas/base-node-ionic:26)
                                                                 │
                                ┌────────────────────────────────┴────────────────────────────────┐
                                ▼                                                                 ▼
                    Pipeline de Validación 11X                                     Publicación en Memoria
             (lint + typecheck + tests >= 95% + build)                      (npm config set token && npm publish)
```

### Configuración de Credenciales:
1. Copie la plantilla `.env.example` en la raíz del repositorio:
   ```bash
   cp .env.example .env
   ```
2. Configure su token de npmjs con permisos de publicación:
   ```bash
   NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. El archivo `.env` está estrictamente blindado en `.gitignore` y auditado por `scripts/verificar-secretos.sh`.

### Modos de Ejecución Canónicos:
```bash
# 1. Simulación completa (Dry-Run): valida lint, tests, build y simula npm pack sin publicar
make publish-mcp-dry
# o directamente: ./scripts/publicar-mcp.sh --dry-run

# 2. Publicación en vivo: ejecuta todo el pipeline y publica a npmjs.org
make publish-mcp
# o directamente: ./scripts/publicar-mcp.sh

# 3. Publicación pasando código 2FA/OTP de 6 dígitos (si el token no tiene 'Bypass 2FA'):
./scripts/publicar-mcp.sh --otp 123456
```

> **Nota sobre 2FA / `EOTP`:** Si el token creado en npmjs.com no tiene marcada la opción **Bypass two-factor authentication (2FA)**, `scripts/publicar-mcp.sh` adjunta automáticamente una terminal interactiva (`-it` + `--no-browser`) al contenedor efímero. De este modo, `npm` imprimirá en consola una URL de autorización (`https://www.npmjs.com/auth/cli/...`) y **esperará en vivo** hasta que usted abra ese enlace en su navegador y autorice la publicación (o bien puede pasar `--otp <código>` directamente).

---

## 4. Filosofía Soberana: Eliminación de CI/CD Externo y Cero Dependencia de Runners Remotos

En conformidad con las directivas corporativas y el modelo de gobernanza Level-11X de RoSGrid:

1. **Cero Dependencia de CI/CD Externo:** Se prescinde intencionalmente de GitHub Actions, GitLab CI y cualquier otro runner alojado en nubes externas para tareas de empaquetado y publicación.
2. **Eliminación del Directorio `.github`:** Toda la automatización de calidad, linters, pruebas unitarias ($\ge 95\%$), validación de esquemas y publicación vive de forma autónoma en el repositorio (`Makefile`, `docker-compose.qa.yml`, `scripts/`).
3. **Mitigación de Fuga de Credenciales (Supply Chain & Secret Protection):** Los tokens con privilegios de escritura en npmjs (`NPM_TOKEN`) nunca se depositan en secretos de plataformas de terceros ni se transmiten por la red hacia runners efímeros remotos. Se inyectan exclusivamente en contenedores locales que se destruyen inmediatamente tras la publicación.
4. **Reproducibilidad Idéntica (Regla Cero):** Al ejecutar el pipeline mediante `scripts/publicar-mcp.sh` sobre `sinfallas/base-node-ionic:26`, el resultado de la publicación es 100% idéntico y determinista sin importar la máquina del desarrollador.
