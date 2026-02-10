import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

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

      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm"
        ></div>
      )}

      {/* SIDEBAR */}
      <aside 
        className={`
          fixed md:static inset-y-0 left-0 z-30 
          bg-black/40 backdrop-blur-2xl border-r border-white/10 flex flex-col transition-all duration-500 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} 
          md:translate-x-0 
          ${isDesktopCollapsed ? "md:w-20" : "md:w-72"}
        `}
      >
        {/* NUEVA FLECHA ESTILIZADA (Pestaña de Cristal) */}
        <button 
          onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
          className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-20 bg-blue-600/80 hover:bg-blue-500 backdrop-blur-md rounded-r-2xl items-center justify-center text-white border-y border-r border-white/20 z-50 shadow-[5px_0_15px_rgba(0,0,0,0.3)] transition-all group"
        >
          <div className={`transition-transform duration-500 ${isDesktopCollapsed ? "rotate-180" : ""}`}>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24" 
              strokeWidth={2.5} 
              stroke="currentColor" 
              className="w-5 h-5 group-hover:scale-125 transition-transform"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </div>
        </button>

        <div className="p-8 border-b border-white/5 flex justify-center items-center overflow-hidden">
          <h1 className={`font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 transition-all duration-500 ${isDesktopCollapsed ? "text-xs opacity-0" : "text-2xl opacity-100"}`}>
             NOVONET PRO
          </h1>
          {isDesktopCollapsed && <span className="text-blue-400 font-bold text-xl">N</span>}
        </div>

        <nav className="flex-1 px-3 py-10 space-y-4 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.path);
                  setSidebarOpen(false); 
                }}
                className={`w-full flex items-center rounded-2xl transition-all duration-300 group ${
                  isDesktopCollapsed ? "justify-center h-14" : "px-5 py-4 space-x-5"
                } ${
                  isActive
                    ? "bg-blue-600/20 border border-blue-500/40 text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={`${isDesktopCollapsed ? "text-3xl" : "text-2xl"} transition-all group-hover:scale-110 drop-shadow-md`}>
                  {item.icon}
                </span>
                {!isDesktopCollapsed && <span className="font-bold tracking-wide truncate">{item.name}</span>}
              </button>
            );
          })}
        </nav>

        <div className={`p-6 border-t border-white/5 bg-black/20 ${isDesktopCollapsed ? "text-center px-2" : ""}`}>
           <div className={`flex items-center mb-6 ${isDesktopCollapsed ? "justify-center" : "space-x-4"}`}>
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center font-black text-white shadow-xl border border-white/10">
                {user.usuario.charAt(0).toUpperCase()}
              </div>
              {!isDesktopCollapsed && (
                <div className="overflow-hidden text-left">
                  <p className="text-sm font-black text-white truncate uppercase tracking-tight">{user.usuario}</p>
                  <p className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">Online</p>
                </div>
              )}
           </div>
           <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-[10px] font-black text-red-400 hover:text-white hover:bg-red-500/30 py-3 rounded-xl border border-red-500/20 transition-all uppercase tracking-widest">
             <span>🚫</span>
             {!isDesktopCollapsed && <span>Desconectar</span>}
           </button>
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO */}
      <main className="flex-1 flex flex-col relative z-10 overflow-hidden w-full transition-all duration-500">
        <header className="h-20 flex items-center justify-between px-8 border-b border-white/5 bg-black/20 shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-3 text-white bg-white/10 rounded-xl"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic bg-clip-text">
                 {menuItems.find(m => m.path === location.pathname)?.name}
            </h2>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-10 w-full transition-all">
           <Outlet /> 
        </div>
      </main>
    </div>
  );
}