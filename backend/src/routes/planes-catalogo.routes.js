// src/routes/planes-catalogo.routes.js
// ============================================================
// Catálogo mensual de planes y precios (Excel "PRECIOS <MES> MATERIAL ASESORES")
//
//   POST /api/planes-catalogo/upload  — (noAsesor) sube el .xlsx del mes,
//                                       lo parsea y REEMPLAZA el catálogo.
//   GET  /api/planes-catalogo         — (autenticado) catálogo vigente,
//                                       agrupado para el formulario NuevaVenta.
//
// Estructura esperada del Excel (se mantiene mes a mes, solo cambian valores):
//   HOME          — A5 headers, filas 6+ · promos TC (K..Q) y Cuenta (S..Y)
//   TERCERA EDAD  — B4 headers, filas 5+ · sin promos
//   GAMER         — A4 headers, filas 5+ · sin promos
//   PRO           — B5 headers, filas 6+ · sin promos
//   PYME          — A5 headers, filas 6+ · sin promos
//
// Cada fila del Excel se expande en 1..N registros (plan_base + empaquetado):
// los textos "X o Y" se separan en opciones únicas para que el asesor elija
// exactamente lo que lleva el cliente.
// ============================================================

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../config/db');
const { verificarToken, noAsesor } = require('../middleware/auth');

router.use(verificarToken);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname || '');
    ok ? cb(null, true) : cb(new Error('Solo se permiten archivos Excel (.xlsx)'));
  },
});

const IVA = 0.15;

// ─── Helpers de parseo ────────────────────────────────────────────────────────
const limpiar = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\*/g, '').trim();
const num     = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const round2  = (v) => v == null ? null : Math.round(v * 100) / 100;

// "Netlife Play o Extender Dual Band" → ["Netlife Play", "Extender Dual Band"]
// "2 Extender *o* 1 Netlife Play+1 Assitence Pro" → 2 opciones
// "ASPRO O EXTENDER WIFI" → ["Aspro", "Extender Wifi"]
function opcionesDe(texto) {
  const t = limpiar(texto);
  if (!t) return [];
  return t.split(/\s+[oO]\s+/).map(limpiar).filter(Boolean);
}

// Nombre de plan HOME → { base, tieneParamount }
// "Plan 400 Mbps+ PARAMOUNT" → { base: "Plan 400 Mbps", tieneParamount: true }
function basePlanHome(nombre) {
  const n = limpiar(nombre);
  const m = n.match(/^(Plan\s+\d+\s*Mbps)/i);
  return {
    base: m ? m[1].replace(/\s+/g, ' ') : n,
    tieneParamount: /paramount/i.test(n),
  };
}

// Expande una fila HOME/TERCERA EDAD en registros {plan_base, empaquetado, ...}
function expandirFilaHome({ nombre, adicionales, paramountExtra, precios, promos }) {
  const { base, tieneParamount } = basePlanHome(nombre);
  const alts = opcionesDe(adicionales); // alternativas "escoge una"
  const sufijo = tieneParamount ? ' + Paramount' : '';

  // Precio: si la fila trae Paramount, se suma al subtotal antes del IVA
  const extra   = tieneParamount ? (num(paramountExtra) || 0) : 0;
  const sinIva  = precios.sinIva != null ? round2(precios.sinIva + extra) : null;
  const conIva  = sinIva != null ? round2(sinIva * (1 + IVA)) : null;

  const etiquetas = alts.length
    ? alts.map(a => `${a}${sufijo}`)
    : [tieneParamount ? 'Paramount+' : 'Sin empaquetado'];

  return etiquetas.map(etq => ({
    plan_base: base,
    empaquetado: etq,
    precio_sin_iva: sinIva,
    precio_con_iva: conIva,
    ...promos,
  }));
}

// ─── Parsers por hoja ────────────────────────────────────────────────────────
// Devuelven arrays de registros ya expandidos.
function parseHome(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 'A', range: 5, defval: null }); // desde fila 6
  const out = [];
  for (const r of rows) {
    if (!r.A || !/^plan/i.test(String(r.A))) continue;
    out.push(...expandirFilaHome({
      nombre: r.A,
      adicionales: r.D,
      paramountExtra: r.I,
      precios: { sinIva: num(r.F) },
      promos: {
        tc_dsto:      num(r.K),  // 0.35 = 35%
        tc_facturas:  num(r.L),
        tc_pvp:       round2(num(r.Q)),
        cta_dsto:     num(r.S),
        cta_facturas: num(r.T),
        cta_pvp:      round2(num(r.Y)),
      },
    }).map(x => ({ ...x, tipo_plan: 'HOME', velocidad: limpiar(r.B), plan_promocion: limpiar(r.C), equipo: limpiar(r.E) })));
  }
  return out;
}

function parseTerceraEdad(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 'A', range: 4, defval: null }); // desde fila 5
  const out = [];
  for (const r of rows) {
    if (!r.B || !/^plan/i.test(String(r.B))) continue;
    out.push(...expandirFilaHome({
      nombre: r.B,
      adicionales: r.E,
      paramountExtra: r.J,
      precios: { sinIva: num(r.G) },
      promos: {}, // esta hoja no tiene promociones
    }).map(x => ({ ...x, tipo_plan: 'TERCERA EDAD', velocidad: limpiar(r.C), plan_promocion: limpiar(r.D), equipo: limpiar(r.F) })));
  }
  return out;
}

function parseGamer(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 'A', range: 4, defval: null }); // desde fila 5
  const out = [];
  for (const r of rows) {
    if (!r.A || !/gamer/i.test(String(r.A))) continue;
    const sinIva = num(r.C);
    out.push({
      tipo_plan: 'GAMER',
      plan_base: limpiar(r.A),
      empaquetado: 'Sin empaquetado',
      velocidad: null,
      plan_promocion: limpiar(r.B) || null,
      equipo: limpiar(r.F) || null,
      precio_sin_iva: round2(sinIva),
      precio_con_iva: round2(num(r.E) ?? (sinIva != null ? sinIva * (1 + IVA) : null)),
    });
  }
  return out;
}

function parsePro(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 'A', range: 5, defval: null }); // desde fila 6
  const out = [];
  for (const r of rows) {
    if (!r.B || !/^pro/i.test(String(r.B))) continue;
    const sinIva = num(r.E);
    out.push({
      tipo_plan: 'PRO',
      plan_base: limpiar(r.B),
      empaquetado: limpiar(r.D) || 'Sin empaquetado',
      velocidad: limpiar(r.C) || null,
      plan_promocion: null,
      equipo: limpiar(r.H) || null,
      precio_sin_iva: round2(sinIva),
      precio_con_iva: round2(num(r.G) ?? (sinIva != null ? sinIva * (1 + IVA) : null)),
    });
  }
  return out;
}

function parsePyme(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 'A', range: 5, defval: null }); // desde fila 6
  const out = [];
  for (const r of rows) {
    if (!r.A || !/^plan/i.test(String(r.A))) continue;
    const incluidas = limpiar(r.C);                 // ej: "NETLIFE DEFENSE"
    const alts      = opcionesDe(r.D);              // ej: ["ASPRO", "EXTENDER WIFI"]
    const sinIva    = num(r.E);
    const etiquetas = alts.length
      ? alts.map(a => [incluidas, a].filter(Boolean).join(' + '))
      : [incluidas || 'Sin empaquetado'];
    for (const etq of etiquetas) {
      out.push({
        tipo_plan: 'PYME',
        plan_base: limpiar(r.A),
        empaquetado: etq,
        velocidad: limpiar(r.B) || null,
        plan_promocion: null,
        equipo: limpiar(r.H) || null,
        precio_sin_iva: round2(sinIva),
        precio_con_iva: round2(num(r.G) ?? (sinIva != null ? sinIva * (1 + IVA) : null)),
      });
    }
  }
  return out;
}

const PARSERS = {
  'HOME':         parseHome,
  'TERCERA EDAD': parseTerceraEdad,
  'GAMER':        parseGamer,
  'PRO':          parsePro,
  'PYME':         parsePyme,
};

// ─── Tabla (se auto-crea si no existe) ───────────────────────────────────────
const DDL = `
  CREATE TABLE IF NOT EXISTS public.catalogo_planes (
    id              SERIAL PRIMARY KEY,
    tipo_plan       TEXT NOT NULL,
    plan_base       TEXT NOT NULL,
    empaquetado     TEXT NOT NULL,
    velocidad       TEXT,
    plan_promocion  TEXT,
    equipo          TEXT,
    precio_sin_iva  NUMERIC(10,2),
    precio_con_iva  NUMERIC(10,2),
    tc_dsto         NUMERIC(6,4),
    tc_facturas     INT,
    tc_pvp          NUMERIC(10,2),
    cta_dsto        NUMERIC(6,4),
    cta_facturas    INT,
    cta_pvp         NUMERIC(10,2),
    vigencia        TEXT,
    actualizado_en  TIMESTAMPTZ DEFAULT now()
  )`;

// ─── POST /api/planes-catalogo/upload ────────────────────────────────────────
router.post('/upload', noAsesor, upload.single('archivo'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const registros = [];
    const resumen   = {};

    for (const [hoja, parser] of Object.entries(PARSERS)) {
      const nombreReal = wb.SheetNames.find(n => n.trim().toUpperCase() === hoja);
      if (!nombreReal) { resumen[hoja] = 'hoja no encontrada'; continue; }
      const regs = parser(wb.Sheets[nombreReal]);
      resumen[hoja] = `${regs.length} opciones`;
      registros.push(...regs);
    }

    if (registros.length === 0) {
      return res.status(422).json({ success: false, error: 'No se encontraron planes en el archivo. Verifica que sea el Excel de precios con las pestañas HOME, TERCERA EDAD, GAMER, PRO y PYME.', resumen });
    }

    const vigencia = (req.body.vigencia || req.file.originalname || '').trim();

    await client.query('BEGIN');
    await client.query(DDL);
    await client.query('DELETE FROM public.catalogo_planes'); // reemplazo mensual completo

    const cols = ['tipo_plan','plan_base','empaquetado','velocidad','plan_promocion','equipo',
                  'precio_sin_iva','precio_con_iva','tc_dsto','tc_facturas','tc_pvp',
                  'cta_dsto','cta_facturas','cta_pvp','vigencia'];
    for (const r of registros) {
      await client.query(
        `INSERT INTO public.catalogo_planes (${cols.join(',')})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
        [r.tipo_plan, r.plan_base, r.empaquetado, r.velocidad || null, r.plan_promocion || null, r.equipo || null,
         r.precio_sin_iva, r.precio_con_iva, r.tc_dsto ?? null, r.tc_facturas ?? null, r.tc_pvp ?? null,
         r.cta_dsto ?? null, r.cta_facturas ?? null, r.cta_pvp ?? null, vigencia]
      );
    }
    await client.query('COMMIT');

    console.log(`[CATALOGO-PLANES] Cargado "${vigencia}" — ${registros.length} opciones por ${req.user.usuario}`);
    res.json({ success: true, total: registros.length, resumen, vigencia });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[CATALOGO-PLANES] upload:', e.message);
    res.status(500).json({ success: false, error: e.message });
  } finally {
    client.release();
  }
});

// ─── GET /api/planes-catalogo ────────────────────────────────────────────────
// Catálogo completo para el formulario (cualquier usuario logueado)
router.get('/', async (req, res) => {
  try {
    await pool.query(DDL);
    const { rows } = await pool.query(`
      SELECT tipo_plan, plan_base, empaquetado, velocidad, plan_promocion, equipo,
             precio_sin_iva, precio_con_iva,
             tc_dsto, tc_facturas, tc_pvp,
             cta_dsto, cta_facturas, cta_pvp,
             vigencia, actualizado_en
      FROM public.catalogo_planes
      ORDER BY tipo_plan,
               NULLIF(regexp_replace(plan_base, '\\D', '', 'g'), '')::int NULLS LAST,
               plan_base, id
    `);
    res.json({ success: true, data: rows, vigencia: rows[0]?.vigencia || null });
  } catch (e) {
    console.error('[CATALOGO-PLANES] get:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
