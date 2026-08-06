/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Archivos Compartidos · Definir columnas
 * ═══════════════════════════════════════════════════════════════════════════════
 * Solo el creador entra aquí. Define la estructura de la hoja: qué se registra
 * y de qué forma.
 *
 * El tipo NO se puede cambiar después de crear la columna: cambiarlo dejaría
 * los valores ya guardados sin sentido. Si hace falta otro tipo, se crea otra
 * columna. Es una restricción a propósito, no una limitación pendiente.
 */

import { useState } from 'react';
import { GripVertical, Lock, Plus, Trash2 } from 'lucide-react';
import { hojasApi } from '../../hooks/useHojas';
import { Modal, TipoBadge, TIPO_UI } from './ui';

const TIPOS = ['TEXTO', 'LISTA', 'FECHA', 'USUARIO'];

export default function ColumnasModal({ abierto, onCerrar, hojaId, columnas, onCambio, onError }) {
  const [nombre, setNombre]     = useState('');
  const [tipo, setTipo]         = useState('TEXTO');
  const [opciones, setOpciones] = useState('');
  const [guardando, setGuardando] = useState(false);

  const agregar = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    const listaOpciones = opciones.split('\n').map(o => o.trim()).filter(Boolean);
    if (tipo === 'LISTA' && listaOpciones.length === 0) {
      onError('Una columna de lista necesita al menos una opción');
      return;
    }

    setGuardando(true);
    try {
      const r = await hojasApi.crearColumna(hojaId, {
        nombre: nombre.trim(),
        tipo,
        opciones: listaOpciones,
      });
      onCambio([...columnas, r.data]);
      setNombre('');
      setOpciones('');
      setTipo('TEXTO');
    } catch (err) {
      onError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (col) => {
    if (!window.confirm(`¿Eliminar la columna "${col.nombre}"? Los datos que tenga dejarán de verse.`)) return;
    try {
      await hojasApi.eliminarColumna(hojaId, col.id);
      onCambio(columnas.filter(c => c.id !== col.id));
    } catch (err) { onError(err.message); }
  };

  const alternarBloqueo = async (col) => {
    try {
      const r = await hojasApi.editarColumna(hojaId, col.id, { soloLectura: !col.soloLectura });
      onCambio(columnas.map(c => c.id === col.id ? r.data : c));
    } catch (err) { onError(err.message); }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Columnas del archivo" ancho="max-w-xl">
      {/* Existentes */}
      <div className="space-y-2">
        {columnas.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">Todavía no hay columnas.</p>
        )}

        {columnas.map(col => (
          <div key={col.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <GripVertical className="w-4 h-4 shrink-0 text-slate-300" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-700">{col.nombre}</span>
                <TipoBadge tipo={col.tipo} />
              </div>
              {col.tipo === 'LISTA' && col.opciones?.length > 0 && (
                <p className="truncate text-xs text-slate-400">{col.opciones.join(' · ')}</p>
              )}
            </div>

            <button
              onClick={() => alternarBloqueo(col)}
              title={col.soloLectura ? 'Desbloquear: los editores podrán escribir' : 'Bloquear: solo tú podrás escribir'}
              className={`rounded p-1.5 ${col.soloLectura ? 'bg-amber-50 text-amber-600' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}`}
            >
              <Lock className="w-4 h-4" />
            </button>

            <button
              onClick={() => eliminar(col)}
              className="rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
              title="Eliminar columna"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Nueva */}
      <form onSubmit={agregar} className="mt-5 space-y-3 rounded-lg bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-700">Agregar columna</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Resultado de la llamada"
              maxLength={100}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            >
              {TIPOS.map(t => (
                <option key={t} value={t}>{TIPO_UI[t].label} — {TIPO_UI[t].ayuda}</option>
              ))}
            </select>
          </label>
        </div>

        {tipo === 'LISTA' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Opciones (una por línea)</span>
            <textarea
              value={opciones}
              onChange={(e) => setOpciones(e.target.value)}
              rows={4}
              placeholder={'Contactado\nNo contesta\nVolver a llamar\nNo interesado'}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={guardando || !nombre.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {guardando ? 'Agregando…' : 'Agregar'}
        </button>

        <p className="text-xs text-slate-400">
          El tipo no se puede cambiar después. Si te equivocas, elimina la columna y crea otra.
        </p>
      </form>
    </Modal>
  );
}
