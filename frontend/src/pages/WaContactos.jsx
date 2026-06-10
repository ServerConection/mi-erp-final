/**
 * WaContactos.jsx — Contactos y listas de difusión WhatsApp en el ERP
 */
import { useState, useEffect, useCallback } from "react";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
const authH = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
};

export default function WaContactos() {
  const [tab, setTab]           = useState("lists"); // "lists" | "contacts"
  const [lists, setLists]       = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [modal, setModal]       = useState(null); // { type: "newList"|"newContact"|"bulkAdd", data? }
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [detail, setDetail]     = useState(null); // lista abierta
  const [listItems, setListItems] = useState([]);
  const [bulkText, setBulkText] = useState("");

  const asArray = (d) => (Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);

  const load = useCallback(async () => {
    try {
      const [rL, rC] = await Promise.all([
        fetch(`${API}/lists`,    { headers: authH(false) }),
        fetch(`${API}/contacts`, { headers: authH(false) }),
      ]);
      const [dL, dC] = await Promise.all([rL.json(), rC.json()]);
      setLists(asArray(dL));
      setContacts(asArray(dC));
    } catch (e) {
      console.error("[WaContactos] Error cargando:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const openListDetail = async (lst) => {
    setDetail(lst);
    const r = await fetch(`${API}/lists/${lst.id}`, { headers: authH(false) });
    const d = await r.json();
    const items = d?.data?.items ?? d?.items;
    setListItems(Array.isArray(items) ? items : []);
  };

  const createList = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/lists`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ name: form.name, description: form.description, color: form.color || "#22c55e" }),
      });
      const d = await r.json();
      if (d.success) { setModal(null); load(); }
    } finally { setSaving(false); }
  };

  const deleteList = async (id) => {
    if (!confirm("¿Eliminar esta lista?")) return;
    await fetch(`${API}/lists/${id}`, { method: "DELETE", headers: authH(false) });
    setLists(prev => prev.filter(l => l.id !== id));
    if (detail?.id === id) setDetail(null);
  };

  const bulkAdd = async () => {
    if (!detail || !bulkText.trim()) return;
    setSaving(true);
    const lines = bulkText.trim().split("\n").filter(Boolean);
    const items = lines.map(l => {
      const [wa_number, ...rest] = l.split(",").map(s => s.trim());
      return { wa_number, name: rest[0] || "", variables: {} };
    });
    try {
      await Promise.all(items.map(item =>
        fetch(`${API}/lists/${detail.id}/items`, {
          method: "POST", headers: authH(),
          body: JSON.stringify(item),
        })
      ));
      setBulkText("");
      setModal(null);
      openListDetail(detail);
    } finally { setSaving(false); }
  };

  const removeItem = async (itemId) => {
    await fetch(`${API}/lists/${detail.id}/items/${itemId}`, { method: "DELETE", headers: authH(false) });
    setListItems(prev => prev.filter(i => i.id !== itemId));
  };

  const filteredLists    = lists.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));
  const filteredContacts = contacts.filter(c =>
    (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.wa_number || "").includes(search)
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">👥 Contactos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Listas de difusión y contactos</p>
        </div>
        {tab === "lists" && (
          <button onClick={() => { setForm({}); setModal("newList"); }}
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Nueva lista
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-5 w-fit">
        {[
          { key: "lists",    label: `📋 Listas (${lists.length})` },
          { key: "contacts", label: `👤 Contactos (${contacts.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); setDetail(null); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <input
        type="text" placeholder={tab === "lists" ? "Buscar lista…" : "Buscar contacto o número…"}
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-green-400"
      />

      {/* === LISTAS === */}
      {tab === "lists" && (
        <>
          {filteredLists.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-3">📋</div>
              <div className="font-medium text-slate-500">No hay listas</div>
              <div className="text-sm mt-1">Crea una lista para organizar tus contactos</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLists.map(lst => (
                <div key={lst.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: lst.color || "#22c55e" }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800">{lst.name}</div>
                    {lst.description && <div className="text-xs text-slate-500 truncate">{lst.description}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openListDetail(lst)}
                      className="text-xs border border-slate-200 hover:border-blue-300 hover:text-blue-500 px-3 py-1.5 rounded-lg transition-colors">
                      Ver contactos
                    </button>
                    <button onClick={() => deleteList(lst.id)}
                      className="text-xs text-slate-300 hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors">
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* === CONTACTOS === */}
      {tab === "contacts" && (
        <>
          {filteredContacts.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-3">👤</div>
              <div className="font-medium text-slate-500">No hay contactos</div>
              <div className="text-sm mt-1">Los contactos se crean automáticamente al recibir mensajes</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredContacts.map(c => (
                <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                    {(c.name || c.wa_number || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800">{c.name || "Sin nombre"}</div>
                    <div className="text-xs text-slate-500">+{c.wa_number}</div>
                  </div>
                  {c.tags?.length > 0 && (
                    <div className="flex gap-1">
                      {c.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Panel lateral detalle de lista */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex justify-end z-50">
          <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">{detail.name}</h3>
                <p className="text-xs text-slate-500">{listItems.length} contactos</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setBulkText(""); setModal("bulkAdd"); }}
                  className="text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-lg">
                  + Agregar
                </button>
                <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {listItems.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm">Lista vacía</div>
                  <div className="text-xs mt-1">Agrega contactos con el botón de arriba</div>
                </div>
              ) : listItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0">
                    {(item.name || item.wa_number || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{item.name || "Sin nombre"}</div>
                    <div className="text-xs text-slate-500">+{item.wa_number}</div>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-400 text-sm">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva lista */}
      {modal === "newList" && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Nueva lista</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</label>
                <input type="text" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Clientes activos"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripción (opcional)</label>
                <input type="text" value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Color</label>
                <input type="color" value={form.color || "#22c55e"} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 cursor-pointer" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setModal(null)} className="text-sm text-slate-500 px-4 py-2 hover:text-slate-700">Cancelar</button>
              <button onClick={createList} disabled={saving || !form.name?.trim()}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving ? "Guardando…" : "Crear lista"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar bulk */}
      {modal === "bulkAdd" && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Agregar contactos</h3>
              <p className="text-xs text-slate-500 mt-0.5">Un contacto por línea: número, nombre</p>
            </div>
            <div className="p-5">
              <textarea
                rows={10}
                placeholder={"50212345678, Juan Pérez\n50298765432, María García\n502..."}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:border-green-400"
              />
              <p className="text-xs text-slate-400 mt-2">
                Formato: número sin +, coma, nombre. El nombre es opcional.
              </p>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setModal(null)} className="text-sm text-slate-500 px-4 py-2 hover:text-slate-700">Cancelar</button>
              <button onClick={bulkAdd} disabled={saving || !bulkText.trim()}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving ? "Agregando…" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
