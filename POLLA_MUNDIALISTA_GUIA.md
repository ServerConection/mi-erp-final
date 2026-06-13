# ⚽ Polla Mundialista 2026 — Guía de Uso

Módulo de predicciones del Mundial FIFA 2026 (48 selecciones, 12 grupos A–L con el sorteo real). Cada usuario del ERP llena su polla y pronostica los marcadores; el admin registra los resultados reales y el sistema calcula aciertos y puntos automáticamente. Visible para **todos los usuarios** en `/polla-mundialista`.

Horarios siempre en **zona Ecuador** (America/Guayaquil, GMT-5).

---

## 1. Instalación (dos migraciones)

```bash
# 1) Base: equipos, config, predicciones por grupo/fase, ranking
psql $DATABASE_URL -f backend/src/migrations/polla_mundialista.sql

# 2) Calendario oficial + pronósticos de marcador (104 partidos)
psql $DATABASE_URL -f backend/src/migrations/polla_partidos.sql
```

La migración 1 crea 6 tablas con las 48 selecciones del sorteo real. La migración 2 agrega `polla_partidos` (104 partidos del calendario oficial FIFA), `polla_pred_partidos` (marcadores que pronostica cada usuario) y `polla_res_partidos` (marcadores reales del admin), más dos columnas de puntaje en `polla_config`. **No toca tablas existentes.**

> ⚠️ La migración 2 hace `TRUNCATE polla_partidos … CASCADE` para resembrar el calendario de forma idempotente. En la primera ejecución no afecta nada; si la re-ejecutas, se reinician los pronósticos de marcador (no las predicciones de grupos/fases).

El calendario se genera con `gen_partidos.js` (en la raíz, fuera del build): contiene el calendario oficial FIFA con la sede y hora local de cada partido y su offset; Postgres guarda el `kickoff` en UTC y el frontend lo muestra en zona Ecuador. Para regenerar el SQL: `node gen_partidos.js`.

---

## 2. Flujo de uso

### Usuario (cualquier perfil)

1. **🎯 Mi Polla → Fase de Grupos**: en cada grupo **arrastra** las 4 selecciones desde la zona de equipos a las posiciones 1º, 2º, 3º, 4º. Puedes reordenar arrastrando entre posiciones o devolver un equipo a la zona de equipos. Completa los grupos y pulsa **Guardar Grupos**.
2. **🎯 Mi Polla → Fases Finales**: marca con chips qué selecciones llegarán a Dieciseisavos (32), Octavos (16), Cuartos (8), Semis (4), Final (2) y el Campeón (1). Pulsa **Guardar Fases**.
3. **📅 Pronósticos**: el calendario oficial agrupado **por fecha** (zona Ecuador), filtrable por fase. En cada partido coloca el marcador de cada equipo con los steppers y pulsa **Guardar Pronósticos**. Los partidos que ya comenzaron quedan bloqueados automáticamente (🔒).
4. **🏆 Ranking**: podio top 3 + tabla con aciertos de grupos, marcadores y puntos totales.

### Admin (perfil ADMINISTRADOR)

- **📅 Pronósticos**: además del pronóstico propio, cada partido muestra una fila **Real** para registrar el marcador oficial (botón 💾 por partido). Cada guardado recalcula el ranking.
- **📋 Resultados (Admin)**: registra la clasificación real de cada grupo (mismo arrastrar y soltar) y los clasificados reales de cada fase.
- Botón **Cerrar/Abrir** en el header: candado global de predicciones.

---

## 3. Puntaje (configurable en `polla_config`)

| Acierto | Puntos |
|---|---|
| Posición exacta en grupo (1º–4º) | 3 |
| **Marcador exacto de un partido** | **5** |
| **Acertar el resultado (gana/empata)** | **2** |
| Equipo en Dieciseisavos | 2 |
| Equipo en Octavos | 3 |
| Equipo en Cuartos | 5 |
| Equipo en Semis | 7 |
| Finalista | 10 |
| Campeón | 15 |

El marcador exacto y el resultado no se acumulan entre sí: cada partido otorga lo mejor de los dos (exacto **o** resultado). Para cambiar puntos: `UPDATE polla_config SET pts_marcador_exacto = 6 WHERE id = 1;`

---

## 4. Endpoints (`/api/polla`, requieren JWT)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/equipos` | 48 equipos + config + flag esAdmin |
| GET | `/mi-polla` | Predicciones de grupos/fases del usuario |
| PUT | `/mi-polla/grupos` | Guardar orden 1º–4º por grupo |
| PUT | `/mi-polla/fases` | Guardar clasificados por fase |
| GET | `/partidos` | Calendario + pronósticos del usuario + marcadores reales |
| PUT | `/mi-polla/partidos` | Guardar pronósticos de marcador (solo partidos por jugar) |
| GET | `/resultados` | Resultados reales de grupos/fases |
| PUT | `/resultados/grupos` | (admin) Clasificación real de un grupo |
| PUT | `/resultados/fases` | (admin) Clasificados reales de una fase |
| PUT | `/resultados/partidos` | (admin) Marcador real de un partido |
| PUT | `/config` | (admin) Abrir/cerrar predicciones |
| GET | `/ranking` | Ranking de aciertos y puntos |

---

## 5. Calendario y eliminatorias

- **Fase de grupos (72 partidos)**: equipos, sedes y horas exactas del calendario oficial FIFA, convertidas a zona Ecuador.
- **Eliminatorias (32 partidos)**: numeración, fechas, sedes, horas **y cruces oficiales FIFA 2026**. Cada partido guarda además un `home_ref`/`away_ref` legible por máquina para construir el bracket:
  - `1:E` = ganador del Grupo E · `2:C` = 2º del Grupo C
  - `3:A/B/C/D/F` = mejor tercero del clúster de grupos indicado (regla FIFA de los 8 mejores terceros)
  - `W:74` = ganador del partido 74 · `L:101` = perdedor del partido 101
  
  Ejemplos reales de dieciseisavos: `2ºA vs 2ºB` (#73), `1ºE vs 3º(A/B/C/D/F)` (#74), `1ºF vs 2ºC` (#75)… hasta la final `Ganador #101 vs Ganador #102` (#104). El admin asigna los equipos reales y registra los marcadores conforme avanza el torneo.

---

## 6. Archivos del módulo

- `gen_partidos.js` — generador del calendario (raíz del proyecto)
- `backend/src/migrations/polla_mundialista.sql` — base
- `backend/src/migrations/polla_partidos.sql` — calendario + pronósticos
- `backend/src/controllers/pollaMundialista.controller.js`
- `backend/src/routes/pollaMundialista.routes.js`
- `backend/src/app.js` (monta `/api/polla`)
- `frontend/src/pages/PollaMundialista.jsx`
- `frontend/src/App.jsx` (ruta `/polla-mundialista`)
- `frontend/src/layouts/DashboardLayout.jsx` (ítem de menú, visible para todos)

Las banderas se cargan desde `flagcdn.com` (CDN gratuito, sin API key). El arrastrar y soltar usa la API nativa de HTML5 (sin dependencias nuevas) — pensado para escritorio.
