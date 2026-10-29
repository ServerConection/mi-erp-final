// Mapa de calor de ventas (módulo Redes).
// Datos: GET /api/redes/mapa-ventas → GPS real de cada venta en envios_ventas,
// filtrado por fecha_ingreso_telcos (período activo de Redes).
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cabecerasSesion } from "../utils/sesion";

const API = import.meta.env.VITE_API_URL;

export default function TabMapaCalor({ filtro, empresa = "NOVONET" }) {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const capaRef = useRef(null);

  // Cargar datos al cambiar el período
  useEffect(() => {
    if (!filtro?.desde || !filtro?.hasta) return;
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    const p = new URLSearchParams({ fechaDesde: filtro.desde, fechaHasta: filtro.hasta, empresa });
    fetch(`${API}/api/redes/mapa-ventas?${p}`, { signal: ctrl.signal, cache: "no-store", headers: cabecerasSesion() })
      .then((r) => r.json())
      .then((j) => { if (j?.success) setDatos(j); else setError(j?.message || "No se pudo cargar el mapa"); })
      .catch((e) => { if (e.name !== "AbortError") setError("No se pudo cargar el mapa"); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [filtro?.desde, filtro?.hasta, empresa]);

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current).setView([-1.5, -78.6], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; capaRef.current = null; };
  }, []);

  // Pintar la capa de calor
  useEffect(() => {
    let cancelado = false;
    (async () => {
      window.L = L;                 // leaflet.heat necesita L global
      await import("leaflet.heat");
      const map = mapRef.current;
      if (cancelado || !map) return;
      if (capaRef.current) { map.removeLayer(capaRef.current); capaRef.current = null; }
      const puntos = datos?.puntos || [];
      if (!puntos.length) return;
      const max = Math.max(...puntos.map((p) => p.n));
      capaRef.current = L.heatLayer(
        puntos.map((p) => [p.lat, p.lng, Math.max(0.3, p.n / max)]),
        {
          radius: 22, blur: 18, maxZoom: 12, minOpacity: 0.35,
          gradient: { 0.2: "#1e3a8a", 0.4: "#06b6d4", 0.6: "#22c55e", 0.8: "#facc15", 1.0: "#dc2626" },
        }
      ).addTo(map);
    })();
    return () => { cancelado = true; };
  }, [datos]);

  const top = datos?.top_ciudades || [];

  return (
    <div className="bg-white border rounded-2xl p-5 shadow-sm" style={{ borderColor: "#e2e8f0" }}>
      <div className="mb-4">
        <h3 className="text-[14px] font-black uppercase tracking-wide" style={{ color: "#1e3a8a" }}>
          Zonas de calor · Ventas nuevas
        </h3>
        <p className="text-[11px]" style={{ color: "#64748b" }}>
          GPS de cada venta registrada (fecha ingreso Telcos) en el período activo.
          {loading ? " Cargando..." : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div ref={divRef} style={{ height: 520, borderRadius: 12, zIndex: 0 }} />
        <div className="text-[12px]">
          {error && <p className="mb-2 font-bold" style={{ color: "#ef4444" }}>{error}</p>}
          <p className="font-black uppercase mb-1" style={{ color: "#334155" }}>
            Total ventas: {datos?.total ?? 0}
          </p>
          <p className="font-black uppercase mt-3 mb-2" style={{ color: "#334155" }}>Top ciudades</p>
          {top.length === 0 && <p style={{ color: "#64748b" }}>Sin ventas en el período.</p>}
          {top.map((c, i) => (
            <div key={c.ciudad} className="flex justify-between py-1 border-b" style={{ borderColor: "#e2e8f0" }}>
              <span>{i + 1}. {c.ciudad}</span><span className="font-black">{c.n}</span>
            </div>
          ))}
          {datos?.sin_gps > 0 && (
            <p className="mt-3 text-[11px]" style={{ color: "#64748b" }}>
              {datos.sin_gps} ventas sin GPS válido (no aparecen en el mapa).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
