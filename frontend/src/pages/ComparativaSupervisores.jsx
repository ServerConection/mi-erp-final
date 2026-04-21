import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import '../styles/ComparativaSupervisores.css';

const ComparativaSupervisores = () => {
  const [supervisoresComparativa, setSupervisoresComparativa] = useState([]);
  const [ingresosSemanales, setIngresosSemanales] = useState([]);
  const [ingresosDiarios, setIngresosDiarios] = useState([]);
  const [metricasAdicionales, setMetricasAdicionales] = useState([]);
  const [resumen, setResumen] = useState({});
  const [supervisor, setSupervisor] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('comparativa');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (sup = '', desde = '', hasta = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sup) params.append('supervisor', sup);
      if (desde) params.append('fechaDesde', desde);
      if (hasta) params.append('fechaHasta', hasta);

      const response = await fetch(
        `/api/comparativa-indicadores/supervisores?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (!response.ok) throw new Error('Error al obtener datos');

      const data = await response.json();
      if (data.success) {
        setSupervisoresComparativa(data.supervisoresComparativa || []);
        setIngresosSemanales(data.ingresosSemanales || []);
        setIngresosDiarios(data.ingresosDiarios || []);
        setMetricasAdicionales(data.metricasAdicionales || []);
        setResumen(data.resumen || {});
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFiltrar = () => {
    fetchData(supervisor, fechaDesde, fechaHasta);
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  return (
    <div className="comparativa-supervisores">
      <h1>📊 Comparativa de Supervisores</h1>

      {/* Filtros */}
      <div className="filtros-section">
        <div className="filtro-group">
          <label>Supervisor:</label>
          <input
            type="text"
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
            placeholder="Dejar vacío para todos"
          />
        </div>
        <div className="filtro-group">
          <label>Desde:</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </div>
        <div className="filtro-group">
          <label>Hasta:</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>
        <button onClick={handleFiltrar} disabled={loading} className="btn-filtrar">
          {loading ? '⏳ Cargando...' : '🔍 Filtrar'}
        </button>
      </div>

      {/* Resumen */}
      <div className="resumen-cards">
        <div className="card">
          <h3>Total Supervisores</h3>
          <p className="valor">{resumen.total_supervisores || 0}</p>
        </div>
        <div className="card">
          <h3>Total Casos Asignados</h3>
          <p className="valor">{resumen.total_casos_asignados || 0}</p>
        </div>
        <div className="card">
          <h3>Total Casos Gestionables</h3>
          <p className="valor">{resumen.total_casos_gestionables || 0}</p>
        </div>
        <div className="card">
          <h3>Total Ingresos JOT</h3>
          <p className="valor">{resumen.total_ingresos_jot || 0}</p>
        </div>
        <div className="card">
          <h3>Total Activas</h3>
          <p className="valor">{resumen.total_activas || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'comparativa' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparativa')}
        >
          Comparativa Supervisores
        </button>
        <button
          className={`tab ${activeTab === 'semanales' ? 'active' : ''}`}
          onClick={() => setActiveTab('semanales')}
        >
          Ingresos por Semana
        </button>
        <button
          className={`tab ${activeTab === 'diarios' ? 'active' : ''}`}
          onClick={() => setActiveTab('diarios')}
        >
          Desglose Diario
        </button>
        <button
          className={`tab ${activeTab === 'metricas' ? 'active' : ''}`}
          onClick={() => setActiveTab('metricas')}
        >
          Métricas Adicionales
        </button>
      </div>

      {/* Contenido por Tab */}
      <div className="tab-content">
        {activeTab === 'comparativa' && (
          <div className="comparativa-content">
            <h2>Comparativa: Casos Asignados vs Gestionables vs Ingresos JOT</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={supervisoresComparativa}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="supervisor" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="casos_asignados" fill="#8884d8" name="Casos Asignados" />
                <Bar dataKey="casos_gestionables" fill="#82ca9d" name="Casos Gestionables" />
                <Bar dataKey="ingresos_jot" fill="#ffc658" name="Ingresos JOT" />
              </BarChart>
            </ResponsiveContainer>

            <h2 style={{ marginTop: '40px' }}>Activas vs Tasa de Instalación</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={supervisoresComparativa}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="supervisor" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="activas" fill="#ff7c7c" name="Activas" />
                <Bar dataKey="tasa_instalacion" fill="#0088FE" name="Tasa Instalación %" />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabla de detalles */}
            <div style={{ marginTop: '40px', overflowX: 'auto' }}>
              <table className="tabla-comparativa">
                <thead>
                  <tr>
                    <th>Supervisor</th>
                    <th>Casos Asignados</th>
                    <th>Casos Gestionables</th>
                    <th>Ingresos JOT</th>
                    <th>Activas</th>
                    <th>Tasa Instalación</th>
                    <th>Activas Tarjeta Crédito</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisoresComparativa.map((sup, idx) => (
                    <tr key={idx}>
                      <td>{sup.supervisor}</td>
                      <td>{sup.casos_asignados}</td>
                      <td>{sup.casos_gestionables}</td>
                      <td>{sup.ingresos_jot}</td>
                      <td>{sup.activas}</td>
                      <td>{sup.tasa_instalacion.toFixed(2)}%</td>
                      <td>{sup.activas_tarjeta_credito}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'semanales' && (
          <div className="semanales-content">
            <h2>Ingresos JOT por Semana vs Activas</h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={ingresosSemanales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="semana_inicio"
                  tickFormatter={(val) => `Sem ${val}`}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ingresos_jot" stroke="#8884d8" name="Ingresos JOT" />
                <Line type="monotone" dataKey="activas" stroke="#82ca9d" name="Activas" />
              </LineChart>
            </ResponsiveContainer>

            <h2 style={{ marginTop: '40px' }}>Tasa de Instalación por Semana</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={ingresosSemanales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="num_semana" label={{ value: 'Semana del Mes', position: 'insideBottom', offset: -5 }} />
                <YAxis />
                <Tooltip formatter={(value) => value.toFixed(2) + '%'} />
                <Bar dataKey="tasa_instalacion" fill="#8884d8" name="Tasa Instalación %" />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabla de ingresos semanales */}
            <div style={{ marginTop: '40px', overflowX: 'auto' }}>
              <table className="tabla-comparativa">
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th>Inicio</th>
                    <th>Ingresos JOT</th>
                    <th>Activas</th>
                    <th>Tasa Instalación</th>
                  </tr>
                </thead>
                <tbody>
                  {ingresosSemanales.map((sem, idx) => (
                    <tr key={idx}>
                      <td>Semana {sem.num_semana}</td>
                      <td>{sem.semana_inicio}</td>
                      <td>{sem.ingresos_jot}</td>
                      <td>{sem.activas}</td>
                      <td>{sem.tasa_instalacion.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'diarios' && (
          <div className="diarios-content">
            <h2>Desglose Diario: Ingresos JOT vs Activas</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={ingresosDiarios}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="ingresos_jot" fill="#8884d8" name="Ingresos JOT" />
                <Bar dataKey="activas" fill="#82ca9d" name="Activas" />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabla de ingresos diarios */}
            <div style={{ marginTop: '40px', overflowX: 'auto' }}>
              <table className="tabla-comparativa">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Día</th>
                    <th>Ingresos JOT</th>
                    <th>Activas</th>
                  </tr>
                </thead>
                <tbody>
                  {ingresosDiarios.map((dia, idx) => (
                    <tr key={idx}>
                      <td>{dia.fecha}</td>
                      <td>{dia.dia_semana}</td>
                      <td>{dia.ingresos_jot}</td>
                      <td>{dia.activas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'metricas' && (
          <div className="metricas-content">
            <h2>Métricas Adicionales por Supervisor</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={metricasAdicionales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="supervisor" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="activas_tercera_edad" fill="#ffc658" name="Activas Tercera Edad" />
                <Bar dataKey="por_regularizar" fill="#ff7c7c" name="Por Regularizar" />
                <Bar dataKey="pagos_tarjeta" fill="#0088FE" name="Pagos Tarjeta Crédito" />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabla de métricas */}
            <div style={{ marginTop: '40px', overflowX: 'auto' }}>
              <table className="tabla-comparativa">
                <thead>
                  <tr>
                    <th>Supervisor</th>
                    <th>Activas 3ra Edad</th>
                    <th>Por Regularizar</th>
                    <th>Pagos Tarjeta Crédito</th>
                  </tr>
                </thead>
                <tbody>
                  {metricasAdicionales.map((met, idx) => (
                    <tr key={idx}>
                      <td>{met.supervisor}</td>
                      <td>{met.activas_tercera_edad}</td>
                      <td>{met.por_regularizar}</td>
                      <td>{met.pagos_tarjeta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComparativaSupervisores;
