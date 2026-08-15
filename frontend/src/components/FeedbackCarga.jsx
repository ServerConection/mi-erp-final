// ============================================================================
// FEEDBACK DE CARGA AL APLICAR FILTROS — compartido Novonet / Velsa
// ----------------------------------------------------------------------------
// Patrón "stale-while-revalidate": mientras llegan los datos nuevos, los
// anteriores SIGUEN visibles pero atenuados y sin poder interactuar, más una
// barra de progreso arriba.
//
// Antes solo cambiaba el texto del botón a "CARGANDO...", así que las tablas
// seguían mostrando el resultado del filtro ANTERIOR sin ninguna señal —
// alguien podía leer esos números creyendo que ya eran los del filtro nuevo.
//
// No cambia colores, tipografías ni layout de los dashboards: solo agrega el
// estado de carga. El color de la barra se pasa por prop para respetar la
// identidad de cada empresa (Novonet azul, Velsa naranja).
//
// USO:
//   const cargandoVisible = useCargaDiferida(loading);
//   ...
//   <EstilosCarga />
//   <BarraCarga activa={cargandoVisible} color="#2563eb" />
//   <div className={`fc-datos ${cargandoVisible ? 'fc-datos--stale' : ''}`}
//        aria-busy={cargandoVisible}>
//     ...KPIs, gráficos y tablas...
//   </div>
// ============================================================================
import { useEffect, useState } from 'react';

/**
 * Muestra el indicador SOLO si la carga supera el umbral (250 ms por defecto).
 * Si la respuesta vuelve del caché en 100-200 ms no se muestra nada y la
 * pantalla se siente instantánea, en vez de pegar un parpadeo en cada clic.
 */
export const useCargaDiferida = (cargando, retardo = 250) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!cargando) { setVisible(false); return; }
    const t = setTimeout(() => setVisible(true), retardo);
    return () => clearTimeout(t);
  }, [cargando, retardo]);
  return visible;
};

export const EstilosCarga = () => (
  <style>{`
    @keyframes fc-barra { 0% { transform: translateX(-100%) } 100% { transform: translateX(400%) } }
    .fc-barra-pista {
      position: fixed; top: 0; left: 0; right: 0; height: 3px;
      background: color-mix(in srgb, var(--fc-color) 14%, transparent);
      z-index: 60; overflow: hidden;
    }
    .fc-barra-pista > span {
      display: block; width: 25%; height: 100%; background: var(--fc-color);
      animation: fc-barra 1.1s cubic-bezier(.4,0,.2,1) infinite;
    }
    /* Easing propio: entra suave, no el ease-in-out por defecto. */
    .fc-datos { transition: opacity .18s cubic-bezier(.2,0,0,1); }
    .fc-datos--stale { opacity: .55; pointer-events: none; user-select: none; }
    @media (prefers-reduced-motion: reduce) {
      .fc-barra-pista > span { animation-duration: 2.4s }
      .fc-datos { transition: none }
    }
  `}</style>
);

export const BarraCarga = ({ activa, color = '#2563eb' }) => activa
  ? (
    <div
      className="fc-barra-pista"
      style={{ '--fc-color': color }}
      role="progressbar"
      aria-label="Cargando datos"
    >
      <span />
    </div>
  )
  : null;
