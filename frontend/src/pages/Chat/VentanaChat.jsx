/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Chat Interno · Ventana de conversación activa
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2, UserPlus, Users } from 'lucide-react';
import { chatApi, useSocketChat } from '../../hooks/useChat';
import { Avatar, Cargando, ErrorBox, horaCorta } from './ui';

export default function VentanaChat({ conversacion, miUsuarioId, esAdmin, onLeido, onAgregarParticipante }) {
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const [texto, setTexto]       = useState('');
  const [enviando, setEnviando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const finRef = useRef(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await chatApi.mensajes(conversacion.id);
      setMensajes(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [conversacion.id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Al abrir/cambiar de conversación, marcar como leída
  useEffect(() => {
    chatApi.marcarLeido(conversacion.id).then(() => onLeido?.(conversacion.id)).catch(() => {});
  }, [conversacion.id]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length]);

  useSocketChat({
    'chat:mensaje': (m) => {
      if (m.conversacionId !== conversacion.id) return;
      setMensajes(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, { ...m, esMio: m.usuarioId === miUsuarioId }]));
      chatApi.marcarLeido(conversacion.id).then(() => onLeido?.(conversacion.id)).catch(() => {});
    },
    'chat:mensaje_eliminado': (m) => {
      if (m.conversacionId !== conversacion.id) return;
      setMensajes(prev => prev.filter(x => x.id !== m.id));
    },
  });

  const eliminar = async (mensaje) => {
    if (!window.confirm('¿Eliminar este mensaje? Dejara de mostrarse para todos los participantes.')) return;
    setEliminandoId(mensaje.id);
    setErrorAccion('');
    try {
      await chatApi.eliminarMensaje(mensaje.id);
      setMensajes(prev => prev.filter(x => x.id !== mensaje.id));
    } catch (e) {
      setErrorAccion(e.message || 'No se pudo eliminar el mensaje');
    } finally {
      setEliminandoId(null);
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    const contenido = texto.trim();
    if (!contenido || enviando) return;

    setEnviando(true);
    setTexto('');
    try {
      const r = await chatApi.enviarMensaje(conversacion.id, contenido);
      setMensajes(prev => [...prev, r.data]);
    } catch (e2) {
      setError(e2.message);
      setTexto(contenido); // devuelve el texto al input si falló
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col bg-slate-50">
      {/* Encabezado */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        {conversacion.tipo === 'GRUPO' ? (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
            <Users className="h-4 w-4" />
          </span>
        ) : (
          <Avatar nombre={conversacion.titulo} usuarioId={conversacion.otrosParticipantes?.[0]?.id} size={36} />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{conversacion.titulo}</p>
          {conversacion.tipo === 'GRUPO' && (
            <p className="text-xs text-slate-400">{conversacion.totalParticipantes} participantes</p>
          )}
        </div>
        {conversacion.tipo === 'GRUPO' && (
          <button
            onClick={onAgregarParticipante}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <UserPlus className="h-3.5 w-3.5" /> Agregar
          </button>
        )}
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {errorAccion && <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><span>{errorAccion}</span><button type="button" onClick={() => setErrorAccion('')} className="min-h-9 rounded-md px-2 font-bold hover:bg-rose-100">Cerrar</button></div>}
        {cargando ? <Cargando texto="Cargando mensajes…" /> : error ? (
          <ErrorBox error={error} onReintentar={cargar} />
        ) : mensajes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Todavía no hay mensajes. Escribe el primero.
          </div>
        ) : (
          <div className="space-y-2">
            {mensajes.map((m, i) => {
              const anterior = mensajes[i - 1];
              const fecha = new Date(m.createdAt);
              const nuevoDia = !anterior || fecha.toLocaleDateString('es-EC')
                !== new Date(anterior.createdAt).toLocaleDateString('es-EC');
              const mismoAutorSeguido = !nuevoDia && anterior && anterior.usuarioId === m.usuarioId
                && (new Date(m.createdAt) - new Date(anterior.createdAt)) < 5 * 60 * 1000;
              return (
                <Fragment key={m.id}>
                  {nuevoDia && (
                    <div className="flex justify-center py-3">
                      <time dateTime={m.createdAt} className="rounded-lg bg-slate-200/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                        {fecha.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </time>
                    </div>
                  )}
                  <Burbuja
                    m={m}
                    mostrarAutor={conversacion.tipo === 'GRUPO' && !m.esMio && !mismoAutorSeguido}
                    puedeEliminar={m.esMio || esAdmin}
                    eliminando={eliminandoId === m.id}
                    onEliminar={() => eliminar(m)}
                  />
                </Fragment>
              );
            })}
            <div ref={finRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={enviar} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e); }
          }}
          placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para salto de línea)"
          rows={1}
          maxLength={20000}
          className="max-h-32 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviando}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function Burbuja({ m, mostrarAutor, puedeEliminar, eliminando, onEliminar }) {
  return (
    <div className={`flex ${m.esMio ? 'justify-end' : 'justify-start'}`}>
      {m.esMio && puedeEliminar && <BotonEliminar eliminando={eliminando} onEliminar={onEliminar} />}
      <div className={`max-w-[75%] ${m.esMio ? 'items-end' : 'items-start'} flex flex-col`}>
        {mostrarAutor && <span className="mb-0.5 px-1 text-[11px] font-medium text-slate-400">{m.autor}</span>}
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
            m.esMio ? 'rounded-br-sm bg-blue-600 text-white' : 'rounded-bl-sm bg-white text-slate-800 shadow-sm border border-slate-100'
          }`}
        >
          {m.contenido}
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-slate-400">{horaCorta(m.createdAt)}</span>
      </div>
      {!m.esMio && puedeEliminar && <BotonEliminar eliminando={eliminando} onEliminar={onEliminar} />}
    </div>
  );
}

function BotonEliminar({ eliminando, onEliminar }) {
  return <button
    type="button"
    onClick={onEliminar}
    disabled={eliminando}
    aria-label="Eliminar mensaje"
    title="Eliminar mensaje"
    className="mx-1 mt-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
  >
    {eliminando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
  </button>;
}
