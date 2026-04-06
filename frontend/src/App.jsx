import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import useAuth from "./hooks/useAuth";
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
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMPONENTE: ProtectedRoute
 * Valida autenticación + permisos para acceder a una ruta
 * ═══════════════════════════════════════════════════════════════════════════════
 */
const ProtectedRoute = ({ children, requierePermiso }) => {
  const { user, permisos, cargando, tienePermiso } = useAuth();

  if (cargando) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Cargando...</h2>
          <p>Validando permisos de acceso</p>
        </div>
      </div>
    );
  }

  // Si no hay token, redirigir a login
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;

  // Si no hay usuario, redirigir a login
  if (!user) return <Navigate to="/login" replace />;

  // Si se requiere un permiso específico, validar
  if (requierePermiso && !tienePermiso(requierePermiso)) {
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
        {requierePermiso && (
          <p><strong>Módulo requerido:</strong> {requierePermiso}</p>
        )}
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

  return children;
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMPONENTE PRINCIPAL: App
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 🔓 Ruta sin protección: LOGIN */}
        <Route path="/login" element={<Login />} />

        {/* 🔒 Dashboard protegido - Requiere autenticación */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* 📋 Home - Hub de módulos (accesible para todos los autenticados) */}
          <Route index element={<HomeModules />} />

          {/* ═══════════════════════════════════════════════════════════════════
              MÓDULOS NOVONET
              ═══════════════════════════════════════════════════════════════════ */}
          
          {/* Vista Asesor NOVONET */}
          <Route 
            path="vista-asesor" 
            element={
              <ProtectedRoute requierePermiso="VistaAsesor">
                <VistaAsesor />
              </ProtectedRoute>
            } 
          />

          {/* Seguimiento de Ventas NOVONET */}
          <Route 
            path="Seguimiento_Venta" 
            element={
              <ProtectedRoute requierePermiso="SeguimientoVentas">
                <Seguimientoventas />
              </ProtectedRoute>
            } 
          />

          {/* Indicadores NOVONET */}
          <Route 
            path="indicadores" 
            element={
              <ProtectedRoute requierePermiso="Indicadores">
                <Indicadores />
              </ProtectedRoute>
            } 
          />

          {/* Redes NOVONET */}
          <Route 
            path="redes" 
            element={
              <ProtectedRoute requierePermiso="Redes">
                <Redes />
              </ProtectedRoute>
            } 
          />

          {/* ═══════════════════════════════════════════════════════════════════
              MÓDULOS VELSA
              ═══════════════════════════════════════════════════════════════════ */}
          
          {/* Vista Asesor VELSA */}
          <Route 
            path="vista-asesor-velsa" 
            element={
              <ProtectedRoute requierePermiso="VistaAsesorVelsa">
                <VistaAsesorVelsa />
              </ProtectedRoute>
            } 
          />

          {/* Seguimiento de Ventas VELSA */}
          <Route 
            path="seguimiento-velsa" 
            element={
              <ProtectedRoute requierePermiso="SeguimientoVelsa">
                <Seguimientovelsa />
              </ProtectedRoute>
            } 
          />

          {/* Indicadores VELSA */}
          <Route 
            path="indicadores-velsa" 
            element={
              <ProtectedRoute requierePermiso="IndicadoresVelsa">
                <IndicadoresVelsa />
              </ProtectedRoute>
            } 
          />

          {/* ═══════════════════════════════════════════════════════════════════
              MÓDULOS COMUNES (Sin restricción de empresa)
              ═══════════════════════════════════════════════════════════════════ */}
          
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

        {/* 🔓 TV Mode - Sin login requerido */}
        <Route path="tv" element={<TVMode />} />

        {/* 🔄 Redirigir rutas no encontradas a login */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NOTAS IMPORTANTES:
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * 1. RUTAS CON PROTECCIÓN DE PERMISOS:
 *    - vista-asesor → requiere permiso "VistaAsesor" (NOVONET)
 *    - Seguimiento_Venta → requiere "SeguimientoVentas" (NOVONET)
 *    - indicadores → requiere "Indicadores" (NOVONET)
 *    - redes → requiere "Redes" (NOVONET)
 *    - vista-asesor-velsa → requiere "VistaAsesorVelsa" (VELSA)
 *    - seguimiento-velsa → requiere "SeguimientoVelsa" (VELSA)
 *    - indicadores-velsa → requiere "IndicadoresVelsa" (VELSA)
 * 
 * 2. RUTAS SIN PROTECCIÓN (accesibles para todos los autenticados):
 *    - ventas, rrhh, horarios, billetera, comisiones
 *    - notificaciones, broadcast, appsheet, Guiaplanesmarzo
 * 
 * 3. SI NECESITAS AGREGAR MÁS MÓDULOS:
 *    a) Primero defínelos en /src/config/permisos.config.js
 *    b) Agrega la ruta aquí con: <ProtectedRoute requierePermiso="TuModulo">
 *    c) Importa el componente al inicio del archivo
 * 
 * 4. ESTRUCTURA MANTENIDA:
 *    ✅ Tu layout de dashboard se mantiene igual
 *    ✅ Tus componentes se importan normalmente
 *    ✅ Solo agregamos validación de permisos
 *    ✅ Mensajes de error amigables si no tiene permiso
 * 
 * 5. USO EN COMPONENTES:
 *    import useAuth from './hooks/useAuth';
 *    
 *    function MiComponente() {
 *      const { user, tienePermiso } = useAuth();
 *      
 *      return (
 *        <>
 *          {tienePermiso('VistaAsesor') && (
 *            <a href="/vista-asesor">Ver Vista Asesor</a>
 *          )}
 *        </>
 *      );
 *    }
 */
