require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const controller = require('../controllers/wa_uso.controller');
const erp = require('../config/dbErp');
const { conteoGestionablesHoy } = require('../shared/repartoConteo');
let gestionablesPanel = null;

const req = {
  user: { id: 1, perfil: 'ADMINISTRADOR', empresa: 'NOVONET', usuario: 'prueba' },
  query: { desde: '2026-11-16', hasta: '2026-11-16', empresa: 'NOVONET' },
};
let codigo = 200;
const res = {
  status(valor) { codigo = valor; return this; },
  json(body) {
    console.log(JSON.stringify({
      codigo,
      success: body.success,
      error: body.error,
      filas_wabot: body.data?.uso?.wabot?.length,
      filas_cobertura: body.data?.cobertura?.length,
      totales: body.data?.totales,
      cobertura_desde: body.data?.cobertura_desde,
      gestionables_panel_reparto: gestionablesPanel,
      andre: body.data?.uso?.wabot?.find((f) => String(f.usuario).toUpperCase().includes('ANDRE SEBASTIAN NOGUERA')),
    }, null, 2));
    return body;
  },
};

(async () => {
  const mapa = await conteoGestionablesHoy(erp, 'novonet');
  gestionablesPanel = [...mapa.values()].reduce((s, f) => s + Number(f.gestionables || 0), 0);
  await controller.reporte(req, res);
})().finally(() => process.exit(codigo >= 400 ? 1 : 0));
