import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Indicadores from "./pages/Indicadores";
import IndicadoresVelsa from "./pages/IndicadoresVelsa";
import DashboardLayout from "./layouts/DashboardLayout";
import HomeModules from "./pages/HomeModules";
import Seguimientoventas from "./pages/Seguimientoventas";
import Redes from "./pages/Redes";
import VistaAsesor from "./pages/VistaAsesor";
import Seguimientovelsa from "./pages/Seguimientovelsa";
import VistaAsesorVelsa from "./pages/VistaAsesorVelsa";
import Notificaciones from "./pages/Notificaciones";
import BroadcastPanel from "./pages/BroadcastPanel";
import Guiaplanesmarzo from "./pages/Guiaplanesmarzo";
import TVMode from "./pages/TVMode";
import AppSheetModule from "./pages/AppSheetModule";
import { Ventas, RRHH, Horarios, Billetera, Comisiones } from "./pages/Modules";

/**
 * COMPONENTE: ProtectedRoute
 * Valida permisos para módulos específicos
 */
const ProtectedRoute = ({ children, requierePermiso }) => {
  const token = localStorage.getItem("token");
  
  if (!token) return <Navigate to="/login" replace />;

  // Si se requiere un permiso específico, validar
  if (requierePermiso) {
    try {
      const permisosStr = localStorage.getItem("permisos");
      const permisos = permisosStr ? JSON.parse(permisosStr) : [];
      
      if (!permisos.includes(requierePermiso)) {
        const userData = localStorage.getItem("user");
        const user = userData ? JSON.parse(userData) : {};
        
        return (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            margin: '20px'
          }}>
            <h2>❌ Acceso Denegado</h2>
            <p>No tienes permisos para acceder a esta página.</p>
            <p>
              <strong>Tu empresa:</strong> {user?.empresa} | 
              <strong> Tu perfil:</strong> {user?.perfil}
            </p>
            <p><strong>Módulo requerido:</strong> {requierePermiso}</p>
            <button 
              onClick={() => window.location.href = '/'}
              style={{
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              Volver al inicio
            </button>
          </div>
        );
      }
    } catch (err) {
      console.error('Error validando permisos:', err);
    }
  }

  return children;
};

/**
 * COMPONENTE PRINCIPAL: App
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login sin protección */}
        <Route path="/login" element={<Login />} />

        {/* Dashboard protegido */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* Home */}
          <Route index element={<HomeModules />} />

          {/* MÓDULOS NOVONET - CON PROTECCIÓN */}
          <Route 
            path="vista-asesor" 
            element={
              <ProtectedRoute requierePermiso="VistaAsesor">
                <VistaAsesor />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="Seguimiento_Venta" 
            element={
              <ProtectedRoute requierePermiso="SeguimientoVentas">
                <Seguimientoventas />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="indicadores" 
            element={
              <ProtectedRoute requierePermiso="Indicadores">
                <Indicadores />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="redes" 
            element={
              <ProtectedRoute requierePermiso="Redes">
                <Redes />
              </ProtectedRoute>
            } 
          />

          {/* MÓDULOS VELSA - CON PROTECCIÓN */}
          <Route 
            path="vista-asesor-velsa" 
            element={
              <ProtectedRoute requierePermiso="VistaAsesorVelsa">
                <VistaAsesorVelsa />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="seguimiento-velsa" 
            element={
              <ProtectedRoute requierePermiso="SeguimientoVelsa">
                <Seguimientovelsa />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="indicadores-velsa" 
            element={
              <ProtectedRoute requierePermiso="IndicadoresVelsa">
                <IndicadoresVelsa />
              </ProtectedRoute>
            } 
          />

          {/* MÓDULOS COMUNES - SIN RESTRICCIÓN */}
          <Route path="ventas" element={<Ventas />} />
          <Route path="rrhh" element={<RRHH />} />
          <Route path="horarios" element={<Horarios />} />
          <Route path="billetera" element={<Billetera />} />
          <Route path="comisiones" element={<Comisiones />} />
          <Route path="notificaciones" element={<Notificaciones />} />
          <Route path="broadcast" element={<BroadcastPanel />} />
          <Route path="appsheet" element={<AppSheetModule />} />
          <Route path="Guiaplanesmarzo" element={<Guiaplanesmarzo />} />
        </Route>

        {/* TV Mode sin login */}
        <Route path="tv" element={<TVMode />} />

        {/* Redirigir desconocidas a login */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}