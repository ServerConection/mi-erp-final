require('dotenv').config();
const pool = require('../src/config/db');

const empresa = String(process.argv.find((v) => v.startsWith('--empresa='))?.split('=')[1] || 'novonet').toLowerCase();
const desde = process.argv.find((v) => v.startsWith('--desde='))?.split('=')[1] || '2026-10-01';
const hasta = process.argv.find((v) => v.startsWith('--hasta='))?.split('=')[1] || '2026-10-28';

pool.query(`
  SELECT UPPER(BTRIM(COALESCE(etapa_bitrix, etapa, 'SIN ETAPA'))) etapa,
         COUNT(DISTINCT bitrix_id)::int total
  FROM public.bitrix_webhook_leads
  WHERE empresa = $1
    AND (created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $2::date AND $3::date
  GROUP BY 1 ORDER BY total DESC
`, [empresa, desde, hasta])
  .then((resultado) => { console.table(resultado.rows); return pool.end(); })
  .catch(async (error) => { console.error(error.message); await pool.end(); process.exit(1); });
