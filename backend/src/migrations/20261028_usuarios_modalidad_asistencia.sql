BEGIN;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS modalidad_asistencia VARCHAR(20);

UPDATE public.usuarios
SET modalidad_asistencia = CASE
  WHEN UPPER(BTRIM(COALESCE(perfil, ''))) IN ('USUARIO', 'ASESOR') THEN 'CONEXION'
  ELSE 'JORNADA'
END
WHERE modalidad_asistencia IS NULL
   OR UPPER(BTRIM(modalidad_asistencia)) NOT IN ('JORNADA', 'CONEXION');

ALTER TABLE public.usuarios
  ALTER COLUMN modalidad_asistencia SET DEFAULT 'JORNADA',
  ALTER COLUMN modalidad_asistencia SET NOT NULL;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_modalidad_asistencia_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_modalidad_asistencia_check
  CHECK (modalidad_asistencia IN ('JORNADA', 'CONEXION'));

COMMENT ON COLUMN public.usuarios.modalidad_asistencia IS
  'Vista operativa de asistencia: JORNADA para personal de nomina y CONEXION para comisionistas que toman leads.';

COMMIT;
