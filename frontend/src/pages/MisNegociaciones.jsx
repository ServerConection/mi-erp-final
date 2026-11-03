// src/pages/MisNegociaciones.jsx
// Vista de negociaciones (deals) de Bitrix dentro del ERP.
// El backend fuerza que cada asesor vea SOLO los deals donde es responsable.
// Desde aquí se ve el contacto/teléfono y se cambia la etapa vía API.

import { useCallback, useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL;
const O = "#FF6B00";

const fmtFecha = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString("es-EC", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
const soloDigitos = (t) => String(t || "").replace(/\D/g, "");
const esCompleto = (t) => !String(t).includes("*");

export default function MisNegociaciones() {
  const token = localStorage.getItem("token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [yo, setYo] = useState(null);
  const [embudos, setEmbudos] = useState([]);
  const [categoria, setCategoria] = useState("");
  const [etapas, setEtapas] = useState({}); // cat -> [etapas]
  const [filtroEtapa, setFiltroEtapa] = useState("");
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [responsables, setResponsables] = useState([]);
  const [responsable, setResponsable] = useState("");

  const [deals, setDeals] = useState([]);
  const [next, setNext] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState({}); // dealId -> true
  const [aviso, setAviso] = useState(null);

  const getJson = useCallback(async (path) => {
    const r = await fetch(`${API}/api/mis-negociaciones${path}`, { headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || `Error ${r.status}`);
    return d;
  }, [headers]);

  const cargarEtapas = useCallback(async (cat) => {
    const c = String(cat ?? "0");
    if (etapas[c]) return etapas[c];
    const d = await getJson(`/etapas?categoria=${encodeURIComponent(c)}`);
    setEtapas((prev) => ({ ...prev, [c]: d.data }));
    return d.data;
  }, [etapas, getJson]);

  // Inicio: quién soy + embudos
  useEffect(() => {
    (async () => {
      try {
        const [y, e] = await Promise.all([getJson("/yo"), getJson("/embudos")]);
        setYo(y);
        setEmbudos(e.data);
        if (y.veTodo) {
          getJson("/responsables").then((r) => setResponsables(r.data)).catch(() => {});
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    })();
  }, [getJson]);

  const cargar = useCallback(async (start = 0) => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (categoria !== "") p.set("categoria", categoria);
      if (filtroEtapa) p.set("etapa", filtroEtapa);
      if (busqueda) p.set("q", busqueda);
      if (responsable) p.set("responsable", responsable);
      if (start) p.set("start", String(start));
      const d = await getJson(`?${p.toString()}`);
      setDeals((prev) => (start ? [...prev, ...d.data] : d.data));
      setNext(d.next);
      setTotal(d.total);
      // precarga etapas de los embudos que aparecen
      [...new Set(d.data.map((x) => x.categoria))].forEach((c) => cargarEtapas(c).catch(() => {}));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [categoria, filtroEtapa, busqueda, responsable, getJson, cargarEtapas]);

  useEffect(() => { if (yo) cargar(0); }, [yo, categoria, filtroEtapa, busqueda, responsable]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFiltroEtapa("");
    if (categoria !== "") cargarEtapas(categoria).catch(() => {});
  }, [categoria]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarEtapa = async (deal, stageId) => {
    if (stageId === deal.etapa) return;
    const anterior = deal.etapa;
    setGuardando((g) => ({ ...g, [deal.id]: true }));
    setDeals((ds) => ds.map((x) => (x.id === deal.id ? { ...x, etapa: stageId } : x)));
    try {
      const r = await fetch(`${API}/api/mis-negociaciones/${deal.id}/etapa`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || `Error ${r.status}`);
      setAviso({ tipo: "ok", txt: `Negociación #${deal.id} movida de etapa.` });
    } catch (err) {
      setDeals((ds) => ds.map((x) => (x.id === deal.id ? { ...x, etapa: anterior } : x)));
      setAviso({ tipo: "error", txt: err.message });
    } finally {
      setGuardando((g) => ({ ...g, [deal.id]: false }));
      setTimeout(() => setAviso(null), 3500);
    }
  };

  const etapasFiltro = categoria !== "" ? etapas[categoria] || [] : [];
  const nombreEmbudo = (id) => embudos.find((e) => e.id === id)?.nombre || `Embudo ${id}`;

  const sel = { padding: "8px 10px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff", minWidth: 0 };

  return (
    <div style={{ minHeight: "100vh", background: "#FFF8F3", padding: "24px 16px", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#1C1C2E", margin: 0 }}>🤝 Mis negociaciones</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>
              {yo?.veTodo
                ? "Vista de gerencia: puedes ver todas las negociaciones."
                : yo?.bitrix
                  ? `Negociaciones donde eres responsable en Bitrix (${yo.bitrix.nombre}).`
                  : "Cargando tu usuario de Bitrix…"}
            </p>
          </div>
          <button onClick={() => cargar(0)} disabled={loading}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: O, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
            ⟳ Actualizar
          </button>
        </div>

        {/* Filtros */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, background: "#fff", padding: 12, borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 14 }}>
          <select style={sel} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todos los embudos</option>
            {embudos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <select style={sel} value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)} disabled={categoria === ""}>
            <option value="">{categoria === "" ? "Elige embudo para filtrar etapa" : "Todas las etapas"}</option>
            {etapasFiltro.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {yo?.veTodo && (
            <select style={sel} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">Todos los responsables</option>
              {responsables.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          )}
          <form onSubmit={(e) => { e.preventDefault(); setBusqueda(q.trim()); }} style={{ display: "flex", gap: 6 }}>
            <input style={{ ...sel, flex: 1 }} placeholder="Buscar por título o ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" style={{ ...sel, cursor: "pointer", fontWeight: 700 }}>🔍</button>
          </form>
        </div>

        {aviso && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: aviso.tipo === "ok" ? "#ECFDF5" : "#FEF2F2", color: aviso.tipo === "ok" ? "#065F46" : "#991B1B" }}>
            {aviso.txt}
          </div>
        )}

        {error && (
          <div style={{ padding: 16, borderRadius: 12, background: "#FEF2F2", color: "#991B1B", fontSize: 14, marginBottom: 12 }}>⚠️ {error}</div>
        )}

        {!error && (
          <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 8px" }}>
            {loading && !deals.length ? "Cargando…" : `${deals.length} de ${total} negociaciones`}
          </p>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {deals.map((d) => {
            const lista = etapas[d.categoria] || [];
            const actual = lista.find((s) => s.id === d.etapa);
            const color = actual?.color || "#9CA3AF";
            return (
              <div key={d.id} style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,.06)", borderLeft: `5px solid ${color}`,
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700 }}>#{d.id} · {nombreEmbudo(d.categoria)}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1C1C2E", overflow: "hidden", textOverflow: "ellipsis" }}>{d.titulo || "(sin título)"}</div>
                  {yo?.veTodo && <div style={{ fontSize: 12, color: "#6B7280" }}>👤 {d.responsable}</div>}
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>Modificado {fmtFecha(d.modificado)}</div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{d.contacto?.nombre || "Sin contacto"}</div>
                  {(d.contacto?.telefonos || []).map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 2 }}>
                      <span style={{ fontFamily: "monospace" }}>📞 {t}</span>
                      {esCompleto(t) && (
                        <>
                          <a href={`tel:${soloDigitos(t)}`} style={{ color: O, fontWeight: 700, textDecoration: "none" }}>Llamar</a>
                          <a href={`https://wa.me/${soloDigitos(t)}`} target="_blank" rel="noreferrer" style={{ color: "#16A34A", fontWeight: 700, textDecoration: "none" }}>WhatsApp</a>
                        </>
                      )}
                    </div>
                  ))}
                  {!d.contacto?.telefonos?.length && d.contacto && <div style={{ fontSize: 12, color: "#9CA3AF" }}>Sin teléfono</div>}
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "#6B7280", fontWeight: 700 }}>Etapa</label>
                  <select value={d.etapa} disabled={!!guardando[d.id] || !lista.length}
                    onChange={(e) => cambiarEtapa(d, e.target.value)}
                    style={{ ...sel, width: "100%", fontWeight: 700, borderColor: color }}>
                    {!actual && <option value={d.etapa}>{lista.length ? d.etapa : "Cargando etapas…"}</option>}
                    {lista.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                  {guardando[d.id] && <div style={{ fontSize: 11, color: O, marginTop: 4 }}>Guardando en Bitrix…</div>}
                </div>
              </div>
            );
          })}
        </div>

        {!loading && !error && !deals.length && (
          <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No hay negociaciones con estos filtros.</div>
        )}

        {next != null && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button onClick={() => cargar(next)} disabled={loading}
              style={{ padding: "10px 20px", borderRadius: 10, border: `1px solid ${O}`, background: "#fff", color: O, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
