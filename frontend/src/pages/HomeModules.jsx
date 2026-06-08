import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from 'jwt-decode';
import {
  BarChart3, TrendingUp, Users, Clock, CreditCard, Coins, CheckCircle2,
  Flag, UserCircle2, Flame, Bell, Radio, ClipboardList, PieChart,
  MapPin, PhoneCall, Boxes, Target, Search, ArrowRight, LayoutGrid,
} from "lucide-react";

// Función para obtener el rol y nombre del usuario desde el token
const getUserInfo = () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return { rol: null, nombre: null };
    const decoded = jwtDecode(token);
    return {
      rol: decoded.perfil || decoded.rol || null,
      nombre: decoded.nombre || decoded.usuario || null,
    };
  } catch (error) {
    console.error('Error decodificando token:', error);
    return { rol: null, nombre: null };
  }
};

// Acentos de color por categoría — clases Tailwind consistentes con el sistema de diseño
const ACCENTS = {
  azul:    { icon: "text-blue-600",    chip: "bg-blue-50 text-blue-700 border-blue-100",       glow: "group-hover:shadow-[0_12px_32px_-8px_rgba(37,99,235,0.35)]" },
  verde:   { icon: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700 border-emerald-100", glow: "group-hover:shadow-[0_12px_32px_-8px_rgba(16,185,129,0.35)]" },
  naranja: { icon: "text-orange-600",  chip: "bg-orange-50 text-orange-700 border-orange-100",  glow: "group-hover:shadow-[0_12px_32px_-8px_rgba(249,115,22,0.35)]" },
  morado:  { icon: "text-violet-600",  chip: "bg-violet-50 text-violet-700 border-violet-100",  glow: "group-hover:shadow-[0_12px_32px_-8px_rgba(139,92,246,0.35)]" },
  rosa:    { icon: "text-rose-600",    chip: "bg-rose-50 text-rose-700 border-rose-100",        glow: "group-hover:shadow-[0_12px_32px_-8px_rgba(225,29,72,0.35)]" },
  cian:    { icon: "text-cyan-600",    chip: "bg-cyan-50 text-cyan-700 border-cyan-100",        glow: "group-hover:shadow-[0_12px_32px_-8px_rgba(8,145,178,0.35)]" },
  ambar:   { icon: "text-amber-600",   chip: "bg-amber-50 text-amber-700 border-amber-100",     glow: "group-hover:shadow-[0_12px_32px_-8px_rgba(217,119,6,0.35)]" },
};

const CATEGORIES = {
  analitica:  { label: "Analítica & Reportes", accent: "azul" },
  ventas:     { label: "Ventas & Seguimiento", accent: "verde" },
  equipo:     { label: "Equipo & Operación", accent: "morado" },
  comunicacion: { label: "Comunicación & TV", accent: "rosa" },
  herramientas: { label: "Herramientas", accent: "cian" },
};

export default function HomeModules() {
  const navigate = useNavigate();
  const { rol: userRol, nombre } = getUserInfo();
  const [query, setQuery] = useState("");

  const modules = useMemo(() => [
    { title: "Indicadores", path: "/indicadores", icon: BarChart3, accent: "azul", cat: "analitica",
      desc: "Dashboard principal, KPIs y métricas clave en tiempo real." },
    { title: "Indicadores Velsa", path: "/indicadores-velsa", icon: BarChart3, accent: "naranja", cat: "analitica",
      desc: "Dashboard principal, KPIs y métricas clave en tiempo real." },
    { title: "Comparativa Supervisores", path: "/comparativa-supervisores", icon: TrendingUp, accent: "azul", cat: "analitica",
      desc: "Análisis detallado: casos asignados vs gestionables, ingresos JOT, activas y eficiencia por supervisor.",
      rolesPermitidos: ['SUPERVISOR', 'ANALISTA', 'GERENCIA', 'ADMINISTRADOR'] },
    { title: "Resumen NOVONET", path: "/resumen-novonet", icon: PieChart, accent: "azul", cat: "analitica",
      desc: "Analítica de calidad de ventas NOVONET: aprobación, regularización, auditoría y ranking de asesores.",
      rolesPermitidos: ['ANALISTA', 'GERENCIA', 'ADMINISTRADOR'] },
    { title: "Resumen VELSA", path: "/resumen-velsa", icon: PieChart, accent: "naranja", cat: "analitica",
      desc: "Analítica de calidad de ventas VELSA: aprobación, regularización, auditoría y ranking de asesores.",
      rolesPermitidos: ['ANALISTA', 'GERENCIA', 'ADMINISTRADOR'] },
    { title: "Reportería Vidika", path: "/vidika", icon: BarChart3, accent: "cian", cat: "analitica",
      desc: "Panel de reportería en tiempo real. Sesión automática integrada con el ERP.",
      rolesPermitidos: ['ANALISTA', 'COORDINADOR', 'ADMINISTRADOR', 'GERENCIA'] },
    { title: "Forecast Campañas", path: "/forecast", icon: Target, accent: "morado", cat: "analitica",
      desc: "Seguimiento de objetivos vs. real por campaña: inversión, CPL, leads, ratios y reporte de ejecutivos.",
      rolesPermitidos: ['ANALISTA', 'GERENCIA', 'ADMINISTRADOR', 'COORDINADOR'] },

    { title: "Ventas CRM", path: "/ventas", icon: TrendingUp, accent: "verde", cat: "ventas",
      desc: "Pipeline comercial, seguimiento de leads y cierre de negocios." },
    { title: "Seguimiento Ventas", path: "/seguimiento-ventas", icon: CheckCircle2, accent: "ambar", cat: "ventas",
      desc: "Seguimiento y control de ventas por asesor." },
    { title: "Seguimiento Velsa", path: "/seguimiento-velsa", icon: Flame, accent: "naranja", cat: "ventas",
      desc: "Ranking de ventas Velsa por asesor y supervisor." },
    { title: "Vista Asesor", path: "/vista-asesor", icon: UserCircle2, accent: "azul", cat: "ventas",
      desc: "Tablero personal de ventas: leads, ingresos CRM, Jotform y activas." },
    { title: "Vista Asesor Velsa", path: "/vista-asesor-velsa", icon: UserCircle2, accent: "naranja", cat: "ventas",
      desc: "Tablero personal de ventas Velsa: leads, ingresos CRM, Jotform y activas." },
    { title: "Guía Planes Abril 2026", path: "/guia-planes-marzo", icon: ClipboardList, accent: "morado", cat: "ventas",
      desc: "Consulta y compara todos los planes Netlife por segmento y forma de pago." },
    { title: "Cobertura", path: "/cobertura", icon: MapPin, accent: "cian", cat: "ventas",
      desc: "Verifica si una dirección tiene cobertura de internet. Soporta enlaces de WhatsApp y Google Maps." },

    { title: "Recursos Humanos", path: "/rrhh", icon: Users, accent: "morado", cat: "equipo",
      desc: "Gestión de talento, vacaciones y expedientes del personal." },
    { title: "Control Horarios", path: "/horarios", icon: Clock, accent: "ambar", cat: "equipo",
      desc: "Registro de asistencia, turnos rotativos y puntualidad." },
    { title: "Billetera Digital", path: "/billetera", icon: CreditCard, accent: "cian", cat: "equipo",
      desc: "Gestión de saldos, pagos corporativos y transferencias." },
    { title: "Comisiones", path: "/comisiones", icon: Coins, accent: "ambar", cat: "equipo",
      desc: "Cálculo automatizado de incentivos y bonos por desempeño." },
    { title: "Inventario", path: "/inventario", icon: Boxes, accent: "morado", cat: "equipo",
      desc: "Gestión de equipos, materiales y planos. Control de stock, movimientos y alertas de mínimos.",
      rolesPermitidos: ['ADMINISTRADOR'] },
    { title: "Redes", path: "/redes", icon: Flag, accent: "ambar", cat: "equipo",
      desc: "Monitoreo y gestión de redes.",
      rolesPermitidos: ['CONSULTOR', 'ANALISTA', 'GERENCIA', 'ADMINISTRADOR'] },
    { title: "Automarcador", path: "/automarcador", icon: PhoneCall, accent: "rosa", cat: "equipo",
      desc: "Sistema de llamadas automáticas. Gestiona campañas y marcaciones desde el panel central.",
      rolesPermitidos: ['ANALISTA', 'ADMINISTRADOR', 'COORDINADOR', 'GERENCIA'] },

    { title: "Notificaciones", path: "/notificaciones", icon: Bell, accent: "verde", cat: "comunicacion",
      desc: "Centro de alertas: WhatsApp, correo y ERP. Escanea QR y ve el historial." },
    { title: "Broadcast TV", path: "/broadcast", icon: Radio, accent: "rosa", cat: "comunicacion",
      desc: "Envía mensajes, alertas y rankings en tiempo real a todas las pantallas." },
    { title: "Broadcast NOVONET", path: "/broadcast-novonet", icon: Radio, accent: "azul", cat: "comunicacion",
      desc: "Proyecta mensajes, alertas y logros en las pantallas del equipo NOVONET. Soporta audio.",
      rolesPermitidos: ['ANALISTA', 'COORDINADOR', 'ADMINISTRADOR'] },
    { title: "Broadcast VELSA", path: "/broadcast-velsa", icon: Radio, accent: "naranja", cat: "comunicacion",
      desc: "Proyecta mensajes, alertas y logros en las pantallas del equipo VELSA. Soporta audio.",
      rolesPermitidos: ['ANALISTA', 'COORDINADOR', 'ADMINISTRADOR'] },
  ], []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return modules.filter(mod => {
      const allowed = userRol === 'CONSULTOR'
        ? mod.rolesPermitidos?.includes('CONSULTOR')
        : (!mod.rolesPermitidos || mod.rolesPermitidos.includes(userRol));
      if (!allowed) return false;
      if (!q) return true;
      return mod.title.toLowerCase().includes(q) || mod.desc.toLowerCase().includes(q);
    });
  }, [modules, userRol, query]);

  const grouped = useMemo(() => {
    const out = {};
    for (const mod of filtered) {
      if (!out[mod.cat]) out[mod.cat] = [];
      out[mod.cat].push(mod);
    }
    return out;
  }, [filtered]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="animate-fade-in-up pb-12">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 py-9 mb-8 shadow-xl">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[12px] font-medium text-slate-200 mb-3">
              <LayoutGrid size={14} className="text-blue-300" />
              Centro de Aplicaciones
            </div>
            <h1 className="text-3xl md:text-[34px] font-bold text-white tracking-tight">
              {greeting}{nombre ? `, ${nombre}` : ""}
            </h1>
            <p className="text-slate-400 mt-1.5 text-[15px]">
              Selecciona un módulo para gestionar tus operaciones — {filtered.length} disponibles para tu perfil.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar módulo…"
              className="w-full rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-slate-400 text-sm pl-10 pr-4 py-2.5 outline-none focus:bg-white/15 focus:border-white/20 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Grupos por categoría */}
      {Object.keys(CATEGORIES).map((catKey) => {
        const items = grouped[catKey];
        if (!items || items.length === 0) return null;
        const cat = CATEGORIES[catKey];
        const accent = ACCENTS[cat.accent];
        return (
          <section key={catKey} className="mb-9">
            <div className="flex items-center gap-2.5 mb-4">
              <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${accent.chip}`}>
                {cat.label}
              </span>
              <span className="text-[12px] text-slate-400">{items.length} módulo{items.length !== 1 ? "s" : ""}</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((mod) => {
                const a = ACCENTS[mod.accent];
                const Icon = mod.icon;
                return (
                  <div
                    key={mod.path}
                    onClick={() => navigate(mod.path)}
                    className={`group relative p-6 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 transition-all duration-300 cursor-pointer shadow-card ${a.glow} hover:-translate-y-1 overflow-hidden`}
                  >
                    <div className={`w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-4 ${a.icon} group-hover:scale-110 transition-transform duration-300 border border-slate-200/70`}>
                      <Icon size={22} strokeWidth={2} />
                    </div>

                    <h3 className="text-[17px] font-bold text-slate-800 mb-1.5 group-hover:text-slate-900 transition-colors">
                      {mod.title}
                    </h3>
                    <p className="text-[13px] text-slate-500 leading-relaxed pr-6">
                      {mod.desc}
                    </p>

                    <div className="absolute bottom-5 right-5 opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-slate-400">
                      <ArrowRight size={18} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Search size={28} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">No se encontraron módulos para “{query}”.</p>
        </div>
      )}
    </div>
  );
}
