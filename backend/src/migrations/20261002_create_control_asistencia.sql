-- Migration: create control_asistencia table
-- Run this on the ERP database (bddgeneral) as appropriate.

CREATE TABLE IF NOT EXISTS control_asistencia (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  usuario TEXT NOT NULL,
  nombre_completo TEXT,
  cargo TEXT,
  actividad TEXT NOT NULL,
  fecha DATE,
  hora TIME,
  fecha_hora TIMESTAMPTZ,
  ip_publica TEXT,
  latitud NUMERIC(11,7),
  longitud NUMERIC(11,7),
  precision_metros NUMERIC(10,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_control_asistencia_usuario_fecha ON control_asistencia (usuario_id, fecha);
CREATE INDEX IF NOT EXISTS idx_control_asistencia_fecha_hora ON control_asistencia (fecha_hora);
