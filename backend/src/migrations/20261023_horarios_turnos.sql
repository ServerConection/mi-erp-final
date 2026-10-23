-- ============================================================================
-- Módulo HORARIOS (turnos semanales de asesores) — NOVONET por ahora.
-- Una fila = un asesor en un día. Semana = lunes a domingo.
-- Correr a mano en pgAdmin (no hay runner automático).
-- ============================================================================
CREATE TABLE IF NOT EXISTS horarios_turnos (
  id              BIGSERIAL PRIMARY KEY,
  empresa         TEXT NOT NULL DEFAULT 'NOVONET',
  fecha           DATE NOT NULL,
  asesor_clave    TEXT NOT NULL,          -- nombre normalizado (MAYÚSCULAS, sin tildes)
  asesor_nombre   TEXT NOT NULL,          -- como viene en el Excel
  supervisor      TEXT,
  usuario_id      BIGINT,                 -- usuarios.id si se pudo cruzar el nombre
  tipo            TEXT NOT NULL DEFAULT 'SIN_ASIGNAR',  -- TURNO | LIBRE | SIN_ASIGNAR
  hora_inicio     TIME,
  hora_fin        TIME,
  hora_inicio2    TIME,                   -- segundo bloque (turnos HÍBRIDO partidos)
  hora_fin2       TIME,
  modalidad       TEXT,                   -- NULL | OFICINA | TELECONEXION | HIBRIDO
  texto_original  TEXT,                   -- celda tal como vino en el Excel
  origen          TEXT NOT NULL DEFAULT 'EXCEL',        -- EXCEL | MANUAL
  actualizado_por TEXT,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT horarios_turnos_uk UNIQUE (empresa, fecha, asesor_clave),
  CONSTRAINT horarios_turnos_tipo_ck CHECK (tipo IN ('TURNO','LIBRE','SIN_ASIGNAR'))
);

CREATE INDEX IF NOT EXISTS horarios_turnos_fecha_idx   ON horarios_turnos (empresa, fecha);
CREATE INDEX IF NOT EXISTS horarios_turnos_usuario_idx ON horarios_turnos (usuario_id, fecha);
