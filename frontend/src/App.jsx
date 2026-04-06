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
import Ventas from "./pages/VentasFormulario";
import { RRHH, Horarios, Billetera, Comisiones } from "./pages/Modules";

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<HomeModules />} />

          <Route path="indicadores" element={<Indicadores />} />
          <Route path="indicadores-velsa" element={<IndicadoresVelsa />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="rrhh" element={<RRHH />} />
          <Route path="horarios" element={<Horarios />} />
          <Route path="billetera" element={<Billetera />} />
          <Route path="comisiones" element={<Comisiones />} />
          <Route path="Seguimiento_Venta" element={<Seguimientoventas />} />
          <Route path="redes" element={<Redes />} />
          <Route path="vista-asesor" element={<VistaAsesor />} />
          <Route path="vista-asesor-velsa" element={<VistaAsesorVelsa />} />
          <Route path="seguimiento-velsa" element={<Seguimientovelsa />} />
          <Route path="notificaciones" element={<Notificaciones />} />
          <Route path="broadcast" element={<BroadcastPanel />} />
          <Route path="appsheet" element={<AppSheetModule />} />
          <Route path="Guiaplanesmarzo" element={<Guiaplanesmarzo />} />
<Route path="VentasFormulario" element={<VentasFormula />} />
        </Route>

        <Route path="tv" element={<TVMode />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}