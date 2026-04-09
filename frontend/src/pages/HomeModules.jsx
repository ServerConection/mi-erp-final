import { useNavigate } from "react-router-dom";

export default function HomeModules() {
  const navigate = useNavigate();

  const modules = [
    {
      title: "Indicadores",
      path: "/indicadores",
      icon: "📊",
      color: "text-blue-400",
      desc: "Dashboard principal, KPIs y métricas clave en tiempo real."
    },
    {
      title: "Indicadores Velsa",
      path: "/indicadores-velsa",
      icon: "📊",
      color: "text-blue-400",
      desc: "Dashboard principal, KPIs y métricas clave en tiempo real."
    },
    {
      title: "Ventas CRM",
      path: "/ventas",
      icon: "📈",
      color: "text-green-400",
      desc: "Pipeline comercial, seguimiento de leads y cierre de negocios."
    },
    {
      title: "Recursos Humanos",
      path: "/rrhh",
      icon: "👥",
      color: "text-purple-400",
      desc: "Gestión de talento, vacaciones y expedientes del personal."
    },
    {
      title: "Control Horarios",
      path: "/horarios",
      icon: "⏰",
      color: "text-orange-400",
      desc: "Registro de asistencia, turnos rotativos y puntualidad."
    },
    {
      title: "Billetera Digital",
      path: "/billetera",
      icon: "💳",
      color: "text-cyan-400",
      desc: "Gestión de saldos, pagos corporativos y transferencias."
    },
    {
      title: "Comisiones",
      path: "/comisiones",
      icon: "💰",
      color: "text-yellow-400",
      desc: "Cálculo automatizado de incentivos y bonos por desempeño."
    },
    {
      title: "Seguimiento Ventas",
      path: "/seguimiento-ventas", // ✅ FIX: era /Seguimiento_Venta
      icon: "✔️",
      color: "text-yellow-400",
      desc: "Seguimiento y control de ventas por asesor."
    },
    {
      title: "Redes",
      path: "/redes",
      icon: "🚩",
      color: "text-yellow-400",
      desc: "Monitoreo y gestión de redes."
    },
    {
      title: "Vista Asesor",
      path: "/vista-asesor",
      icon: "🧑‍💼",
      color: "text-sky-400",
      desc: "Tablero personal de ventas: leads, ingresos CRM, Jotform y activas."
    },
    {
      title: "Vista Asesor Velsa",
      path: "/vista-asesor-velsa",
      icon: "🟣",
      color: "text-purple-400",
      desc: "Tablero personal de ventas Velsa: leads, ingresos CRM, Jotform y activas."
    },
    {
      title: "Seguimiento Velsa",
      path: "/seguimiento-velsa",
      icon: "🔥",
      color: "text-orange-400",
      desc: "Ranking de ventas Velsa por asesor y supervisor."
    },
    {
      title: "Notificaciones",
      path: "/notificaciones",
      icon: "🔔",
      color: "text-emerald-400",
      desc: "Centro de alertas: WhatsApp, correo y ERP. Escanea QR y ve el historial."
    },
    {
      title: "Broadcast TV",
      path: "/broadcast",
      icon: "📡",
      color: "text-rose-400",
      desc: "Envía mensajes, alertas y rankings en tiempo real a todas las pantallas."
    },
    {
      title: "Guía Planes Abril 2026",
      path: "/guia-planes-marzo", // ✅ FIX: era /Guiaplanesmarzo
      icon: "📋",
      color: "text-indigo-400",
      desc: "Consulta y compara todos los planes Netlife por segmento y forma de pago."
    },
  ];

  return (
    <div className="animate-fade-in-up pb-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Centro de Aplicaciones</h1>
        <p className="text-blue-200 mt-1">Selecciona un módulo para gestionar tus operaciones.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((mod, index) => (
          <div
            key={index}
            onClick={() => navigate(mod.path)}
            className="group relative p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 overflow-hidden"
          >
            <div className={`w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-3xl mb-4 ${mod.color} group-hover:scale-110 transition-transform duration-300 border border-white/5 shadow-inner`}>
              {mod.icon}
            </div>

            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
              {mod.title}
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed group-hover:text-slate-300">
              {mod.desc}
            </p>

            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

            <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white/50">
              ➔
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}