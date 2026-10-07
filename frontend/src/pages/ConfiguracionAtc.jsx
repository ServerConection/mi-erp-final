import { useCallback, useEffect, useMemo, useState } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/wa/atc-config`;

const headers = (json = false) => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function request(url = "", options = {}) {
  const response = await fetch(`${API}${url}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "No se pudo completar la operación");
  }
  return payload;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function maskPhone(value) {
  const digits = String(value || "");
  return digits.length >= 4 ? `+593 ••• •• ${digits.slice(-4)}` : "—";
}

const STATUS = {
  pending: ["Pendiente", "#92400e", "#fef3c7"],
  processing: ["Procesando", "#1d4ed8", "#dbeafe"],
  retry: ["Reintento", "#9a3412", "#ffedd5"],
  sent: ["Enviado", "#047857", "#d1fae5"],
  failed: ["Fallido", "#b91c1c", "#fee2e2"],
};

function StatusBadge({ status }) {
  const config = STATUS[status] || [status || "—", "#475569", "#f1f5f9"];
  return (
    <span style={{ padding: "5px 9px", borderRadius: 999, color: config[1], background: config[2], fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>
      {config[0]}
    </span>
  );
}

export default function ConfiguracionAtc() {
  const [data, setData] = useState({ config: {}, lines: [], templates: [], stats: {}, history: [], pagination: {} });
  const [lineId, setLineId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [editor, setEditor] = useState(null);

  const load = useCallback(async (nextPage = page, status = filterStatus) => {
    setLoading(true);
    try {
      const payload = await request(`?page=${nextPage}&limit=30&status=${encodeURIComponent(status)}`, { headers: headers() });
      setData(payload.data);
      setLineId(payload.data.config?.line_id || "");
      setEnabled(Boolean(payload.data.config?.enabled));
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { load(page, filterStatus); }, [load, page, filterStatus]);

  const selectedLine = useMemo(
    () => data.lines.find((line) => line.id === lineId),
    [data.lines, lineId]
  );

  async function saveConfig() {
    setBusy("config");
    try {
      await request("", {
        method: "PUT",
        headers: headers(true),
        body: JSON.stringify({ line_id: lineId || null, enabled }),
      });
      setNotice({ type: "success", text: "Configuración guardada correctamente." });
      await load(page, filterStatus);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function saveTemplate(event) {
    event.preventDefault();
    const editing = Boolean(editor?.id);
    setBusy("template");
    try {
      await request(editing ? `/templates/${editor.id}` : "/templates", {
        method: editing ? "PUT" : "POST",
        headers: headers(true),
        body: JSON.stringify({ name: editor.name, body: editor.body, active: editor.active !== false }),
      });
      setEditor(null);
      setNotice({ type: "success", text: editing ? "Variante actualizada." : "Variante creada." });
      await load(page, filterStatus);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function toggleTemplate(template) {
    setBusy(`template-${template.id}`);
    try {
      await request(`/templates/${template.id}`, {
        method: "PUT",
        headers: headers(true),
        body: JSON.stringify({ name: template.name, body: template.body, active: !template.active }),
      });
      await load(page, filterStatus);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function removeTemplate(template) {
    if (!window.confirm(`¿Eliminar la variante "${template.name}"? El historial anterior se conservará.`)) return;
    setBusy(`template-${template.id}`);
    try {
      await request(`/templates/${template.id}`, { method: "DELETE", headers: headers() });
      setNotice({ type: "success", text: "Variante eliminada; el historial fue conservado." });
      await load(page, filterStatus);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function moveTemplate(index, direction) {
    const next = [...data.templates];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusy("reorder");
    try {
      await request("/templates/reorder", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ order: next.map((item) => item.id) }),
      });
      await load(page, filterStatus);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  async function retry(id) {
    setBusy(`retry-${id}`);
    try {
      await request(`/history/${id}/retry`, { method: "POST", headers: headers() });
      setNotice({ type: "success", text: "Mensaje habilitado para reintento." });
      await load(page, filterStatus);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy("");
    }
  }

  const totalPages = Math.max(1, Math.ceil((data.pagination?.total || 0) / (data.pagination?.limit || 30)));

  return (
    <main className="atc-page">
      <style>{`
        .atc-page{max-width:1500px;margin:0 auto;padding:28px;color:#0f172a}.atc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px}.atc-head h1{font-size:25px;margin:0;font-weight:900}.atc-head p{margin:6px 0 0;color:#64748b;font-size:13px}.atc-grid{display:grid;grid-template-columns:minmax(320px,.8fr) minmax(480px,1.2fr);gap:18px}.atc-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 6px 22px #0f172a0a;overflow:hidden}.atc-card-head{padding:18px 20px;border-bottom:1px solid #eef2f7}.atc-card-head h2{font-size:16px;margin:0;font-weight:900}.atc-card-head p{font-size:11px;color:#64748b;margin:4px 0 0}.atc-body{padding:20px}.atc-label{display:grid;gap:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase}.atc-select,.atc-input,.atc-textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:11px 12px;color:#0f172a;outline:none}.atc-textarea{min-height:190px;resize:vertical;line-height:1.5}.atc-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:800;cursor:pointer}.atc-btn:disabled{opacity:.5;cursor:not-allowed}.atc-primary{background:#0f766e;border-color:#0f766e;color:#fff}.atc-danger{color:#b91c1c;border-color:#fecaca;background:#fff7f7}.atc-switch{display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid #e2e8f0;border-radius:12px;margin-top:16px}.atc-switch input{width:42px;height:22px;accent-color:#0f766e}.atc-line-state{margin-top:10px;padding:10px 12px;background:#f8fafc;border-radius:9px;font-size:11px;color:#475569}.atc-variants{display:grid;gap:10px}.atc-variant{border:1px solid #e2e8f0;border-radius:12px;padding:14px}.atc-variant-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.atc-variant p{white-space:pre-wrap;margin:10px 0 0;color:#475569;font-size:11px;line-height:1.45;max-height:78px;overflow:hidden}.atc-actions{display:flex;gap:6px;flex-wrap:wrap}.atc-notice{padding:12px 14px;border-radius:10px;font-size:12px;font-weight:700;margin-bottom:16px}.atc-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin:18px 0}.atc-stat{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:13px}.atc-stat b{display:block;font-size:20px}.atc-stat span{font-size:10px;color:#64748b;text-transform:uppercase;font-weight:800}.atc-history{margin-top:18px}.atc-table-wrap{overflow:auto}.atc-table{width:100%;border-collapse:collapse;min-width:980px}.atc-table th{background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:9px;letter-spacing:.04em;text-align:left;padding:11px 12px}.atc-table td{padding:12px;border-top:1px solid #f1f5f9;font-size:11px;vertical-align:top}.atc-modal{position:fixed;inset:0;background:#0f172a80;display:grid;place-items:center;padding:20px;z-index:1000}.atc-modal-card{width:min(680px,100%);background:#fff;border-radius:16px;padding:22px;box-shadow:0 24px 70px #0004}.atc-modal-card h2{margin:0 0 18px}.atc-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}@media(max-width:1000px){.atc-grid{grid-template-columns:1fr}.atc-stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.atc-page{padding:14px}.atc-head{flex-direction:column}.atc-actions{margin-top:8px}}
      `}</style>

      <header className="atc-head">
        <div>
          <h1>🔔 Configuración ATC</h1>
          <p>Envío automático al cliente cuando una negociación entra a la etapa ATC.</p>
        </div>
        <button className="atc-btn" onClick={() => load(page, filterStatus)} disabled={loading}>
          {loading ? "Actualizando…" : "↻ Actualizar"}
        </button>
      </header>

      {notice && (
        <div className="atc-notice" style={{ color: notice.type === "error" ? "#b91c1c" : "#047857", background: notice.type === "error" ? "#fef2f2" : "#ecfdf5", border: `1px solid ${notice.type === "error" ? "#fecaca" : "#a7f3d0"}` }}>
          {notice.text}
        </div>
      )}

      <section className="atc-grid">
        <article className="atc-card">
          <div className="atc-card-head"><h2>Automatización</h2><p>Aplica para Novonet y Velsa.</p></div>
          <div className="atc-body">
            <label className="atc-label">
              Línea emisora
              <select className="atc-select" value={lineId} onChange={(event) => setLineId(event.target.value)}>
                <option value="">Seleccione una línea…</option>
                {data.lines.map((line) => (
                  <option key={line.id} value={line.id}>{line.name} {line.phone_number ? `· +${line.phone_number}` : ""}</option>
                ))}
              </select>
            </label>
            <div className="atc-line-state">
              Estado: <b>{selectedLine?.rt_status || "Sin línea seleccionada"}</b>
              {selectedLine?.phone_number && <> · Número: <b>+{selectedLine.phone_number}</b></>}
            </div>
            <label className="atc-switch">
              <span><b>Automatización activa</b><br /><small style={{ color: "#64748b" }}>Solo dispara al entrar realmente a ATC.</small></span>
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            </label>
            <button className="atc-btn atc-primary" style={{ width: "100%", marginTop: 16 }} onClick={saveConfig} disabled={busy === "config"}>
              {busy === "config" ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        </article>

        <article className="atc-card">
          <div className="atc-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div><h2>Variantes de mensaje</h2><p>Se alternan en el orden mostrado.</p></div>
            <button className="atc-btn atc-primary" onClick={() => setEditor({ name: "", body: "", active: true })}>+ Agregar variante</button>
          </div>
          <div className="atc-body atc-variants">
            {data.templates.map((template, index) => (
              <div className="atc-variant" key={template.id} style={{ opacity: template.active ? 1 : .62 }}>
                <div className="atc-variant-top">
                  <div><b>{index + 1}. {template.name}</b> <span style={{ marginLeft: 7, padding: "4px 8px", borderRadius: 999, fontSize: 9, fontWeight: 900, color: template.active ? "#047857" : "#92400e", background: template.active ? "#d1fae5" : "#fef3c7" }}>{template.active ? "ACTIVA" : "PAUSADA"}</span></div>
                  <div className="atc-actions">
                    <button className="atc-btn" onClick={() => moveTemplate(index, -1)} disabled={index === 0 || busy === "reorder"} title="Subir">↑</button>
                    <button className="atc-btn" onClick={() => moveTemplate(index, 1)} disabled={index === data.templates.length - 1 || busy === "reorder"} title="Bajar">↓</button>
                    <button className="atc-btn" onClick={() => toggleTemplate(template)} disabled={busy === `template-${template.id}`}>{template.active ? "Pausar" : "Activar"}</button>
                    <button className="atc-btn" onClick={() => setEditor({ ...template })}>Editar</button>
                    <button className="atc-btn atc-danger" onClick={() => removeTemplate(template)} disabled={busy === `template-${template.id}`}>Eliminar</button>
                  </div>
                </div>
                <p>{template.body}</p>
              </div>
            ))}
            {!loading && data.templates.length === 0 && <p style={{ color: "#64748b", textAlign: "center" }}>No existen variantes configuradas.</p>}
          </div>
        </article>
      </section>

      <section className="atc-stats">
        {Object.entries(STATUS).map(([key, value]) => (
          <div className="atc-stat" key={key}><b>{data.stats?.[key] || 0}</b><span>{value[0]}</span></div>
        ))}
      </section>

      <section className="atc-card atc-history">
        <div className="atc-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><h2>Historial de notificaciones</h2><p>Auditoría de entradas a ATC, envíos y errores.</p></div>
          <select className="atc-select" style={{ width: 190 }} value={filterStatus} onChange={(event) => { setPage(1); setFilterStatus(event.target.value); }}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value[0]}</option>)}
          </select>
        </div>
        <div className="atc-table-wrap">
          <table className="atc-table">
            <thead><tr><th>Fecha</th><th>Empresa</th><th>ID Bitrix</th><th>Teléfono</th><th>Variante</th><th>Línea</th><th>Estado</th><th>Intentos</th><th>Detalle</th><th /></tr></thead>
            <tbody>
              {data.history.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.created_at)}</td><td><b>{String(item.empresa).toUpperCase()}</b></td><td>{item.bitrix_id}</td>
                  <td>{maskPhone(item.phone_normalized)}</td><td>{item.template_key}</td><td>{item.line_name || "—"}</td>
                  <td><StatusBadge status={item.status} /></td><td>{item.attempts}</td>
                  <td style={{ maxWidth: 250, color: item.last_error ? "#b91c1c" : "#64748b" }}>{item.last_error || (item.sent_at ? `Enviado ${formatDate(item.sent_at)}` : "—")}</td>
                  <td>{item.status === "failed" && <button className="atc-btn" onClick={() => retry(item.id)} disabled={busy === `retry-${item.id}`}>Reintentar</button>}</td>
                </tr>
              ))}
              {!loading && data.history.length === 0 && <tr><td colSpan="10" style={{ textAlign: "center", padding: 30, color: "#64748b" }}>No existen notificaciones para este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: 14, borderTop: "1px solid #eef2f7" }}>
          <button className="atc-btn" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button>
          <span style={{ fontSize: 11, color: "#64748b" }}>Página {page} de {totalPages}</span>
          <button className="atc-btn" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
        </div>
      </section>

      {editor && (
        <div className="atc-modal" role="dialog" aria-modal="true" aria-label="Editar variante ATC">
          <form className="atc-modal-card" onSubmit={saveTemplate}>
            <h2>{editor.id ? "Editar variante" : "Nueva variante"}</h2>
            <label className="atc-label">Nombre<input className="atc-input" maxLength={120} required value={editor.name || ""} onChange={(event) => setEditor((value) => ({ ...value, name: event.target.value }))} /></label>
            <label className="atc-label" style={{ marginTop: 14 }}>Mensaje<textarea className="atc-textarea" maxLength={4000} required value={editor.body || ""} onChange={(event) => setEditor((value) => ({ ...value, body: event.target.value }))} /></label>
            <div style={{ marginTop: 5, textAlign: "right", fontSize: 10, color: "#64748b" }}>{String(editor.body || "").length}/4000</div>
            <div className="atc-modal-actions"><button className="atc-btn" type="button" onClick={() => setEditor(null)}>Cancelar</button><button className="atc-btn atc-primary" disabled={busy === "template"}>{busy === "template" ? "Guardando…" : "Guardar"}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
