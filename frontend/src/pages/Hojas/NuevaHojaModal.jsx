/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Archivos Compartidos · Crear un archivo nuevo
 * ═══════════════════════════════════════════════════════════════════════════════
 * Nombre, color y columnas iniciales. Se ofrecen plantillas porque arrancar
 * desde una hoja en blanco es la parte que más fricción genera.
 */

import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { hojasApi } from '../../hooks/useHojas';
import { COLORES_HOJA, Modal, TIPO_UI } from './ui';

const TIPOS = ['TEXTO', 'LISTA', 'FECHA', 'USUARIO'];

const PLANTILLAS = {
  llamadas: {
    etiqueta: 'Llamadas ejecutadas',
    columnas: [
      { nombre: 'Asesor',    tipo: 'USUARIO', opciones: [] },
      { nombre: 'Fecha',     tipo: 'FECHA',   opciones: [] },
      { nombre: 'Cliente',   tipo: 'TEXTO',   opciones: [] },
      { nombre: 'Teléfono',  tipo: 'TEXTO',   opciones: [] },
      { nombre: 'Resultado', tipo: 'LISTA',   opciones: ['Contactado', 'No contesta', 'Volver a llamar', 'No interesado', 'Venta cerrada'] },
      { nombre: 'Observación', tipo: 'TEXTO', opciones: [] },
    ],
  },
  seguimiento: {
    etiqueta: 'Seguimiento general',
    columnas: [
      { nombre: 'Responsable', tipo: 'USUARIO', opciones: [] },
      { nombre: 'Fecha',       tipo: 'FECHA',   opciones: [] },
      { nombre: 'Detalle',     tipo: 'TEXTO',   opciones: [] },
      { nombre: 'Estado',      tipo: 'LISTA',   opciones: ['Pendiente', 'En proceso', 'Listo'] },
    ],
  },
  blanco: { etiqueta: 'Empezar en blanco', columnas: [{ nombre: 'Detalle', tipo: 'TEXTO', opciones: [] }] },
};

export default function NuevaHojaModal({ abierto, onCerrar, onCreada, onError }) {
  const [nombre, setNombre]           = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [color, setColor]             = useState(COLORES_HOJA[0]);
  const [plantilla, setPlantilla]     = useState('llamadas');
  const [columnas, setColumnas]       = useState(PLANTILLAS.llamadas.columnas);
  const [guardando, setGuardando]     = useState(false);

  const elegirPlantilla = (clave) => {
    setPlantilla(clave);
    setColumnas(PLANTILLAS[clave].columnas.map(c => ({ ...c })));
  };

  const actualizar = (i, campo, valor) =>
    setColumnas(cs => cs.map((c, j) => j === i ? { ...c, [campo]: valor } : c));

  const crear = async (e) => {
    e.preventDefault();
    if (!nombre.trim() || nombre.trim().length < 3) {
      onError('El nombre debe tener al menos 3 caracteres');
      return;
    }

    const limpias = columnas
      .filter(c => c.nombre.trim())
      .map(c => ({
        nombre: c.nombre.trim(),
        tipo: c.tipo,
        opciones: c.tipo === 'LISTA'
          ? (Array.isArray(c.opciones) ? c.opciones : String(c.opciones).split(',').map(o => o.trim()).filter(Boolean))
          : [],
      }));

    if (limpias.some(c => c.tipo === 'LISTA' && c.opciones.length === 0)) {
      onError('Las columnas de lista necesitan al menos una opción');
      return;
    }

    setGuardando(true);
    try {
      const r = await hojasApi.crear({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        color,
        columnas: limpias,
      });
      setNombre(''); setDescripcion('');
      elegirPlantilla('llamadas');
      onCreada(r.data);
    } catch (err) {
      onError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nuevo archivo compartido" ancho="max-w-2xl">
      <form onSubmit={crear} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Llamadas ejecutadas · Agosto"
              maxLength={150}
              autoFocus
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Color</span>
            <div className="flex gap-1.5">
              {COLORES_HOJA.map(c => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  className="flex h-7 w-7 items-center justify-center rounded-md"
                  style={{ backgroundColor: c }}
                  title={c}
                >
                  {color === c && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Descripción (opcional)</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Para qué sirve este archivo"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Plantilla</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PLANTILLAS).map(([clave, p]) => (
              <button
                key={clave} type="button" onClick={() => elegirPlantilla(clave)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                  plantilla === clave
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* Columnas iniciales */}
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-500">Columnas iniciales</p>

          <div className="space-y-2">
            {columnas.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px_auto] items-start gap-2">
                <input
                  value={c.nombre}
                  onChange={(e) => actualizar(i, 'nombre', e.target.value)}
                  placeholder={`Columna ${i + 1}`}
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
                />
                <select
                  value={c.tipo}
                  onChange={(e) => actualizar(i, 'tipo', e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                >
                  {TIPOS.map(t => <option key={t} value={t}>{TIPO_UI[t].label}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setColumnas(cs => cs.filter((_, j) => j !== i))}
                  className="rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {c.tipo === 'LISTA' && (
                  <input
                    value={Array.isArray(c.opciones) ? c.opciones.join(', ') : c.opciones}
                    onChange={(e) => actualizar(i, 'opciones', e.target.value.split(',').map(o => o.trim()))}
                    placeholder="Opciones separadas por coma"
                    className="col-span-3 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-400"
                  />
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setColumnas(cs => [...cs, { nombre: '', tipo: 'TEXTO', opciones: [] }])}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="w-4 h-4" /> Otra columna
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || !nombre.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Creando…' : 'Crear archivo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
