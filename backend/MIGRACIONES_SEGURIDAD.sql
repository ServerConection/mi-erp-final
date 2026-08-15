/**
 * 📋 MIGRACIONES PARA IMPLEMENTAR SEGURIDAD
 *
 * ⚠️ IMPORTANTE:
 * Ejecutar SOLO UNA VEZ en tu base de datos PostgreSQL
 * Estas migraciones crean tablas y índices necesarios
 *
 * ¿Cómo ejecutar?
 * 1. Abre tu cliente PostgreSQL (pgAdmin, DBeaver, psql, etc)
 * 2. Selecciona la BD: SELECT CURRENT_DATABASE();
 * 3. Copia y ejecuta CADA script de abajo
 * 4. Verifica que se ejecute sin errores
 */

-- ============================================================================
-- MIGRACIÓN 1: CREAR TABLA DE AUDITORÍA (Login tracking)
-- ============================================================================
--
-- ¿Para qué?
-- Registrar TODOS los intentos de login (exitosos y fallidos)
-- Detectar ataques de fuerza bruta
-- Auditoría: quién accedió y cuándo
--

CREATE TABLE IF NOT EXISTS audit_login (
  id SERIAL PRIMARY KEY,

  -- Usuario que intentó login
  username VARCHAR(100) NOT NULL,

  -- IP desde donde se conectó
  ip_address VARCHAR(50),

  -- ¿Fue exitoso o falló?
  success BOOLEAN NOT NULL,

  -- Razón si falló (ej: 'Contraseña incorrecta', 'Usuario no existe')
  reason VARCHAR(255),

  -- Cuándo ocurrió el intento
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Crear índices para búsquedas rápidas
-- (Sin índices, la tabla es lenta con muchos registros)

-- Índice 1: Buscar por usuario (para historial de intentos)
CREATE INDEX idx_audit_username ON audit_login(username);

-- Índice 2: Buscar por timestamp (para reportes recientes)
CREATE INDEX idx_audit_timestamp ON audit_login(timestamp DESC);

-- Índice 3: Buscar por IP (para detectar ataques)
CREATE INDEX idx_audit_ip ON audit_login(ip_address);

-- Índice 4: Búsqueda avanzada (intentos fallidos recientes)
CREATE INDEX idx_audit_success_timestamp ON audit_login(success, timestamp DESC);

-- Comentario documentando la tabla (para referencias futuras)
COMMENT ON TABLE audit_login IS 'Auditoría de intentos de login - usado para seguridad y debugging';
COMMENT ON COLUMN audit_login.success IS 'TRUE = login exitoso, FALSE = login fallido';

-- ============================================================================
-- MIGRACIÓN 2: CREAR TABLA DE CONFIGURACIÓN DINÁMICA
-- ============================================================================
--
-- ¿Para qué?
-- Almacenar URLs de reportes en BD (no hardcodeado en código)
-- Permite cambiar URLs sin tocar código
--

CREATE TABLE IF NOT EXISTS config_reportes (
  id SERIAL PRIMARY KEY,

  -- Rol del usuario (SUPERVISOR, ANALISTA, GERENCIA, etc)
  role VARCHAR(50) UNIQUE NOT NULL,

  -- URL del reporte de Google Looker Studio
  url_reporte TEXT NOT NULL,

  -- Timestamp de creación (para auditoría)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar URLs de reportes (reemplazar con tus URLs reales)
INSERT INTO config_reportes (role, url_reporte) VALUES
  ('SUPERVISOR', 'https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF'),
  ('ASESOR', 'https://lookerstudio.google.com/embed/reporting/7690d7a1-0a7e-4eeb-9f7b-5d1a65d0a03a/page/w7EnF'),
  ('ANALISTA', 'https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF'),
  ('GERENCIA', 'https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF'),
  ('ADMINISTRADOR', 'https://lookerstudio.google.com/embed/reporting/7690d7a1-0a7e-4eeb-9f7b-5d1a65d0a03a/page/w7EnF')
ON CONFLICT (role) DO NOTHING; -- No duplicar si ya existen


-- ============================================================================
-- MIGRACIÓN 3: CREAR TABLA DE USUARIOS ESPECIALES
-- ============================================================================
--
-- ¿Para qué?
-- Usuarios con URL de reporte especial (no basada en rol)
-- Antes estaba hardcodeado, ahora está en BD
--

CREATE TABLE IF NOT EXISTS config_usuarios_especiales (
  id SERIAL PRIMARY KEY,

  -- Username del usuario especial
  username VARCHAR(100) UNIQUE NOT NULL,

  -- Su URL de reporte especial
  url_reporte TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar usuarios especiales (reemplazar con tus datos)
INSERT INTO config_usuarios_especiales (username, url_reporte) VALUES
  ('berueda', 'https://lookerstudio.google.com/embed/reporting/ee3b8401-45d8-4075-912b-2bc6ef815309/page/p_jsui99vd0d'),
  ('brueda', 'https://lookerstudio.google.com/embed/reporting/ee3b8401-45d8-4075-912b-2bc6ef815309/page/p_jsui99vd0d'),
  ('achavez', 'https://lookerstudio.google.com/embed/reporting/ee3b8401-45d8-4075-912b-2bc6ef815309/page/p_jsui99vd0d'),
  ('dleonardi', 'https://lookerstudio.google.com/embed/reporting/ee3b8401-45d8-4075-912b-2bc6ef815309/page/p_jsui99vd0d'),
  ('apachecho', 'https://lookerstudio.google.com/embed/reporting/ee3b8401-45d8-4075-912b-2bc6ef815309/page/p_jsui99vd0d'),
  ('asrodriguez', 'https://lookerstudio.google.com/embed/reporting/ee3b8401-45d8-4075-912b-2bc6ef815309/page/p_jsui99vd0d')
ON CONFLICT (username) DO NOTHING; -- No duplicar

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
--
-- Ejecuta esto para verificar que todo se creó correctamente:
--

-- Ver que las tablas existen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('audit_login', 'config_reportes', 'config_usuarios_especiales');

-- Ver cantidad de registros en cada tabla
SELECT 'audit_login' as tabla, COUNT(*) as registros FROM audit_login
UNION ALL
SELECT 'config_reportes', COUNT(*) FROM config_reportes
UNION ALL
SELECT 'config_usuarios_especiales', COUNT(*) FROM config_usuarios_especiales;

-- Ver índices creados
SELECT indexname FROM pg_indexes
WHERE tablename IN ('audit_login', 'config_reportes', 'config_usuarios_especiales');

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
--
-- 1. Si necesitas REVERTIR estos cambios (DELETE solo):
--    DROP TABLE IF EXISTS audit_login CASCADE;
--    DROP TABLE IF EXISTS config_reportes CASCADE;
--    DROP TABLE IF EXISTS config_usuarios_especiales CASCADE;
--
-- 2. Los índices se crearán automáticamente con CREATE INDEX
--
-- 3. Para ACTUALIZAR URLs:
--    UPDATE config_reportes SET url_reporte = 'nueva_url' WHERE role = 'SUPERVISOR';
--
-- 4. Para agregar un nuevo usuario especial:
--    INSERT INTO config_usuarios_especiales (username, url_reporte)
--    VALUES ('nuevo_user', 'nueva_url');
--
-- 5. Para ver auditoría de login:
--    SELECT * FROM audit_login ORDER BY timestamp DESC LIMIT 20;
--
-- 6. Para ver intentos fallidos por IP:
--    SELECT ip_address, COUNT(*) as intentos FROM audit_login
--    WHERE success = false AND timestamp > NOW() - INTERVAL '1 hour'
--    GROUP BY ip_address ORDER BY intentos DESC;
