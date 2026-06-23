// src/pages/MisVentasPendientes.jsx
// Lista los borradores ("REGISTRAR VENTA") del asesor logueado para que pueda
// retomarlos y finalizarlos con "CARGAR VENTA" en NuevaVenta.jsx.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL;
const O   = "#FF6B00";

export default function MisVentasPendientes() {
  const [borradores, setBorradores] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/envios-ventas/mis-borradores`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        if (d.success) setBorradores(d.data);
        else setError(d.error || "No se pudieron cargar los borradores.");
      } catch {
        setError("Error de conexión con el servidor.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#FFF8F3", padding: "28px 20px", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#1C1C2E", margin: 0 }}>📋 Mis ventas pendientes</h1>
            <p style={{ fontSize: 13, color: "#8B5E3C", marginTop: 4 }}>
              Borradores guardados con "Registrar venta" — complétalos y cárgalos cuando estén listos.
            </p>
          </div>
          <button
            onClick={() => navigate("/nueva-venta")}
            style={{ background: O, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
          >
            ➕ Nueva venta
          </button>
        </div>

        {loading && <p style={{ color: "#8B5E3C" }}>Cargando…</p>}
        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: 12, padding: 14, fontSize: 13, fontWeight: 600 }}>
            ❌ {error}
          </div>
        )}

        {!loading && !error && borradores.length === 0 && (
          <div style={{ background: "#fff", border: "1.5px solid #F0E6DD", borderRadius: 16, padding: 40, textAlign: "center", color: "#A07850" }}>
            No tienes borradores pendientes. 🎉
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {borradores.map(b => (
            <div
              key={b.id}
              style={{ background: "#fff", border: "1.5px solid #F0E6DD", borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
            >
              <div>
                <p style={{ fontWeight: 800, fontSize: 14, color: "#1C1C2E", margin: 0 }}>
                  {b.nombre_cliente_completo || "Cliente sin nombre aún"}
                </p>
                <p style={{ fontSize: 12, color: "#8B5E3C", margin: "4px 0 0" }}>
                  {b.numero_identificacion ? `Cédula: ${b.numero_identificacion} · ` : ""}
                  {b.distribuidor_autorizado || "—"}{b.plan_contratado_final ? ` · ${b.plan_contratado_final}` : ""}
                </p>
                <p style={{ fontSize: 11, color: "#C4A898", margin: "4px 0 0" }}>
                  Guardado: {b.fecha_registro_sistema ? new Date(b.fecha_registro_sistema).toLocaleString("es-EC") : "—"}
                </p>
              </div>
              <button
                onClick={() => navigate(`/nueva-venta?id=${b.id}`)}
                style={{ background: O, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Continuar →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
