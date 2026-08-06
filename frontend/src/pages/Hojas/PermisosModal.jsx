/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Archivos Compartidos · Repartir accesos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Solo el creador entra aquí. Decide quién ve y quién escribe.
 * El administrador del ERP siempre tiene acceso, no hace falta agregarlo.
 */

import { useEffect, useMemo, useState } from 'react';
import { Crown, Eye, Pencil, Search, UserPlus, X } from 'lucide-react';
import { hojasApi } from '../../hooks/useHojas';
import { Avatar, Cargando, Modal } from './ui';

export default function PermisosModal({ abierto, onCerrar, hojaId, onError, onOk }) {
  const [datos, setDatos]       = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;

    (async () => {
      setCargando(true);
      try {
        const [permisos, catalogo] = await Promise.all([
          hojasApi.permisos(hojaId),
          hojasApi.usuarios(),
        ]);
        if (!vivo) return;
        setDatos(permisos.data);
        setUsuarios(catalogo.data);
      } catch (e) {
        if (vivo) onError(e.message);
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => { vivo = false; };
  }, [abierto, hojaId, onError]);

  const yaInvitados = useMemo(
    () => new Set((datos?.invitados || []).map(i => i.usuarioId)),
    [datos]
  );

  const candidatos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios
      .filter(u => u.id !== datos?.creador?.id && !yaInvitados.has(u.id))
      .filter(u => !q || u.nombre.toLowerCase().includes(q) || u.usuario.toLowerCase().includes(q))
      .slice(0, 30);
  }, [usuarios, yaInvitados, busqueda, datos]);

  const compartir = async (usuarioId, nivel) => {
    try {
      await hojasApi.compartir(hojaId, usuarioId, nivel);
      const r = await hojasApi.permisos(hojaId);
      setDatos(r.data);
      setBusqueda('');
      onOk('Acceso concedido');
    } catch (e) { onError(e.message); }
  };

  const quitar = async (usuarioId) => {
    try {
      await hojasApi.quitarAcceso(hojaId, usuarioId);
      setDatos(d => ({ ...d, invitados: d.invitados.filter(i => i.usuarioId !== usuarioId) }));
    } catch (e) { onError(e.message); }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Compartir archivo" ancho="max-w-lg">
      {cargando ? <Cargando texto="Cargando accesos…" /> : (
        <>
          {/* Con acceso */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2">
              <Avatar nombre={datos?.creador?.nombre} color="#2563EB" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{datos?.creador?.nombre}</p>
                <p className="text-xs text-slate-500">Creador del archivo</p>
              </div>
              <Crown className="w-4 h-4 text-blue-500" />
            </div>

            {(datos?.invitados || []).map(inv => (
              <div key={inv.usuarioId} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <Avatar nombre={inv.nombre} color="#64748B" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{inv.nombre}</p>
                  <p className="truncate text-xs text-slate-500">{inv.perfil} · {inv.empresa}</p>
                </div>

                <select
                  value={inv.nivel}
                  onChange={(e) => compartir(inv.usuarioId, e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
                >
                  <option value="EDITOR">Puede editar</option>
                  <option value="LECTOR">Solo lectura</option>
                </select>

                <button
                  onClick={() => quitar(inv.usuarioId)}
                  className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                  title="Quitar acceso"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            {datos?.invitados?.length === 0 && (
              <p className="py-2 text-center text-xs text-slate-400">
                Nadie más tiene acceso todavía.
              </p>
            )}
          </div>

          {/* Agregar */}
          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <UserPlus className="w-4 h-4" /> Dar acceso a alguien
            </p>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o usuario…"
                className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-400"
              />
            </div>

            {busqueda.trim() && (
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {candidatos.length === 0 && (
                  <p className="py-3 text-center text-xs text-slate-400">Sin resultados</p>
                )}

                {candidatos.map(u => (
                  <div key={u.id} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-700">{u.nombre}</p>
                      <p className="truncate text-[11px] text-slate-400">{u.perfil} · {u.empresa}</p>
                    </div>
                    <button
                      onClick={() => compartir(u.id, 'EDITOR')}
                      className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    <button
                      onClick={() => compartir(u.id, 'LECTOR')}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      <Eye className="w-3 h-3" /> Ver
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-3 text-xs text-slate-400">
              Los administradores del ERP ven todos los archivos sin necesidad de invitación.
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}
