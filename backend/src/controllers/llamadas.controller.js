/**
 * LLAMADAS CONTROLLER — "Cargar base" para el Automarcador
 *
 * Permite al supervisor filtrar negociaciones de Bitrix (responsable,
 * fecha de creación, etapa), ver el teléfono del cliente, asignar qué
 * asesor debe hacer cada llamada, y exportar la base en CSV para
 * cargarla en el panel del Automarcador (Campañas > Cargar lista de números).
 *
 * Fuentes de datos:
 *   - bitrix_deals / bitrix_etapas / bitrix_usuarios -> pool (Render, bddgeneral)
 *   - bitrix_contacts (teléfono)                     -> poolLocal (Postgres LOCAL)
 *
 * IMPORTANTE: bitrix_contacts vive SOLO en la Postgres local (ver
 * config/dbLocal.js). El teléfono solo se podrá resolver cuando este
 * backend corra en la máquina donde vive esa base local (igual que
 * datosAdicionales.controller.js). En Render, el filtro funciona pero
 * el campo "telefono" llega vacío de forma controlada.
 */
const pool      = require('../config/db');
const poolLocal = require('../config/dbLocal');

// ── GET /api/llamadas/filtros ─────────────────────────────────────────────
// Catálogos para armar el formulario de filtro (responsables + etapas)
const getCatalogosFiltro = async (req, res) => {
  try {
    const [asesoresRes, etapasRes] = await Promise.all([
      pool.query(
        `SELECT id, nombre_completo FROM bitrix_usuarios WHERE activo = true ORDER BY nombre_completo`
      ),
      pool.query(
        `SELECT e.status_id, e.nombre, e.category_id, c.nombre AS categoria
         FROM bitrix_etapas e
         JOIN bitrix_categorias c ON c.id = e.category_id
         ORDER BY c.sort, e.sort`
      ),
    ]);
    res.json({ success: true, asesores: asesoresRes.rows, etapas: etapasRes.rows });
  } catch (err) {
    console.error('[llamadas.controller] getCatalogosFiltro error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/llamadas/filtrar ─────────────────────────────────────────────
// Query params: responsable_id, desde, hasta, stage_id, category_id, limit, offset
const filtrarNegociaciones = async (req, res) => {
  try {
    const {
      responsable_id, desde, hasta, stage_id, category_id,
      limit = 500, offset = 0,
    } = req.query;

    const cond   = [];
    const params = [];

    if (responsable_id) { params.push(responsable_id); cond.push(`d.asesor_id = $${params.length}`); }
    if (category_id)    { params.push(category_id);    cond.push(`d.category_id = $${params.length}`); }
    if (stage_id)        { params.push(stage_id);        cond.push(`d.stage_id = $${params.length}`); }
    if (desde)            { params.push(desde);            cond.push(`d.fecha_creacion::date >= $${params.length}::date`); }
    if (hasta)            { params.push(hasta);            cond.push(`d.fecha_creacion::date <= $${params.length}::date`); }

    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

    params.push(Math.min(parseInt(limit) || 500, 2000));
    params.push(parseInt(offset) || 0);

    const r = await pool.query(
      `SELECT
         d.id            AS deal_id,
         d.titulo,
         d.contact_id,
         d.stage_id,
         COALESCE(e.nombre, d.stage_id) AS etapa,
         d.asesor_id,
         COALESCE(u.nombre_completo, 'Sin asignar') AS asesor_nombre,
         d.fecha_creacion,
         d.monto,
         d.moneda
       FROM bitrix_deals d
       LEFT JOIN bitrix_etapas e   ON e.status_id = d.stage_id
       LEFT JOIN bitrix_usuarios u ON u.id        = d.asesor_id
       ${where}
       ORDER BY d.fecha_creacion DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const deals = r.rows;

    // Resolver teléfonos desde la base LOCAL (bitrix_contacts), si está alcanzable.
    const contactIds = [...new Set(deals.map(d => d.contact_id).filter(Boolean))];
    let telefonosPorContacto = {};
    let telefonoDisponible = false;

    if (contactIds.length > 0) {
      try {
        const rc = await poolLocal.query(
          `SELECT contact_id, name, phone_1_value, phone_2_value
           FROM bitrix_contacts
           WHERE contact_id = ANY($1::int[])`,
          [contactIds]
        );
        telefonoDisponible = true;
        for (const c of rc.rows) {
          telefonosPorContacto[c.contact_id] = {
            nombre_cliente: c.name || null,
            telefono: c.phone_1_value || c.phone_2_value || null,
          };
        }
      } catch (e) {
        console.error('[llamadas.controller] No se pudo consultar bitrix_contacts (DB local):', e.message);
      }
    }

    const data = deals.map(d => ({
      ...d,
      nombre_cliente: telefonosPorContacto[d.contact_id]?.nombre_cliente || null,
      telefono:       telefonosPorContacto[d.contact_id]?.telefono || null,
    }));

    res.json({
      success: true,
      data,
      count: data.length,
      telefono_disponible: telefonoDisponible,
      aviso: telefonoDisponible
        ? null
        : 'No se pudo conectar a la base local de contactos (bitrix_contacts). El teléfono no está disponible desde este servidor — corre el backend en la máquina con acceso a esa Postgres local para ver los números.',
    });
  } catch (err) {
    console.error('[llamadas.controller] filtrarNegociaciones error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── POST /api/llamadas/lotes ──────────────────────────────────────────────
// body: { nombre, filtros: {...}, items: [{ deal_id, contact_id, nombre_cliente, telefono, etapa, asesor_id }] }
const crearLote = async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, filtros = {}, items = [] } = req.body || {};

    if (!nombre || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Falta nombre o la lista de negociaciones (items) está vacía.' });
    }

    await client.query('BEGIN');

    const loteRes = await client.query(
      `INSERT INTO llamadas_lotes (nombre, creado_por, filtros, total_items)
       VALUES ($1,$2,$3,$4) RETURNING id, creado_en`,
      [nombre, req.user?.id || null, JSON.stringify(filtros), items.length]
    );
    const loteId = loteRes.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO llamadas_lote_items
           (lote_id, deal_id, contact_id, nombre_cliente, telefono, etapa, asesor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          loteId, it.deal_id || null, it.contact_id || null,
          it.nombre_cliente || null, it.telefono || null,
          it.etapa || null, it.asesor_id || null,
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, lote_id: loteId, total_items: items.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[llamadas.controller] crearLote error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

// ── GET /api/llamadas/lotes ───────────────────────────────────────────────
const listarLotes = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT l.id, l.nombre, l.filtros, l.total_items, l.creado_en,
              u.usuario AS creado_por_usuario
       FROM llamadas_lotes l
       LEFT JOIN usuarios u ON u.id = l.creado_por
       ORDER BY l.creado_en DESC
       LIMIT 100`
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── PUT /api/llamadas/lotes/:loteId/items/:itemId ─────────────────────────
// body: { asesor_id } — reasignar quién hace esa llamada específica
const asignarAsesorItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { asesor_id } = req.body || {};
    const r = await pool.query(
      `UPDATE llamadas_lote_items SET asesor_id = $1 WHERE id = $2 RETURNING id`,
      [asesor_id || null, itemId]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Item no encontrado' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/llamadas/lotes/:loteId/export.csv ────────────────────────────
const exportarLoteCsv = async (req, res) => {
  try {
    const { loteId } = req.params;
    const r = await pool.query(
      `SELECT i.deal_id, i.nombre_cliente, i.telefono, i.etapa,
              COALESCE(u.nombre_completo, '') AS asesor
       FROM llamadas_lote_items i
       LEFT JOIN bitrix_usuarios u ON u.id = i.asesor_id
       WHERE i.lote_id = $1
       ORDER BY i.id`,
      [loteId]
    );

    const filas = ['numero,nombre,negocio_id,etapa,asesor'];
    for (const it of r.rows) {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      filas.push([esc(it.telefono), esc(it.nombre_cliente), esc(it.deal_id), esc(it.etapa), esc(it.asesor)].join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lote_${loteId}.csv"`);
    res.send(filas.join('\n'));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getCatalogosFiltro,
  filtrarNegociaciones,
  crearLote,
  listarLotes,
  asignarAsesorItem,
  exportarLoteCsv,
};
