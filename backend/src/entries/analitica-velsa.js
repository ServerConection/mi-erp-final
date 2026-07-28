/**
 * PROCESO: ANALÍTICA VELSA  (read-heavy, pool propio)
 *
 * Indicadores/redes de la marca VELSA, que ya leen de vistas materializadas.
 * Aislado de Novonet: si Velsa se satura, Novonet sigue respondiendo.
 * Recomendado: DB_POOL_MAX moderado (p.ej. 8) y, cuando exista, leer de la
 * réplica de lectura (DB_HOST apuntando a la réplica).
 *
 * NOTA: /api/consultor-velsa NO va aquí — es API externa y vive en CORE.
 */
require('dotenv').config();
const { buildBaseApp, finalize } = require('../shared/createApp');
const startHttp = require('../shared/startHttp');

const app = buildBaseApp({ serviceName: 'analitica-velsa' });

app.use('/api/indicadores-velsa', require('../routes/indicadoresVelsa.routes'));
app.use('/api/redes-velsa',       require('../routes/redesVelsa.routes'));
app.use('/api/datos-adicionales', require('../routes/datosAdicionales.routes'));

finalize(app);
startHttp(app, { serviceName: 'analitica-velsa', withSocket: false });
