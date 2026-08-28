// ─────────────────────────────────────────────────────────────────────────────
// EFECTIVIDAD DIARIA — por AGENCIA y por FECHA DE CREACIÓN del lead en Bitrix
// ─────────────────────────────────────────────────────────────────────────────
// Pedido de gerencia (2026-08-28): una vista simple, tipo semáforo, que por
// AGENCIA de publicidad y por DÍA responda tres cosas:
//
//     TOTAL LEADS   → 100 % de la validación (todo lo que entró ese día)
//     GESTIONABLE   → meta: 50 % de los leads totales
//     INGRESOS CRM  → meta: 30 % de la META de gestionables (venta subida)
//     FALTANTE      → cuántas ventas subidas faltan para llegar a esa meta
//
// REGLAS DE CÁLCULO (confirmadas con Bryan el 2026-08-28)
//   · Las tres filas se cuentan SIEMPRE por FECHA DE CREACIÓN del lead en el
//     CRM. Una venta subida se atribuye al día en que ENTRÓ el lead, no al día
//     en que se cerró. Es la misma regla del diccionario (§2.4) y es lo que
//     permite leer la columna de un día como un embudo cerrado.
//   · meta_gestionables = round(total_leads × 50 %)
//   · meta_ingresos     = floor(meta_gestionables × 30 %)
//     (floor, no round: 55 × 30 % = 16,5 → 16. Con 15 ventas el faltante da 1,
//      que es exactamente el cuadre del ejemplo de gerencia del 1/8.)
//   · faltante          = max(0, meta_ingresos − ingresos_crm)
//   · Los % que se muestran son: real sobre su propia base, contra la meta fija
//     (gestionable → sobre leads, meta 50 %; ingresos y faltante → sobre
//      gestionables, meta 30 %).
//
// FUENTE DE DATOS: public.bitrix_webhook_leads (tabla VIVA del webhook de
// Bitrix, la misma que usa Redes). NO mestra_bitrix: esa tabla quedó congelada
// a inicios de agosto y dejaría la pantalla ciega a los leads nuevos.
// La AGENCIA sale del catálogo editable del módulo Redes
// (novonet_lineas_canal / velsa_lineas_canal, pestaña "Agencias").
//
// Las listas de etapas NO se redefinen acá: vienen de shared/etapas.js, que es
// la fuente única de verdad del ERP.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');
const {
    esLeadTotalExpr,
    esGestionableExpr,
    sumaReporteExpr,
} = require('../shared/etapas');

const META_GESTIONABLE = 0.50;   // 50 % de los leads totales
const META_INGRESO     = 0.30;   // 30 % de la meta de gestionables

const getFechaEcuador = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

// Configuración por empresa. Lo único que cambia es el catálogo de agencias,
// el default de "sin asignar" y si se filtra o no el origen REMARKETING.
//   · NOVONET  → excluye el origen literal REMARKETING de leads y gestionables
//                (regla vigente del dashboard Novonet, diccionario §2.1).
//   · VELSA    → no filtra orígenes, y todo origen sin asignar cae en "VELSA"
//                (regla confirmada: WinTracker solo trackea una agencia).
const EMPRESAS = {
    novonet: {
        empresa: 'novonet',
        catalogo: 'public.novonet_lineas_canal',
        agenciaPorDefecto: 'SIN AGENCIA ASIGNADA',
        filtraRemarketing: true,
    },
    velsa: {
        empresa: 'velsa',
        catalogo: 'public.velsa_lineas_canal',
        agenciaPorDefecto: 'VELSA',
        filtraRemarketing: false,
    },
};

// La etapa del webhook llega en dos columnas (etapa / etapa_bitrix) y con
// variantes de escritura. Se normaliza igual que en redes.controller.js para
// que "inegociable" y "INNEGOCIABLE" no cuenten como dos etapas distintas.
const ETAPA_EXPR = `NULLIF(CASE
    WHEN LOWER(TRIM(COALESCE(w.etapa, ''))) IN ('inegociable', 'innegociable') THEN 'INNEGOCIABLE'
    WHEN LOWER(TRIM(COALESCE(w.etapa, ''))) = 'regularizacion'                 THEN 'REGULARIZACION'
    ELSE UPPER(TRIM(COALESCE(w.etapa_bitrix, w.etapa, '')))
END, '')`;

const FECHA_EXPR = `(w.created_at AT TIME ZONE 'America/Guayaquil')::date`;

/**
 * Calcula metas y porcentajes de una celda (una agencia en un día).
 * Vive en el backend a propósito: así el Excel, la pantalla y cualquier
 * consumidor futuro del endpoint usan exactamente la misma aritmética.
 */
const calcularCelda = (totalLeads, gestionables, ingresosCrm) => {
    const total   = Number(totalLeads)   || 0;
    const gest    = Number(gestionables) || 0;
    const ing     = Number(ingresosCrm)  || 0;

    const metaGestionables = Math.round(total * META_GESTIONABLE);
    const metaIngresos     = Math.floor(metaGestionables * META_INGRESO);
    const faltante         = Math.max(0, metaIngresos - ing);

    const pct = (num, den) => (den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0);

    return {
        total_leads:        total,
        gestionables:       gest,
        ingresos_crm:       ing,
        faltante,
        meta_gestionables:  metaGestionables,
        meta_ingresos:      metaIngresos,
        // % real de cada fila sobre su propia base
        pct_gestionables:   pct(gest, total),
        pct_ingresos:       pct(ing, gest),
        pct_faltante:       pct(faltante, gest),
        // % de cumplimiento contra la meta (100 % = meta alcanzada)
        cumple_gestionables: pct(gest, metaGestionables),
        cumple_ingresos:     pct(ing, metaIngresos),
        // semáforo listo para la UI
        ok_gestionables:    gest >= metaGestionables,
        ok_ingresos:        ing  >= metaIngresos,
    };
};

/**
 * GET /api/indicadores/efectividad-diaria         (Novonet)
 * GET /api/indicadores-velsa/efectividad-diaria   (Velsa)
 *
 * Query: fechaDesde, fechaHasta (YYYY-MM-DD, por defecto hoy)
 *        agencia (opcional, coma-separado — filtra a una o varias agencias)
 *
 * Respuesta:
 *   { success, empresa, fechaDesde, fechaHasta, metas:{gestionable,ingreso},
 *     fechas: ['2026-08-01', ...],
 *     agencias: [ { agencia, dias: { '2026-08-01': {celda}, ... }, total:{celda} } ],
 *     consolidado: { agencia:'TOTAL', dias:{...}, total:{celda} } }
 */
const construirHandler = (claveEmpresa) => async (req, res) => {
    const cfg = EMPRESAS[claveEmpresa];
    try {
        const hoy        = getFechaEcuador();
        const fechaDesde = req.query.fechaDesde || hoy;
        const fechaHasta = req.query.fechaHasta || hoy;

        const values = [fechaDesde, fechaHasta];
        let filtroAgencia = '';
        const agenciasSel = (req.query.agencia ? String(req.query.agencia) : '')
            .split(',').map(a => a.trim()).filter(Boolean);
        if (agenciasSel.length) {
            values.push(agenciasSel.map(a => a.toUpperCase()));
            filtroAgencia = ` AND UPPER(agencia) = ANY($${values.length}::text[])`;
        }

        // Filtro de origen REMARKETING (solo Novonet). VENTA SUBIDA siempre suma,
        // aunque su origen esté excluido — regla previa de negocio.
        const filtroOrigen = cfg.filtraRemarketing
            ? `AND ${sumaReporteExpr('w.source', ETAPA_EXPR)}`
            : '';

        const sql = `
            WITH base AS (
                SELECT
                    ${FECHA_EXPR}                                       AS fecha,
                    w.bitrix_id                                         AS id,
                    COALESCE(NULLIF(BTRIM(m.agencia), ''), $${values.length + 1}) AS agencia,
                    ${ETAPA_EXPR}                                       AS etapa_norm
                FROM public.bitrix_webhook_leads w
                LEFT JOIN LATERAL (
                    SELECT lc.agencia
                    FROM ${cfg.catalogo} lc
                    WHERE BTRIM(lc.origen) = NULLIF(BTRIM(w.source), '')
                    ORDER BY lc.actualizado_en DESC NULLS LAST
                    LIMIT 1
                ) m ON TRUE
                WHERE w.empresa = $${values.length + 2}
                  AND ${FECHA_EXPR} BETWEEN $1::date AND $2::date
                  ${filtroOrigen}
            )
            SELECT
                agencia,
                fecha,
                COUNT(DISTINCT id) FILTER (WHERE ${esLeadTotalExpr('etapa_norm')})   AS total_leads,
                COUNT(DISTINCT id) FILTER (WHERE ${esGestionableExpr('etapa_norm')}) AS gestionables,
                COUNT(DISTINCT id) FILTER (WHERE etapa_norm = 'VENTA SUBIDA')        AS ingresos_crm
            FROM base
            WHERE TRUE ${filtroAgencia}
            GROUP BY agencia, fecha
            ORDER BY agencia ASC, fecha ASC
        `;
        values.push(cfg.agenciaPorDefecto, cfg.empresa);

        const { rows } = await pool.query(sql, values);

        // ── Serie completa de fechas: incluye los días sin leads, para que la
        //    tabla no "salte" días y el Excel salga con el calendario completo.
        const fechas = [];
        for (let d = new Date(`${fechaDesde}T00:00:00`); d <= new Date(`${fechaHasta}T00:00:00`); d.setDate(d.getDate() + 1)) {
            fechas.push(d.toLocaleDateString('en-CA'));
        }

        const porAgencia   = new Map();
        const acumGlobal   = {};          // fecha -> {leads, gest, ing}
        const sumar = (destino, fecha, r) => {
            const slot = destino[fecha] || (destino[fecha] = { l: 0, g: 0, i: 0 });
            slot.l += Number(r.total_leads)  || 0;
            slot.g += Number(r.gestionables) || 0;
            slot.i += Number(r.ingresos_crm) || 0;
        };

        for (const r of rows) {
            const fecha = r.fecha instanceof Date ? r.fecha.toLocaleDateString('en-CA') : String(r.fecha).slice(0, 10);
            if (!porAgencia.has(r.agencia)) porAgencia.set(r.agencia, {});
            sumar(porAgencia.get(r.agencia), fecha, r);
            sumar(acumGlobal, fecha, r);
        }

        const armar = (nombre, acum) => {
            const dias = {};
            let tl = 0, tg = 0, ti = 0;
            for (const f of fechas) {
                const s = acum[f] || { l: 0, g: 0, i: 0 };
                dias[f] = calcularCelda(s.l, s.g, s.i);
                tl += s.l; tg += s.g; ti += s.i;
            }
            return { agencia: nombre, dias, total: calcularCelda(tl, tg, ti) };
        };

        const agencias = [...porAgencia.keys()]
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map(nombre => armar(nombre, porAgencia.get(nombre)));

        res.json({
            success: true,
            empresa: cfg.empresa,
            fechaDesde,
            fechaHasta,
            metas: { gestionable: META_GESTIONABLE, ingreso: META_INGRESO },
            fechas,
            agencias,
            consolidado: armar('TOTAL GENERAL', acumGlobal),
        });
    } catch (error) {
        console.error(`ERROR EFECTIVIDAD DIARIA (${claveEmpresa}):`, error);
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message,
        });
    }
};

/** Lista de agencias disponibles (para el dropdown de la pantalla). */
const construirHandlerAgencias = (claveEmpresa) => async (req, res) => {
    const cfg = EMPRESAS[claveEmpresa];
    try {
        const { rows } = await pool.query(`
            SELECT COALESCE(NULLIF(BTRIM(m.agencia), ''), $1) AS agencia,
                   COUNT(*)::int                              AS n_leads
            FROM public.bitrix_webhook_leads w
            LEFT JOIN ${cfg.catalogo} m ON BTRIM(m.origen) = NULLIF(BTRIM(w.source), '')
            WHERE w.empresa = $2
            GROUP BY 1
            ORDER BY n_leads DESC
        `, [cfg.agenciaPorDefecto, cfg.empresa]);
        res.json({ success: true, agencias: rows });
    } catch (error) {
        console.error(`ERROR AGENCIAS EFECTIVIDAD (${claveEmpresa}):`, error);
        res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message });
    }
};

module.exports = {
    calcularCelda,
    META_GESTIONABLE,
    META_INGRESO,
    getEfectividadDiariaNovonet: construirHandler('novonet'),
    getEfectividadDiariaVelsa:   construirHandler('velsa'),
    getAgenciasEfectividadNovonet: construirHandlerAgencias('novonet'),
    getAgenciasEfectividadVelsa:   construirHandlerAgencias('velsa'),
};
