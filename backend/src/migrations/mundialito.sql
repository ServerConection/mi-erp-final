-- =============================================================================
-- MIGRACION: MUNDIALITO - Programa de Aceleracion Comercial
-- =============================================================================
-- Crea tablas nuevas para gestionar torneos de incentivo estilo Mundial
-- entre asesores. NO modifica ninguna tabla existente.
--
-- Ejecutar con: psql $DATABASE_URL -f backend/src/migrations/mundialito.sql
-- =============================================================================

BEGIN;

-- 1. Torneos -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mundialito_torneos (
  id              SERIAL PRIMARY KEY,
  empresa         VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET','VELSA')),
  nombre          VARCHAR(120) NOT NULL,
  fase            VARCHAR(20) NOT NULL DEFAULT 'GRUPOS'
                  CHECK (fase IN ('GRUPOS','OCTAVOS','CUARTOS','SEMIS','FINAL')),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  estado          VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
                  CHECK (estado IN ('BORRADOR','ACTIVO','CERRADO')),
  reglas_json     JSONB NOT NULL DEFAULT '{
    "gol_por_venta": 1,
    "bono_90min_goles": 2,
    "bono_mismo_dia_goles": 1,
    "pts_victoria": 3,
    "pts_empate": 1,
    "pts_derrota": 0,
    "bono_kpi_eficiencia_pct": 85,
    "bono_kpi_eficiencia_pts": 5,
    "bono_kpi_velocidad_min": 2,
    "bono_kpi_velocidad_pts": 3,
    "bono_kpi_conversion_pct": 18,
    "bono_kpi_conversion_pts": 3,
    "premio_dia_normal": 1.00,
    "premio_dia_acelerado": 1.50
  }'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mundialito_torneos_empresa_estado
  ON mundialito_torneos (empresa, estado);

-- 2. Grupos ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mundialito_grupos (
  id          SERIAL PRIMARY KEY,
  torneo_id   INT NOT NULL REFERENCES mundialito_torneos(id) ON DELETE CASCADE,
  nombre      VARCHAR(60) NOT NULL,
  color_hex   VARCHAR(7) DEFAULT '#3b82f6',
  orden       INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mundialito_grupos_torneo
  ON mundialito_grupos (torneo_id);

-- 3. Participantes (snapshot al sorteo) --------------------------------------
CREATE TABLE IF NOT EXISTS mundialito_participantes (
  id          SERIAL PRIMARY KEY,
  torneo_id   INT NOT NULL REFERENCES mundialito_torneos(id) ON DELETE CASCADE,
  grupo_id    INT REFERENCES mundialito_grupos(id) ON DELETE SET NULL,
  asesor_key  VARCHAR(120) NOT NULL,   -- nombre_grupo o identificador del indicador
  nombre      VARCHAR(120) NOT NULL,
  foto_url    TEXT,
  empresa     VARCHAR(20) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (torneo_id, asesor_key)
);
CREATE INDEX IF NOT EXISTS idx_mundialito_part_torneo
  ON mundialito_participantes (torneo_id);
CREATE INDEX IF NOT EXISTS idx_mundialito_part_grupo
  ON mundialito_participantes (grupo_id);

-- 4. Partidos diarios --------------------------------------------------------
CREATE TABLE IF NOT EXISTS mundialito_partidos (
  id                   SERIAL PRIMARY KEY,
  torneo_id            INT NOT NULL REFERENCES mundialito_torneos(id) ON DELETE CASCADE,
  fecha                DATE NOT NULL,
  jugador_local_id     INT NOT NULL REFERENCES mundialito_participantes(id),
  jugador_visitante_id INT NOT NULL REFERENCES mundialito_participantes(id),
  goles_local          INT NOT NULL DEFAULT 0,
  goles_visitante      INT NOT NULL DEFAULT 0,
  puntos_local         INT NOT NULL DEFAULT 0,
  puntos_visitante     INT NOT NULL DEFAULT 0,
  cerrado              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CHECK (jugador_local_id <> jugador_visitante_id)
);
CREATE INDEX IF NOT EXISTS idx_mundialito_partidos_torneo_fecha
  ON mundialito_partidos (torneo_id, fecha);

-- 5. Goles individuales (log para animaciones live) --------------------------
CREATE TABLE IF NOT EXISTS mundialito_goles (
  id            SERIAL PRIMARY KEY,
  torneo_id     INT NOT NULL REFERENCES mundialito_torneos(id) ON DELETE CASCADE,
  partido_id    INT REFERENCES mundialito_partidos(id) ON DELETE SET NULL,
  asesor_id     INT NOT NULL REFERENCES mundialito_participantes(id),
  fecha_hora    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo          VARCHAR(30) NOT NULL
                CHECK (tipo IN ('VENTA','BONO_90MIN','BONO_MISMO_DIA','BONO_KPI_EFI','BONO_KPI_VEL','BONO_KPI_CONV','MANUAL')),
  cantidad      INT NOT NULL DEFAULT 1,
  descripcion   TEXT,
  venta_ref     VARCHAR(60),   -- ID de bitrix_deals o equivalente si aplica
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mundialito_goles_torneo_fecha
  ON mundialito_goles (torneo_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_mundialito_goles_asesor
  ON mundialito_goles (asesor_id);

-- 6. Premios y liquidacion ---------------------------------------------------
CREATE TABLE IF NOT EXISTS mundialito_premios (
  id           SERIAL PRIMARY KEY,
  torneo_id    INT NOT NULL REFERENCES mundialito_torneos(id) ON DELETE CASCADE,
  asesor_id    INT NOT NULL REFERENCES mundialito_participantes(id),
  monto        NUMERIC(10,2) NOT NULL DEFAULT 0,
  motivo       VARCHAR(120) NOT NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  pagado       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mundialito_premios_torneo
  ON mundialito_premios (torneo_id);

-- 7. Top 10 (incentivo de productividad) -------------------------------------
CREATE TABLE IF NOT EXISTS mundialito_top10 (
  id            SERIAL PRIMARY KEY,
  torneo_id     INT NOT NULL REFERENCES mundialito_torneos(id) ON DELETE CASCADE,
  asesor_id     INT NOT NULL REFERENCES mundialito_participantes(id),
  posicion      INT NOT NULL,
  beneficio     VARCHAR(120) DEFAULT 'Horario flexible / Tarde libre',
  notificado    BOOLEAN DEFAULT FALSE,
  disfrutado    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (torneo_id, posicion)
);

-- 8. Vista materializada de tabla de posiciones ------------------------------
-- (CREATE VIEW para permitir actualizaciones instantaneas)
CREATE OR REPLACE VIEW v_mundialito_posiciones AS
SELECT
  p.id                AS participante_id,
  p.torneo_id,
  p.grupo_id,
  g.nombre            AS grupo_nombre,
  g.color_hex         AS grupo_color,
  p.nombre            AS asesor_nombre,
  p.foto_url,
  COALESCE(SUM(gol.cantidad), 0)::INT AS goles_totales,
  (
    SELECT COALESCE(SUM(CASE WHEN pa.jugador_local_id = p.id THEN pa.puntos_local
                             WHEN pa.jugador_visitante_id = p.id THEN pa.puntos_visitante
                             ELSE 0 END), 0)
    FROM mundialito_partidos pa
    WHERE pa.torneo_id = p.torneo_id
      AND (pa.jugador_local_id = p.id OR pa.jugador_visitante_id = p.id)
  )::INT AS puntos_partidos,
  (
    SELECT COUNT(*)::INT FROM mundialito_partidos pa
    WHERE pa.torneo_id = p.torneo_id
      AND (pa.jugador_local_id = p.id OR pa.jugador_visitante_id = p.id)
      AND pa.cerrado = TRUE
  ) AS pj,
  (
    SELECT COUNT(*)::INT FROM mundialito_partidos pa
    WHERE pa.torneo_id = p.torneo_id
      AND ((pa.jugador_local_id = p.id AND pa.goles_local > pa.goles_visitante)
        OR (pa.jugador_visitante_id = p.id AND pa.goles_visitante > pa.goles_local))
      AND pa.cerrado = TRUE
  ) AS pg,
  (
    SELECT COUNT(*)::INT FROM mundialito_partidos pa
    WHERE pa.torneo_id = p.torneo_id
      AND (pa.jugador_local_id = p.id OR pa.jugador_visitante_id = p.id)
      AND pa.goles_local = pa.goles_visitante
      AND pa.cerrado = TRUE
  ) AS pe,
  (
    SELECT COUNT(*)::INT FROM mundialito_partidos pa
    WHERE pa.torneo_id = p.torneo_id
      AND ((pa.jugador_local_id = p.id AND pa.goles_local < pa.goles_visitante)
        OR (pa.jugador_visitante_id = p.id AND pa.goles_visitante < pa.goles_local))
      AND pa.cerrado = TRUE
  ) AS pp
FROM mundialito_participantes p
LEFT JOIN mundialito_grupos g ON g.id = p.grupo_id
LEFT JOIN mundialito_goles gol ON gol.asesor_id = p.id
WHERE p.activo = TRUE
GROUP BY p.id, p.torneo_id, p.grupo_id, g.nombre, g.color_hex, p.nombre, p.foto_url;

COMMIT;
