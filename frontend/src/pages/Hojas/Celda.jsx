/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Archivos Compartidos · Una celda de la grilla
 * ═══════════════════════════════════════════════════════════════════════════════
 * Responsabilidad única: mostrar y editar UN valor según el tipo de su columna.
 * No sabe de sockets, ni de permisos globales, ni de guardar en el servidor:
 * recibe `valor`, avisa con `onCambio` y `onSalir`, y nada más.
 *
 * Estados: reposo (texto plano) → edición (input real, al hacer clic o escribir).
 * Mantener el input montado solo durante la edición es lo que hace que una
 * hoja de 500×8 se sienta ligera: se renderizan 4000 <div>, no 4000 <input>.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, User } from 'lucide-react';

function CeldaBase({
  valor,
  columna,
  usuarios,
  editable,
  seleccionada,
  editando,
  focoAjeno,       // { nombre, color } si otra persona está parada aquí
  onSeleccionar,
  onEmpezarEdicion,
  onCambio,
  onSalir,
}) {
  const [borrador, setBorrador] = useState(valor ?? '');
  const ref = useRef(null);

  // Si el valor llega desde otro usuario por socket y no estamos editando,
  // se adopta. Si estamos editando, se respeta lo que la persona está tecleando.
  useEffect(() => {
    if (!editando) setBorrador(valor ?? '');
  }, [valor, editando]);

  useEffect(() => {
    if (editando && ref.current) {
      ref.current.focus();
      if (ref.current.select) ref.current.select();
    }
  }, [editando]);

  const confirmar = (nuevo) => {
    if (String(nuevo ?? '') !== String(valor ?? '')) onCambio(nuevo === '' ? null : nuevo);
  };

  const alTeclado = (e) => {
    if (e.key === 'Enter' && columna.tipo !== 'LISTA') {
      e.preventDefault();
      confirmar(borrador);
      onSalir('abajo');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setBorrador(valor ?? '');
      onSalir('quedarse');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      confirmar(borrador);
      onSalir(e.shiftKey ? 'izquierda' : 'derecha');
    }
  };

  // ── Texto visible en reposo ────────────────────────────────────────────────
  let mostrado = valor ?? '';
  if (columna.tipo === 'USUARIO' && valor) {
    mostrado = usuarios.get(String(valor)) || `Usuario ${valor}`;
  } else if (columna.tipo === 'FECHA' && valor) {
    const [a, m, d] = String(valor).split('-');
    mostrado = `${d}/${m}/${a}`;
  }

  // ── Marco: selección propia o foco de otra persona ─────────────────────────
  const estilo = {};
  let clasesMarco = 'border-slate-200';
  if (seleccionada) {
    clasesMarco = 'ring-2 ring-blue-500 ring-inset border-blue-500 z-10';
  } else if (focoAjeno) {
    clasesMarco = 'border-transparent';
    estilo.boxShadow = `inset 0 0 0 2px ${focoAjeno.color}`;
  }

  const base = `relative h-9 border-b border-r px-2 text-sm text-slate-700 ${clasesMarco}`;

  // ── Modo edición ───────────────────────────────────────────────────────────
  if (editando && editable && !columna.soloLectura) {
    if (columna.tipo === 'LISTA') {
      return (
        <div className={base} style={estilo}>
          <select
            ref={ref}
            value={borrador ?? ''}
            onChange={(e) => { setBorrador(e.target.value); confirmar(e.target.value); }}
            onBlur={() => onSalir('quedarse')}
            onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Tab') alTeclado(e); }}
            className="absolute inset-0 w-full bg-white px-2 text-sm outline-none"
          >
            <option value="">—</option>
            {(columna.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }

    if (columna.tipo === 'USUARIO') {
      return (
        <div className={base} style={estilo}>
          <select
            ref={ref}
            value={borrador ?? ''}
            onChange={(e) => { setBorrador(e.target.value); confirmar(e.target.value); }}
            onBlur={() => onSalir('quedarse')}
            onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Tab') alTeclado(e); }}
            className="absolute inset-0 w-full bg-white px-2 text-sm outline-none"
          >
            <option value="">—</option>
            {[...usuarios.entries()].map(([id, nombre]) => (
              <option key={id} value={id}>{nombre}</option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div className={base} style={estilo}>
        <input
          ref={ref}
          type={columna.tipo === 'FECHA' ? 'date' : 'text'}
          value={borrador ?? ''}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={() => { confirmar(borrador); onSalir('quedarse'); }}
          onKeyDown={alTeclado}
          className="absolute inset-0 w-full bg-white px-2 text-sm outline-none"
        />
      </div>
    );
  }

  // ── Modo reposo ────────────────────────────────────────────────────────────
  const bloqueada = !editable || columna.soloLectura;

  return (
    <div
      className={`${base} flex items-center gap-1 cursor-${bloqueada ? 'default' : 'cell'} ${bloqueada ? 'bg-slate-50/60' : 'bg-white hover:bg-slate-50'} overflow-hidden`}
      style={estilo}
      onClick={onSeleccionar}
      onDoubleClick={() => !bloqueada && onEmpezarEdicion()}
      title={mostrado || undefined}
    >
      <span className="truncate">{mostrado}</span>

      {!bloqueada && seleccionada && columna.tipo === 'LISTA'   && <ChevronDown className="ml-auto w-3.5 h-3.5 shrink-0 text-slate-400" />}
      {!bloqueada && seleccionada && columna.tipo === 'FECHA'   && <Calendar    className="ml-auto w-3.5 h-3.5 shrink-0 text-slate-400" />}
      {!bloqueada && seleccionada && columna.tipo === 'USUARIO' && <User        className="ml-auto w-3.5 h-3.5 shrink-0 text-slate-400" />}

      {focoAjeno && (
        <span
          className="pointer-events-none absolute -top-4 left-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: focoAjeno.color }}
        >
          {focoAjeno.nombre}
        </span>
      )}
    </div>
  );
}

/**
 * memo con comparación explícita: sin esto, escribir en UNA celda vuelve a
 * renderizar las 4000 de la hoja y se siente lento.
 */
export default memo(CeldaBase, (a, b) =>
  a.valor === b.valor &&
  a.editando === b.editando &&
  a.seleccionada === b.seleccionada &&
  a.editable === b.editable &&
  a.columna === b.columna &&
  a.usuarios === b.usuarios &&
  a.focoAjeno?.usuarioId === b.focoAjeno?.usuarioId
);
