// Generador del seed de partidos del Mundial 2026 (calendario oficial FIFA).
// kickoff se escribe como TIMESTAMPTZ con el offset de la sede (junio/julio 2026).
// Postgres lo guarda en UTC; el frontend lo muestra en zona Ecuador (America/Guayaquil).

const V = {
  MEX:['Estadio Ciudad de México','Ciudad de México','-06'],
  GDL:['Estadio Guadalajara','Zapopan','-06'],
  MTY:['Estadio Monterrey','Guadalupe','-06'],
  TOR:['Estadio Toronto','Toronto','-04'],
  LA :['Estadio Los Ángeles','Los Ángeles','-07'],
  SF :['Estadio Bahía de San Francisco','San Francisco','-07'],
  NJ :['Estadio Nueva York/Nueva Jersey','Nueva Jersey','-04'],
  BOS:['Estadio Boston','Boston','-04'],
  VAN:['BC Place','Vancouver','-07'],
  HOU:['Estadio Houston','Houston','-05'],
  DAL:['Estadio Dallas','Dallas','-05'],
  PHI:['Estadio Filadelfia','Filadelfia','-04'],
  ATL:['Estadio Atlanta','Atlanta','-04'],
  MIA:['Estadio Miami','Miami','-04'],
  KC :['Estadio Kansas City','Kansas City','-05'],
  SEA:['Estadio Seattle','Seattle','-07'],
};

// [grupo, home, away, fecha, hora_local, sedeKey]
const G = [
 ['A','México','Sudáfrica','2026-06-11','13:00','MEX'],
 ['A','Corea del Sur','República Checa','2026-06-11','20:00','GDL'],
 ['B','Canadá','Bosnia y Herzegovina','2026-06-12','15:00','TOR'],
 ['D','Estados Unidos','Paraguay','2026-06-12','18:00','LA'],
 ['B','Catar','Suiza','2026-06-13','12:00','SF'],
 ['C','Brasil','Marruecos','2026-06-13','18:00','NJ'],
 ['C','Haití','Escocia','2026-06-13','21:00','BOS'],
 ['D','Australia','Turquía','2026-06-13','18:00','VAN'],
 ['E','Alemania','Curazao','2026-06-14','12:00','HOU'],
 ['F','Países Bajos','Japón','2026-06-14','15:00','DAL'],
 ['E','Costa de Marfil','Ecuador','2026-06-14','19:00','PHI'],
 ['F','Suecia','Túnez','2026-06-14','20:00','MTY'],
 ['H','España','Cabo Verde','2026-06-15','12:00','ATL'],
 ['G','Bélgica','Egipto','2026-06-15','12:00','VAN'],
 ['H','Arabia Saudita','Uruguay','2026-06-15','18:00','MIA'],
 ['G','Irán','Nueva Zelanda','2026-06-15','18:00','LA'],
 ['I','Francia','Senegal','2026-06-16','15:00','NJ'],
 ['I','Irak','Noruega','2026-06-16','18:00','BOS'],
 ['J','Argentina','Argelia','2026-06-16','20:00','KC'],
 ['J','Austria','Jordania','2026-06-16','21:00','SF'],
 ['K','Portugal','RD Congo','2026-06-17','12:00','HOU'],
 ['L','Inglaterra','Croacia','2026-06-17','15:00','DAL'],
 ['L','Ghana','Panamá','2026-06-17','19:00','TOR'],
 ['K','Uzbekistán','Colombia','2026-06-17','20:00','MEX'],
 ['A','República Checa','Sudáfrica','2026-06-18','12:00','ATL'],
 ['B','Suiza','Bosnia y Herzegovina','2026-06-18','12:00','LA'],
 ['B','Canadá','Catar','2026-06-18','15:00','VAN'],
 ['A','México','Corea del Sur','2026-06-18','19:00','GDL'],
 ['C','Escocia','Marruecos','2026-06-19','18:00','BOS'],
 ['D','Estados Unidos','Australia','2026-06-19','12:00','SEA'],
 ['C','Brasil','Haití','2026-06-19','20:30','PHI'],
 ['D','Turquía','Paraguay','2026-06-19','21:00','SF'],
 ['F','Países Bajos','Suecia','2026-06-20','12:00','HOU'],
 ['E','Alemania','Costa de Marfil','2026-06-20','16:00','TOR'],
 ['E','Ecuador','Curazao','2026-06-20','19:00','KC'],
 ['F','Túnez','Japón','2026-06-20','22:00','MTY'],
 ['H','España','Arabia Saudita','2026-06-21','12:00','ATL'],
 ['G','Bélgica','Irán','2026-06-21','12:00','LA'],
 ['H','Uruguay','Cabo Verde','2026-06-21','18:00','MIA'],
 ['G','Nueva Zelanda','Egipto','2026-06-21','18:00','VAN'],
 ['J','Argentina','Austria','2026-06-22','12:00','DAL'],
 ['I','Francia','Irak','2026-06-22','17:00','PHI'],
 ['I','Noruega','Senegal','2026-06-22','20:00','NJ'],
 ['J','Jordania','Argelia','2026-06-22','20:00','SF'],
 ['K','Portugal','Uzbekistán','2026-06-23','12:00','HOU'],
 ['L','Inglaterra','Ghana','2026-06-23','16:00','BOS'],
 ['L','Panamá','Croacia','2026-06-23','19:00','TOR'],
 ['K','Colombia','RD Congo','2026-06-23','20:00','GDL'],
 ['B','Suiza','Canadá','2026-06-24','12:00','VAN'],
 ['B','Bosnia y Herzegovina','Catar','2026-06-24','12:00','SEA'],
 ['C','Escocia','Brasil','2026-06-24','18:00','MIA'],
 ['C','Marruecos','Haití','2026-06-24','18:00','ATL'],
 ['A','República Checa','México','2026-06-24','19:00','MEX'],
 ['A','Sudáfrica','Corea del Sur','2026-06-24','19:00','MTY'],
 ['E','Ecuador','Alemania','2026-06-25','16:00','NJ'],
 ['E','Curazao','Costa de Marfil','2026-06-25','16:00','PHI'],
 ['F','Japón','Suecia','2026-06-25','18:00','DAL'],
 ['F','Túnez','Países Bajos','2026-06-25','18:00','KC'],
 ['D','Turquía','Estados Unidos','2026-06-25','19:00','LA'],
 ['D','Paraguay','Australia','2026-06-25','19:00','SF'],
 ['I','Noruega','Francia','2026-06-26','15:00','BOS'],
 ['I','Senegal','Irak','2026-06-26','15:00','TOR'],
 ['H','Cabo Verde','Arabia Saudita','2026-06-26','19:00','HOU'],
 ['H','Uruguay','España','2026-06-26','18:00','GDL'],
 ['G','Egipto','Irán','2026-06-26','20:00','SEA'],
 ['G','Nueva Zelanda','Bélgica','2026-06-26','20:00','VAN'],
 ['L','Panamá','Inglaterra','2026-06-27','17:00','NJ'],
 ['L','Croacia','Ghana','2026-06-27','17:00','PHI'],
 ['K','Colombia','Portugal','2026-06-27','19:30','MIA'],
 ['K','RD Congo','Uzbekistán','2026-06-27','19:30','ATL'],
 ['J','Argelia','Austria','2026-06-27','21:00','KC'],
 ['J','Jordania','Argentina','2026-06-27','21:00','DAL'],
];

// Eliminatorias — numeración y cruces OFICIALES FIFA 2026 (match 73-104).
// [fase, fecha, hora, sedeKey, homeRef, awayRef]
// Refs: 1:E=ganador grupo E · 2:C=2º grupo C · 3:A/B/C/D/F=mejor 3º del clúster
//       W:74=ganador del partido 74 · L:101=perdedor del partido 101
const K = [
 ['R32','2026-06-28','12:00','LA','2:A','2:B'],
 ['R32','2026-06-29','16:30','BOS','1:E','3:A/B/C/D/F'],
 ['R32','2026-06-29','19:00','MTY','1:F','2:C'],
 ['R32','2026-06-29','12:00','HOU','1:C','2:F'],
 ['R32','2026-06-30','17:00','NJ','1:I','3:C/D/F/G/H'],
 ['R32','2026-06-30','12:00','DAL','2:E','2:I'],
 ['R32','2026-06-30','19:00','MEX','1:A','3:C/E/F/H/I'],
 ['R32','2026-07-01','12:00','ATL','1:L','3:E/H/I/J/K'],
 ['R32','2026-07-01','17:00','SF','1:D','3:B/E/F/I/J'],
 ['R32','2026-07-01','13:00','SEA','1:G','3:A/E/H/I/J'],
 ['R32','2026-07-02','19:00','TOR','2:K','2:L'],
 ['R32','2026-07-02','12:00','LA','1:H','2:J'],
 ['R32','2026-07-02','20:00','VAN','1:B','3:E/F/G/I/J'],
 ['R32','2026-07-03','18:00','MIA','1:J','2:H'],
 ['R32','2026-07-03','20:30','KC','1:K','3:D/E/I/J/L'],
 ['R32','2026-07-03','13:00','DAL','2:D','2:G'],
 ['R16','2026-07-04','17:00','PHI','W:74','W:77'],
 ['R16','2026-07-04','12:00','HOU','W:73','W:75'],
 ['R16','2026-07-05','16:00','NJ','W:76','W:78'],
 ['R16','2026-07-05','18:00','MEX','W:79','W:80'],
 ['R16','2026-07-06','14:00','DAL','W:83','W:84'],
 ['R16','2026-07-06','17:00','SEA','W:81','W:82'],
 ['R16','2026-07-07','12:00','ATL','W:86','W:88'],
 ['R16','2026-07-07','13:00','VAN','W:85','W:87'],
 ['CUARTOS','2026-07-09','16:00','BOS','W:89','W:90'],
 ['CUARTOS','2026-07-10','12:00','LA','W:93','W:94'],
 ['CUARTOS','2026-07-11','17:00','MIA','W:91','W:92'],
 ['CUARTOS','2026-07-11','20:00','KC','W:95','W:96'],
 ['SEMIS','2026-07-14','14:00','DAL','W:97','W:98'],
 ['SEMIS','2026-07-15','15:00','ATL','W:99','W:100'],
 ['TERCER','2026-07-18','17:00','MIA','L:101','L:102'],
 ['FINAL','2026-07-19','15:00','NJ','W:101','W:102'],
];

// Etiqueta legible a partir del ref
const labelFromRef = (ref) => {
  const [t, v] = ref.split(":");
  if (t === "1") return `1º ${v}`;
  if (t === "2") return `2º ${v}`;
  if (t === "3") return `3º (${v})`;
  if (t === "W") return `Ganador #${v}`;
  if (t === "L") return `Perdedor #${v}`;
  return ref;
};

const q = (s) => s.replace(/'/g, "''");
const ts = (fecha, hora, off) => `${fecha} ${hora}:00${off}`;
let n = 0;
const rows = [];

for (const [grupo, home, away, fecha, hora, vk] of G) {
  n++;
  const [sede, ciudad, off] = V[vk];
  rows.push(
    `(${n},'GRUPOS','${grupo}','${ts(fecha,hora,off)}','${q(sede)}','${q(ciudad)}',` +
    `(SELECT id FROM polla_equipos WHERE grupo='${grupo}' AND nombre='${q(home)}'),` +
    `(SELECT id FROM polla_equipos WHERE grupo='${grupo}' AND nombre='${q(away)}'),` +
    `'${q(home)}','${q(away)}',NULL,NULL)`
  );
}
for (const [fase, fecha, hora, vk, hr, ar] of K) {
  n++;
  const [sede, ciudad, off] = V[vk];
  rows.push(
    `(${n},'${fase}',NULL,'${ts(fecha,hora,off)}','${q(sede)}','${q(ciudad)}',` +
    `NULL,NULL,'${q(labelFromRef(hr))}','${q(labelFromRef(ar))}','${q(hr)}','${q(ar)}')`
  );
}

const header = `-- =============================================================================
-- POLLA MUNDIALISTA 2026 — Calendario de partidos + pronósticos de marcador
-- Calendario OFICIAL FIFA 2026 (104 partidos). 'kickoff' se almacena con el
-- offset de cada sede; Postgres lo guarda en UTC y el frontend lo muestra en
-- zona Ecuador (America/Guayaquil, GMT-5). Generado por gen_partidos.js.
-- Ejecutar: psql $DATABASE_URL -f backend/src/migrations/polla_partidos.sql
-- No toca tablas existentes. Depende de polla_equipos (migración base).
-- =============================================================================

CREATE TABLE IF NOT EXISTS polla_partidos (
  id             SERIAL PRIMARY KEY,
  numero         SMALLINT    NOT NULL UNIQUE,
  fase           VARCHAR(20) NOT NULL,
  grupo          CHAR(1),
  kickoff        TIMESTAMPTZ NOT NULL,
  sede           VARCHAR(80) NOT NULL,
  ciudad         VARCHAR(60),
  home_equipo_id INT REFERENCES polla_equipos(id),
  away_equipo_id INT REFERENCES polla_equipos(id),
  home_label     VARCHAR(60) NOT NULL,
  away_label     VARCHAR(60) NOT NULL,
  home_ref       VARCHAR(20),   -- ref de bracket (1:E, 2:C, 3:A/B/.., W:74, L:101) o NULL en grupos
  away_ref       VARCHAR(20)
);
CREATE INDEX IF NOT EXISTS idx_polla_partidos_kickoff ON polla_partidos(kickoff);

-- Pronóstico de marcador por usuario y partido
CREATE TABLE IF NOT EXISTS polla_pred_partidos (
  usuario_id  INT      NOT NULL,
  partido_id  INT      NOT NULL REFERENCES polla_partidos(id) ON DELETE CASCADE,
  home_goles  SMALLINT NOT NULL CHECK (home_goles >= 0 AND home_goles <= 99),
  away_goles  SMALLINT NOT NULL CHECK (away_goles >= 0 AND away_goles <= 99),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (usuario_id, partido_id)
);
CREATE INDEX IF NOT EXISTS idx_polla_pred_partidos_usuario ON polla_pred_partidos(usuario_id);

-- Marcador real (lo registra el admin)
CREATE TABLE IF NOT EXISTS polla_res_partidos (
  partido_id  INT      PRIMARY KEY REFERENCES polla_partidos(id) ON DELETE CASCADE,
  home_goles  SMALLINT NOT NULL CHECK (home_goles >= 0 AND home_goles <= 99),
  away_goles  SMALLINT NOT NULL CHECK (away_goles >= 0 AND away_goles <= 99),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Columnas de bracket (para instalaciones que ya tenían la tabla sin ellas)
ALTER TABLE polla_partidos ADD COLUMN IF NOT EXISTS home_ref VARCHAR(20);
ALTER TABLE polla_partidos ADD COLUMN IF NOT EXISTS away_ref VARCHAR(20);

ALTER TABLE polla_config ADD COLUMN IF NOT EXISTS pts_marcador_exacto SMALLINT NOT NULL DEFAULT 5;
ALTER TABLE polla_config ADD COLUMN IF NOT EXISTS pts_resultado       SMALLINT NOT NULL DEFAULT 2;

-- Limpieza idempotente del calendario antes de re-sembrar
TRUNCATE polla_partidos RESTART IDENTITY CASCADE;

INSERT INTO polla_partidos
  (numero,fase,grupo,kickoff,sede,ciudad,home_equipo_id,away_equipo_id,home_label,away_label,home_ref,away_ref)
VALUES
`;

const sql = header + rows.join(',\n') + ';\n';
require('fs').writeFileSync('/sessions/eloquent-intelligent-dijkstra/mnt/V1/backend/src/migrations/polla_partidos.sql', sql);
console.log('Total partidos:', n);
console.log('Grupos:', G.length, 'Eliminatorias:', K.length);
