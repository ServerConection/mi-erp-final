import { BrowserRouter, Routes, Route, Navigate, Suspense, lazy } from "react-router-dom";

// Páginas ligeras — se cargan siempre (login + shell + home)
import Login          from "./pages/Login";
import DashboardLayout from "./layouts/DashboardLayout";
import HomeModules    from "./pages/HomeModules";
// Módulos con exports nombrados — pequeños, se mantienen estáticos
import { RRHH, Horarios, Billetera, Comisiones } from "./pages/Modules";

// Páginas pesadas → carga diferida (code splitting)
// El browser descarga el chunk solo cuando el usuario navega a esa ruta
const Indicadores          = lazy(() => import("./pages/Indicadores"));
const IndicadoresVelsa     = lazy(() => import("./pages/IndicadoresVelsa"));
const ComparativaSupervisores = lazy(() => import("./pages/ComparativaSupervisores"));
const Seguimientoventas    = lazy(() => import("./pages/Seguimientoventas"));
const Redes                = lazy(() => import("./pages/Redes"));
const VistaAsesor          = lazy(() => import("./pages/VistaAsesor"));
const Seguimientovelsa     = lazy(() => import("./pages/Seguimientovelsa"));
const VistaAsesorVelsa     = lazy(() => import("./pages/VistaAsesorVelsa"));
const Notificaciones       = lazy(() => import("./pages/Notificaciones"));
const BroadcastPanel       = lazy(() => import("./pages/BroadcastPanel"));
const Guiaplanesmarzo      = lazy(() => import("./pages/Guiaplanesmarzo"));
const TVMode               = lazy(() => import("./pages/TVMode"));
const AppSheetModule       = lazy(() => import("./pages/AppSheetModule"));
const Ventas               = lazy(() => import("./pages/VentasFormulario"));

// Spinner mínimo mientras se descarga el chunk
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-100">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cargando módulo…</span>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<HomeModules />} />

            {/* SUB-MÓDULOS */}
            <Route path="indicadores"               element={<Indicadores />} />
            <Route path="indicadores-velsa"         element={<IndicadoresVelsa />} />
            <Route path="comparativa-supervisores"  element={<ComparativaSupervisores />} />
            <Route path="ventas"                    element={<Ventas />} />
            <Route path="rrhh"                      element={<RRHH />} />
            <Route path="horarios"                  element={<Horarios />} />
            <Route path="billetera"                 element={<Billetera />} />
            <Route path="comisiones"                element={<Comisiones />} />
            <Route path="seguimiento-ventas"        element={<Seguimientoventas />} />
            <Route path="redes"                     element={<Redes />} />
            <Route path="vista-asesor"              element={<VistaAsesor />} />
            <Route path="vista-asesor-velsa"        element={<VistaAsesorVelsa />} />
            <Route path="seguimiento-velsa"         element={<Seguimientovelsa />} />

            {/* Rutas sin ítem en el menú lateral */}
            <Route path="notificaciones"            element={<Notificaciones />} />
            <Route path="broadcast"                 element={<BroadcastPanel />} />
            <Route path="appsheet"                  element={<AppSheetModule />} />
            <Route path="guia-planes-marzo"         element={<Guiaplanesmarzo />} />
          </Route>

          <Route path="tv"  element={<TVMode />} />
          <Route path="*"   element={<Navigate to="/login" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
