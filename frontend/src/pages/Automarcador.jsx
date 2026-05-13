/**
 * Automarcador.jsx
 * Módulo embebido para el sistema de llamadas automáticas.
 * Acceso restringido: ANALISTA, ADMINISTRADOR, COORDINADOR, GERENCIA
 */

export default function Automarcador() {
  return (
    <div className="animate-fade-in-up flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            📞 Automarcador
          </h1>
          <p className="text-slate-500 mt-1">
            Sistema de llamadas automáticas
          </p>
        </div>
        <a
          href="https://granddad-important-scoop.ngrok-free.dev/admin"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition"
        >
          ↗ Abrir en nueva pestaña
        </a>
      </div>

      {/* Iframe */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
        <iframe
          src="https://granddad-important-scoop.ngrok-free.dev/admin"
          title="Automarcador"
          className="w-full h-full border-0"
          allow="microphone; camera; autoplay"
        />
      </div>
    </div>
  );
}
