-- =============================================================================
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
  away_label     VARCHAR(60) NOT NULL
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

-- Puntos por pronóstico de marcador (configurable)
ALTER TABLE polla_config ADD COLUMN IF NOT EXISTS pts_marcador_exacto SMALLINT NOT NULL DEFAULT 5;
ALTER TABLE polla_config ADD COLUMN IF NOT EXISTS pts_resultado       SMALLINT NOT NULL DEFAULT 2;

-- Limpieza idempotente del calendario antes de re-sembrar
TRUNCATE polla_partidos RESTART IDENTITY CASCADE;

INSERT INTO polla_partidos
  (numero,fase,grupo,kickoff,sede,ciudad,home_equipo_id,away_equipo_id,home_label,away_label)
VALUES
(1,'GRUPOS','A','2026-06-11 13:00:00-06','Estadio Ciudad de México','Ciudad de México',(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='México'),(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='Sudáfrica'),'México','Sudáfrica'),
(2,'GRUPOS','A','2026-06-11 20:00:00-06','Estadio Guadalajara','Zapopan',(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='Corea del Sur'),(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='República Checa'),'Corea del Sur','República Checa'),
(3,'GRUPOS','B','2026-06-12 15:00:00-04','Estadio Toronto','Toronto',(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Canadá'),(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Bosnia y Herzegovina'),'Canadá','Bosnia y Herzegovina'),
(4,'GRUPOS','D','2026-06-12 18:00:00-07','Estadio Los Ángeles','Los Ángeles',(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Estados Unidos'),(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Paraguay'),'Estados Unidos','Paraguay'),
(5,'GRUPOS','B','2026-06-13 12:00:00-07','Estadio Bahía de San Francisco','San Francisco',(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Catar'),(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Suiza'),'Catar','Suiza'),
(6,'GRUPOS','C','2026-06-13 18:00:00-04','Estadio Nueva York/Nueva Jersey','Nueva Jersey',(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Brasil'),(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Marruecos'),'Brasil','Marruecos'),
(7,'GRUPOS','C','2026-06-13 21:00:00-04','Estadio Boston','Boston',(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Haití'),(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Escocia'),'Haití','Escocia'),
(8,'GRUPOS','D','2026-06-13 18:00:00-07','BC Place','Vancouver',(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Australia'),(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Turquía'),'Australia','Turquía'),
(9,'GRUPOS','E','2026-06-14 12:00:00-05','Estadio Houston','Houston',(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Alemania'),(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Curazao'),'Alemania','Curazao'),
(10,'GRUPOS','F','2026-06-14 15:00:00-05','Estadio Dallas','Dallas',(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Países Bajos'),(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Japón'),'Países Bajos','Japón'),
(11,'GRUPOS','E','2026-06-14 19:00:00-04','Estadio Filadelfia','Filadelfia',(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Costa de Marfil'),(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Ecuador'),'Costa de Marfil','Ecuador'),
(12,'GRUPOS','F','2026-06-14 20:00:00-06','Estadio Monterrey','Guadalupe',(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Suecia'),(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Túnez'),'Suecia','Túnez'),
(13,'GRUPOS','H','2026-06-15 12:00:00-04','Estadio Atlanta','Atlanta',(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='España'),(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Cabo Verde'),'España','Cabo Verde'),
(14,'GRUPOS','G','2026-06-15 12:00:00-07','BC Place','Vancouver',(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Bélgica'),(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Egipto'),'Bélgica','Egipto'),
(15,'GRUPOS','H','2026-06-15 18:00:00-04','Estadio Miami','Miami',(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Arabia Saudita'),(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Uruguay'),'Arabia Saudita','Uruguay'),
(16,'GRUPOS','G','2026-06-15 18:00:00-07','Estadio Los Ángeles','Los Ángeles',(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Irán'),(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Nueva Zelanda'),'Irán','Nueva Zelanda'),
(17,'GRUPOS','I','2026-06-16 15:00:00-04','Estadio Nueva York/Nueva Jersey','Nueva Jersey',(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Francia'),(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Senegal'),'Francia','Senegal'),
(18,'GRUPOS','I','2026-06-16 18:00:00-04','Estadio Boston','Boston',(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Irak'),(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Noruega'),'Irak','Noruega'),
(19,'GRUPOS','J','2026-06-16 20:00:00-05','Estadio Kansas City','Kansas City',(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Argentina'),(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Argelia'),'Argentina','Argelia'),
(20,'GRUPOS','J','2026-06-16 21:00:00-07','Estadio Bahía de San Francisco','San Francisco',(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Austria'),(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Jordania'),'Austria','Jordania'),
(21,'GRUPOS','K','2026-06-17 12:00:00-05','Estadio Houston','Houston',(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Portugal'),(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='RD Congo'),'Portugal','RD Congo'),
(22,'GRUPOS','L','2026-06-17 15:00:00-05','Estadio Dallas','Dallas',(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Inglaterra'),(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Croacia'),'Inglaterra','Croacia'),
(23,'GRUPOS','L','2026-06-17 19:00:00-04','Estadio Toronto','Toronto',(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Ghana'),(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Panamá'),'Ghana','Panamá'),
(24,'GRUPOS','K','2026-06-17 20:00:00-06','Estadio Ciudad de México','Ciudad de México',(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Uzbekistán'),(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Colombia'),'Uzbekistán','Colombia'),
(25,'GRUPOS','A','2026-06-18 12:00:00-04','Estadio Atlanta','Atlanta',(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='República Checa'),(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='Sudáfrica'),'República Checa','Sudáfrica'),
(26,'GRUPOS','B','2026-06-18 12:00:00-07','Estadio Los Ángeles','Los Ángeles',(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Suiza'),(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Bosnia y Herzegovina'),'Suiza','Bosnia y Herzegovina'),
(27,'GRUPOS','B','2026-06-18 15:00:00-07','BC Place','Vancouver',(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Canadá'),(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Catar'),'Canadá','Catar'),
(28,'GRUPOS','A','2026-06-18 19:00:00-06','Estadio Guadalajara','Zapopan',(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='México'),(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='Corea del Sur'),'México','Corea del Sur'),
(29,'GRUPOS','C','2026-06-19 18:00:00-04','Estadio Boston','Boston',(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Escocia'),(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Marruecos'),'Escocia','Marruecos'),
(30,'GRUPOS','D','2026-06-19 12:00:00-07','Estadio Seattle','Seattle',(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Estados Unidos'),(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Australia'),'Estados Unidos','Australia'),
(31,'GRUPOS','C','2026-06-19 20:30:00-04','Estadio Filadelfia','Filadelfia',(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Brasil'),(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Haití'),'Brasil','Haití'),
(32,'GRUPOS','D','2026-06-19 21:00:00-07','Estadio Bahía de San Francisco','San Francisco',(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Turquía'),(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Paraguay'),'Turquía','Paraguay'),
(33,'GRUPOS','F','2026-06-20 12:00:00-05','Estadio Houston','Houston',(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Países Bajos'),(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Suecia'),'Países Bajos','Suecia'),
(34,'GRUPOS','E','2026-06-20 16:00:00-04','Estadio Toronto','Toronto',(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Alemania'),(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Costa de Marfil'),'Alemania','Costa de Marfil'),
(35,'GRUPOS','E','2026-06-20 19:00:00-05','Estadio Kansas City','Kansas City',(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Ecuador'),(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Curazao'),'Ecuador','Curazao'),
(36,'GRUPOS','F','2026-06-20 22:00:00-06','Estadio Monterrey','Guadalupe',(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Túnez'),(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Japón'),'Túnez','Japón'),
(37,'GRUPOS','H','2026-06-21 12:00:00-04','Estadio Atlanta','Atlanta',(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='España'),(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Arabia Saudita'),'España','Arabia Saudita'),
(38,'GRUPOS','G','2026-06-21 12:00:00-07','Estadio Los Ángeles','Los Ángeles',(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Bélgica'),(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Irán'),'Bélgica','Irán'),
(39,'GRUPOS','H','2026-06-21 18:00:00-04','Estadio Miami','Miami',(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Uruguay'),(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Cabo Verde'),'Uruguay','Cabo Verde'),
(40,'GRUPOS','G','2026-06-21 18:00:00-07','BC Place','Vancouver',(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Nueva Zelanda'),(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Egipto'),'Nueva Zelanda','Egipto'),
(41,'GRUPOS','J','2026-06-22 12:00:00-05','Estadio Dallas','Dallas',(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Argentina'),(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Austria'),'Argentina','Austria'),
(42,'GRUPOS','I','2026-06-22 17:00:00-04','Estadio Filadelfia','Filadelfia',(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Francia'),(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Irak'),'Francia','Irak'),
(43,'GRUPOS','I','2026-06-22 20:00:00-04','Estadio Nueva York/Nueva Jersey','Nueva Jersey',(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Noruega'),(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Senegal'),'Noruega','Senegal'),
(44,'GRUPOS','J','2026-06-22 20:00:00-07','Estadio Bahía de San Francisco','San Francisco',(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Jordania'),(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Argelia'),'Jordania','Argelia'),
(45,'GRUPOS','K','2026-06-23 12:00:00-05','Estadio Houston','Houston',(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Portugal'),(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Uzbekistán'),'Portugal','Uzbekistán'),
(46,'GRUPOS','L','2026-06-23 16:00:00-04','Estadio Boston','Boston',(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Inglaterra'),(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Ghana'),'Inglaterra','Ghana'),
(47,'GRUPOS','L','2026-06-23 19:00:00-04','Estadio Toronto','Toronto',(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Panamá'),(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Croacia'),'Panamá','Croacia'),
(48,'GRUPOS','K','2026-06-23 20:00:00-06','Estadio Guadalajara','Zapopan',(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Colombia'),(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='RD Congo'),'Colombia','RD Congo'),
(49,'GRUPOS','B','2026-06-24 12:00:00-07','BC Place','Vancouver',(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Suiza'),(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Canadá'),'Suiza','Canadá'),
(50,'GRUPOS','B','2026-06-24 12:00:00-07','Estadio Seattle','Seattle',(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Bosnia y Herzegovina'),(SELECT id FROM polla_equipos WHERE grupo='B' AND nombre='Catar'),'Bosnia y Herzegovina','Catar'),
(51,'GRUPOS','C','2026-06-24 18:00:00-04','Estadio Miami','Miami',(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Escocia'),(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Brasil'),'Escocia','Brasil'),
(52,'GRUPOS','C','2026-06-24 18:00:00-04','Estadio Atlanta','Atlanta',(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Marruecos'),(SELECT id FROM polla_equipos WHERE grupo='C' AND nombre='Haití'),'Marruecos','Haití'),
(53,'GRUPOS','A','2026-06-24 19:00:00-06','Estadio Ciudad de México','Ciudad de México',(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='República Checa'),(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='México'),'República Checa','México'),
(54,'GRUPOS','A','2026-06-24 19:00:00-06','Estadio Monterrey','Guadalupe',(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='Sudáfrica'),(SELECT id FROM polla_equipos WHERE grupo='A' AND nombre='Corea del Sur'),'Sudáfrica','Corea del Sur'),
(55,'GRUPOS','E','2026-06-25 16:00:00-04','Estadio Nueva York/Nueva Jersey','Nueva Jersey',(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Ecuador'),(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Alemania'),'Ecuador','Alemania'),
(56,'GRUPOS','E','2026-06-25 16:00:00-04','Estadio Filadelfia','Filadelfia',(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Curazao'),(SELECT id FROM polla_equipos WHERE grupo='E' AND nombre='Costa de Marfil'),'Curazao','Costa de Marfil'),
(57,'GRUPOS','F','2026-06-25 18:00:00-05','Estadio Dallas','Dallas',(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Japón'),(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Suecia'),'Japón','Suecia'),
(58,'GRUPOS','F','2026-06-25 18:00:00-05','Estadio Kansas City','Kansas City',(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Túnez'),(SELECT id FROM polla_equipos WHERE grupo='F' AND nombre='Países Bajos'),'Túnez','Países Bajos'),
(59,'GRUPOS','D','2026-06-25 19:00:00-07','Estadio Los Ángeles','Los Ángeles',(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Turquía'),(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Estados Unidos'),'Turquía','Estados Unidos'),
(60,'GRUPOS','D','2026-06-25 19:00:00-07','Estadio Bahía de San Francisco','San Francisco',(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Paraguay'),(SELECT id FROM polla_equipos WHERE grupo='D' AND nombre='Australia'),'Paraguay','Australia'),
(61,'GRUPOS','I','2026-06-26 15:00:00-04','Estadio Boston','Boston',(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Noruega'),(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Francia'),'Noruega','Francia'),
(62,'GRUPOS','I','2026-06-26 15:00:00-04','Estadio Toronto','Toronto',(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Senegal'),(SELECT id FROM polla_equipos WHERE grupo='I' AND nombre='Irak'),'Senegal','Irak'),
(63,'GRUPOS','H','2026-06-26 19:00:00-05','Estadio Houston','Houston',(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Cabo Verde'),(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Arabia Saudita'),'Cabo Verde','Arabia Saudita'),
(64,'GRUPOS','H','2026-06-26 18:00:00-06','Estadio Guadalajara','Zapopan',(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='Uruguay'),(SELECT id FROM polla_equipos WHERE grupo='H' AND nombre='España'),'Uruguay','España'),
(65,'GRUPOS','G','2026-06-26 20:00:00-07','Estadio Seattle','Seattle',(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Egipto'),(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Irán'),'Egipto','Irán'),
(66,'GRUPOS','G','2026-06-26 20:00:00-07','BC Place','Vancouver',(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Nueva Zelanda'),(SELECT id FROM polla_equipos WHERE grupo='G' AND nombre='Bélgica'),'Nueva Zelanda','Bélgica'),
(67,'GRUPOS','L','2026-06-27 17:00:00-04','Estadio Nueva York/Nueva Jersey','Nueva Jersey',(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Panamá'),(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Inglaterra'),'Panamá','Inglaterra'),
(68,'GRUPOS','L','2026-06-27 17:00:00-04','Estadio Filadelfia','Filadelfia',(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Croacia'),(SELECT id FROM polla_equipos WHERE grupo='L' AND nombre='Ghana'),'Croacia','Ghana'),
(69,'GRUPOS','K','2026-06-27 19:30:00-04','Estadio Miami','Miami',(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Colombia'),(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Portugal'),'Colombia','Portugal'),
(70,'GRUPOS','K','2026-06-27 19:30:00-04','Estadio Atlanta','Atlanta',(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='RD Congo'),(SELECT id FROM polla_equipos WHERE grupo='K' AND nombre='Uzbekistán'),'RD Congo','Uzbekistán'),
(71,'GRUPOS','J','2026-06-27 21:00:00-05','Estadio Kansas City','Kansas City',(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Argelia'),(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Austria'),'Argelia','Austria'),
(72,'GRUPOS','J','2026-06-27 21:00:00-05','Estadio Dallas','Dallas',(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Jordania'),(SELECT id FROM polla_equipos WHERE grupo='J' AND nombre='Argentina'),'Jordania','Argentina'),
(73,'R32',NULL,'2026-06-28 12:00:00-07','Estadio Los Ángeles','Los Ángeles',NULL,NULL,'1º A','Mejor 3º (1)'),
(74,'R32',NULL,'2026-06-29 12:00:00-05','Estadio Houston','Houston',NULL,NULL,'1º C','Mejor 3º (2)'),
(75,'R32',NULL,'2026-06-29 16:30:00-04','Estadio Boston','Boston',NULL,NULL,'1º E','Mejor 3º (3)'),
(76,'R32',NULL,'2026-06-29 19:00:00-06','Estadio Monterrey','Guadalupe',NULL,NULL,'1º G','Mejor 3º (4)'),
(77,'R32',NULL,'2026-06-30 12:00:00-05','Estadio Dallas','Dallas',NULL,NULL,'1º I','Mejor 3º (5)'),
(78,'R32',NULL,'2026-06-30 17:00:00-04','Estadio Nueva York/Nueva Jersey','Nueva Jersey',NULL,NULL,'1º K','Mejor 3º (6)'),
(79,'R32',NULL,'2026-06-30 19:00:00-06','Estadio Ciudad de México','Ciudad de México',NULL,NULL,'1º B','Mejor 3º (7)'),
(80,'R32',NULL,'2026-07-01 12:00:00-04','Estadio Atlanta','Atlanta',NULL,NULL,'1º D','Mejor 3º (8)'),
(81,'R32',NULL,'2026-07-01 13:00:00-07','Estadio Seattle','Seattle',NULL,NULL,'1º F','2º J'),
(82,'R32',NULL,'2026-07-01 17:00:00-07','Estadio Bahía de San Francisco','San Francisco',NULL,NULL,'1º H','2º L'),
(83,'R32',NULL,'2026-07-02 12:00:00-07','Estadio Los Ángeles','Los Ángeles',NULL,NULL,'1º J','2º B'),
(84,'R32',NULL,'2026-07-02 19:00:00-04','Estadio Toronto','Toronto',NULL,NULL,'1º L','2º D'),
(85,'R32',NULL,'2026-07-02 20:00:00-07','BC Place','Vancouver',NULL,NULL,'2º A','2º C'),
(86,'R32',NULL,'2026-07-03 13:00:00-05','Estadio Dallas','Dallas',NULL,NULL,'2º E','2º G'),
(87,'R32',NULL,'2026-07-03 18:00:00-04','Estadio Miami','Miami',NULL,NULL,'2º I','2º K'),
(88,'R32',NULL,'2026-07-03 20:30:00-05','Estadio Kansas City','Kansas City',NULL,NULL,'2º F','2º H'),
(89,'R16',NULL,'2026-07-04 12:00:00-05','Estadio Houston','Houston',NULL,NULL,'Ganador #73','Ganador #74'),
(90,'R16',NULL,'2026-07-04 17:00:00-04','Estadio Filadelfia','Filadelfia',NULL,NULL,'Ganador #75','Ganador #76'),
(91,'R16',NULL,'2026-07-05 16:00:00-04','Estadio Nueva York/Nueva Jersey','Nueva Jersey',NULL,NULL,'Ganador #77','Ganador #78'),
(92,'R16',NULL,'2026-07-05 18:00:00-06','Estadio Ciudad de México','Ciudad de México',NULL,NULL,'Ganador #79','Ganador #80'),
(93,'R16',NULL,'2026-07-06 14:00:00-05','Estadio Dallas','Dallas',NULL,NULL,'Ganador #81','Ganador #82'),
(94,'R16',NULL,'2026-07-06 17:00:00-07','Estadio Seattle','Seattle',NULL,NULL,'Ganador #83','Ganador #84'),
(95,'R16',NULL,'2026-07-07 12:00:00-04','Estadio Atlanta','Atlanta',NULL,NULL,'Ganador #85','Ganador #86'),
(96,'R16',NULL,'2026-07-07 13:00:00-07','BC Place','Vancouver',NULL,NULL,'Ganador #87','Ganador #88'),
(97,'CUARTOS',NULL,'2026-07-09 16:00:00-04','Estadio Boston','Boston',NULL,NULL,'Ganador #89','Ganador #90'),
(98,'CUARTOS',NULL,'2026-07-10 12:00:00-07','Estadio Los Ángeles','Los Ángeles',NULL,NULL,'Ganador #91','Ganador #92'),
(99,'CUARTOS',NULL,'2026-07-11 17:00:00-04','Estadio Miami','Miami',NULL,NULL,'Ganador #93','Ganador #94'),
(100,'CUARTOS',NULL,'2026-07-11 20:00:00-05','Estadio Kansas City','Kansas City',NULL,NULL,'Ganador #95','Ganador #96'),
(101,'SEMIS',NULL,'2026-07-14 14:00:00-05','Estadio Dallas','Dallas',NULL,NULL,'Ganador #97','Ganador #98'),
(102,'SEMIS',NULL,'2026-07-15 15:00:00-04','Estadio Atlanta','Atlanta',NULL,NULL,'Ganador #99','Ganador #100'),
(103,'TERCER',NULL,'2026-07-18 17:00:00-04','Estadio Miami','Miami',NULL,NULL,'Perdedor #101','Perdedor #102'),
(104,'FINAL',NULL,'2026-07-19 15:00:00-04','Estadio Nueva York/Nueva Jersey','Nueva Jersey',NULL,NULL,'Ganador #101','Ganador #102');
