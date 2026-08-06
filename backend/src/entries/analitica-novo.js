/**
 * PROCESO: ANALÍTICA NOVONET  (read-heavy, pool propio)
 *
 * Indicadores/redes/forecast de la marca NOVONET. Hoy es el más lento porque
 * muchas consultas leen tablas crudas en vivo (netlife_estatus_real, etc.).
 * Aislarlo evita que sus escaneos ahoguen a Velsa y al resto. El gran salto de
 * velocidad viene de migrar esas consultas a vistas materializadas (ver guía).
 *
 * NOTA: /api/consultor NO va aquí — es API externa y vive en CORE.
 */
require('dotenv').config();
const { buildBaseApp, finalize } = require('../shared/createApp');
const startHttp = require('../shared/startHttp');

const app = buildBaseApp({ serviceName: 'analitica-novo' });

app.use('/api/indicadores',             require('../routes/indicadores.routes'));
app.use('/api/comparativa-indicadores', require('../routes/comparativaIndicadores.routes'));
app.use('/api/redes',                   require('../routes/redes.routes'));
app.use('/api/forecast',                require('../routes/forecast.routes'));
app.use('/api/coverage',                require('../routes/coverage.routes'));
app.use('/api/cumplimiento-leads',      require('../routes/cumplimientoLeads.routes'));
app.use('/api/llamadas',                require('../routes/llamadas.routes'));

finalize(app);
startHttp(app, { serviceName: 'analitica-novo', withSocket: false });
