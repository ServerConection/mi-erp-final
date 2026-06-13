-- =============================================================================
-- POLLA MUNDIALISTA 2026
-- Predicciones del Mundial FIFA 2026 (48 selecciones, 12 grupos A-L).
-- Cada usuario predice el orden 1º-4º de cada grupo y los clasificados de cada
-- fase eliminatoria. El admin registra los resultados reales y el sistema
-- calcula aciertos y puntos automáticamente.
-- No toca tablas existentes.
-- Ejecutar: psql $DATABASE_URL -f backend/src/migrations/polla_mundialista.sql
-- =============================================================================

-- Equipos (seed con el sorteo real del 5-dic-2025 + repechajes de marzo 2026)
CREATE TABLE IF NOT EXISTS polla_equipos (
  id      SERIAL PRIMARY KEY,
  grupo   CHAR(1)     NOT NULL,
  nombre  VARCHAR(60) NOT NULL,
  codigo  VARCHAR(10) NOT NULL,          -- código de bandera (flagcdn)
  orden   SMALLINT    NOT NULL DEFAULT 0, -- orden del sorteo dentro del grupo
  UNIQUE (grupo, nombre)
);

-- Configuración global (puntos y candado de predicciones)
CREATE TABLE IF NOT EXISTS polla_config (
  id                    SMALLINT PRIMARY KEY DEFAULT 1,
  predicciones_abiertas BOOLEAN  NOT NULL DEFAULT TRUE,
  pts_posicion_exacta   SMALLINT NOT NULL DEFAULT 3,
  pts_dieciseisavos     SMALLINT NOT NULL DEFAULT 2,
  pts_octavos           SMALLINT NOT NULL DEFAULT 3,
  pts_cuartos           SMALLINT NOT NULL DEFAULT 5,
  pts_semis             SMALLINT NOT NULL DEFAULT 7,
  pts_final             SMALLINT NOT NULL DEFAULT 10,
  pts_campeon           SMALLINT NOT NULL DEFAULT 15,
  updated_at            TIMESTAMPTZ DEFAULT now()
);
INSERT INTO polla_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Predicción de posiciones por grupo (1º a 4º) de cada usuario
CREATE TABLE IF NOT EXISTS polla_pred_grupos (
  id         SERIAL PRIMARY KEY,
  usuario_id INT      NOT NULL,
  grupo      CHAR(1)  NOT NULL,
  equipo_id  INT      NOT NULL REFERENCES polla_equipos(id),
  posicion   SMALLINT NOT NULL CHECK (posicion BETWEEN 1 AND 4),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, grupo, posicion),
  UNIQUE (usuario_id, equipo_id)
);
CREATE INDEX IF NOT EXISTS idx_polla_pred_grupos_usuario ON polla_pred_grupos(usuario_id);

-- Predicción de clasificados por fase de cada usuario
-- Fases: DIECISEISAVOS (32), OCTAVOS (16), CUARTOS (8), SEMIS (4), FINAL (2), CAMPEON (1)
CREATE TABLE IF NOT EXISTS polla_pred_fases (
  id         SERIAL PRIMARY KEY,
  usuario_id INT         NOT NULL,
  fase       VARCHAR(20) NOT NULL,
  equipo_id  INT         NOT NULL REFERENCES polla_equipos(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, fase, equipo_id)
);
CREATE INDEX IF NOT EXISTS idx_polla_pred_fases_usuario ON polla_pred_fases(usuario_id);

-- Resultados reales: posiciones finales de cada grupo (los registra el admin)
CREATE TABLE IF NOT EXISTS polla_res_grupos (
  grupo     CHAR(1)  NOT NULL,
  equipo_id INT      NOT NULL REFERENCES polla_equipos(id),
  posicion  SMALLINT NOT NULL CHECK (posicion BETWEEN 1 AND 4),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (grupo, posicion),
  UNIQUE (equipo_id)
);

-- Resultados reales: equipos que llegaron a cada fase
CREATE TABLE IF NOT EXISTS polla_res_fases (
  fase      VARCHAR(20) NOT NULL,
  equipo_id INT         NOT NULL REFERENCES polla_equipos(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (fase, equipo_id)
);

-- =============================================================================
-- SEED: 48 selecciones del Mundial 2026 (sorteo real)
-- =============================================================================
INSERT INTO polla_equipos (grupo, nombre, codigo, orden) VALUES
  ('A', 'México',               'mx',     1),
  ('A', 'Sudáfrica',            'za',     2),
  ('A', 'Corea del Sur',        'kr',     3),
  ('A', 'República Checa',      'cz',     4),
  ('B', 'Canadá',               'ca',     1),
  ('B', 'Bosnia y Herzegovina', 'ba',     2),
  ('B', 'Catar',                'qa',     3),
  ('B', 'Suiza',                'ch',     4),
  ('C', 'Brasil',               'br',     1),
  ('C', 'Marruecos',            'ma',     2),
  ('C', 'Haití',                'ht',     3),
  ('C', 'Escocia',              'gb-sct', 4),
  ('D', 'Estados Unidos',       'us',     1),
  ('D', 'Paraguay',             'py',     2),
  ('D', 'Australia',            'au',     3),
  ('D', 'Turquía',              'tr',     4),
  ('E', 'Alemania',             'de',     1),
  ('E', 'Curazao',              'cw',     2),
  ('E', 'Costa de Marfil',      'ci',     3),
  ('E', 'Ecuador',              'ec',     4),
  ('F', 'Países Bajos',         'nl',     1),
  ('F', 'Japón',                'jp',     2),
  ('F', 'Suecia',               'se',     3),
  ('F', 'Túnez',                'tn',     4),
  ('G', 'Bélgica',              'be',     1),
  ('G', 'Egipto',               'eg',     2),
  ('G', 'Irán',                 'ir',     3),
  ('G', 'Nueva Zelanda',        'nz',     4),
  ('H', 'España',               'es',     1),
  ('H', 'Cabo Verde',           'cv',     2),
  ('H', 'Arabia Saudita',       'sa',     3),
  ('H', 'Uruguay',              'uy',     4),
  ('I', 'Francia',              'fr',     1),
  ('I', 'Senegal',              'sn',     2),
  ('I', 'Irak',                 'iq',     3),
  ('I', 'Noruega',              'no',     4),
  ('J', 'Argentina',            'ar',     1),
  ('J', 'Argelia',              'dz',     2),
  ('J', 'Austria',              'at',     3),
  ('J', 'Jordania',             'jo',     4),
  ('K', 'Portugal',             'pt',     1),
  ('K', 'RD Congo',             'cd',     2),
  ('K', 'Uzbekistán',           'uz',     3),
  ('K', 'Colombia',             'co',     4),
  ('L', 'Inglaterra',           'gb-eng', 1),
  ('L', 'Croacia',              'hr',     2),
  ('L', 'Ghana',                'gh',     3),
  ('L', 'Panamá',               'pa',     4)
ON CONFLICT (grupo, nombre) DO NOTHING;
