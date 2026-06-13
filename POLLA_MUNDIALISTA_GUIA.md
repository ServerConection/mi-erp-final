# ⚽ Polla Mundialista 2026 — Guía de Uso

Módulo de predicciones del Mundial FIFA 2026 (48 selecciones, 12 grupos A–L con el sorteo real). Cada usuario del ERP llena su polla; el admin registra los resultados reales y el sistema calcula aciertos y puntos automáticamente. Visible para **todos los usuarios** en `/polla-mundialista`.

---

## 1. Instalación (un solo paso)

Ejecuta la migración SQL en tu BD de Render:

```bash
psql $DATABASE_URL -f backend/src/migrations/polla_mundialista.sql
```

Crea 6 tablas nuevas: `polla_equipos` (ya viene con las 48 selecciones reales y sus banderas), `polla_config`, `polla_pred_grupos`, `polla_pred_fases`, `polla_res_grupos`, `polla_res_fases`. **No toca tablas existentes.**

---

## 2. Flujo de uso

### Usuario (cualquier perfil)
1. Entra a **⚽ Polla Mundialista** en el menú lateral.
2. Tab **🎯 Mi Polla → Fase de Grupos**: en cada grupo toca los equipos en orden 1º, 2º, 3º, 4º (toca de nuevo para deshacer). Completa los 12 grupos y pulsa **Guardar Grupos**.
3. Tab **🎯 Mi Polla → Fases Finales**: marca con chips qué selecciones llegarán a Dieciseisavos (32), Octavos (16), Cuartos (8), Semis (4), Final (2) y el Campeón (1). Pulsa **Guardar Fases**.
4. Tab **🏆 Ranking**: podio top 3 + tabla con aciertos por categoría y puntos totales.

### Admin (perfil ADMINISTRADOR)
- Tab **📋 Resultados (Admin)**: registra cómo quedó cada grupo real (mismo sistema de taps) y los clasificados reales de cada fase. Cada guardado recalcula el ranking.
- Botón **Cerrar/Abrir** en el header: candado de predicciones (ciérralo cuando arranque la fase que quieras congelar). Con el candado cerrado los usuarios ven su polla pero no pueden editarla.

---

## 3. Puntaje (configurable en `polla_config`)

| Acierto | Puntos |
|---|---|
| Posición exacta en grupo (1º–4º) | 3 |
| Equipo en Dieciseisavos | 2 |
| Equipo en Octavos | 3 |
| Equipo en Cuartos | 5 |
| Equipo en Semis | 7 |
| Finalista | 10 |
| Campeón | 15 |

Para cambiar puntos: `UPDATE polla_config SET pts_campeon = 20 WHERE id = 1;`

---

## 4. Endpoints (`/api/polla`, requieren JWT)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/equipos` | 48 equipos + config + flag esAdmin |
| GET | `/mi-polla` | Predicciones del usuario |
| PUT | `/mi-polla/grupos` | Guardar orden 1º–4º por grupo |
| PUT | `/mi-polla/fases` | Guardar clasificados por fase |
| GET | `/resultados` | Resultados reales |
| PUT | `/resultados/grupos` | (admin) Resultado real de un grupo |
| PUT | `/resultados/fases` | (admin) Clasificados reales de una fase |
| PUT | `/config` | (admin) Abrir/cerrar predicciones |
| GET | `/ranking` | Ranking de aciertos y puntos |

---

## 5. Archivos del módulo

- `backend/src/migrations/polla_mundialista.sql`
- `backend/src/controllers/pollaMundialista.controller.js`
- `backend/src/routes/pollaMundialista.routes.js`
- `backend/src/app.js` (monta `/api/polla`)
- `frontend/src/pages/PollaMundialista.jsx`
- `frontend/src/App.jsx` (ruta `/polla-mundialista`)
- `frontend/src/layouts/DashboardLayout.jsx` (ítem de menú, visible para todos)

Las banderas se cargan desde `flagcdn.com` (CDN gratuito, sin API key).
