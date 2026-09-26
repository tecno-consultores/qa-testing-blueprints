# Integración Autónoma con Agentes de IA[cite: 19]

Este documento detalla cómo evolucionar de una interacción manual (copiar y pegar los archivos `.md` en una ventana de chat) a un flujo de trabajo automatizado, donde los agentes de Inteligencia Artificial ingieren, aplican y ejecutan los *blueprints* de QA de forma autónoma.[cite: 19]

## 1. Ingestión de Reglas mediante MCP (Model Context Protocol)[cite: 19]
Para que un agente comprenda las restricciones corporativas en tiempo real, los *blueprints* deben exponerse como recursos dinámicos.[cite: 19]

* **El Concepto:** Evita darle a la IA acceso irrestricto de lectura a todo tu disco duro.[cite: 19] Usa un servidor MCP para exponer únicamente las reglas que necesita.[cite: 19]
* **Ejemplo Práctico 1 (Servidor Oficial):** Puedes exponer la carpeta de directrices usando el servidor de Node.js oficial dentro de la configuración de tu agente:[cite: 19]
  ```bash
  npx -y @modelcontextprotocol/server-filesystem /ruta/absoluta/a/qa-testing-blueprints
  ```
* **Ejemplo Práctico 2 (Recursos Custom en Python):** Configura un servidor MCP que exponga los archivos `.md` como *Recursos* estáticos (URIs).[cite: 19] Cuando el agente detecta que está en un proyecto Python, consulta `blueprints://python/fastapi`.[cite: 19] El servidor lee el archivo local y le devuelve el prompt inyectando la regla inquebrantable del 95% de cobertura.[cite: 19]

## 2. Orquestación Multi-Agente (Arquitecturas tipo Pantheon / Hermes)[cite: 19]
Las pruebas de alta exigencia (mutación, SAST, BDD) abruman el contexto si un solo agente intenta programar la aplicación y auditarla al mismo tiempo. Se debe implementar una separación de roles.

* **El Concepto:** Un Agente Developer escribe el código; un Agente Auditor (QA) vigila que se cumplan las reglas del *blueprint*.[cite: 19]
* **Sugerencia de Implementación (System Prompt para el Agente QA):**[cite: 19]
  > *"Eres un auditor de QA implacable.[cite: 19] Tu única fuente de la verdad es el archivo de reglas ingerido vía MCP.[cite: 19] Si el Agente Developer propone comandos locales como `pip install` o `npm run test`, RECHAZA el código. Exígele estrictamente usar `docker compose -f docker-compose.qa.yml run --rm` y orquestar dependencias al vuelo sin afectar la configuración del proyecto anfitrión."*
* **Flujo:** Si el Developer crea un script de Bash destructivo sin usar `bats-mock`, el Agente QA intercepta el paso y obliga a refactorizar la prueba antes de dar el trabajo por terminado.

## 3. Optimización del Contexto con Proxies de Inferencia (OmniRoute)[cite: 19]
El ciclo de auto-corrección consume masivamente tokens de entrada, especialmente al procesar volcados de error largos o reportes de cobertura en HTML.

* **El Concepto:** No gastes tokens de modelos de alto razonamiento (y alto costo) en arreglar un problema de espacios en blanco.
* **Ejemplo de Enrutamiento (Routing):**
  * **Tareas Mecánicas:** Configura OmniRoute para enrutar los errores de `shfmt`, `ShellCheck` o `Ruff` hacia un modelo local rápido y económico (ej. *Llama 3 8B* o *Hermes 3 8B*). Corregir indentación no requiere inteligencia avanzada.
  * **Tareas Lógicas:** Si una prueba de mutación en `Stryker` o `mutmut` falla, o hay un interbloqueo reportado por `Artillery`, enruta ese volcado al modelo de más alto razonamiento (ej. *Hermes 3 70B* o *Claude 3.5 Sonnet*), ya que requiere analizar el flujo de negocio para entender por qué la prueba es defectuosa.

## 4. Sandboxing: Permisos de Ejecución (Tool Calling)[cite: 19]
El ecosistema de `qa-testing-blueprints` está diseñado intencionalmente para ser el entorno de juegos de la IA.[cite: 19] Como todas las pruebas ocurren en contenedores que se autodestruyen, es seguro darle a la IA acceso de ejecución.[cite: 19]

* **El Concepto:** Proporcionar al agente una herramienta (`tool_call`) para ejecutar comandos en la terminal, pero bloqueando el acceso al host real.[cite: 19]
* **Ejemplo Práctico de Restricción (Python):** En la definición de tu herramienta para la IA, aplica una validación estricta antes de invocar el subproceso:[cite: 19]
  ```python
  def ejecutar_comando_qa(comando: str) -> str:
      if not comando.startswith("docker compose -f docker-compose.qa.yml run --rm"):
          return "ERROR: Operación denegada. Política corporativa: Solo puedes ejecutar pruebas dentro de contenedores efímeros usando 'docker compose -f docker-compose.qa.yml run --rm'."
      
      # Ejecuta de forma segura
      resultado = subprocess.run(comando, shell=True, capture_output=True, text=True)[cite: 19]
      return resultado.stdout if resultado.returncode == 0 else resultado.stderr[cite: 19]
  ```
* **El Bucle Autónomo:** El agente ejecuta `ejecutar_comando_qa("docker compose -f docker-compose.qa.yml run --rm qa-bash bats test/")`.[cite: 19] Si `kcov` reporta solo un 85% de cobertura, la IA lee el `stderr`, comprende qué línea faltó, escribe la prueba en su propio entorno interno, y vuelve a invocar la herramienta hasta alcanzar el 95%, entregando un Pull Request perfecto y verificado.
