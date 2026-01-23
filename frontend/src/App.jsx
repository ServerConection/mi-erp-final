import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Indicadores from "./pages/Indicadores";
import DashboardLayout from "./layouts/DashboardLayout";
import HomeModules from "./pages/HomeModules"; // <--- 1. IMPORTAMOS EL NUEVO HOME
import { Ventas, RRHH, Horarios, Billetera, Comisiones } from "./pages/Modules";

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
          <Route path="ventas" element={<Ventas />} />
          <Route path="rrhh" element={<RRHH />} />
          <Route path="horarios" element={<Horarios />} />
          <Route path="billetera" element={<Billetera />} />
          <Route path="comisiones" element={<Comisiones />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}