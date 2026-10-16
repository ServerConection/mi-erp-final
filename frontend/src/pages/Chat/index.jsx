/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MÓDULO CHAT INTERNO
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sidebar de conversaciones + ventana activa, sin rutas anidadas (mismo criterio
 * que Archivos Compartidos: es una pantalla completa, no necesita URL por chat).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { MessageCircle } from 'lucide-react';
import { chatApi, useSocketChat } from '../../hooks/useChat';
import { Aviso, Vacio } from './ui';
import ListaConversaciones from './ListaConversaciones';
import VentanaChat from './VentanaChat';
import NuevoChatModal, { AgregarParticipanteModal } from './NuevoChatModal';

function miSesion() {
  try {
    const token = localStorage.getItem('token');
    const tokenData = token ? jwtDecode(token) : {};
    const perfilGuardado = JSON.parse(localStorage.getItem('userProfile') || '{}');
    return {
      usuarioId: tokenData.id || perfilGuardado.id || null,
      esAdmin: String(perfilGuardado.perfil || tokenData.perfil || '').toUpperCase() === 'ADMINISTRADOR',
    };
  } catch {
    return { usuarioId: null, esAdmin: false };
  }
}

export default function ChatInterno() {
  const sesion = useMemo(miSesion, []);
  const [conversaciones, setConversaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const [activaId, setActivaId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [modalNuevo, setModalNuevo]     = useState(false);
  const [modalAgregar, setModalAgregar] = useState(false);
  const [aviso, setAviso] = useState(null);

  const notificar = (mensaje, tipo = 'info') => setAviso({ mensaje, tipo });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await chatApi.listarConversaciones();
      setConversaciones(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Nuevo mensaje en cualquier chat (aunque no esté abierto) → refresca el
  // sidebar para que se vea el badge de no leídos y suba al tope de la lista.
  useSocketChat({
    'chat:mensaje': (m) => {
      if (m.conversacionId !== activaId) cargar();
      else {
        // Ya lo está viendo VentanaChat, que actualiza su propio estado;
        // solo necesitamos refrescar el orden/preview del sidebar.
        cargar();
      }
    },
    'chat:mensaje_eliminado': () => cargar(),
    'chat:conversacion_nueva': () => cargar(),
  });

  const activa = conversaciones.find(c => c.id === activaId) || null;

  const alMarcarLeido = (id) => {
    setConversaciones(prev => prev.map(c => c.id === id ? { ...c, noLeidos: 0 } : c));
  };

  const alCrearConversacion = (id) => {
    setModalNuevo(false);
    cargar();
    setActivaId(id);
  };

  const alAgregarParticipante = async (usuarioIdNuevo) => {
    await chatApi.agregarParticipante(activaId, usuarioIdNuevo);
    setModalAgregar(false);
    notificar('Se agregó a la conversación', 'ok');
    cargar();
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <ListaConversaciones
        conversaciones={conversaciones}
        cargando={cargando}
        error={error}
        onReintentar={cargar}
        activaId={activaId}
        onAbrir={setActivaId}
        onNuevoChat={() => setModalNuevo(true)}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
      />

      {activa ? (
        <VentanaChat
          key={activa.id}
          conversacion={activa}
          miUsuarioId={sesion.usuarioId}
          esAdmin={sesion.esAdmin}
          onLeido={alMarcarLeido}
          onAgregarParticipante={() => setModalAgregar(true)}
        />
      ) : (
        <div className="hidden flex-1 items-center justify-center sm:flex">
          <Vacio
            titulo="Selecciona un chat"
            texto="Elige una conversación de la lista o inicia una nueva."
            accion={
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <MessageCircle className="h-3.5 w-3.5" /> Chat interno del ERP
              </span>
            }
          />
        </div>
      )}

      <NuevoChatModal
        abierto={modalNuevo}
        onCerrar={() => setModalNuevo(false)}
        onCreada={alCrearConversacion}
        onError={(m) => notificar(m, 'error')}
      />

      <AgregarParticipanteModal
        abierto={modalAgregar}
        onCerrar={() => setModalAgregar(false)}
        onAgregado={alAgregarParticipante}
        onError={(m) => notificar(m, 'error')}
      />

      <Aviso mensaje={aviso?.mensaje} tipo={aviso?.tipo} onCerrar={() => setAviso(null)} />
    </div>
  );
}
