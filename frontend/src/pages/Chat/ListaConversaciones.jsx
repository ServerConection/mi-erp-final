/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Chat Interno · Sidebar de conversaciones
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Plus, Search, Users } from 'lucide-react';
import { Avatar, Cargando, ErrorBox, Vacio, tiempoRelativo } from './ui';

export default function ListaConversaciones({
  conversaciones, cargando, error, onReintentar,
  activaId, onAbrir, onNuevoChat, busqueda, onBusqueda,
}) {
  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? conversaciones.filter(c => c.titulo.toLowerCase().includes(q))
    : conversaciones;

  return (
    <div className="flex h-full w-full flex-col border-r border-slate-200 bg-white sm:w-80 sm:shrink-0">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5">
        <h1 className="text-[15px] font-semibold text-slate-800">Chat interno</h1>
        <button
          onClick={onNuevoChat}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo
        </button>
      </div>

      <div className="border-b border-slate-200 px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Buscar chat…"
            className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {cargando ? <Cargando texto="Cargando tus chats…" /> : error ? (
          <div className="p-3"><ErrorBox error={error} onReintentar={onReintentar} /></div>
        ) : visibles.length === 0 ? (
          <Vacio
            titulo={q ? 'Ningún chat coincide' : 'Todavía no tienes conversaciones'}
            texto={q ? 'Prueba con otro término.' : 'Escribe a un compañero o arma un grupo para empezar.'}
            accion={!q && (
              <button onClick={onNuevoChat} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Iniciar el primero
              </button>
            )}
          />
        ) : (
          visibles.map(c => (
            <Item key={c.id} c={c} activa={c.id === activaId} onAbrir={() => onAbrir(c.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function Item({ c, activa, onAbrir }) {
  const otro = c.otrosParticipantes?.[0];
  const previa = c.ultimoMensaje
    ? `${c.ultimoAutorSoyYo ? 'Tú: ' : ''}${c.ultimoMensaje}`
    : 'Sin mensajes todavía';

  return (
    <button
      onClick={onAbrir}
      className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${
        activa ? 'bg-blue-50' : 'hover:bg-slate-50'
      }`}
    >
      {c.tipo === 'GRUPO' ? (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <Users className="h-4 w-4" />
        </span>
      ) : (
        <Avatar nombre={c.titulo} usuarioId={otro?.id} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-800">{c.titulo}</span>
          {c.ultimoAt && (
            <span className="ml-auto shrink-0 text-[11px] text-slate-400">{tiempoRelativo(c.ultimoAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-slate-500">{previa}</span>
          {c.noLeidos > 0 && (
            <span className="ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">
              {c.noLeidos > 99 ? '99+' : c.noLeidos}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
