---
name: 🚀 Plantilla de Pull Request Corporativa
about: Usa esta plantilla para someter cambios al ecosistema QA Testing Blueprints.
---

## 📝 Descripción del Cambio
<!-- Describe claramente qué hace este Pull Request, qué problema resuelve y por qué esta aproximación es la mejor. -->
<!-- Si este PR resuelve un Issue abierto, enlázalo aquí usando la sintaxis oficial (ej. "Closes #123" o "Fixes #123") -->


## 🔄 Tipo de PR
<!-- Marca con una 'x' entre los corchetes la opción que corresponda: [x] -->
- [ ] 🐛 Corrección de Bug (`fix`)
- [ ] 🚀 Nueva Herramienta / Funcionalidad QA (`feat`)
- [ ] 📚 Actualización de Documentación (`docs`)
- [ ] 💅 Formateo / Estilo / Calidad (`style` / `chore`)
- [ ] ♻️ Refactorización / Optimización (`refactor` / `perf`)

## ✅ Checklist de Calidad Corporativa (Estándar 10X)
<!-- DEBES marcar todas las casillas aplicables comprobando que cumples nuestras políticas. Un PR que no cumpla esto será rechazado. -->
- [ ] **Efimeridad:** El código funciona estrictamente usando imágenes oficiales y `docker compose -f docker-compose.qa.yml run --rm`. Cero compilaciones locales.
- [ ] **Cobertura Innegociable:** He verificado localmente que las pruebas pasan con al menos un **95% de cobertura**.
- [ ] **Aislamiento y Mocking:** Las nuevas pruebas unitarias no dependen de latencia de red. Utilicé herramientas de intercepción (`nock`, `pytest-mock`, `bats-mock`).
- [ ] **Deuda Técnica:** Validé que la complejidad ciclomática se mantiene en grado A o B (pasando las reglas de `radon` o `eslint-plugin-sonarjs`).
- [ ] **Limpieza de Entorno:** Ejecuté el script `sudo ./limpieza.sh` del ecosistema afectado y confirmé que purga correctamente los nuevos artefactos generados.
- [ ] **Historial Semántico:** Mis commits siguen estrictamente las reglas de `commitlint` (ej. `feat(python): integra py-spy para profiling`).

## 📸 Evidencia de Ejecución (Logs / Screenshots)
<!-- Pega aquí el volcado de la terminal (stdout) demostrando que la ejecución en el contenedor efímero fue exitosa y reportó >95% de cobertura. -->
```text
(Pega tus logs aquí)
```
