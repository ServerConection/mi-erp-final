/**
 * WaContactos.jsx — Contactos y listas de difusión WhatsApp en el ERP
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import WaCreationDateFilter from "../components/WaCreationDateFilter";
import { matchesCreationDate, formatCreationDate } from "../utils/waCreationDate";

const API = `${import.meta.env.VITE_API_URL}/api/wa`;
const authH = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
};

const normalizeSearch = (value = "") => String(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function SearchableSelect({ options = [], value, onChange, disabled, placeholder = "Buscar responsable…" }) {
  const rootRef = useRef(null);
  const selected = options.find(option => String(option.id) === String(value));
  const [query, setQuery] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle || selected?.name === query) return options.slice(0, 100);
    return options.filter(option => normalizeSearch(option.name).includes(needle)).slice(0, 100);
  }, [options, query, selected?.name]);

  useEffect(() => {
    const close = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = option => {
    onChange(String(option.id));
    setQuery(option.name);
    setOpen(false);
  };

  const onKeyDown = event => {
    if (event.key === "ArrowDown") {
      event.preventDefault(); setOpen(true);
      setHighlighted(index => Math.min(index + 1, Math.max(0, filtered.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(index => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && filtered[highlighted]) {
      event.preventDefault(); choose(filtered[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return <div ref={rootRef} className="relative mt-1">
    <div className={`flex items-center border rounded-lg bg-white transition-colors ${open ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"} ${disabled ? "bg-slate-50 opacity-60" : ""}`}>
      <span className="pl-3 text-slate-400" aria-hidden="true">⌕</span>
      <input
        type="text" value={query} disabled={disabled} placeholder={placeholder}
        autoComplete="off" role="combobox" aria-expanded={open} aria-autocomplete="list"
        onFocus={event => { setOpen(true); setHighlighted(0); event.currentTarget.select(); }}
        onChange={event => { setQuery(event.target.value); setHighlighted(0); setOpen(true); if (value) onChange(""); }}
        onKeyDown={onKeyDown}
        className="w-full px-2 py-2 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
      />
      {query && !disabled && <button type="button" aria-label="Limpiar responsable"
        onClick={() => { setQuery(""); onChange(""); setOpen(true); }}
        className="px-3 py-2 text-slate-400 hover:text-slate-700">×</button>}
      <span className="pr-3 text-xs text-slate-400 pointer-events-none">▾</span>
    </div>
    {open && !disabled && <div role="listbox" className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
      {filtered.length ? filtered.map((option, index) => <button
        type="button" role="option" aria-selected={String(option.id) === String(value)} key={option.id}
        onMouseEnter={() => setHighlighted(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}
        className={`block w-full px-3 py-2 text-left text-sm ${index === highlighted ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"} ${String(option.id) === String(value) ? "font-semibold" : ""}`}>
        {option.name}
      </button>) : <div className="px-3 py-4 text-center text-sm text-slate-500">
        No encontramos responsables con “{query}”
      </div>}
      {filtered.length === 100 && <div className="sticky bottom-0 border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">Escribe más letras para precisar la búsqueda.</div>}
    </div>}
  </div>;
}

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
  const [creationDates, setCreationDates] = useState({ desde: "", hasta: "" });
  const [creator, setCreator] = useState("");
  const [bitrixOptions, setBitrixOptions] = useState(null);
  const [bitrixForm, setBitrixForm] = useState({ stage_id: "", responsible_id: "", date_from: "", date_to: "", name: "" });
  const [bitrixPreview, setBitrixPreview] = useState(null);
  const [bitrixBusy, setBitrixBusy] = useState(false);
  const [bitrixError, setBitrixError] = useState("");

  const asArray = (d) => (Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);

  const load = useCallback(async () => {
    try {
      const rL = await fetch(`${API}/lists`, { headers: authH(false) });
      const dL = await rL.json();
      const allContacts = [];
      for (let offset = 0; ; offset += 500) {
        const response = await fetch(`${API}/contacts?limit=500&offset=${offset}`, { headers: authH(false) });
        const page = await response.json();
        if (!response.ok || !page.success) throw new Error(page.error || "No se pudieron cargar los contactos");
        allContacts.push(...asArray(page));
        if (allContacts.length >= page.total || asArray(page).length < 500) break;
      }
      setLists(asArray(dL));
      setContacts(allContacts);
    } catch (e) {
      console.error("[WaContactos] Error cargando:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

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

  const openBitrix = async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
    setModal("bitrix"); setBitrixPreview(null); setBitrixError("");
    setBitrixForm({ stage_id: "", responsible_id: "", date_from: today, date_to: today, name: "" });
    if (bitrixOptions) return;
    setBitrixBusy(true);
    try {
      const response = await fetch(`${API}/lists/bitrix/options`, { headers: authH(false) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudieron cargar los filtros de Bitrix");
      setBitrixOptions(payload.data);
    } catch (error) { setBitrixError(error.message); }
    finally { setBitrixBusy(false); }
  };

  const generatedBitrixName = (current = bitrixForm) => {
    const stage = bitrixOptions?.stages?.find(s => s.id === current.stage_id)?.name || "";
    const responsible = bitrixOptions?.responsibles?.find(u => u.id === current.responsible_id)?.name || "";
    const date = current.date_from ? current.date_from.split("-").reverse().join("-") : "";
    return [stage, date, responsible].filter(Boolean).join(" - ").toUpperCase();
  };

  const updateBitrixForm = (field, value) => {
    setBitrixPreview(null); setBitrixError("");
    setBitrixForm(prev => {
      const next = { ...prev, [field]: value };
      if (field !== "name") next.name = generatedBitrixName(next);
      return next;
    });
  };

  const previewFromBitrix = async () => {
    setBitrixBusy(true); setBitrixError(""); setBitrixPreview(null);
    try {
      const response = await fetch(`${API}/lists/bitrix/preview`, { method: "POST", headers: authH(), body: JSON.stringify(bitrixForm) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo consultar Bitrix");
      setBitrixPreview(payload.data);
    } catch (error) { setBitrixError(error.message); }
    finally { setBitrixBusy(false); }
  };

  const createFromBitrix = async () => {
    setBitrixBusy(true); setBitrixError("");
    try {
      const response = await fetch(`${API}/lists/bitrix/create`, { method: "POST", headers: authH(), body: JSON.stringify(bitrixForm) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo crear la lista");
      setModal(null); await load();
    } catch (error) { setBitrixError(error.message); }
    finally { setBitrixBusy(false); }
  };

  const creatorLabel = (list) => list.owner_username || (list.created_by != null ? `Usuario #${list.created_by}` : "Sin creador registrado");
  const creators = [...new Map(lists.map(list => [String(list.created_by ?? "unknown"), creatorLabel(list)])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const filteredLists = lists.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) &&
    matchesCreationDate(l.created_at, creationDates) &&
    (!creator || String(l.created_by ?? "unknown") === creator)
  );
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
        {tab === "lists" && <div className="flex flex-wrap justify-end gap-2">
          <button onClick={openBitrix} className="border border-blue-600 text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Importar desde Bitrix
          </button>
          <button onClick={() => { setForm({}); setModal("newList"); }}
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">+ Nueva lista</button>
        </div>}
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
          <WaCreationDateFilter value={creationDates} onChange={setCreationDates} />
          <label className="flex flex-col gap-1 text-xs text-slate-500 mb-4">
            Creado por
            <select value={creator} onChange={e => setCreator(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700">
              <option value="">Todos los usuarios</option>
              {creators.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <p className="text-xs text-slate-500 mb-3">{filteredLists.length} de {lists.length} listas</p>
          {filteredLists.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-3">📋</div>
              <div className="font-medium text-slate-500">No hay listas</div>
              <div className="text-sm mt-1">{lists.length ? "No hay listas que coincidan con los filtros seleccionados." : "Crea una lista para organizar tus contactos"}</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLists.map(lst => (
                <div key={lst.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: lst.color || "#22c55e" }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800">{lst.name}</div>
                    {lst.description && <div className="text-xs text-slate-500 truncate">{lst.description}</div>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                      <span>Creado por: {creatorLabel(lst)}</span>
                      <span>Creación: {formatCreationDate(lst.created_at)}</span>
                      <span>{lst.contact_count ?? 0} contactos</span>
                    </div>
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

      {/* Modal crear base desde Bitrix */}
      {modal === "bitrix" && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between">
              <div><h3 className="font-bold text-slate-800">Crear base desde Bitrix</h3>
                <p className="text-xs text-slate-500 mt-1">Empresa: {bitrixOptions?.empresa || "cargando…"}</p></div>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <label className="text-xs font-semibold text-slate-500">ETAPA
                  <select value={bitrixForm.stage_id} onChange={e => updateBitrixForm("stage_id", e.target.value)} disabled={bitrixBusy || !bitrixOptions}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">Selecciona una etapa</option>
                    {(bitrixOptions?.stages || []).map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                  </select>
                </label>
                <div className="text-xs font-semibold text-slate-500">RESPONSABLE
                  <SearchableSelect options={bitrixOptions?.responsibles || []} value={bitrixForm.responsible_id}
                    onChange={value => updateBitrixForm("responsible_id", value)} disabled={bitrixBusy || !bitrixOptions} />
                </div>
                <label className="text-xs font-semibold text-slate-500">FECHA DESDE
                  <input type="date" value={bitrixForm.date_from} onChange={e => updateBitrixForm("date_from", e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-500">FECHA HASTA
                  <input type="date" value={bitrixForm.date_to} onChange={e => updateBitrixForm("date_to", e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-500">NOMBRE DE LA LISTA
                <input value={bitrixForm.name} onChange={e => updateBitrixForm("name", e.target.value)} placeholder="Se genera al seleccionar los filtros"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </label>
              {bitrixError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{bitrixError}</div>}
              {bitrixPreview && <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-center">
                  <div><div className="text-xl font-bold text-slate-800">{bitrixPreview.total_deals}</div><div className="text-xs text-slate-500">Negocios</div></div>
                  <div><div className="text-xl font-bold text-green-700">{bitrixPreview.unique_contacts}</div><div className="text-xs text-slate-500">Teléfonos únicos</div></div>
                  <div><div className="text-xl font-bold text-amber-600">{bitrixPreview.deals_without_phone}</div><div className="text-xs text-slate-500">Sin teléfono</div></div>
                </div>
                {bitrixPreview.truncated && <p className="text-xs text-amber-700 mb-2">La consulta alcanzó el límite de seguridad de 10.000 negocios. Reduce el rango de fechas.</p>}
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 bg-white border border-slate-200 rounded-lg">
                  {(bitrixPreview.items || []).map(item => <div key={item.wa_number} className="px-3 py-2 flex justify-between gap-3 text-sm">
                    <span className="truncate">{item.name || "Sin nombre"}</span><span className="text-slate-500 whitespace-nowrap">+{item.wa_number}</span>
                  </div>)}
                  {!bitrixPreview.items?.length && <div className="p-4 text-center text-sm text-slate-500">No se encontraron teléfonos válidos.</div>}
                </div>
                {bitrixPreview.unique_contacts > 100 && <p className="text-xs text-slate-400 mt-2">Se muestran los primeros 100; la lista incluirá los {bitrixPreview.unique_contacts} números únicos.</p>}
              </div>}
            </div>
            <div className="p-5 border-t border-slate-100 flex flex-wrap gap-3 justify-end">
              <button onClick={() => setModal(null)} className="text-sm text-slate-500 px-4 py-2">Cancelar</button>
              <button onClick={previewFromBitrix} disabled={bitrixBusy || !bitrixForm.stage_id || !bitrixForm.responsible_id || !bitrixForm.date_from || !bitrixForm.date_to}
                className="border border-blue-600 text-blue-700 disabled:opacity-40 px-5 py-2 rounded-lg text-sm font-medium">{bitrixBusy ? "Consultando…" : "Consultar"}</button>
              <button onClick={createFromBitrix} disabled={bitrixBusy || !bitrixPreview?.unique_contacts || !bitrixForm.name.trim()}
                className="bg-green-600 text-white disabled:bg-slate-300 px-5 py-2 rounded-lg text-sm font-medium">Crear base</button>
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
