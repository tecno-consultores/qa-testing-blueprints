# 📦 Especificación 05: Guía Paso a Paso de Publicación en npm (Node.js) y Automatización CI/CD

**Proyecto:** QA Testing Blueprints (Estándar Corporativo Nivel 11X)  
**Paquete Objetivo:** `@sinfallas/mcp-qa-11x` (con alcance de usuario/organización) o `mcp-qa-11x` (nombre directo)  
**Audiencia:** Guía paso a paso desde cero para el Autor del Proyecto y automatización en GitHub Actions  
**Estado:** APROBADO PARA IMPLEMENTACIÓN

---

## 1. Resumen: ¿Cómo funciona publicar un paquete en Node.js (`npm`)?

Publicar en **npm** (`https://www.npmjs.com`) es gratuito para paquetes públicos. Una vez publicado, cualquier persona o Agente de IA en cualquier parte del mundo podrá ejecutar tu servidor MCP o instalar tu Skill con un solo comando sin clonar el repositorio:
```bash
# Levantar el servidor MCP automáticamente:
npx -y @sinfallas/mcp-qa-11x

# O instalar la Skill qa-11x-architect en 1 segundo:
npx -y @sinfallas/mcp-qa-11x install-skill
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
   - *(Opcional pero recomendado para GitHub Actions)* Marca la casilla **Bypass two-factor authentication (2FA)** si vas a automatizar la publicación desde GitHub Actions.
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

Siguiendo el estándar de arquitectura de **RoSGrid**, la publicación no depende obligatoriamente de runners remotos de CI/CD (GitHub Actions), eliminando el riesgo de fuga de credenciales o fallos de red en plataformas externas.

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
```

---

## 4. Automatización Opcional con GitHub Actions + SLSA Provenance (DISA STIG `V-222513`)

Para que después de la primera configuración **nunca más tengas que publicar a mano**, se incluirá el workflow `.github/workflows/publish-mcp-npm.yml`:

1. En tu repositorio de GitHub (`tecno-consultores/qa-testing-blueprints`), ve a **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions** $\rightarrow$ **New repository secret**.
2. Crea un secreto llamado **`NPM_TOKEN`** y pega tu token `npm_...`.
3. Cada vez que hagas un `git tag 2.8.0 && git push origin 2.8.0`, GitHub Actions:
   - Ejecutará todas las pruebas unitarias de `mcp-server/` verificando `>= 95%` de cobertura.
   - Compilará el paquete TypeScript.
   - Ejecutará `npm publish --provenance --access public`.
   - El flag `--provenance` firma criptográficamente el paquete en npm con un certificado oficial de GitHub (SLSA Build Level 2, cumpliendo **DISA ASD STIG V6R5 `V-222513` / `V-222645`** y **OWASP CycloneDX**), mostrando un escudo verde de verificación criptográfica en la página de npmjs.com.
