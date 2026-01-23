// Componente Reutilizable de "Tarjeta de Módulo"
const ModuleCard = ({ title, icon, color, description }) => (
  <div className="h-full p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl flex flex-col items-center justify-center text-center animate-fade-in-up">
    <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-6 shadow-lg ${color}`}>
      {icon}
    </div>
    <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
    <p className="text-blue-200 max-w-md">{description}</p>
    <div className="mt-8 px-6 py-2 rounded-full border border-white/20 bg-white/5 text-sm text-white/60">
      Módulo Activo v1.0
    </div>
  </div>
);

// 1. Seguimiento de Ventas
export const Ventas = () => (
  <ModuleCard 
    title="Seguimiento de Ventas" 
    icon="📈" 
    color="bg-green-500/20 text-green-400"
    description="Monitoreo en tiempo real del pipeline comercial, conversiones y proyecciones mensuales."
  />
);

// 2. Recursos Humanos (RRHH)
export const RRHH = () => (
  <ModuleCard 
    title="Recursos Humanos" 
    icon="👥" 
    color="bg-purple-500/20 text-purple-400"
    description="Gestión de talento, expedientes de colaboradores y control de vacaciones."
  />
);

// 3. Horarios
export const Horarios = () => (
  <ModuleCard 
    title="Control de Horarios" 
    icon="⏰" 
    color="bg-orange-500/20 text-orange-400"
    description="Registro de asistencia biométrica, turnos rotativos y control de puntualidad."
  />
);

// 4. Billetera Digital
export const Billetera = () => (
  <ModuleCard 
    title="Billetera Digital" 
    icon="💳" 
    color="bg-cyan-500/20 text-cyan-400"
    description="Saldos disponibles, transferencias internas y gestión de pagos corporativos."
  />
);

// 5. Tabla de Comisiones
export const Comisiones = () => (
  <ModuleCard 
    title="Tabla de Comisiones" 
    icon="💰" 
    color="bg-yellow-500/20 text-yellow-400"
    description="Cálculo automático de incentivos basado en cumplimiento de KPIs mensuales."
  />
);