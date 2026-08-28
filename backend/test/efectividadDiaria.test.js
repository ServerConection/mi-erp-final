// Tests del módulo EFECTIVIDAD DIARIA (por agencia y fecha de creación).
// Se stubea el pool ANTES de cargar el controlador: así el test no abre una
// conexión real a Postgres y además puede leer el SQL que se genera.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const dbPath = require.resolve('../src/config/db');
let ultimaQuery = null;
let filasFake = [];
require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
        query: async (sql, vals) => { ultimaQuery = { sql, vals }; return { rows: filasFake }; },
    },
};

const ctrl = require('../src/controllers/efectividadDiaria.controller');

const ejecutar = (handler, query) => new Promise((resolve, reject) => {
    handler({ query }, {
        json: resolve,
        status: (code) => ({ json: (body) => reject(new Error(`HTTP ${code}: ${JSON.stringify(body)}`)) }),
    }).catch(reject);
});

// ── Aritmética: el cuadre que dio gerencia en el Excel de referencia ─────────
test('1/8: 110 leads · 50 gestionables · 15 ventas → faltante 1 (2 %)', () => {
    const c = ctrl.calcularCelda(110, 50, 15);
    assert.equal(c.meta_gestionables, 55);   // 50 % de 110
    assert.equal(c.meta_ingresos, 16);       // floor(30 % de 55) = 16, no 17
    assert.equal(c.faltante, 1);
    assert.equal(c.pct_gestionables, 45.5);  // 50/110
    assert.equal(c.pct_faltante, 2);         // 1/50
    assert.equal(c.ok_gestionables, false);
});

test('2/8: 100 leads · 50 gestionables · 30 ventas → cuadre perfecto, faltante 0', () => {
    const c = ctrl.calcularCelda(100, 50, 30);
    assert.equal(c.meta_gestionables, 50);
    assert.equal(c.meta_ingresos, 15);
    assert.equal(c.faltante, 0);
    assert.equal(c.pct_gestionables, 50);
    assert.equal(c.cumple_gestionables, 100);
    assert.equal(c.ok_gestionables, true);
    assert.equal(c.ok_ingresos, true);
});

test('día sin leads no divide por cero', () => {
    const c = ctrl.calcularCelda(0, 0, 0);
    assert.equal(c.faltante, 0);
    assert.equal(c.pct_gestionables, 0);
    assert.equal(c.pct_ingresos, 0);
});

test('el faltante nunca es negativo aunque se supere la meta', () => {
    assert.equal(ctrl.calcularCelda(100, 50, 40).faltante, 0);
});

// ── Respuesta del endpoint ───────────────────────────────────────────────────
test('devuelve todos los días del rango, incluso los que no tienen leads', async () => {
    filasFake = [{ agencia: 'ARTS', fecha: '2026-08-01', total_leads: 110, gestionables: 50, ingresos_crm: 15 }];
    const r = await ejecutar(ctrl.getEfectividadDiariaNovonet, { fechaDesde: '2026-08-01', fechaHasta: '2026-08-03' });
    assert.deepEqual(r.fechas, ['2026-08-01', '2026-08-02', '2026-08-03']);
    assert.equal(r.agencias.length, 1);
    assert.equal(r.agencias[0].dias['2026-08-02'].total_leads, 0);
    assert.equal(r.agencias[0].total.total_leads, 110);
});

test('el consolidado suma todas las agencias', async () => {
    filasFake = [
        { agencia: 'ARTS',   fecha: '2026-08-01', total_leads: 110, gestionables: 50, ingresos_crm: 15 },
        { agencia: 'VIDIKA', fecha: '2026-08-01', total_leads: 100, gestionables: 50, ingresos_crm: 30 },
    ];
    const r = await ejecutar(ctrl.getEfectividadDiariaNovonet, { fechaDesde: '2026-08-01', fechaHasta: '2026-08-01' });
    assert.deepEqual(r.agencias.map(a => a.agencia), ['ARTS', 'VIDIKA']);
    assert.equal(r.consolidado.total.total_leads, 210);
    assert.equal(r.consolidado.total.ingresos_crm, 45);
});

// ── SQL: las reglas que NO se pueden romper sin desalinear el ERP ────────────
test('todo se cuenta por FECHA DE CREACIÓN del lead, no por fecha de cierre', async () => {
    filasFake = [];
    await ejecutar(ctrl.getEfectividadDiariaNovonet, { fechaDesde: '2026-08-01', fechaHasta: '2026-08-01' });
    assert.match(ultimaQuery.sql, /created_at AT TIME ZONE 'America\/Guayaquil'/);
    assert.doesNotMatch(ultimaQuery.sql, /fecha_venta_subida/);
});

test('lee de la tabla viva del webhook, no de mestra_bitrix (congelada)', async () => {
    filasFake = [];
    await ejecutar(ctrl.getEfectividadDiariaNovonet, {});
    assert.match(ultimaQuery.sql, /public\.bitrix_webhook_leads/);
    assert.doesNotMatch(ultimaQuery.sql, /mestra_bitrix/);
});

test('cada empresa usa su propio catálogo de agencias y su propio default', async () => {
    filasFake = [];
    await ejecutar(ctrl.getEfectividadDiariaNovonet, {});
    assert.match(ultimaQuery.sql, /public\.novonet_lineas_canal/);
    assert.ok(ultimaQuery.vals.includes('novonet'));
    assert.ok(ultimaQuery.vals.includes('SIN AGENCIA ASIGNADA'));

    await ejecutar(ctrl.getEfectividadDiariaVelsa, {});
    assert.match(ultimaQuery.sql, /public\.velsa_lineas_canal/);
    assert.ok(ultimaQuery.vals.includes('velsa'));
    assert.ok(ultimaQuery.vals.includes('VELSA'));   // default: todo origen sin asignar es VELSA
});

test('Novonet excluye el origen REMARKETING; Velsa no filtra orígenes', async () => {
    filasFake = [];
    await ejecutar(ctrl.getEfectividadDiariaNovonet, {});
    assert.match(ultimaQuery.sql, /NOT IN \('REMARKETING'\)/);

    await ejecutar(ctrl.getEfectividadDiariaVelsa, {});
    assert.doesNotMatch(ultimaQuery.sql, /NOT IN \('REMARKETING'\)/);
});

test('gestionables e ingresos usan IDs únicos (un lead con varios servicios no se duplica)', async () => {
    filasFake = [];
    await ejecutar(ctrl.getEfectividadDiariaNovonet, {});
    const ocurrencias = ultimaQuery.sql.match(/COUNT\(DISTINCT id\)/g) || [];
    assert.equal(ocurrencias.length, 3);
    assert.doesNotMatch(ultimaQuery.sql, /COUNT\(\*\)/);
});

test('el filtro de agencia llega parametrizado (sin concatenar texto del usuario)', async () => {
    filasFake = [];
    await ejecutar(ctrl.getEfectividadDiariaNovonet, { agencia: "ARTS,VIDIKA'; DROP TABLE x;--" });
    assert.match(ultimaQuery.sql, /UPPER\(agencia\) = ANY\(\$3::text\[\]\)/);
    assert.doesNotMatch(ultimaQuery.sql, /DROP TABLE/);
    assert.ok(ultimaQuery.vals.some(v => Array.isArray(v) && v.length === 2));
});
