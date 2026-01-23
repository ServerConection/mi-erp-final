import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  
  // ESTADO PARA EL MENÚ EN MÓVIL (Abierto/Cerrado)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const BG_IMAGE = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop";

  useEffect(() => {
    const userData = localStorage.getItem("userProfile");
    if (!userData) { navigate("/login"); return; }
    setUser(JSON.parse(userData));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  if (!user) return null;

  const menuItems = [
    { name: "Inicio", path: "/", icon: "🏠" }, 
    
    // CORRECCIÓN: Ahora Indicadores apunta a su propia ruta, no al inicio
    { name: "Indicadores", path: "/indicadores", icon: "📊" },
    
    { name: "Ventas", path: "/ventas", icon: "📈" },
    { name: "RRHH", path: "/rrhh", icon: "👥" },
    { name: "Horarios", path: "/horarios", icon: "⏰" },
    { name: "Billetera", path: "/billetera", icon: "💳" },
    { name: "Comisiones", path: "/comisiones", icon: "💰" },
  ];

  return (
    <div 
      className="flex h-screen bg-cover bg-center overflow-hidden relative"
      style={{ backgroundImage: `url(${BG_IMAGE})` }}
    >
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-0"></div>

      {/* 0. OVERLAY PARA CERRAR EN MÓVIL (Solo visible si menú abierto en móvil) */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm transition-opacity"
        ></div>
      )}

      {/* 1. SIDEBAR (RESPONSIVE) */}
      <aside 
        className={`
          fixed md:static inset-y-0 left-0 z-30 w-72 
          bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
        `}
      >
        <div className="p-8 border-b border-white/5 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
            MI ERP <span className="text-xs text-white/40 font-normal">PRO</span>
          </h1>
          {/* Botón X para cerrar en móvil */}
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-white/50 hover:text-white">
            ✕
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.path);
                  setSidebarOpen(false); // Cerrar menú al hacer click en móvil
                }}
                className={`w-full flex items-center space-x-4 px-4 py-3.5 rounded-xl transition-all duration-300 group ${
                  isActive
                    ? "bg-blue-600/20 border border-blue-500/30 text-white shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                    : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"
                }`}
              >
                <span className={`text-xl ${isActive ? "text-blue-400" : "text-slate-500"}`}>{item.icon}</span>
                <span className="font-medium tracking-wide">{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 bg-black/20">
           <div className="flex items-center space-x-3 mb-4 px-2">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg">
                {user.usuario.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-white truncate">{user.usuario}</p>
                <p className="text-xs text-blue-300 truncate">{user.perfil}</p>
              </div>
           </div>
           <button onClick={handleLogout} className="w-full text-xs text-red-400 hover:bg-red-500/20 py-2 rounded transition">
             Cerrar Sesión
           </button>
        </div>
      </aside>

      {/* 2. ÁREA DE CONTENIDO */}
      <main className="flex-1 flex flex-col relative z-10 overflow-hidden w-full">
        {/* Header con Botón Hamburguesa */}
        <header className="h-16 md:h-20 flex items-center justify-between px-4 md:px-8 border-b border-white/5 bg-transparent shrink-0">
          <div className="flex items-center gap-4">
            {/* BOTÓN HAMBURGUESA (Solo visible en Móvil) */}
            <button 
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                 {menuItems.find(m => m.path === location.pathname)?.name}
              </h2>
              <p className="hidden md:block text-sm text-slate-400">Panel de Control</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6 w-full">
           <Outlet /> 
        </div>
      </main>
    </div>
  );
}