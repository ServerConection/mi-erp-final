/**
 * MapaCobertura — mapa reutilizable para el módulo de cobertura.
 *
 * Usa Leaflet + OpenStreetMap en vez de Google Maps a propósito:
 * Google Maps exige clave de API con facturación y cobra por carga del mapa;
 * con miles de consultas al mes eso es un costo recurrente. Leaflet es gratuito,
 * sin clave y sin límite de uso.
 *
 * Leaflet se carga desde CDN bajo demanda (no es dependencia de npm), así que
 * no hay paso de instalación ni riesgo en el build. Si no hay internet el mapa
 * no funciona — pero tampoco funcionarían los tiles, así que es equivalente.
 *
 * MODOS:
 *   modo="interno"  → muestra polígonos de cobertura y zonas de peligro
 *   modo="cliente"  → SOLO el marcador. Nunca dibuja polígonos ni zonas de
 *                     peligro: esa información es interna y no debe llegar al
 *                     cliente (es información competitiva y, en el caso de las
 *                     zonas de riesgo, sensible).
 */

import { useEffect, useRef, useState } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// Carga Leaflet una sola vez para toda la aplicación
let leafletPromise = null;
function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const js = document.createElement("script");
    js.src = LEAFLET_JS;
    js.async = true;
    js.onload = () => resolve(window.L);
    js.onerror = () => reject(new Error("No se pudo cargar el mapa. Verifica tu conexión a internet."));
    document.head.appendChild(js);
  });
  return leafletPromise;
}

// Colores por tipo de zona
const COLOR_COBERTURA = "#0d9488"; // teal
const COLOR_PELIGRO = {
  BLOQUEADO:           "#dc2626", // rojo
  HORARIO_RESTRINGIDO: "#f59e0b", // ámbar
  RESTRINGIDA:         "#f97316", // naranja
};

export default function MapaCobertura({
  lat,
  lon,
  zonas = [],            // [{ name, type, dangerType, coordinates:[[lon,lat],...] }]
  modo = "interno",      // "interno" | "cliente"
  zoom = 15,
  alto = 320,
  onMoveEnd,             // (bounds) => void — para cargar zonas del área visible
  interactivo = true,
  etiquetaMarcador = "Ubicación consultada",
}) {
  const contRef  = useRef(null);
  const mapRef   = useRef(null);
  const capaRef  = useRef(null);
  const marcaRef = useRef(null);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  // ── Crear el mapa una sola vez ────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;

    cargarLeaflet()
      .then((L) => {
        if (cancelado || !contRef.current || mapRef.current) return;

        const map = L.map(contRef.current, {
          zoomControl:    interactivo,
          dragging:       interactivo,
          scrollWheelZoom: interactivo,
          doubleClickZoom: interactivo,
          attributionControl: true,
        }).setView([lat ?? -2.17, lon ?? -79.92], zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          crossOrigin: true, // necesario para poder exportar la imagen
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);

        capaRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setListo(true);

        if (onMoveEnd) {
          const emitir = () => {
            const b = map.getBounds();
            onMoveEnd({
              minLon: b.getWest(), minLat: b.getSouth(),
              maxLon: b.getEast(), maxLat: b.getNorth(),
              zoom:   map.getZoom(),
            });
          };
          map.on("moveend", emitir);
          emitir(); // carga inicial
        }

        // El contenedor suele montarse oculto/animado: recalcular tamaño
        setTimeout(() => map.invalidateSize(), 150);
      })
      .catch((e) => !cancelado && setError(e.message));

    return () => {
      cancelado = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recentrar cuando cambian las coordenadas ──────────────────────────────
  useEffect(() => {
    if (!listo || !mapRef.current || lat == null || lon == null) return;
    const L = window.L;
    mapRef.current.setView([lat, lon], zoom);

    if (marcaRef.current) mapRef.current.removeLayer(marcaRef.current);
    marcaRef.current = L.marker([lat, lon]).addTo(mapRef.current);
    marcaRef.current.bindTooltip(etiquetaMarcador, { permanent: false });
  }, [lat, lon, zoom, listo, etiquetaMarcador]);

  // ── Dibujar zonas ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!listo || !capaRef.current) return;
    const L = window.L;
    capaRef.current.clearLayers();

    // Vista para cliente: NUNCA se dibujan zonas. Solo el marcador.
    if (modo === "cliente") return;

    for (const z of zonas) {
      if (!Array.isArray(z.coordinates) || z.coordinates.length < 3) continue;
      // El backend entrega [lon,lat]; Leaflet espera [lat,lon]
      const puntos = z.coordinates.map(([lo, la]) => [la, lo]);

      const esPeligro = !!z.dangerType;
      const color = esPeligro
        ? (COLOR_PELIGRO[z.dangerType] || COLOR_PELIGRO.RESTRINGIDA)
        : COLOR_COBERTURA;

      const poly = L.polygon(puntos, {
        color,
        weight:      esPeligro ? 2 : 1,
        opacity:     esPeligro ? 0.9 : 0.6,
        fillColor:   color,
        fillOpacity: esPeligro ? 0.35 : 0.15,
        // Las zonas de peligro se dibujan encima para que siempre se vean
        pane: esPeligro ? "markerPane" : "overlayPane",
      });

      const etiqueta = esPeligro
        ? `<strong>${z.dangerType === "BLOQUEADO" ? "⛔ BLOQUEADO"
            : z.dangerType === "HORARIO_RESTRINGIDO" ? "🕒 HORARIO RESTRINGIDO"
            : "⚠️ ZONA RESTRINGIDA"}</strong><br>${z.name || ""}`
        : `<strong>Cobertura</strong><br>${z.name || "Sin nombre"}`;
      poly.bindPopup(etiqueta);

      poly.addTo(capaRef.current);
    }
  }, [zonas, listo, modo]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 px-4 text-center"
        style={{ height: alto }}
      >
        🗺️ {error}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={contRef}
        style={{ height: alto, zIndex: 0 }}
        className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
      />
      {!listo && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 pointer-events-none"
          style={{ height: alto }}
        >
          Cargando mapa…
        </div>
      )}
    </div>
  );
}

// Leyenda reutilizable para la vista interna
export function LeyendaMapa() {
  const items = [
    { c: COLOR_COBERTURA,                       t: "Cobertura disponible" },
    { c: COLOR_PELIGRO.BLOQUEADO,               t: "Bloqueado" },
    { c: COLOR_PELIGRO.HORARIO_RESTRINGIDO,     t: "Horario restringido" },
    { c: COLOR_PELIGRO.RESTRINGIDA,             t: "Zona restringida" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 mt-2">
      {items.map(({ c, t }) => (
        <span key={t} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm border"
            style={{ backgroundColor: c + "55", borderColor: c }}
          />
          {t}
        </span>
      ))}
    </div>
  );
}
