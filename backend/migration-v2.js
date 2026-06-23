/**
 * MIGRACIÓN v2 — Campos custom + Vista enriquecida
 * Desde la carpeta backend: node migration-v2.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

const SQL = `
-- ── 1. Agregar columna de campos custom si no existe ──────────────────────────
ALTER TABLE bitrix_deals
  ADD COLUMN IF NOT EXISTS campos_custom JSONB DEFAULT '{}';

-- ── 2. Vista enriquecida cruzando deals con catálogos ─────────────────────────
CREATE OR REPLACE VIEW bitrix_deals_vista AS
SELECT
  d.id,
  d.titulo                                         AS nombre,
  COALESCE(bc.nombre, 'Cat ' || d.category_id)    AS pipeline,
  COALESCE(be.nombre, d.stage_id)                  AS etapa,
  CASE
    WHEN d.ganado  THEN 'GANADO'
    WHEN d.perdido THEN 'PERDIDO'
    ELSE                'EN PROCESO'
  END                                              AS estado,
  COALESCE(u.nombre_completo, 'ID ' || d.asesor_id) AS asesor,
  d.source_id                                      AS fuente,
  d.monto,
  d.moneda,

  -- Campos custom mapeados desde JSONB
  d.campos_custom->>'ciudad'             AS ciudad,
  d.campos_custom->>'provincia'          AS provincia,
  d.campos_custom->>'nombre_asesor'      AS nombre_asesor_campo,
  d.campos_custom->>'cedula'             AS cedula,
  d.campos_custom->>'forma_pago'         AS forma_pago,
  d.campos_custom->>'megas_plan'         AS megas_plan,
  d.campos_custom->>'motivo_atc'         AS motivo_atc,
  d.campos_custom->>'regularizado'       AS regularizado,
  d.campos_custom->>'volver_llamar'      AS volver_llamar,
  d.campos_custom->>'fecha_venta_subida' AS fecha_venta_subida,
  d.campos_custom->>'deuda'              AS deuda,
  d.campos_custom->>'contrato'           AS contrato,
  d.campos_custom->>'login'              AS login,
  d.campos_custom->>'pagado_instalacion' AS pagado_instalacion,
  d.campos_custom->>'desiste_compra'     AS desiste_compra,
  d.campos_custom->>'innegociable'       AS innegociable,

  -- Fechas
  d.fecha_creacion,
  d.fecha_modificacion,
  d.fecha_cierre,
  d.updated_at

FROM bitrix_deals d
LEFT JOIN bitrix_categorias bc ON bc.id     = d.category_id
LEFT JOIN bitrix_etapas     be ON be.status_id = d.stage_id
LEFT JOIN bitrix_usuarios   u  ON u.id      = d.asesor_id;
`;

(async () => {
  console.log('🔌 Conectando a la base de datos...');
  const client = await pool.connect();
  try {
    console.log('⚙️  Ejecutando migración v2...');
    await client.query(SQL);
    console.log('✅ Migración v2 completada:');
    console.log('   • Columna campos_custom JSONB agregada a bitrix_deals');
    console.log('   • Vista bitrix_deals_vista creada/actualizada');
    console.log('\nPróximo paso:');
    console.log('   1. node bitrix-discover-fields.js   ← ver qué campos UF_CRM existen');
    console.log('   2. node sync-bitrix.js               ← re-sincronizar con campos custom');
  } catch (err) {
    console.error('❌ Error en migración v2:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
