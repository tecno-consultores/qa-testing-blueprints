---
name: 🐛 Reporte de Error (Bug)
about: Reporta un fallo en la ejecución de los contenedores, scripts o dependencias
title: 'fix(ecosistema): [Descripción corta del error]'
labels: bug, triage
assignees: ''
---

## 🛑 Descripción del Problema
Un resumen claro y conciso de lo que está fallando (ej. "El contenedor de Playwright arroja Exit Code 137 por falta de memoria").

## 👣 Pasos para Reproducir
Ejecuté los siguientes comandos en la terminal:
1. `docker compose -f docker-compose.qa.yml up -d [servicio]`
2. `docker compose -f docker-compose.qa.yml run --rm [servicio] [comando]`
3. El error que apareció fue...

## 🎯 Comportamiento Esperado
Un resumen claro de lo que debería haber pasado (ej. "El reporte de cobertura HTML debió guardarse en el host local").

## 💻 Entorno de Ejecución
- **Ecosistema Afectado:** [ej. Python/FastAPI, Node/Vue3, Bash]
- **Sistema Operativo (Host):** [ej. Ubuntu 22.04, Proxmox LXC, Windows/WSL2]
- **Versión de Docker Compose:** [ej. v2.24.5]

## 📋 Logs o Capturas de Pantalla
```text
Pega aquí el volcado de error (Stack trace) de la terminal.
```
