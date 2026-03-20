import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Indicadores from "./pages/Indicadores";
import IndicadoresVelsa from "./pages/IndicadoresVelsa";
import DashboardLayout from "./layouts/DashboardLayout";
import HomeModules from "./pages/HomeModules"; // <--- 1. IMPORTAMOS EL NUEVO HOME
import Seguimientoventas from "./pages/Seguimientoventas"; // <--- 1. IMPORTAMOS EL NUEVO HOME
import Redes from "./pages/Redes"; // <--- 1. IMPORTAMOS EL NUEVO HOME
import VistaAsesor from "./pages/VistaAsesor"; // <--- VISTA MÓDULO ASESOR
import Seguimientovelsa from "./pages/Seguimientovelsa";
import VistaAsesorVelsa from "./pages/VistaAsesorVelsa"
import { Ventas, RRHH, Horarios, Billetera, Comisiones} from "./pages/Modules";

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
          {/* 2. PANTALLA PRINCIPAL (El Hub de Tarjetas) */}
          <Route index element={<HomeModules />} />

          {/* 3. SUB-MÓDULOS */}
          <Route path="indicadores" element={<Indicadores />} /> {/* Ahora tiene su propia ruta */}
          <Route path="indicadores-velsa" element={<IndicadoresVelsa />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="rrhh" element={<RRHH />} />
          <Route path="horarios" element={<Horarios />} />
          <Route path="billetera" element={<Billetera />} />
          <Route path="comisiones" element={<Comisiones />} />
          <Route path="Seguimiento_Venta" element={<Seguimientoventas />} />
          <Route path="redes" element={<Redes />} />
          <Route path="vista-asesor" element={<VistaAsesor />} /> {/* MÓDULO ASESOR */}
          <Route path="vista-asesor-velsa" element={<VistaAsesorVelsa />} /> {/* MÓDULO ASESOR VELSA*/}
          <Route path="seguimiento-velsa" element={<Seguimientovelsa />} /> {/* SEGUIMIENTO VENTAS VELSA*/}
        </Route>

        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}