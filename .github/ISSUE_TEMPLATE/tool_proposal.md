---
name: 🚀 Propuesta de Herramienta QA
about: Sugerir un nuevo linter, profiler, framework de estrés o herramienta de seguridad
title: 'feat(ecosistema): integra [nombre de la herramienta]'
labels: enhancement, tool-proposal
assignees: ''
---

## 🛠️ Herramienta Propuesta
- **Nombre de la herramienta:** 
- **Ecosistema objetivo:** [ej. Vue3, FastAPI, Node]
- **Documentación oficial:** [Link]

## 🎯 ¿Qué problema de calidad resuelve?
Explica por qué necesitamos esta herramienta. (ej. "Actualmente no medimos la latencia de red en las pruebas de mutación, esta herramienta cubre ese punto ciego").

## 🐳 Ejecución Efímera (Prueba de Concepto)
Demuestra cómo ejecutaríamos esta herramienta usando nuestra arquitectura actual de Docker Compose. Escribe el comando propuesto:

```bash
docker compose -f docker-compose.qa.yml run --rm [servicio] [comando propuesto]
```

## ✅ Checklist Corporativo
- [ ] Confirmo que la herramienta no requiere compilar imágenes locales (Cero `docker build`).
- [ ] Confirmo que la herramienta puede instalarse al vuelo en nuestras imágenes `sinfallas/*`.
- [ ] La herramienta no requiere permisos `root` en la máquina anfitriona (a menos que se justifique con Profiling).
