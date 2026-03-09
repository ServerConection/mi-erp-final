const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const getMonitoreoRedes = async (req, res) => {
  try {
    const query = `
      SELECT * FROM pivot_etapas_mes() AS t(
        etapa text,
        total bigint,
        "09/03/2026" bigint,
        "08/03/2026" bigint,
        "07/03/2026" bigint,
        "06/03/2026" bigint,
        "05/03/2026" bigint,
        "04/03/2026" bigint,
        "03/03/2026" bigint,
        "02/03/2026" bigint,
        "01/03/2026" bigint
      )
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows,
      columns: result.fields.map((f) => f.name),
      total: result.rowCount,
    });
  } catch (error) {
    console.error('Error en getMonitoreoRedes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos de monitoreo de redes',
      error: error.message,
    });
  }
};

const getMonitoreoCosto = async (req, res) => {
  try {
    // TODO: Implementar query para monitoreo de costos
    res.json({
      success: true,
      data: [],
      message: 'Módulo de Monitoreo Costo General - En desarrollo',
    });
  } catch (error) {
    console.error('Error en getMonitoreoCosto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos de monitoreo de costos',
      error: error.message,
    });
  }
};

module.exports = {
  getMonitoreoRedes,
  getMonitoreoCosto,
};