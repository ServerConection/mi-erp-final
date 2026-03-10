const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const getMonitoreoRedes = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM pivot_etapas_mes()`);

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