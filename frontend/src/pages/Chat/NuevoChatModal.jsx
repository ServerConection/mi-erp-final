/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Chat Interno · Modal "Nuevo chat" (directo o grupo) y "Agregar participante"
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { chatApi } from '../../hooks/useChat';
import { Avatar, Modal } from './ui';

/** Buscador de usuarios reutilizable: dispara onBuscar(q) con debounce simple. */
function BuscadorUsuarios({ resultados, cargando, seleccionados = [], onSeleccionar, busqueda, onBusqueda }) {
  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder="Buscar por nombre o usuario…"
          className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-400"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-slate-100">
        {cargando ? (
          <p className="p-4 text-center text-sm text-slate-400">Buscando…</p>
        ) : resultados.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">
            {busqueda ? 'Sin resultados' : 'Empieza a escribir para buscar'}
          </p>
        ) : (
          resultados.map(u => {
            const yaElegido = seleccionados.some(s => s.id === u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onSeleccionar(u)}
                className={`flex w-full items-center gap-2.5 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50 ${yaElegido ? 'bg-blue-50' : ''}`}
              >
                <Avatar nombre={u.nombre} usuarioId={u.id} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">{u.nombre}</p>
                  <p className="truncate text-xs text-slate-400">{u.perfil} · {u.empresa}</p>
                </div>
                {yaElegido && <span className="text-xs font-medium text-blue-600">Elegido</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function useBusquedaUsuarios(activo) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!activo) return undefined;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await chatApi.usuarios(busqueda);
        setResultados(r.data);
      } catch {
        setResultados([]);
      } finally {
        setCargando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, activo]);

  return { busqueda, setBusqueda, resultados, cargando };
}

export default function NuevoChatModal({ abierto, onCerrar, onCreada, onError }) {
  const [modo, setModo] = useState('DIRECTA'); // 'DIRECTA' | 'GRUPO'
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [elegidos, setElegidos] = useState([]);
  const [creando, setCreando] = useState(false);
  const { busqueda, setBusqueda, resultados, cargando } = useBusquedaUsuarios(abierto);

  useEffect(() => {
    if (!abierto) { setModo('DIRECTA'); setNombreGrupo(''); setElegidos([]); setBusqueda(''); }
  }, [abierto]);

  const alegir = (u) => {
    if (modo === 'DIRECTA') { setElegidos([u]); return; }
    setElegidos(prev => prev.some(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u]);
  };

  const crear = async () => {
    if (elegidos.length === 0) return;
    if (modo === 'GRUPO' && nombreGrupo.trim().length < 3) {
      onError?.('El grupo necesita un nombre de al menos 3 caracteres');
      return;
    }
    setCreando(true);
    try {
      const r = await chatApi.crearConversacion({
        tipo: modo,
        participantes: elegidos.map(u => u.id),
        nombre: modo === 'GRUPO' ? nombreGrupo.trim() : undefined,
      });
      onCreada(r.data.id);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setCreando(false);
    }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nuevo chat">
      <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm">
        <button
          onClick={() => { setModo('DIRECTA'); setElegidos([]); }}
          className={`flex-1 rounded-md py-1.5 font-medium transition ${modo === 'DIRECTA' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
        >
          Mensaje directo
        </button>
        <button
          onClick={() => { setModo('GRUPO'); setElegidos([]); }}
          className={`flex-1 rounded-md py-1.5 font-medium transition ${modo === 'GRUPO' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
        >
          Grupo
        </button>
      </div>

      {modo === 'GRUPO' && (
        <input
          value={nombreGrupo}
          onChange={(e) => setNombreGrupo(e.target.value)}
          placeholder="Nombre del grupo"
          maxLength={150}
          className="mb-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
      )}

      {modo === 'GRUPO' && elegidos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {elegidos.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-blue-700">
              {u.nombre}
              <button onClick={() => alegir(u)} className="rounded-full p-0.5 hover:bg-blue-100"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      <BuscadorUsuarios
        resultados={resultados} cargando={cargando}
        seleccionados={elegidos} onSeleccionar={alegir}
        busqueda={busqueda} onBusqueda={setBusqueda}
      />

      <button
        onClick={crear}
        disabled={elegidos.length === 0 || creando}
        className="mt-4 w-full rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
      >
        {creando ? 'Creando…' : modo === 'DIRECTA' ? 'Iniciar chat' : `Crear grupo${elegidos.length ? ` (${elegidos.length})` : ''}`}
      </button>
    </Modal>
  );
}

/** Modal chico para agregar 1 persona a un grupo ya existente. */
export function AgregarParticipanteModal({ abierto, onCerrar, onAgregado, onError }) {
  const [agregando, setAgregando] = useState(false);
  const { busqueda, setBusqueda, resultados, cargando } = useBusquedaUsuarios(abierto);

  useEffect(() => { if (!abierto) setBusqueda(''); }, [abierto]);

  const elegir = async (u) => {
    setAgregando(true);
    try {
      await onAgregado(u.id);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setAgregando(false);
    }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Agregar participante">
      <fieldset disabled={agregando}>
        <BuscadorUsuarios
          resultados={resultados} cargando={cargando}
          onSeleccionar={elegir}
          busqueda={busqueda} onBusqueda={setBusqueda}
        />
      </fieldset>
    </Modal>
  );
}
